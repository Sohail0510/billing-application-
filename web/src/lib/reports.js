// Report builders. Each returns KPIs plus one or more tables that the report screen renders
// and that export to CSV with the same columns.
import { KINDS, stateName, uqc } from './gst.js';
import { round2, num, fmtDate, fmtAmt, fmtQty, csvEscape, addDays, todayISO } from './format.js';
import { derive, stockAsOf, partyStatement } from './ledger.js';

const inRange = (date, r) => (!r.from || date >= r.from) && (!r.to || date <= r.to);
const money = (key, label) => ({ key, label, type: 'money' });
const text = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const sumBy = (rows, key) => round2(rows.reduce((s, r) => s + num(r[key]), 0));
const totalRow = (rows, keys, label = 'Total', labelKey) => {
  const t = { _total: true };
  keys.forEach((k) => {
    t[k] = sumBy(rows, k);
  });
  if (labelKey) t[labelKey] = label;
  return t;
};

export const REPORTS = [
  { key: 'sales', title: 'Sales Summary', desc: 'Invoices, credit notes and what is still unpaid', range: true },
  { key: 'gstr1', title: 'GSTR-1', desc: 'B2B, B2C, credit notes and HSN summary for filing', range: true },
  { key: 'gstr3b', title: 'GSTR-3B Summary', desc: 'Output tax, input tax credit and net tax', range: true },
  { key: 'hsn', title: 'HSN Summary', desc: 'HSN-wise quantity, taxable value and tax on sales', range: true },
  { key: 'pnl', title: 'Profit & Loss', desc: 'Sales minus cost of goods and expenses', range: true },
  { key: 'purchases', title: 'Purchase Summary', desc: 'Purchase bills and debit notes', range: true },
  { key: 'itemsales', title: 'Item-wise Sales', desc: 'Quantity and value sold per item', range: true },
  { key: 'stock', title: 'Stock Summary', desc: 'Stock in hand and its value', range: false },
  { key: 'outstanding', title: 'Receivables & Payables', desc: 'Who owes you and whom you owe', range: false },
  { key: 'daybook', title: 'Day Book', desc: 'Every entry on a single day with cash in and out', range: 'day' },
  { key: 'expenses', title: 'Expense Report', desc: 'Expenses by category', range: true },
];

function voucherRows(s, d, kinds, r) {
  return s.vouchers
    .filter((v) => kinds.includes(v.kind) && inRange(v.date, r))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq || 0) - (b.seq || 0)))
    .map((v) => {
      const c = d.calc.get(v.id);
      const st = d.status.get(v.id);
      return {
        link: `doc-${v.id}`, date: fmtDate(v.date), no: v.number, party: (v.party && v.party.name) || 'Cash Sale',
        gstin: (v.party && v.party.gstin) || '', taxable: c.taxable, tax: c.tax, total: c.total,
        due: st ? st.due : 0, status: st ? (st.overdue ? 'Overdue' : { paid: 'Paid', partial: 'Partly paid', unpaid: 'Unpaid' }[st.status]) : KINDS[v.kind].label,
        kind: KINDS[v.kind].label,
      };
    });
}

function salesSummary(s, d, r, side) {
  const main = side === 'sale' ? 'sale' : 'purchase';
  const ret = side === 'sale' ? 'cnote' : 'dnote';
  const inv = voucherRows(s, d, [main], r);
  const rets = voucherRows(s, d, [ret], r);
  const cols = [text('date', 'Date'), text('no', side === 'sale' ? 'Invoice' : 'Bill'), text('party', 'Party', { wrap: true }),
    money('taxable', 'Taxable'), money('tax', 'GST'), money('total', 'Total'), money('due', 'Unpaid'), text('status', 'Status')];
  const totals = ['taxable', 'tax', 'total', 'due'];
  const net = round2(sumBy(inv, 'total') - sumBy(rets, 'total'));
  const tables = [{ title: side === 'sale' ? 'Sales invoices' : 'Purchase bills', columns: cols, rows: inv, total: totalRow(inv, totals, 'Total', 'date') }];
  if (rets.length) {
    tables.push({
      title: side === 'sale' ? 'Credit notes (sales returns)' : 'Debit notes (purchase returns)',
      columns: cols.filter((c) => c.key !== 'due' && c.key !== 'status'), rows: rets, total: totalRow(rets, ['taxable', 'tax', 'total'], 'Total', 'date'),
    });
  }
  return {
    kpis: [
      { k: side === 'sale' ? 'Invoices' : 'Bills', v: String(inv.length) },
      { k: side === 'sale' ? 'Net sales (incl. GST)' : 'Net purchases (incl. GST)', v: net, money: true },
      { k: side === 'sale' ? 'GST collected' : 'GST paid', v: round2(sumBy(inv, 'tax') - sumBy(rets, 'tax')), money: true },
      { k: side === 'sale' ? 'Still to collect' : 'Still to pay', v: sumBy(inv, 'due'), money: true },
    ],
    tables,
  };
}

