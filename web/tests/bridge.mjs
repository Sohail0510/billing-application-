// Runs the Android build with a fake native bridge: PDF sharing, saving, links and the back button.
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8765/index.html';
const shots = process.argv[3] || '/tmp';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await ctx.addInitScript(() => {
  window.__shared = []; window.__saved = []; window.__opened = [];
  window.HisaabAndroid = {
    shareFile(b64, name, mime, text) { window.__shared.push({ name, mime, text, head: atob(b64.slice(0, 8)), size: Math.round(b64.length * 0.75) }); return ''; },
    saveFile(b64, name, mime) { window.__saved.push({ name, mime }); return 'Saved to Downloads/Hisaab/' + name; },
    openExternal(url) { window.__opened.push(url); },
  };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); };

await page.goto(base);
await page.getByRole('button', { name: 'Try sample data' }).click();
await page.waitForSelector('text=To collect');
await page.screenshot({ path: `${shots}/d1-home.png` });
check(await page.evaluate(() => window.__hisaabBack()) === 'false', 'back on home leaves the app');

await page.evaluate(() => { location.hash = 'bills'; });
await page.waitForTimeout(200);
await page.locator('.row', { hasText: 'Sales Invoice #104' }).click();
await page.waitForSelector('text=Sales Invoice #104');
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/d2-invoice.png` });
await page.getByRole('button', { name: 'Share PDF' }).click();
await page.waitForFunction(() => window.__shared.length > 0, null, { timeout: 10000 });
const shared = await page.evaluate(() => window.__shared[0]);
check(shared.head.startsWith('%PDF') && shared.mime === 'application/pdf', `share PDF ${shared.name} ${shared.size} bytes`);
await page.getByRole('button', { name: 'Download' }).click();
await page.waitForFunction(() => window.__saved.length > 0);
check(await page.locator('.toast').textContent().then((t) => t.includes('Downloads/Hisaab')), 'save shows Downloads toast');
await page.getByRole('button', { name: 'WhatsApp' }).click();
const url = await page.evaluate(() => window.__opened[0]);
check(url && url.startsWith('https://wa.me/91'), 'WhatsApp link ' + (url || '').slice(0, 40));
check(await page.evaluate(() => window.__hisaabBack()) === 'true', 'back on invoice goes back');
await page.waitForTimeout(200);
check(await page.evaluate(() => location.hash) === '#bills', 'returned to bills');

// Open the create sheet and close it with back
await page.evaluate(() => { location.hash = 'home'; });
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Create a bill or entry' }).click();
check(await page.locator('.sheet').count() === 1, 'create sheet open');
const handled = await page.evaluate(() => window.__hisaabBack());
await page.waitForTimeout(150);
check(handled === 'true' && (await page.locator('.sheet').count()) === 0 && (await page.evaluate(() => location.hash)) === '#home', 'back closes the sheet first and stays on home');

for (const r of ['report-gstr3b', 'report-pnl', 'parties', 'report-outstanding']) {
  await page.evaluate((h) => { location.hash = h; }, r);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${shots}/d-${r}.png` });
}
// Quotation -> invoice conversion
await page.evaluate(() => { location.hash = 'bills'; });
await page.waitForTimeout(150);
await page.getByRole('tab', { name: 'Quotations' }).click();
await page.locator('.row').first().click();
await page.getByRole('button', { name: 'Make invoice' }).click();
await page.getByRole('button', { name: 'Save invoice' }).click();
await page.waitForSelector('text=Sales Invoice #107');
check(true, 'quotation converted to invoice 107');
await page.screenshot({ path: `${shots}/d3-converted.png` });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
