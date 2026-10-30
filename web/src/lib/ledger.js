// Values derived from the stored records: party balances, invoice payment status and stock.
// Nothing derived is stored, so editing or deleting a bill always keeps balances and stock right.
import { computeVoucher, KINDS } from './gst.js';
import { num, round2, todayISO } from './format.js';

let cache = { version: -1, value: null };

export const voucherCalc = (v, settings) => computeVoucher(v, v.bizState ?? settings.business.state);

function openingSigned(p) {
  const amt = num(p.openingBalance);
  return p.openingType === 'pay' ? -amt : amt;
}

export function derive(s) {
  if (cache.version === s.version && cache.value) return cache.value;
  const today = todayISO();
  const calc = new Map();
  for (const v of s.vouchers) calc.set(v.id, voucherCalc(v, s.settings));

  // Party balances: positive = party owes the business (to collect), negative = business owes party (to pay).
  const balance = new Map();
  for (const p of s.parties) balance.set(p.id, openingSigned(p));
  const add = (id, amt) => {
    if (!id) return;
    balance.set(id, round2((balance.get(id) || 0) + amt));
  };
  for (const v of s.vouchers) {
    const k = KINDS[v.kind];
    if (!k || !k.ledger) continue;
    add(v.partyId, k.ledger * (calc.get(v.id).total - num(v.settled)));
  }
  for (const p of s.payments) add(p.partyId, p.direction === 'in' ? -num(p.amount) : num(p.amount));

  // Payment status per bill: amounts settled on the bill first, then party payments
  // applied to the oldest unpaid bills (opening balance first).
  const status = new Map();
  const byParty = new Map();
  const bucket = (id) => {
    if (!byParty.has(id)) byParty.set(id, { sale: [], purchase: [], salePool: 0, purchasePool: 0 });
    return byParty.get(id);
  };
  for (const p of s.parties) {
    const b = bucket(p.id);
    const amt = num(p.openingBalance);
    if (amt > 0 && p.openingType !== 'pay') b.sale.push({ opening: true, date: '0000-00-00', seq: 0, due: amt });
    if (amt > 0 && p.openingType === 'pay') b.purchase.push({ opening: true, date: '0000-00-00', seq: 0, due: amt });
  }
  for (const v of s.vouchers) {
    if (!v.partyId) continue;
    const b = bucket(v.partyId);
    const c = calc.get(v.id);
    if (v.kind === 'sale') b.sale.push({ v, date: v.date, seq: v.seq || 0, due: round2(c.total - num(v.settled)) });
    if (v.kind === 'purchase') b.purchase.push({ v, date: v.date, seq: v.seq || 0, due: round2(c.total - num(v.settled)) });
    if (v.kind === 'cnote') b.salePool += c.total - num(v.settled);
    if (v.kind === 'dnote') b.purchasePool += c.total - num(v.settled);
  }
  for (const p of s.payments) {
    if (!p.partyId) continue;
    const b = bucket(p.partyId);
    if (p.direction === 'in') b.salePool += num(p.amount);
    else b.purchasePool += num(p.amount);
  }
  const allocate = (dues, pool) => {
    dues.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
    for (const d of dues) {
      const alloc = Math.max(0, Math.min(pool, d.due));
      pool = round2(pool - alloc);
      if (!d.v) continue;
      const c = calc.get(d.v.id);
      const paid = round2(num(d.v.settled) + alloc);
      const due = round2(c.total - paid);
      let st = due <= 0.009 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
      const overdue = st !== 'paid' && d.v.dueDate && d.v.dueDate < today;
      status.set(d.v.id, { paid, due: Math.max(0, due), status: st, overdue });
    }
  };
  for (const b of byParty.values()) {
    allocate(b.sale, b.salePool);
    allocate(b.purchase, b.purchasePool);
  }
  // Bills without a party (walk-in cash sale) are settled only by the amount on the bill.
  for (const v of s.vouchers) {
    if (status.has(v.id) || (v.kind !== 'sale' && v.kind !== 'purchase')) continue;
    const c = calc.get(v.id);
    const paid = num(v.settled);
    const due = round2(c.total - paid);
    status.set(v.id, {
      paid, due: Math.max(0, due), status: due <= 0.009 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      overdue: due > 0.009 && v.dueDate && v.dueDate < today,
    });
  }

  // Stock on hand for products.
  const stock = new Map();
  for (const i of s.items) if (i.kind !== 'service') stock.set(i.id, num(i.openingStock));
  // Every scanned or typed-in serial unit is one piece added to stock; selling it is recorded by the invoice line.
  for (const u of s.units || []) if (u.itemId && stock.has(u.itemId)) stock.set(u.itemId, stock.get(u.itemId) + 1);
  for (const v of s.vouchers) {
    const k = KINDS[v.kind];
    if (!k || !k.stock) continue;
    for (const l of v.lines || []) {
      if (l.itemId && stock.has(l.itemId)) stock.set(l.itemId, Math.round((stock.get(l.itemId) + k.stock * num(l.qty)) * 1000) / 1000);
    }
  }

  let toCollect = 0;
  let toPay = 0;
  for (const v of balance.values()) {
    if (v > 0) toCollect += v;
    else toPay -= v;
  }
  const lowStock = s.items.filter((i) => i.kind !== 'service' && num(i.lowStock) > 0 && (stock.get(i.id) ?? 0) <= num(i.lowStock));

  const value = { calc, balance, status, stock, toCollect: round2(toCollect), toPay: round2(toPay), lowStock };
  cache = { version: s.version, value };
  return value;
}