// Tax per rate inside one voucher.
function byRate(c) {
  const m = new Map();
  for (const g of c.hsn) {
    const x = m.get(g.rate) || { rate: g.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    x.taxable = round2(x.taxable + g.taxable);
    x.igst = round2(x.igst + g.igst);
    x.cgst = round2(x.cgst + g.cgst);
    x.sgst = round2(x.sgst + g.sgst);
    m.set(g.rate, x);
  }
  return [...m.values()];
}

function hsnRows(s, d, r, kinds = ['sale'], minusKinds = ['cnote']) {
  const m = new Map();
  for (const v of s.vouchers) {
    const sign = kinds.includes(v.kind) ? 1 : minusKinds.includes(v.kind) ? -1 : 0;
    if (!sign || !inRange(v.date, r)) continue;
    const c = d.calc.get(v.id);
    for (const l of c.lines) {
      const key = `${l.hsn || '-'}|${l.calc.gstRate}`;
      const x = m.get(key) || { hsn: l.hsn || '-', desc: l.name, uqc: uqc(l.unit), rate: l.calc.gstRate, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
      x.qty = Math.round((x.qty + sign * l.calc.qty) * 1000) / 1000;
      x.taxable = round2(x.taxable + sign * l.calc.taxable);
      if (c.inter) x.igst = round2(x.igst + sign * l.calc.tax);
      else {
        const half = round2(l.calc.tax / 2);
        x.cgst = round2(x.cgst + sign * half);
        x.sgst = round2(x.sgst + sign * (l.calc.tax - half));
      }
      x.total = round2(x.total + sign * l.calc.amount);
      m.set(key, x);
    }
  }
  return [...m.values()].sort((a, b) => (a.hsn < b.hsn ? -1 : 1));
}

const hsnColumns = [text('hsn', 'HSN'), text('desc', 'Description', { wrap: true }), text('uqc', 'UQC'), { key: 'qty', label: 'Qty', type: 'qty' },
  { key: 'rate', label: 'Rate %', type: 'qty' }, money('taxable', 'Taxable'), money('igst', 'IGST'), money('cgst', 'CGST'), money('sgst', 'SGST'), money('total', 'Total value')];

function gstr1(s, d, r) {
  const b2b = [];
  const b2cl = [];
  const b2cs = new Map();
  const notes = [];
  for (const v of s.vouchers) {
    if (!inRange(v.date, r)) continue;
    if (v.kind !== 'sale' && v.kind !== 'cnote') continue;
    const c = d.calc.get(v.id);
    const p = v.party || {};
    const pos = `${v.taxState || s.settings.business.state || ''}-${stateName(v.taxState || s.settings.business.state)}`;
    for (const x of byRate(c)) {
      const base = { link: `doc-${v.id}`, gstin: p.gstin || '', party: p.name || 'Cash Sale', no: v.number, date: fmtDate(v.date), value: c.total, pos, rate: x.rate, taxable: x.taxable, igst: x.igst, cgst: x.cgst, sgst: x.sgst };
      if (v.kind === 'cnote') notes.push({ ...base, type: p.gstin ? 'CDNR' : 'CDNUR' });
      else if (p.gstin) b2b.push(base);
      else if (c.inter && c.total > 100000) b2cl.push(base);
      else {
        const key = `${pos}|${x.rate}`;
        const g = b2cs.get(key) || { pos, rate: x.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
        g.taxable = round2(g.taxable + x.taxable);
        g.igst = round2(g.igst + x.igst);
        g.cgst = round2(g.cgst + x.cgst);
        g.sgst = round2(g.sgst + x.sgst);
        b2cs.set(key, g);
      }
    }
  }
  const taxCols = [{ key: 'rate', label: 'Rate %', type: 'qty' }, money('taxable', 'Taxable'), money('igst', 'IGST'), money('cgst', 'CGST'), money('sgst', 'SGST')];
  const taxKeys = ['taxable', 'igst', 'cgst', 'sgst'];
  const b2csRows = [...b2cs.values()];
  const hsn = hsnRows(s, d, r);
  const all = [...b2b, ...b2cl, ...b2csRows];
  const net = (k) => round2(sumBy(all, k) - sumBy(notes, k));
  return {
    kpis: [
      { k: 'Taxable value (net)', v: net('taxable'), money: true },
      { k: 'IGST', v: net('igst'), money: true },
      { k: 'CGST', v: net('cgst'), money: true },
      { k: 'SGST', v: net('sgst'), money: true },
    ],
    note: 'B2C Large lists inter-state invoices above ₹1,00,000 to unregistered buyers. Check the totals with your GST portal before filing.',
    tables: [
      { title: 'B2B invoices (4A)', columns: [text('gstin', 'GSTIN'), text('party', 'Party', { wrap: true }), text('no', 'Invoice'), text('date', 'Date'), money('value', 'Invoice value'), text('pos', 'Place of supply'), ...taxCols], rows: b2b, total: totalRow(b2b, taxKeys, 'Total', 'gstin') },
      { title: 'B2C Large (5)', columns: [text('no', 'Invoice'), text('date', 'Date'), money('value', 'Invoice value'), text('pos', 'Place of supply'), ...taxCols], rows: b2cl, total: totalRow(b2cl, taxKeys, 'Total', 'no') },
      { title: 'B2C Small (7)', columns: [text('pos', 'Place of supply'), ...taxCols], rows: b2csRows, total: totalRow(b2csRows, taxKeys, 'Total', 'pos') },
      { title: 'Credit notes (9B)', columns: [text('type', 'Type'), text('gstin', 'GSTIN'), text('party', 'Party', { wrap: true }), text('no', 'Note'), text('date', 'Date'), money('value', 'Note value'), ...taxCols], rows: notes, total: totalRow(notes, taxKeys, 'Total', 'type') },
      { title: 'HSN summary (12)', columns: hsnColumns, rows: hsn, total: totalRow(hsn, ['taxable', 'igst', 'cgst', 'sgst', 'total'], 'Total', 'hsn') },
    ],
  };
}

function expenseTax(e) {
  const rate = num(e.gstRate);
  if (!rate) return { taxable: num(e.amount), tax: 0 };
  const taxable = round2(num(e.amount) / (1 + rate / 100));
  return { taxable, tax: round2(num(e.amount) - taxable) };
}

function gstr3b(s, d, r) {
  const out = { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
  const nil = { taxable: 0 };
  const itc = { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
  for (const v of s.vouchers) {
    if (!inRange(v.date, r)) continue;
    const c = d.calc.get(v.id);
    const sign = { sale: 1, cnote: -1, purchase: 1, dnote: -1 }[v.kind];
    if (!sign) continue;
    const target = v.kind === 'sale' || v.kind === 'cnote' ? out : itc;
    for (const g of c.hsn) {
      if (target === out && g.rate === 0) {
        nil.taxable = round2(nil.taxable + sign * g.taxable);
        continue;
      }
      target.taxable = round2(target.taxable + sign * g.taxable);
      target.igst = round2(target.igst + sign * g.igst);
      target.cgst = round2(target.cgst + sign * g.cgst);
      target.sgst = round2(target.sgst + sign * g.sgst);
    }
  }
  const exp = { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
  for (const e of s.expenses) {
    if (!inRange(e.date, r) || !num(e.gstRate)) continue;
    const t = expenseTax(e);
    const half = round2(t.tax / 2);
    exp.taxable = round2(exp.taxable + t.taxable);
    exp.cgst = round2(exp.cgst + half);
    exp.sgst = round2(exp.sgst + t.tax - half);
  }
  const cols = [text('head', 'Particulars', { wrap: true }), money('taxable', 'Taxable'), money('igst', 'IGST'), money('cgst', 'CGST'), money('sgst', 'SGST')];
  const itcTotal = { igst: round2(itc.igst + exp.igst), cgst: round2(itc.cgst + exp.cgst), sgst: round2(itc.sgst + exp.sgst) };
  const netRow = {
    head: 'Net tax (output − ITC)', taxable: '',
    igst: round2(out.igst - itcTotal.igst), cgst: round2(out.cgst - itcTotal.cgst), sgst: round2(out.sgst - itcTotal.sgst), _total: true,
  };
  const outTax = round2(out.igst + out.cgst + out.sgst);
  const inTax = round2(itcTotal.igst + itcTotal.cgst + itcTotal.sgst);
  return {
    kpis: [
      { k: 'Output tax', v: outTax, money: true },
      { k: 'Input tax credit', v: inTax, money: true },
      { k: outTax - inTax >= 0 ? 'Net tax payable' : 'Credit carried forward', v: Math.abs(round2(outTax - inTax)), money: true },
      { k: 'Nil-rated sales', v: nil.taxable, money: true },
    ],
    note: 'Net figures are before the IGST/CGST/SGST set-off order the GST portal applies. Confirm with your accountant before paying.',
    tables: [
      { title: '3.1 Outward supplies', columns: cols, rows: [{ head: '(a) Taxable outward supplies', ...out }, { head: '(c) Nil-rated and exempt', taxable: nil.taxable, igst: 0, cgst: 0, sgst: 0 }], total: null },
      { title: '4. Eligible input tax credit', columns: cols, rows: [{ head: 'Purchases (net of debit notes)', ...itc }, { head: 'Expenses with GST bills', ...exp }], total: { head: 'Total ITC', taxable: round2(itc.taxable + exp.taxable), ...itcTotal, _total: true } },
      { title: 'Net position', columns: cols, rows: [netRow], total: null },
    ],
  };
}

// Unit cost for stock valuation: last purchase rate (pre-tax) if any, otherwise the item's purchase price.
function unitCosts(s, d, upTo) {
  const cost = new Map();
  for (const i of s.items) {
    const base = num(i.purchasePrice);
    cost.set(i.id, i.purchaseTaxIncl ? round2(base / (1 + num(i.gstRate) / 100)) : base);
  }
  const purchases = s.vouchers.filter((v) => v.kind === 'purchase' && (!upTo || v.date <= upTo)).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const v of purchases) {
    for (const l of d.calc.get(v.id).lines) if (l.itemId && l.calc.qty > 0) cost.set(l.itemId, round2(l.calc.taxable / l.calc.qty));
  }
  return cost;
}

function stockValue(s, stockMap, cost) {
  let v = 0;
  for (const [id, qty] of stockMap) v += Math.max(0, qty) * (cost.get(id) || 0);
  return round2(v);
}

function pnl(s, d, r) {
  const sales = s.vouchers.filter((v) => inRange(v.date, r));
  const sum = (kind) => round2(sales.filter((v) => v.kind === kind).reduce((t, v) => t + d.calc.get(v.id).taxable, 0));
  const netSales = round2(sum('sale') - sum('cnote'));
  const netPurchases = round2(sum('purchase') - sum('dnote'));
  const from = r.from || '2000-01-01';
  const to = r.to || todayISO();
  const openMap = stockAsOf(s, addDays(from, -1));
  const closeMap = stockAsOf(s, to);
  const closeCosts = unitCosts(s, d, to);
  const openStock = stockValue(s, openMap, unitCosts(s, d, addDays(from, -1)));
  const closeStock = stockValue(s, closeMap, closeCosts);
  const noCost = s.items.filter((i) => i.kind !== 'service' && !(closeCosts.get(i.id) > 0) && ((openMap.get(i.id) || 0) > 0 || (closeMap.get(i.id) || 0) > 0)).length;
  const cogs = round2(openStock + netPurchases - closeStock);
  const gross = round2(netSales - cogs);
  const byCat = new Map();
  for (const e of s.expenses) {
    if (!inRange(e.date, r)) continue;
    byCat.set(e.category || 'Other', round2((byCat.get(e.category || 'Other') || 0) + expenseTax(e).taxable));
  }
  const expRows = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([cat, amt]) => ({ head: cat, amount: amt }));
  const expTotal = sumBy(expRows, 'amount');
  const net = round2(gross - expTotal);
  const cols = [text('head', 'Particulars', { wrap: true }), money('amount', 'Amount')];
  return {
    kpis: [
      { k: 'Net sales', v: netSales, money: true },
      { k: 'Gross profit', v: gross, money: true },
      { k: 'Expenses', v: expTotal, money: true },
      { k: net >= 0 ? 'Net profit' : 'Net loss', v: Math.abs(net), money: true },
    ],
    note: (noCost ? `${noCost} ${noCost === 1 ? 'item has' : 'items have'} stock but no purchase price, so that stock counts as ₹0 and profit looks higher than it is. Add purchase prices in Items. ` : '')
      + 'Amounts exclude GST. Stock is valued at the latest purchase rate, or the item’s purchase price if it was never purchased.',
    tables: [
      {
        title: 'Trading account', columns: cols, rows: [
          { head: 'Sales (net of credit notes)', amount: netSales },
          { head: 'Opening stock', amount: openStock },
          { head: 'Purchases (net of debit notes)', amount: netPurchases },
          { head: 'Closing stock', amount: closeStock },
          { head: 'Cost of goods sold', amount: cogs },
        ], total: { head: 'Gross profit', amount: gross, _total: true },
      },
      { title: 'Expenses', columns: cols, rows: expRows, total: { head: 'Total expenses', amount: expTotal, _total: true } },
      { title: 'Result', columns: cols, rows: [{ head: net >= 0 ? 'Net profit' : 'Net loss', amount: net, _total: true }], total: null },
    ],
  };
}

function itemSales(s, d, r) {
  const m = new Map();
  for (const v of s.vouchers) {
    const sign = v.kind === 'sale' ? 1 : v.kind === 'cnote' ? -1 : 0;
    if (!sign || !inRange(v.date, r)) continue;
    for (const l of d.calc.get(v.id).lines) {
      const key = l.itemId || l.name;
      const x = m.get(key) || { item: l.name, unit: l.unit || '', qty: 0, taxable: 0, tax: 0, total: 0, link: l.itemId ? `item-${l.itemId}` : undefined };
      x.qty = Math.round((x.qty + sign * l.calc.qty) * 1000) / 1000;
      x.taxable = round2(x.taxable + sign * l.calc.taxable);
      x.tax = round2(x.tax + sign * l.calc.tax);
      x.total = round2(x.total + sign * l.calc.amount);
      m.set(key, x);
    }
  }
  const rows = [...m.values()].sort((a, b) => b.total - a.total).map((x) => ({ ...x, qtyText: `${fmtQty(x.qty)} ${x.unit}` }));
  return {
    kpis: [{ k: 'Items sold', v: String(rows.length) }, { k: 'Sales value', v: sumBy(rows, 'total'), money: true }],
    tables: [{ title: 'Items', columns: [text('item', 'Item', { wrap: true }), text('qtyText', 'Qty sold', { align: 'r' }), money('taxable', 'Taxable'), money('tax', 'GST'), money('total', 'Total')], rows, total: totalRow(rows, ['taxable', 'tax', 'total'], 'Total', 'item') }],
  };
}

function stockSummary(s, d) {
  const cost = unitCosts(s, d);
  const rows = s.items.filter((i) => i.kind !== 'service').sort((a, b) => a.name.localeCompare(b.name)).map((i) => {
    const qty = d.stock.get(i.id) || 0;
    const low = num(i.lowStock) > 0 && qty <= num(i.lowStock);
    return {
      link: `item-${i.id}`, item: i.name, hsn: i.hsn || '', qty: `${fmtQty(qty)} ${i.unit || ''}`, cost: cost.get(i.id) || 0,
      value: round2(Math.max(0, qty) * (cost.get(i.id) || 0)), status: qty <= 0 ? 'Out of stock' : low ? 'Low stock' : 'In stock',
    };
  });
  return {
    kpis: [
      { k: 'Stock value', v: sumBy(rows, 'value'), money: true },
      { k: 'Low or out of stock', v: String(rows.filter((x) => x.status !== 'In stock').length) },
    ],
    tables: [{ title: 'Products', columns: [text('item', 'Item', { wrap: true }), text('hsn', 'HSN'), text('qty', 'In stock', { align: 'r' }), money('cost', 'Unit cost'), money('value', 'Value'), text('status', 'Status')], rows, total: totalRow(rows, ['value'], 'Total', 'item') }],
  };
}

function outstanding(s, d) {
  const oldest = new Map();
  for (const v of s.vouchers) {
    const st = d.status.get(v.id);
    if (!st || st.due <= 0 || !v.partyId) continue;
    const prev = oldest.get(v.partyId);
    if (!prev || v.date < prev) oldest.set(v.partyId, v.date);
  }
  const rows = s.parties.map((p) => ({
    link: `party-${p.id}`, party: p.name, phone: p.phone || '', balance: d.balance.get(p.id) || 0, since: oldest.get(p.id) ? fmtDate(oldest.get(p.id)) : '',
  }));
  const rec = rows.filter((x) => x.balance > 0.009).sort((a, b) => b.balance - a.balance);
  const pay = rows.filter((x) => x.balance < -0.009).map((x) => ({ ...x, balance: -x.balance })).sort((a, b) => b.balance - a.balance);
  const cols = [text('party', 'Party', { wrap: true }), text('phone', 'Phone'), text('since', 'Unpaid since'), money('balance', 'Amount')];
  return {
    kpis: [{ k: 'To collect', v: d.toCollect, money: true }, { k: 'To pay', v: d.toPay, money: true }],
    tables: [
      { title: 'Receivables (to collect)', columns: cols, rows: rec, total: totalRow(rec, ['balance'], 'Total', 'party') },
      { title: 'Payables (to pay)', columns: cols, rows: pay, total: totalRow(pay, ['balance'], 'Total', 'party') },
    ],
  };
}

function dayBook(s, d, r) {
  const day = r.to || todayISO();
  const rows = [];
  for (const v of s.vouchers) {
    if (v.date !== day || v.kind === 'quote') continue;
    const c = d.calc.get(v.id);
    const settled = num(v.settled);
    const inflow = v.kind === 'sale' || v.kind === 'dnote' ? settled : 0;
    const outflow = v.kind === 'purchase' || v.kind === 'cnote' ? settled : 0;
    rows.push({ link: `doc-${v.id}`, type: KINDS[v.kind].label, no: v.number, party: (v.party && v.party.name) || 'Cash Sale', total: c.total, inflow, outflow, t: v.createdAt || '' });
  }
  for (const p of s.payments) {
    if (p.date !== day) continue;
    const party = s.parties.find((x) => x.id === p.partyId);
    rows.push({ link: `payment-edit-${p.id}`, type: p.direction === 'in' ? 'Payment In' : 'Payment Out', no: p.number, party: party ? party.name : '', total: num(p.amount), inflow: p.direction === 'in' ? num(p.amount) : 0, outflow: p.direction === 'out' ? num(p.amount) : 0, t: p.createdAt || '' });
  }
  for (const e of s.expenses) {
    if (e.date !== day) continue;
    rows.push({ link: `expense-edit-${e.id}`, type: 'Expense', no: e.number, party: e.category + (e.paidTo ? ` · ${e.paidTo}` : ''), total: num(e.amount), inflow: 0, outflow: num(e.amount), t: e.createdAt || '' });
  }
  rows.sort((a, b) => (a.t < b.t ? -1 : 1));
  const inT = sumBy(rows, 'inflow');
  const outT = sumBy(rows, 'outflow');
  return {
    kpis: [{ k: 'Money in', v: inT, money: true }, { k: 'Money out', v: outT, money: true }, { k: 'Net', v: round2(inT - outT), money: true }, { k: 'Entries', v: String(rows.length) }],
    tables: [{ title: `Entries on ${fmtDate(day)}`, columns: [text('type', 'Type'), text('no', 'No.'), text('party', 'Party', { wrap: true }), money('total', 'Amount'), money('inflow', 'Money in'), money('outflow', 'Money out')], rows, total: totalRow(rows, ['inflow', 'outflow'], 'Total', 'type') }],
  };
}

function expenseReport(s, d, r) {
  const list = s.expenses.filter((e) => inRange(e.date, r)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const byCat = new Map();
  list.forEach((e) => byCat.set(e.category || 'Other', round2((byCat.get(e.category || 'Other') || 0) + num(e.amount))));
  const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount }));
  const rows = list.map((e) => ({ link: `expense-edit-${e.id}`, date: fmtDate(e.date), no: e.number, category: e.category, paidTo: e.paidTo || '', mode: e.paymentMode || '', amount: num(e.amount) }));
  return {
    kpis: [{ k: 'Total expenses', v: sumBy(rows, 'amount'), money: true }, { k: 'Entries', v: String(rows.length) }],
    tables: [
      { title: 'By category', columns: [text('category', 'Category'), money('amount', 'Amount')], rows: catRows, total: totalRow(catRows, ['amount'], 'Total', 'category') },
      { title: 'All expenses', columns: [text('date', 'Date'), text('no', 'No.'), text('category', 'Category'), text('paidTo', 'Paid to', { wrap: true }), text('mode', 'Mode'), money('amount', 'Amount')], rows, total: totalRow(rows, ['amount'], 'Total', 'date') },
    ],
  };
}

export function buildReport(key, s, range) {
  const d = derive(s);
  switch (key) {
    case 'sales': return salesSummary(s, d, range, 'sale');
    case 'purchases': return salesSummary(s, d, range, 'purchase');
    case 'gstr1': return gstr1(s, d, range);
    case 'gstr3b': return gstr3b(s, d, range);
    case 'hsn': {
      const rows = hsnRows(s, d, range);
      return {
        kpis: [{ k: 'Taxable value', v: sumBy(rows, 'taxable'), money: true }, { k: 'Total tax', v: round2(sumBy(rows, 'igst') + sumBy(rows, 'cgst') + sumBy(rows, 'sgst')), money: true }],
        tables: [{ title: 'HSN-wise sales (net of credit notes)', columns: hsnColumns, rows, total: totalRow(rows, ['taxable', 'igst', 'cgst', 'sgst', 'total'], 'Total', 'hsn') }],
      };
    }
    case 'pnl': return pnl(s, d, range);
    case 'itemsales': return itemSales(s, d, range);
    case 'stock': return stockSummary(s, d);
    case 'outstanding': return outstanding(s, d);
    case 'daybook': return dayBook(s, d, range);
    case 'expenses': return expenseReport(s, d, range);
    default: return { kpis: [], tables: [] };
  }
}

export function cellText(col, row) {
  const v = row[col.key];
  if (v === '' || v === undefined || v === null) return '';
  if (col.type === 'money') return fmtAmt(v, { decimals: 'always' });
  if (col.type === 'qty') return fmtQty(v);
  return String(v);
}

export function reportCsv(title, rangeLabel, report) {
  const lines = [csvEscape(title), csvEscape(rangeLabel), ''];
  for (const t of report.tables) {
    lines.push(csvEscape(t.title));
    lines.push(t.columns.map((c) => csvEscape(c.label)).join(','));
    const rows = t.total ? [...t.rows, t.total] : t.rows;
    for (const r of rows) {
      lines.push(t.columns.map((c) => {
        const v = r[c.key];
        if (c.type === 'money' && v !== '' && v !== undefined) return round2(num(v)).toFixed(2);
        return csvEscape(v ?? '');
      }).join(','));
    }
    lines.push('');
  }
  return '﻿' + lines.join('\r\n');
}

export function statementCsv(s, party) {
  const rows = partyStatement(s, party.id);
  const lines = [csvEscape(`Statement: ${party.name}`), '', 'Date,Particulars,Ref,Debit,Credit,Balance'];
  for (const r of rows) {
    lines.push([fmtDate(r.date), r.label, r.ref, r.debit.toFixed(2), r.credit.toFixed(2), r.balance.toFixed(2)].map(csvEscape).join(','));
  }
  return '﻿' + lines.join('\r\n');
}
