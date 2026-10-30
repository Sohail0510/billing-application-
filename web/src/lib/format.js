// Number, date and text helpers shared by the app, reports and the invoice PDF.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// Indian digit grouping (12,34,567.89). Whole numbers drop the decimals, like the sample invoice.
export function fmtAmt(n, { decimals = 'auto' } = {}) {
  const v = round2(num(n));
  const neg = v < 0;
  const abs = Math.abs(v);
  const showDec = decimals === 'always' || (decimals === 'auto' && Math.round(abs * 100) % 100 !== 0);
  const [intPart, decPart] = abs.toFixed(2).split('.');
  let head = intPart;
  let out = '';
  if (head.length > 3) {
    out = ',' + head.slice(-3);
    head = head.slice(0, -3);
    while (head.length > 2) {
      out = ',' + head.slice(-2) + out;
      head = head.slice(0, -2);
    }
    out = head + out;
  } else {
    out = head;
  }
  return (neg ? '-' : '') + out + (showDec ? '.' + decPart : '');
}

export const fmtMoney = (n, opts) => '₹ ' + fmtAmt(n, opts);

export function fmtQty(n) {
  const v = Math.round(num(n) * 1000) / 1000;
  return String(v);
}

export const pad2 = (n) => String(n).padStart(2, '0');

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + Number(days || 0));
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// 2026-10-25 -> 25/10/2026
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDateShort(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function monthRange(iso = todayISO()) {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(last)}` };
}

// Indian financial year (April to March) containing the date.
export function financialYear(iso = todayISO()) {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `FY ${start}-${String(start + 1).slice(2)}` };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? ONES[h] + ' Hundred' : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}

// Indian numbering: crore, lakh, thousand.
export function intToWords(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(intToWords(crore) + ' Crore');
  if (lakh) parts.push(twoDigits(lakh) + ' Lakh');
  if (thousand) parts.push(twoDigits(thousand) + ' Thousand');
  if (n) parts.push(threeDigits(n));
  return parts.join(' ');
}

// 93000 -> "Ninety Three Thousand Rupees"; 1234.5 -> "One Thousand Two Hundred Thirty Four Rupees and Fifty Paise"
export function amountInWords(amount) {
  const v = round2(Math.abs(num(amount)));
  const rupees = Math.floor(v);
  const paise = Math.round((v - rupees) * 100);
  let s = intToWords(rupees) + ' Rupees';
  if (paise) s += ' and ' + twoDigits(paise) + ' Paise';
  return s;
}

export function uid() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return (t + r).replace(/[^a-z0-9]/g, '');
}

export const clean = (s) => String(s ?? '').trim();

export function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
