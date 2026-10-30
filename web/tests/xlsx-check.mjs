// Writes a sample workbook with the app's writer so the Python checker can open it.
import { buildXlsx } from '../src/lib/xlsx.js';
import { writeFileSync } from 'node:fs';
const bytes = buildXlsx({
  sheetName: 'Stock',
  headers: ['Serial no', 'Model no', 'Product', 'Price (₹)', 'Note & "quote" <x>'],
  rows: [['SN-0001', 'AC-15-5S', 'Split AC 1.5 ton', 52000, 'Sold & gone'], ['SN-0002', '', 'Stabilizer', 2600, ''], ['SN 3 ✓', 'M/N 9', 'Fridge', 24500.5, 'नया']],
  widths: [16, 14, 24, 12, 22],
});
writeFileSync(process.argv[2], bytes);
console.log('wrote', bytes.length, 'bytes');
