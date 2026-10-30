import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot } from './db.js';
import { derive } from './ledger.js';

export function useData() {
  const s = useSyncExternalStore(subscribe, getSnapshot);
  return { s, d: derive(s) };
}
