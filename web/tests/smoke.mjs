// Click-through of the main flows at phone size. Run: node tests/smoke.mjs [baseUrl] [shotsDir]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8765/index.html';
const shots = process.argv[3] || '/tmp';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const shot = (n) => page.screenshot({ path: `${shots}/${n}.png` });
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); await shot('fail-' + name.replace(/\W+/g, '_')); } };

await page.goto(base);
await page.waitForSelector('text=Set up your business');
await shot('01-welcome');
await step('onboarding', async () => {
  await page.fill('#b-name', 'NOBLE ELECTRONICS');
  await page.fill('#b-gstin', '36BJOPS7708D1ZT');
  await page.fill('#b-phone', '9866716563');
  await page.fill('#b-addr', '12-2-837/A/6, ASIF NAGAR, HYDERABAD');
  await page.fill('#b-city', 'Hyderabad');
  await page.getByRole('button', { name: 'Start billing' }).click();
  await page.waitForSelector('text=To collect');
});
await shot('02-home-empty');

await step('create sales invoice 621', async () => {
  await page.getByRole('button', { name: 'Create a bill or entry' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Sales Invoice' }).click();
  await page.fill('#v-number', '621');
  await page.fill('#v-date', '2026-10-25');
  await page.fill('#v-due', '2026-11-01');
  await page.getByRole('button', { name: /Cash sale/ }).click();
  await page.getByRole('button', { name: /Add new customer/ }).click();
  await page.fill('#p-name', 'JAANVI ELECTRONICS');
  await page.fill('#p-gstin', '36CMFPM4487G1ZP');
  await page.fill('#p-addr', '2-4-135, LINGAREDDY COMPLEX, SIKH VILLAGE ,NEAR HANUMAN TEMPLE, TADBUND, Secunderabad, Medchal Malkajgiri, Hyderabad, Telangana, 500009');
  await page.getByRole('button', { name: /Save & select/ }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('button', { name: /Create new item/ }).click();
  await page.fill('#i-name', 'LG 1.5 5 STAR');
  await page.fill('#i-hsn', '8415');
  await page.fill('#i-sale', '34000');
  await page.fill('#i-open', '5');
  await page.getByRole('button', { name: /Save & add/ }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('button', { name: /Create new item/ }).click();
  await page.fill('#i-name', 'DAIKIN 1.5 TON');
  await page.fill('#i-hsn', '8415');
  await page.fill('#i-sale', '25000');
  await page.getByRole('tab', { name: 'Plus GST' }).click();
  await page.fill('#i-open', '6');
  await page.getByRole('button', { name: /Save & add/ }).click();
  await page.fill('#l-qty', '2');
  await page.getByRole('button', { name: 'Done' }).click();
  await shot('03-invoice-form');
  const total = await page.locator('.savebar .total b').textContent();
  if (total.trim() !== '₹ 93,000') throw new Error('form total ' + total);
  await page.getByRole('button', { name: 'Save invoice' }).click();
  await page.waitForSelector('text=Sales Invoice #621');
});
await page.waitForTimeout(400);
await shot('04-invoice-view');

await step('download pdf', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
  await dl.saveAs(`${shots}/app-invoice-621.pdf`);
  console.log('     pdf name:', dl.suggestedFilename());
});

await step('payment in', async () => {
  await page.getByRole('button', { name: 'Get paid' }).click();
  await page.fill('#pay-amt', '50000');
  await page.getByRole('button', { name: 'Save payment' }).click();
  await page.waitForSelector('text=Partly paid');
});
await shot('05-after-payment');

await step('home totals', async () => {
  await page.evaluate(() => { location.hash = 'home'; });
  await page.waitForSelector('text=To collect');
  const amt = await page.locator('.money-tile.collect .amt').textContent();
  if (amt.trim() !== '₹ 43,000') throw new Error('to collect ' + amt);
});
await shot('06-home');

for (const r of ['bills', 'parties', 'items', 'reports', 'report-gstr1', 'report-gstr3b', 'report-pnl', 'report-stock', 'report-outstanding', 'report-daybook', 'report-hsn', 'report-itemsales', 'more', 'business', 'billsetup', 'backup', 'bill-new-purchase', 'bill-new-quote', 'payment-new-out', 'expense-new']) {
  await step('route ' + r, async () => {
    await page.evaluate((h) => { location.hash = h; }, r);
    await page.waitForTimeout(250);
    const main = await page.locator('main').count();
    if (!main) throw new Error('no main');
  });
  await shot('r-' + r);
}

await step('backup round trip', async () => {
  await page.evaluate(() => { location.hash = 'backup'; });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Save backup to phone/ }).click()]);
  const file = `${shots}/backup.json`;
  await dl.saveAs(file);
  await page.getByRole('button', { name: /Erase all data/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Erase everything' }).click();
  await page.waitForSelector('text=Set up your business');
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.waitForSelector('text=To collect');
  const amt = await page.locator('.money-tile.collect .amt').textContent();
  if (amt.trim() !== '₹ 43,000') throw new Error('after restore ' + amt);
});

await step('reload keeps data', async () => {
  await page.reload();
  await page.waitForSelector('text=To collect');
  const amt = await page.locator('.money-tile.collect .amt').textContent();
  if (amt.trim() !== '₹ 43,000') throw new Error('after reload ' + amt);
});

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
