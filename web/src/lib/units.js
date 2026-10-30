// Serial-numbered stock units: each physical unit scanned from a label (or typed in), its status, and
// the Excel stock sheet built from them. Pure functions, so they can be tested without the app.
import { buildXlsx } from './xlsx.js';

const LABEL_MODEL = /\b(?:model\s*(?:no|number|#)?\.?|m\s*\/\s*n|mod\.?)\s*[:\-.]?\s*([A-Z0-9][A-Z0-9\-\/.]{2,})/i;
const LABEL_SERIAL = /\b(?:serial\s*(?:no|number|#)?\.?|s\s*\/\s*n|sr\.?\s*no\.?|sl\.?\s*no\.?|slno\.?)\s*[:\-.]?\s*([A-Z0-9][A-Z0-9\-\/]{3,})/i;

// Reads model and serial from the text of a label photo. Returns '' for anything it can't find, so the
// user types it in. A value must contain a digit, which keeps words such as "Model No" from being taken.
export function parseLabel(text) {
  const t = String(text || '').replace(/\r/g, '\n');
  const flat = t.replace(/\n+/g, ' | ');
  const pick = (re) => {
    const m = re.exec(flat);
    if (!m) return '';
    const v = m[1].replace(/[.\-\/]+$/, '');
    return /\d/.test(v) ? v.toUpperCase() : '';
  };
  return { model: pick(LABEL_MODEL), serial: pick(LABEL_SERIAL), text: t.trim() };
}

export const UNIT_HEADERS = ['Serial no', 'Model no', 'Product', 'Brand', 'HSN', 'Purchase price (₹)', 'Status', 'Invoice no', 'Date added', 'Date sold', 'Party', 'Note'];

// One row per unit, in the order they were added.
export function stockRows(units, items = []) {
  const itemName = (id) => (items.find((i) => i.id === id) || {}).name || '';
  const itemHsn = (id) => (items.find((i) => i.id === id) || {}).hsn || '';
  return [...units]
    .sort((a, b) => ((a.createdAt || '') < (b.createdAt || '') ? -1 : 1))
    .map((u) => [
      u.serial || '',
      u.model || '',
      u.productName || itemName(u.itemId),
      u.brand || '',
      u.hsn || itemHsn(u.itemId),
      u.purchasePrice ? Number(u.purchasePrice) : '',
      u.status === 'sold' ? 'Sold' : 'In stock',
      u.invoiceNo || '',
      u.addedDate || '',
      u.soldDate || '',
      u.partyName || '',
      u.note || '',
    ]);
}

// The Excel file that holds every unit. Columns are fixed so the sheet stays easy to total or filter.
export function stockWorkbook(units, items) {
  return buildXlsx({
    sheetName: 'Stock',
    headers: UNIT_HEADERS,
    rows: stockRows(units, items),
    widths: [18, 18, 30, 14, 10, 16, 12, 14, 13, 13, 26, 24],
  });
}

export const STOCK_FILE = 'Stock.xlsx';
export const STOCK_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
