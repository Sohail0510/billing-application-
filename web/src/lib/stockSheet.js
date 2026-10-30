// Rebuilds Stock.xlsx from every serial-numbered unit and saves it over the previous copy.
import { getSnapshot, upsert } from './db.js';
import { stockWorkbook, STOCK_FILE, STOCK_MIME } from './units.js';
import { saveReplacing } from './platform.js';

export function publishStockSheet() {
  const s = getSnapshot();
  return saveReplacing(stockWorkbook(s.units, s.items), STOCK_FILE, STOCK_MIME);
}

// Marks the units chosen on a sale as sold to that invoice, and puts back in stock any unit that was
// sold to it before but has been removed. Saves the Excel file when anything changed.
export async function markSoldUnits(voucher) {
  const s = getSnapshot();
  const chosen = new Set();
  if (voucher.kind === 'sale') for (const l of voucher.lines || []) for (const id of l.serialIds || []) chosen.add(id);
  const partyName = (voucher.party && voucher.party.name) || '';
  let changed = false;
  for (const u of s.units) {
    if (u.soldIn === voucher.id && !chosen.has(u.id)) {
      await upsert('units', { ...u, status: 'in_stock', soldIn: '', invoiceNo: '', soldDate: '', partyName: '' });
      changed = true;
    } else if (chosen.has(u.id) && u.soldIn !== voucher.id) {
      await upsert('units', { ...u, status: 'sold', soldIn: voucher.id, invoiceNo: voucher.number, soldDate: voucher.date, partyName });
      changed = true;
    }
  }
  if (changed) publishStockSheet();
  return changed;
}

// Used when an invoice is deleted: every unit sold on it goes back in stock.
export async function releaseSoldUnits(voucherId) {
  return markSoldUnits({ id: voucherId, kind: 'none', lines: [] });
}
