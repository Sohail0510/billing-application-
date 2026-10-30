// Simulates a phone that already has the previous database version with a party saved, then opens the new app.
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8765/index.html';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Same site, but no app: so the old database is created before the new app ever opens it.
await page.goto(new URL('/nothing-here.html', base).toString());
await page.evaluate(async () => {
  await new Promise((resolve, reject) => {
    const r = indexedDB.open('hisaab-billing', 1);
    r.onupgradeneeded = () => { for (const n of ['meta', 'parties', 'items', 'vouchers', 'payments', 'expenses']) r.result.createObjectStore(n, { keyPath: 'id' }); };
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(['meta', 'parties'], 'readwrite');
      tx.objectStore('meta').put({ id: 'settings', business: { name: 'Old Shop', gstin: '', state: '36' }, onboarded: true });
      tx.objectStore('parties').put({ id: 'p-old', name: 'OLD CUSTOMER', kind: 'customer', openingBalance: 500, openingType: 'receive', phone: '', state: '36' });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    r.onerror = () => reject(r.error);
  });
});
await page.goto(base);
await page.waitForSelector('text=Old Shop', { timeout: 10000 });
const version = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('hisaab-billing'); r.onsuccess = () => { const v = r.result.version; const hasUnits = r.result.objectStoreNames.contains('units'); r.result.close(); res({ v, hasUnits }); }; }));
const ok = version.v === 2 && version.hasUnits && errors.length === 0;
console.log(ok ? 'PASS' : 'FAIL', 'old data kept and database upgraded', JSON.stringify(version), 'errors:', errors.length);
await browser.close();
process.exit(ok ? 0 : 1);
