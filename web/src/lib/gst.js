// GST rules: state codes, rates, units, GSTIN checks and invoice arithmetic.
import { round2, num } from './format.js';

export const STATES = [
  ['01', 'Jammu & Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'],
  ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'],
  ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra & Nagar Haveli and Daman & Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'],
  ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman & Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
  ['97', 'Other Territory'],
];
const STATE_MAP = Object.fromEntries(STATES);
export const stateName = (code) => STATE_MAP[code] || '';

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40];

// Display unit -> GST UQC code used in the HSN summary of GSTR-1.
export const UNITS = [
  ['PCS', 'PCS'], ['NOS', 'NOS'], ['BOX', 'BOX'], ['SET', 'SET'], ['PAIR', 'PRS'], ['KGS', 'KGS'],
  ['GMS', 'GMS'], ['LTR', 'LTR'], ['MTR', 'MTR'], ['DOZ', 'DOZ'], ['PKT', 'PAC'], ['BAG', 'BAG'],
  ['ROLL', 'ROL'], ['SQFT', 'SQF'], ['SQM', 'SQM'], ['UNIT', 'UNT'], ['HRS', 'OTH'], ['JOB', 'OTH'],
];
export const uqc = (unit) => (UNITS.find((u) => u[0] === unit) || [unit, 'OTH'])[1];

export const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card'];

export const EXPENSE_CATEGORIES = ['Rent', 'Salary', 'Electricity', 'Transport', 'Repairs', 'Telephone & Internet',
  'Office Supplies', 'Marketing', 'Bank Charges', 'Food & Tea', 'Other'];

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

// Returns '' when valid (or empty), otherwise a message saying what is wrong.
export function gstinProblem(gstin) {
  const g = String(gstin || '').trim().toUpperCase();
  if (!g) return '';
  if (g.length !== 15) return 'GSTIN must be 15 characters.';
  if (!GSTIN_RE.test(g)) return 'GSTIN format looks wrong. Check it against the registration certificate.';
  if (!STATE_MAP[g.slice(0, 2)]) return 'The first two digits are not a valid state code.';
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return 'The last character does not match. Check for a typo.';
  return '';
}

export const panFromGstin = (g) => (String(g || '').length >= 12 ? String(g).slice(2, 12).toUpperCase() : '');
export const stateFromGstin = (g) => {
  const code = String(g || '').slice(0, 2);
  return STATE_MAP[code] ? code : '';
};

// Voucher kinds. `ledger` is the sign applied to (total - settled) on the party balance,
// where a positive balance means the party owes the business. `stock` is the sign on item quantity.
export const KINDS = {
  sale: {
    label: 'Sales Invoice', plural: 'Sales Invoices', side: 'sale', ledger: 1, stock: -1,
    title: 'TAX INVOICE', numberLabel: 'Invoice No.', dateLabel: 'Invoice Date', dueLabel: 'Due Date',
    settleLabel: 'Amount received', partyRole: 'Customer', prefix: '', hasDue: true,
  },
  quote: {
    label: 'Quotation', plural: 'Quotations', side: 'sale', ledger: 0, stock: 0,
    title: 'QUOTATION', numberLabel: 'Quotation No.', dateLabel: 'Quotation Date', dueLabel: 'Valid Till',
    settleLabel: '', partyRole: 'Customer', prefix: 'QT-', hasDue: true,
  },
  cnote: {
    label: 'Credit Note', plural: 'Credit Notes', side: 'sale', ledger: -1, stock: 1,
    title: 'CREDIT NOTE', numberLabel: 'Credit Note No.', dateLabel: 'Date', dueLabel: '',
    settleLabel: 'Amount refunded', partyRole: 'Customer', prefix: 'CN-', hasDue: false,
  },
  purchase: {
    label: 'Purchase Invoice', plural: 'Purchases', side: 'purchase', ledger: -1, stock: 1,
    title: 'PURCHASE INVOICE', numberLabel: 'Bill No.', dateLabel: 'Bill Date', dueLabel: 'Due Date',
    settleLabel: 'Amount paid', partyRole: 'Supplier', prefix: 'PUR-', hasDue: true,
  },
  dnote: {
    label: 'Debit Note', plural: 'Debit Notes', side: 'purchase', ledger: 1, stock: -1,
    title: 'DEBIT NOTE', numberLabel: 'Debit Note No.', dateLabel: 'Date', dueLabel: '',
    settleLabel: 'Refund received', partyRole: 'Supplier', prefix: 'DN-', hasDue: false,
  },
};
export const KIND_KEYS = Object.keys(KINDS);

// One invoice line. Tax-inclusive prices keep the line total exact (34,000 stays 34,000)
// and back out the taxable value, which is how the sample invoice shows 28,813.56 + 5,186.44.
export function computeLine(line) {
  const qty = num(line.qty);
  const price = num(line.price);
  const r = num(line.gstRate) / 100;
  const disc = Math.min(Math.max(num(line.discountPct), 0), 100) / 100;
  let taxable;
  let tax;
  let amount;
  if (line.taxIncl) {
    amount = round2(qty * price * (1 - disc));
    taxable = round2(amount / (1 + r));
    tax = round2(amount - taxable);
  } else {
    taxable = round2(qty * price * (1 - disc));
    tax = round2(taxable * r);
    amount = round2(taxable + tax);
  }
  const unitRate = line.taxIncl ? round2(price / (1 + r)) : round2(price);
  const discountAmt = line.taxIncl
    ? round2(qty * unitRate * disc)
    : round2(qty * price * disc);
  return { qty, unitRate, taxable, tax, amount, discountAmt, gstRate: num(line.gstRate) };
}

export function isInterState(taxState, businessState) {
  return Boolean(taxState && businessState && taxState !== businessState);
}

// Full voucher arithmetic: line values, HSN-wise tax split and totals.
export function computeVoucher(v, businessState) {
  const inter = isInterState(v.taxState, businessState);
  const lines = (v.lines || []).map((l) => ({ ...l, calc: computeLine(l) }));
  const groupMap = new Map();
  for (const l of lines) {
    const key = `${l.hsn || ''}|${l.calc.gstRate}`;
    const g = groupMap.get(key) || { hsn: l.hsn || '', rate: l.calc.gstRate, taxable: 0, tax: 0, qty: 0, unit: l.unit };
    g.taxable = round2(g.taxable + l.calc.taxable);
    g.tax = round2(g.tax + l.calc.tax);
    g.qty += l.calc.qty;
    groupMap.set(key, g);
  }
  const hsn = [...groupMap.values()].map((g) => {
    if (inter) return { ...g, igst: g.tax, cgst: 0, sgst: 0 };
    const cgst = round2(g.tax / 2);
    return { ...g, igst: 0, cgst, sgst: round2(g.tax - cgst) };
  });
  const sum = (arr, k) => round2(arr.reduce((s, x) => s + x[k], 0));
  const taxable = sum(hsn, 'taxable');
  const tax = sum(hsn, 'tax');
  const gross = round2(taxable + tax);
  const roundOff = v.roundOff ? round2(Math.round(gross) - gross) : 0;
  const total = round2(gross + roundOff);
  const discount = round2(lines.reduce((s, l) => s + l.calc.discountAmt, 0));
  return {
    inter, lines, hsn, taxable, tax, gross, roundOff, total, discount,
    cgst: sum(hsn, 'cgst'), sgst: sum(hsn, 'sgst'), igst: sum(hsn, 'igst'),
    qty: Math.round(lines.reduce((s, l) => s + l.calc.qty, 0) * 1000) / 1000,
  };
}
