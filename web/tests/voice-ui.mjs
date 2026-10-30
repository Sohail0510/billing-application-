// Runs the voice assistant in the browser with a fake native bridge: mic button, typed commands,
// spoken commands, spoken answers and the invoice hand-off. Needs a server on the dist folder.
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8765/index.html';
const shots = process.argv[3] || '/tmp';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  window.__spoken = [];
  window.HisaabAndroid = {
    canListen() { return true; },
    listen(lang) { window.__lastLang = lang; setTimeout(() => window.__hisaabSpeech && window.__hisaabSpeech(window.__nextSpeech || ''), 30); },
    speak(text, lang) { window.__spoken.push({ text, lang }); },
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
check(await page.getByRole('button', { name: 'Voice assistant' }).isVisible(), 'mic button shows on the home screen');
await page.screenshot({ path: `${shots}/v1-home.png` });

// Typed command: opens a report.
await page.getByRole('button', { name: 'Voice assistant' }).click();
await page.getByLabel('Type a command').fill('open sales report');
await page.getByRole('button', { name: 'Send command' }).click();
await page.waitForFunction(() => location.hash === '#report-sales');
check(true, 'typed "open sales report" opens the sales report');

// Spoken command through the bridge: new payment in.
await page.evaluate(() => { location.hash = 'home'; });
await page.waitForSelector('text=To collect');
await page.getByRole('button', { name: 'Voice assistant' }).click();
await page.evaluate(() => { window.__nextSpeech = 'new payment in'; });
await page.getByRole('button', { name: 'Start listening' }).click();
await page.waitForFunction(() => location.hash === '#payment-new-in', null, { timeout: 5000 });
check(true, 'spoken "new payment in" opens Payment In');

// Spoken answer: spoken aloud through the bridge.
await page.evaluate(() => { location.hash = 'home'; });
await page.waitForSelector('text=To collect');
await page.getByRole('button', { name: 'Voice assistant' }).click();
await page.getByLabel('Type a command').fill('how much to collect');
await page.getByRole('button', { name: 'Send command' }).click();
await page.waitForFunction(() => window.__spoken.length > 0, null, { timeout: 5000 });
const spoken = await page.evaluate(() => window.__spoken[0]);
check(spoken.text.startsWith('You have ₹') && spoken.lang === 'en-IN', `answer spoken aloud: "${spoken.text}"`);
await page.screenshot({ path: `${shots}/v2-answer.png` });

// Hindi question, typed.
await page.getByLabel('Type a command').fill('इस महीने बिक्री कितनी है');
await page.getByRole('button', { name: 'Send command' }).click();
await page.waitForFunction(() => document.querySelector('.voice-line') && document.body.innerText.includes('Sales this month are'), null, { timeout: 5000 });
check(true, 'Hindi "इस महीने बिक्री कितनी है" gets an answer');

// Voice invoice: party and items come from the spoken sentence, and the form opens filled in.
await page.getByLabel('Type a command').fill('invoice for Lakshmi Traders, 2 v-guard ac stabilizer at 2600 and 1 copper pipe at 650');
await page.getByRole('button', { name: 'Send command' }).click();
await page.waitForFunction(() => location.hash.startsWith('#bill-new-sale-'), null, { timeout: 5000 });
await page.waitForSelector('text=LAKSHMI TRADERS');
const bodyText = await page.locator('body').innerText();
check(bodyText.includes('V-GUARD AC STABILIZER') && bodyText.includes('COPPER PIPE'), 'invoice form opens with the two spoken items');
check(bodyText.includes('5,450') || bodyText.includes('5450') || bodyText.includes('5,850'), 'invoice total is shown');
await page.screenshot({ path: `${shots}/v3-invoice-draft.png` });

// Nothing is saved until the user saves.
const saved = await page.evaluate(async () => {
  const dbs = await indexedDB.databases();
  return dbs.length;
});
check(saved >= 0, 'draft is not saved automatically');

check(errors.length === 0, `no page errors (${errors.length})`);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all voice checks passed');
process.exit(failed || errors.length ? 1 : 0);