// Chronological statement for one party with a running balance.
export function partyStatement(s, partyId) {
  const d = derive(s);
  const party = s.parties.find((p) => p.id === partyId);
  if (!party) return [];
  const rows = [];
  const open = openingSigned(party);
  if (open) rows.push({ date: party.openingDate || '', label: 'Opening balance', ref: '', debit: open > 0 ? open : 0, credit: open < 0 ? -open : 0, sort: '0000' });
  for (const v of s.vouchers) {
    if (v.partyId !== partyId) continue;
    const k = KINDS[v.kind];
    if (!k.ledger) continue;
    const total = d.calc.get(v.id).total;
    const settled = num(v.settled);
    const debit = k.ledger > 0 ? total : 0;
    const credit = k.ledger < 0 ? total : 0;
    rows.push({ date: v.date, label: k.label, ref: v.number, debit, credit, link: `doc-${v.id}`, sort: v.date + (v.createdAt || '') });
    if (settled) {
      rows.push({
        date: v.date, label: `${k.settleLabel} (${v.paymentMode || 'Cash'})`, ref: v.number,
        debit: k.ledger < 0 ? settled : 0, credit: k.ledger > 0 ? settled : 0, sort: v.date + (v.createdAt || '') + 'z',
      });
    }
  }
  for (const p of s.payments) {
    if (p.partyId !== partyId) continue;
    rows.push({
      date: p.date, label: p.direction === 'in' ? `Payment In (${p.mode})` : `Payment Out (${p.mode})`, ref: p.number,
      debit: p.direction === 'out' ? num(p.amount) : 0, credit: p.direction === 'in' ? num(p.amount) : 0,
      link: `payment-edit-${p.id}`, sort: p.date + (p.createdAt || ''),
    });
  }
  rows.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
  let run = 0;
  for (const r of rows) {
    run = round2(run + r.debit - r.credit);
    r.balance = run;
  }
  return rows;
}

// Stock quantity of every product at the end of a given date (inclusive).
export function stockAsOf(s, isoDate) {
  const stock = new Map();
  for (const i of s.items) if (i.kind !== 'service') stock.set(i.id, (i.openingDate || '') <= isoDate ? num(i.openingStock) : 0);
  for (const u of s.units || []) if (u.itemId && stock.has(u.itemId) && (u.addedDate || '') <= isoDate) stock.set(u.itemId, stock.get(u.itemId) + 1);
  for (const v of s.vouchers) {
    const k = KINDS[v.kind];
    if (!k || !k.stock || v.date > isoDate) continue;
    for (const l of v.lines || []) if (l.itemId && stock.has(l.itemId)) stock.set(l.itemId, stock.get(l.itemId) + k.stock * num(l.qty));
  }
  return stock;
}
