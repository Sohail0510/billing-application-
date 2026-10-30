// Recreates invoice 621 from the sample (business details anonymised) and writes the PDF.
import { buildDocModel } from '../src/lib/docModel.js';
import { renderInvoicePdf } from '../src/pdf/invoicePdf.js';
import { defaultSettings } from '../src/lib/db.js';
import { derive } from '../src/lib/ledger.js';
import { writeFileSync } from 'node:fs';

const settings = defaultSettings();
Object.assign(settings.business, {
  name: 'NOBLE ELECTRONICS', address: '12-2-837/A/6, ASIF NAGAR, HYDERABAD', city: 'Hyderabad', state: '36',
  gstin: '36BJOPS7708D1ZT', phone: '9866716563', pan: 'BJOPS7708D',
});
const party = { id: 'p1', name: 'JAANVI ELECTRONICS', gstin: '36CMFPM4487G1ZP', pan: 'CMFPM4487G', state: '36',
  billingAddress: '2-4-135, LINGAREDDY COMPLEX, SIKH VILLAGE ,NEAR HANUMAN TEMPLE, TADBUND, Secunderabad, Medchal Malkajgiri, Hyderabad, Telangana, 500009' };
const v = { id: 'v1', kind: 'sale', number: '621', seq: 621, date: '2026-10-25', dueDate: '2026-11-01', partyId: 'p1', party,
  taxState: '36', bizState: '36', roundOff: true, settled: 0, lines: [
  { name: 'LG 1.5 5 STAR', hsn: '8415', qty: 1, unit: 'PCS', price: 34000, taxIncl: true, gstRate: 18 },
  { name: 'DAIKIN 1.5 TON', hsn: '8415', qty: 2, unit: 'PCS', price: 25000, taxIncl: false, gstRate: 18 } ] };
const s = { version: 1, settings, parties: [party], items: [], vouchers: [v], payments: [], expenses: [] };
const model = buildDocModel(v, s, derive(s));
const out = process.argv[2] || 'invoice-621.pdf';
writeFileSync(out, await renderInvoicePdf(model));
console.log('wrote', out, model.fileName);

// Long invoice to exercise page breaks and inter-state tax.
const many = { ...v, id: 'v2', number: '622', taxState: '29', lines: Array.from({ length: 34 }, (_, i) => ({
  name: i % 5 === 0 ? 'Voltas 1.5 Ton 3 Star Inverter Split AC with copper condenser and stabiliser kit' : `Item number ${i + 1}`,
  hsn: i % 2 ? '8415' : '8418', qty: (i % 3) + 1, unit: 'PCS', price: 1000 + i * 137.5, taxIncl: i % 2 === 0, gstRate: i % 2 ? 18 : 5, discountPct: i === 3 ? 10 : 0 })) };
const s2 = { ...s, version: 2, vouchers: [many] };
writeFileSync(out.replace('.pdf', '-long.pdf'), await renderInvoicePdf(buildDocModel(many, s2, derive(s2))));
