// Checks label reading and the stock sheet (no browser needed).
import { parseLabel, stockRows, stockWorkbook } from '../src/lib/units.js';
import { writeFileSync } from 'node:fs';
const cases = [
  ['Model No: AC-15-5S\nSerial No: 22A12345\nMade in India', 'AC-15-5S', '22A12345'],
  ['M/N: NX-3000 S/N: 0045678', 'NX-3000', '0045678'],
  ['Model no. SPLIT 1.5T\nSerial Number SN998877', '', 'SN998877'],
  ['Model: Samsung 253L | Serial No', '', ''],
  ['MODEL NUMBER: VG-4500/A\nSL NO. 7788-0091', 'VG-4500/A', '7788-0091'],
  ['random words with no labels 12345', '', ''],
];
let fail = 0;
for (const [text, model, serial] of cases) {
  const r = parseLabel(text);
  const ok = r.model === model && r.serial === serial;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(text), '->', r.model, '|', r.serial);
}
const units = [
  { id: '1', serial: '22A12345', model: 'AC-15-5S', productName: 'Split AC 1.5 ton', brand: 'LG', hsn: '8415', status: 'in_stock', addedDate: '2026-10-30', createdAt: '2026-10-30T10:00' },
  { id: '2', serial: 'SN-0002', model: 'NX-3000', productName: 'Fridge', status: 'sold', invoiceNo: '104', addedDate: '2026-10-29', soldDate: '2026-10-30', partyName: 'Lakshmi Traders', createdAt: '2026-10-29T09:00' },
];
console.log(stockRows(units, []));
writeFileSync(process.argv[2] || '/home/claude/scratchpad_units.xlsx', stockWorkbook(units, []));
console.log(fail ? `${fail} failed` : 'all label checks passed');
process.exit(fail ? 1 : 0);
