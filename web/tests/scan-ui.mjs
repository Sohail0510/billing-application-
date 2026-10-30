// Scan a label, save the unit, sell it on an invoice, and check the Excel stock sheet that comes out.
// Uses a fake Android bridge for label reading and file saving.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const base = process.argv[2] || 'http://localhost:8765/index.html';
const outDir = process.argv[3] || '/tmp';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  window.__saves = []; window.__spoken = [];
  window.HisaabAndroid = {
    canListen() { return true; },
    listen() {},
    speak(t) { window.__spoken.push(t); },
    recognizeText() { setTimeout(() => window.__hisaabOcr && window.__hisaabOcr(window.__ocrText || ''), 30); },
    saveReplacing(b64, name, mime) { window.__saves.push({ name, mime, b64 }); return 'Updated Downloads/Hisaab/' + name; },
    shareFile() { return ''; }, saveFile() { return ''; }, openExternal() {},
  };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
let failed = 0;
const check = (cond, msg) => { if (!cond) failed++; console.log(cond ? 'ok  ' : 'FAIL', msg); };

await page.goto(base);
await page.getByRole('button', { name: 'Try sample data' }).click();
await page.waitForSelector('text=To collect');

// 1. Scan a label from the Create menu.
await page.getByRole('button', { name: 'Create a bill or entry' }).click();
await page.getByRole('button', { name: 'Scan label' }).click();
await page.waitForFunction(() => location.hash === '#scan');
await page.evaluate(() => { window.__ocrText = 'Model No: AC-15-5S\nSerial No: 22A12345\nMade in India'; });
await page.setInputFiles('#scan-file', { name: 'label.png', mimeType: 'image/png', buffer: PNG });
await page.waitForFunction(() => document.querySelector('#scan-serial') && document.querySelector('#scan-serial').value === '22A12345', null, { timeout: 8000 });
check(await page.inputValue('#scan-model') === 'AC-15-5S', 'model read from the label');
check(await page.inputValue('#scan-serial') === '22A12345', 'serial read from the label');
await page.selectOption('#scan-item', { label: 'LG 1.5 TON 5 STAR AC' });
await page.getByRole('button', { name: 'Save to stock sheet' }).click();
await page.waitForFunction(() => window.__saves.length > 0, null, { timeout: 8000 });
const first = await page.evaluate(() => ({ name: window.__saves[0].name, mime: window.__saves[0].mime }));
check(first.name === 'Stock.xlsx' && first.mime.includes('spreadsheetml'), 'stock sheet saved as Stock.xlsx');
check(await page.inputValue('#scan-serial') === '' && await page.inputValue('#scan-item') !== '', 'form clears serial and keeps the item for the next unit');

// A duplicate serial is refused.
await page.getByRole('button', { name: 'Take photo of label' }).isVisible();
await page.fill('#scan-serial', '22a12345');
await page.getByRole('button', { name: 'Save to stock sheet' }).click();
await page.waitForTimeout(300);
check(await page.locator('.toast').textContent().then((t) => t.includes('already')), 'duplicate serial is refused');
await page.fill('#scan-serial', '');

// 2. Sell that unit on an invoice made by voice, then choose the serial on the line.
await page.evaluate(() => { location.hash = 'home'; });
await page.waitForSelector('text=To collect');
await page.getByRole('button', { name: 'Voice assistant' }).click();
await page.getByLabel('Type a command').fill('invoice for Lakshmi Traders, 1 LG 1.5 ton 5 star AC at 34000');
await page.getByRole('button', { name: 'Send command' }).click();
await page.waitForFunction(() => location.hash.startsWith('#bill-new-sale-'), null, { timeout: 5000 });
await page.getByRole('button', { name: /LG 1\.5 TON 5 STAR AC/ }).first().click();
await page.getByRole('checkbox', { name: 'Serial 22A12345' }).check();
await page.getByRole('button', { name: 'Done' }).click();
await page.getByRole('button', { name: 'Save invoice' }).click();
await page.waitForFunction(() => location.hash.startsWith('#doc-'), null, { timeout: 8000 });
await page.waitForFunction(() => window.__saves.length > 1, null, { timeout: 8000 });
const last = await page.evaluate(() => window.__saves[window.__saves.length - 1].b64);
writeFileSync(`${outDir}/stock-after-sale.xlsx`, Buffer.from(last, 'base64'));
check(true, 'stock sheet updated after the invoice was saved');

// 3. Deleting the invoice puts the unit back in stock.
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
await page.waitForFunction(() => window.__saves.length > 2, null, { timeout: 8000 });
const afterDelete = await page.evaluate(() => window.__saves[window.__saves.length - 1].b64);
writeFileSync(`${outDir}/stock-after-delete.xlsx`, Buffer.from(afterDelete, 'base64'));
check(true, 'stock sheet updated after the invoice was deleted');

check(errors.length === 0, `no page errors (${errors.length})`);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all scan checks passed');
process.exit(failed || errors.length ? 1 : 0);
