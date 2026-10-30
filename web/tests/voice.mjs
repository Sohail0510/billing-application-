// Unit checks for the voice command parser (no browser needed).
import { interpret } from '../src/lib/voice.js';

const ctx = {
  parties: [{ id: 'p1', name: 'Ali Traders' }, { id: 'p2', name: 'Ali' }, { id: 'p3', name: 'Sri Kalki Electronics' }],
  items: [{ id: 'i1', name: 'Fan', hsn: '8414', unit: 'PCS', gstRate: 18, saleTaxIncl: true }, { id: 'i2', name: 'LED Bulb', gstRate: 12, saleTaxIncl: false }, { id: 'i3', name: 'COPPER PIPE (PER MTR)', gstRate: 18, saleTaxIncl: true }],
  balanceOf: (id) => ({ p1: 5000, p2: 0, p3: -1200 })[id] ?? 0,
  monthSales: 93000, toCollect: 41121792.82, toPay: 0, lowStockCount: 2,
};

const cases = [
  ['open sales report', (r) => r.type === 'navigate' && r.to === 'report-sales'],
  ['new payment in', (r) => r.type === 'navigate' && r.to === 'payment-new-in'],
  ['add expense', (r) => r.type === 'navigate' && r.to === 'expense-new'],
  ['show parties', (r) => r.type === 'navigate' && r.to === 'parties'],
  ['gstr 3b report', (r) => r.type === 'navigate' && r.to === 'report-gstr3b'],
  ['go to home', (r) => r.type === 'navigate' && r.to === 'home'],
  ['how much does Ali Traders owe', (r) => r.type === 'answer' && r.reply === 'Ali Traders owes you ₹5,000.'],
  ['how much do I owe Sri Kalki Electronics', (r) => r.type === 'answer' && r.reply === 'You owe Sri Kalki Electronics ₹1,200.'],
  ['sales this month', (r) => r.type === 'answer' && r.reply === 'Sales this month are ₹93,000.'],
  ['how much to collect', (r) => r.type === 'answer' && r.reply === 'You have ₹4,11,21,793 to collect.'],
  ['invoice for Ali Traders, 2 fans at 1500 and 1 led bulb at 300', (r) =>
    r.type === 'draft' && r.draft.partyId === 'p1' && r.draft.lines.length === 2 &&
    r.draft.lines[0].itemId === 'i1' && r.draft.lines[0].qty === 2 && r.draft.lines[0].price === 1500 &&
    r.draft.lines[1].itemId === 'i2' && r.draft.lines[1].price === 300],
  ['invoice for Sri Kalki Electronics, 3 cable at 50', (r) =>
    r.type === 'draft' && r.draft.partyId === 'p3' && r.draft.lines[0].itemId === '' && r.draft.lines[0].name === 'Cable' && r.draft.lines[0].gstRate === 0],
  ['invoice for Ali Traders, 1 copper pipe at 650', (r) => r.type === 'draft' && r.draft.lines[0].itemId === 'i3' && r.draft.lines[0].gstRate === 18],
  ['bill for Ali Traders', (r) => r.type === 'navigate' && r.to === 'bill-new-sale-p1'],
  ['इस महीने बिक्री कितनी है', (r) => r.type === 'answer' && r.reply === 'Sales this month are ₹93,000.'],
  ['पार्टी खोलो', (r) => r.type === 'navigate' && r.to === 'parties'],
  ['नया भुगतान लेना', (r) => r.type === 'navigate' && r.to === 'payment-new-in'],
  ['blah blah', (r) => r.type === 'unknown'],
];

let fail = 0;
for (const [text, check] of cases) {
  const r = interpret(text, ctx);
  const ok = check(r);
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(text), '->', JSON.stringify({ ...r, draft: r.draft ? { partyId: r.draft.partyId, lines: r.draft.lines.map((l) => [l.name, l.qty, l.price, l.itemId]) } : undefined }));
}
console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
