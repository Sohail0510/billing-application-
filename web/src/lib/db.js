// On-device storage. Everything lives in IndexedDB on the phone and is mirrored in memory,
// so screens read synchronously and every change is written straight through to disk.
import { uid } from './format.js';

const DB_NAME = 'hisaab-billing';
const DB_VERSION = 1;
export const COLLECTIONS = ['parties', 'items', 'vouchers', 'payments', 'expenses'];

export function defaultSettings() {
  return {
    id: 'settings',
    business: {
      name: '', address: '', city: '', state: '', pincode: '', gstin: '', pan: '', phone: '', email: '',
      logo: '', bankName: '', accountName: '', accountNo: '', ifsc: '', branch: '', upi: '',
    },
    invoice: {
      color: 'green', showHsnSummary: true, showSignature: false, roundOff: true, defaultDueDays: 7,
      terms: 'Goods once sold will not be taken back or exchanged\nAll disputes are subject to [CITY] jurisdiction only',
      startNumbers: { sale: 1, quote: 1, cnote: 1, purchase: 1, dnote: 1, payin: 1, payout: 1, expense: 1 },
      prefixes: { sale: '', quote: 'QT-', cnote: 'CN-', purchase: 'PUR-', dnote: 'DN-', payin: 'PI-', payout: 'PO-', expense: 'EXP-' },
    },
    onboarded: false,
    lastBackupAt: '',
  };
}

let idb = null;
let persistent = false;
let snapshot = {
  ready: false, persistent: false, version: 0, settings: defaultSettings(),
  parties: [], items: [], vouchers: [], payments: [], expenses: [],
};
const listeners = new Set();

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const getSnapshot = () => snapshot;

function emit(patch) {
  snapshot = { ...snapshot, ...patch, version: snapshot.version + 1 };
  listeners.forEach((fn) => fn());
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    let r;
    try {
      r = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const name of ['meta', ...COLLECTIONS]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Storage is blocked'));
  });
}

function mergeSettings(saved) {
  const d = defaultSettings();
  if (!saved) return d;
  return {
    ...d, ...saved,
    business: { ...d.business, ...(saved.business || {}) },
    invoice: {
      ...d.invoice, ...(saved.invoice || {}),
      startNumbers: { ...d.invoice.startNumbers, ...((saved.invoice || {}).startNumbers || {}) },
      prefixes: { ...d.invoice.prefixes, ...((saved.invoice || {}).prefixes || {}) },
    },
  };
}

export async function initStore() {
  const data = {};
  try {
    idb = await openDb();
    const tx = idb.transaction(['meta', ...COLLECTIONS], 'readonly');
    const settings = await req(tx.objectStore('meta').get('settings'));
    for (const c of COLLECTIONS) data[c] = await req(tx.objectStore(c).getAll());
    data.settings = mergeSettings(settings);
    persistent = true;
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch { /* optional */ }
  } catch (e) {
    console.warn('IndexedDB unavailable, keeping data in memory only', e);
    idb = null;
    persistent = false;
    for (const c of COLLECTIONS) data[c] = [];
    data.settings = defaultSettings();
  }
  emit({ ...data, ready: true, persistent });
}

async function write(storeName, fn) {
  if (!idb) return;
  const tx = idb.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  fn(store);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Save aborted'));
  });
}

export async function saveSettings(updater) {
  const next = typeof updater === 'function' ? updater(snapshot.settings) : { ...snapshot.settings, ...updater };
  next.id = 'settings';
  emit({ settings: next });
  await write('meta', (s) => s.put(next));
  return next;
}

export async function upsert(collection, record) {
  const now = new Date().toISOString();
  const rec = { ...record, id: record.id || uid(), updatedAt: now, createdAt: record.createdAt || now };
  const list = snapshot[collection];
  const idx = list.findIndex((x) => x.id === rec.id);
  const nextList = idx >= 0 ? list.map((x) => (x.id === rec.id ? rec : x)) : [...list, rec];
  emit({ [collection]: nextList });
  await write(collection, (s) => s.put(rec));
  return rec;
}

export async function remove(collection, id) {
  emit({ [collection]: snapshot[collection].filter((x) => x.id !== id) });
  await write(collection, (s) => s.delete(id));
}

export function exportAll() {
  const out = { app: 'hisaab-billing', format: 1, exportedAt: new Date().toISOString(), settings: snapshot.settings };
  for (const c of COLLECTIONS) out[c] = snapshot[c];
  return out;
}

export function validateBackup(data) {
  if (!data || typeof data !== 'object') return 'This file is not a backup from this app.';
  if (data.app !== 'hisaab-billing') return 'This file is not a backup from this app.';
  for (const c of COLLECTIONS) if (!Array.isArray(data[c])) return `The backup is missing ${c}.`;
  return '';
}

// Replaces every record with the backup's contents.
export async function replaceAll(data) {
  const settings = mergeSettings(data.settings);
  const patch = { settings };
  for (const c of COLLECTIONS) patch[c] = data[c] || [];
  emit(patch);
  if (!idb) return;
  const tx = idb.transaction(['meta', ...COLLECTIONS], 'readwrite');
  tx.objectStore('meta').put({ ...settings, id: 'settings' });
  for (const c of COLLECTIONS) {
    const s = tx.objectStore(c);
    s.clear();
    for (const r of patch[c]) s.put(r);
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// Next document number for a series: highest used + 1, never below the configured start.
export function nextNumber(seriesKey, existing) {
  const start = Number(snapshot.settings.invoice.startNumbers[seriesKey] || 1);
  const maxSeq = existing.reduce((m, x) => Math.max(m, Number(x.seq) || 0), 0);
  const seq = Math.max(start, maxSeq + 1);
  const prefix = snapshot.settings.invoice.prefixes[seriesKey] || '';
  return { seq, number: prefix + seq };
}
