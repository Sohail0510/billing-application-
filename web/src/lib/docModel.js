// The printable content of a bill, shared by the on-screen preview and the PDF so both always agree.
import { KINDS, stateName } from './gst.js';
import { fmtAmt, fmtDate, fmtQty, amountInWords, num } from './format.js';
import { voucherCalc } from './ledger.js';

export const THEMES = {
  green: { label: 'Green', fill: '#E2EFD9', accent: '#4A8A1E' },
  blue: { label: 'Blue', fill: '#DDE8F6', accent: '#1F5AA6' },
  purple: { label: 'Purple', fill: '#E8E2F5', accent: '#5A3AA5' },
  orange: { label: 'Orange', fill: '#FBE5D3', accent: '#B8561A' },
  black: { label: 'Black', fill: '#E9E9E9', accent: '#1E1E1E' },
};

export function businessAddress(biz) {
  return [biz.address, biz.city, stateName(biz.state), biz.pincode].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
}

export function buildDocModel(v, s, d) {
  const k = KINDS[v.kind];
  const c = (d && d.calc.get(v.id)) || voucherCalc(v, s.settings);
  const st = d && d.status.get(v.id);
  const biz = s.settings.business;
  const inv = s.settings.invoice;
  const p = v.party || {};
  const isPurchase = k.side === 'purchase';
  const title = v.kind === 'sale' ? (biz.gstin ? 'TAX INVOICE' : 'INVOICE') : k.title;

  const meta = [
    { label: k.numberLabel, value: v.number || '' },
    { label: k.dateLabel, value: fmtDate(v.date) },
  ];
  if (k.dueLabel && v.dueDate) meta.push({ label: k.dueLabel, value: fmtDate(v.dueDate) });
  if (v.refNumber) meta.push({ label: v.kind === 'purchase' ? 'Our Ref.' : 'Against', value: v.refNumber });

  const billTo = {
    heading: isPurchase ? 'BILL FROM' : 'BILL TO',
    name: p.name || 'Cash Sale',
    address: p.billingAddress || '',
    gstin: p.gstin || '',
    pan: p.pan || '',
    phone: p.phone || '',
    pos: v.kind !== 'purchase' && v.kind !== 'dnote' ? stateName(v.taxState) : '',
  };
  let shipTo = null;
  if (!isPurchase && p.name) {
    shipTo = { heading: 'SHIP TO', name: p.name, address: p.shippingAddress || p.billingAddress || '' };
  }

  const hasDisc = c.lines.some((l) => num(l.discountPct) > 0);
  const rows = c.lines.map((l, i) => ({
    sno: String(i + 1),
    name: l.name || '',
    desc: l.description || '',
    hsn: l.hsn || '',
    qty: `${fmtQty(l.calc.qty)} ${l.unit || ''}`.trim(),
    rate: fmtAmt(l.calc.unitRate),
    disc: num(l.discountPct) ? `${fmtQty(l.discountPct)}%` : '',
    tax: fmtAmt(l.calc.tax),
    taxPct: `(${fmtQty(l.calc.gstRate)}%)`,
    amount: fmtAmt(l.calc.amount),
  }));

  const summary = [];
  if (c.roundOff) summary.push({ label: 'ROUND OFF', value: (c.roundOff > 0 ? '+' : '') + fmtAmt(c.roundOff) });
  const settleRows = [];
  if (v.kind === 'sale' || v.kind === 'purchase') {
    const paid = st ? st.paid : num(v.settled);
    settleRows.push({ label: v.kind === 'sale' ? 'RECEIVED AMOUNT' : 'PAID AMOUNT', value: '₹ ' + fmtAmt(paid) });
    const due = st ? st.due : c.total - paid;
    if (paid > 0 && due > 0.009) settleRows.push({ label: 'BALANCE AMOUNT', value: '₹ ' + fmtAmt(due) });
  } else if (num(v.settled) > 0) {
    settleRows.push({ label: k.settleLabel.toUpperCase(), value: '₹ ' + fmtAmt(v.settled) });
  }

  const hsn = {
    inter: c.inter,
    rows: c.hsn.map((g) => ({
      hsn: g.hsn || '-',
      taxable: fmtAmt(g.taxable),
      rate: fmtQty(c.inter ? g.rate : g.rate / 2) + '%',
      cgst: fmtAmt(g.cgst),
      sgst: fmtAmt(g.sgst),
      igst: fmtAmt(g.igst),
      tax: '₹ ' + fmtAmt(g.tax),
    })),
    total: c.hsn.length > 1 ? {
      taxable: fmtAmt(c.taxable), cgst: fmtAmt(c.cgst), sgst: fmtAmt(c.sgst), igst: fmtAmt(c.igst), tax: '₹ ' + fmtAmt(c.tax),
    } : null,
  };

  const bank = [];
  if (!isPurchase) {
    if (biz.bankName) bank.push(['Bank', biz.bankName + (biz.branch ? ', ' + biz.branch : '')]);
    if (biz.accountName) bank.push(['A/c Name', biz.accountName]);
    if (biz.accountNo) bank.push(['A/c No.', biz.accountNo]);
    if (biz.ifsc) bank.push(['IFSC', biz.ifsc]);
    if (biz.upi) bank.push(['UPI', biz.upi]);
  }

  const termsText = v.terms !== undefined ? v.terms : inv.terms;
  const terms = String(termsText || '')
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/\[CITY\]/g, (biz.city || 'HYDERABAD').toUpperCase()));

  return {
    title,
    copyLabel: v.kind === 'sale' ? 'ORIGINAL FOR RECIPIENT' : '',
    theme: THEMES[inv.color] || THEMES.green,
    business: {
      name: biz.name || 'Your Business Name',
      address: businessAddress(biz),
      gstin: biz.gstin || '',
      phone: biz.phone || '',
      pan: biz.pan || '',
      email: biz.email || '',
      logo: biz.logo || '',
    },
    meta,
    billTo,
    shipTo,
    hasDisc,
    rows,
    summary,
    totals: { qty: fmtQty(c.qty), tax: '₹ ' + fmtAmt(c.tax), amount: '₹ ' + fmtAmt(c.total) },
    settleRows,
    showHsn: inv.showHsnSummary !== false && c.tax > 0,
    hsn,
    words: amountInWords(c.total),
    notes: String(v.notes || '').trim(),
    terms,
    bank,
    signature: inv.showSignature ? (biz.name || '') : '',
    fileName: `${(v.number || 'bill').replace(/[^A-Za-z0-9-]+/g, '_')}_${k.label.replace(/\s+/g, '_').toLowerCase()}_${(p.name || 'cash').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}.pdf`,
  };
}
