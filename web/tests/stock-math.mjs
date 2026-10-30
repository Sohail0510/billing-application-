// Stock quantity: opening stock, scanned units, purchases and sales all add up.
import { derive } from '../src/lib/ledger.js';
let version = 0;
const base = () => ({
  version: ++version,
  settings: { business: { state: '36' }, invoice: { terms: '' } },
  parties: [{ id: 'p1', name: 'Lakshmi', kind: 'customer', openingBalance: 0 }],
  items: [{ id: 'i1', name: 'LG AC', kind: 'product', openingStock: 4, gstRate: 18, salePrice: 1000, saleTaxIncl: true }],
  vouchers: [], payments: [], expenses: [], units: [],
});
const sale = (qty) => ({ id: 'v1', kind: 'sale', number: '1', date: '2026-10-30', partyId: 'p1', party: { name: 'Lakshmi' }, taxState: '36', lines: [{ itemId: 'i1', name: 'LG AC', qty, price: 1000, taxIncl: true, gstRate: 18 }], settled: 0 });
const unit = { id: 'u1', itemId: 'i1', serial: 'SN1', status: 'in_stock', addedDate: '2026-10-30' };
const stockOf = (s) => derive({ ...s, version: ++version }).stock.get('i1');
const checks = [
  ['opening stock only', stockOf(base()), 4],
  ['after scanning one unit', stockOf({ ...base(), units: [unit] }), 5],
  ['after selling one', stockOf({ ...base(), units: [{ ...unit, status: 'sold', soldIn: 'v1' }], vouchers: [sale(1)] }), 4],
  ['after deleting that sale', stockOf({ ...base(), units: [unit], vouchers: [] }), 5],
];
let fail = 0;
for (const [name, got, want] of checks) {
  const ok = got === want;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', name, got, 'expected', want);
}
process.exit(fail ? 1 : 0);
