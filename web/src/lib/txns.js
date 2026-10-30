// One list of every entry (bills, payments, expenses) for the Bills tab, the home screen and party pages.
import { KINDS } from './gst.js';
import { num, fmtDateShort } from './format.js';

export const FILTERS = [
  ['all', 'All'], ['sale', 'Sales'], ['purchase', 'Purchases'], ['quote', 'Quotations'],
  ['payments', 'Payments'], ['expense', 'Expenses'], ['returns', 'Returns'],
];

export function txnEntries(s, d, { filter = 'all', partyId = '', from = '', to = '', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  const out = [];
  const partyName = (id) => (s.parties.find((p) => p.id === id) || {}).name || '';
  const keep = (date) => (!from || date >= from) && (!to || date <= to);
  const want = (type) => filter === 'all'
    || filter === type
    || (filter === 'payments' && (type === 'payin' || type === 'payout'))
    || (filter === 'returns' && (type === 'cnote' || type === 'dnote'));

  for (const v of s.vouchers) {
    if (!want(v.kind) || !keep(v.date) || (partyId && v.partyId !== partyId)) continue;
    const k = KINDS[v.kind];
    const c = d.calc.get(v.id);
    const st = d.status.get(v.id);
    const name = (v.party && v.party.name) || 'Cash Sale';
    if (q && !`${name} ${v.number} ${k.label}`.toLowerCase().includes(q)) continue;
    out.push({
      id: v.id, type: v.kind, date: v.date, sort: v.date + (v.createdAt || ''), link: `doc-${v.id}`,
      title: name, meta: `${k.label} #${v.number} · ${fmtDateShort(v.date)}`, amount: c.total,
      amountClass: k.side === 'purchase' ? '' : '', st: v.kind === 'sale' || v.kind === 'purchase' ? st : null,
      tag: v.kind === 'quote' ? (v.status === 'converted' ? 'Converted' : 'Open') : v.kind === 'cnote' || v.kind === 'dnote' ? 'Return' : '',
      due: st ? st.due : 0,
    });
  }
  for (const p of s.payments) {
    const type = p.direction === 'in' ? 'payin' : 'payout';
    if (!want(type) || !keep(p.date) || (partyId && p.partyId !== partyId)) continue;
    const name = partyName(p.partyId);
    const label = p.direction === 'in' ? 'Payment In' : 'Payment Out';
    if (q && !`${name} ${p.number} ${label}`.toLowerCase().includes(q)) continue;
    out.push({
      id: p.id, type, date: p.date, sort: p.date + (p.createdAt || ''), link: `payment-edit-${p.id}`,
      title: name || label, meta: `${label} #${p.number} · ${p.mode} · ${fmtDateShort(p.date)}`, amount: num(p.amount),
      amountClass: p.direction === 'in' ? 'c-collect' : 'c-pay', sign: p.direction === 'in' ? '+' : '−',
    });
  }
  if (!partyId) {
    for (const e of s.expenses) {
      if (!want('expense') || !keep(e.date)) continue;
      if (q && !`${e.category} ${e.paidTo || ''} ${e.number}`.toLowerCase().includes(q)) continue;
      out.push({
        id: e.id, type: 'expense', date: e.date, sort: e.date + (e.createdAt || ''), link: `expense-edit-${e.id}`,
        title: e.category + (e.paidTo ? ` · ${e.paidTo}` : ''), meta: `Expense #${e.number} · ${fmtDateShort(e.date)}`, amount: num(e.amount),
        amountClass: 'c-pay', sign: '−',
      });
    }
  }
  out.sort((a, b) => (a.sort < b.sort ? 1 : a.sort > b.sort ? -1 : 0));
  return out;
}
