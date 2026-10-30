// Tiny hash router. Route names use only letters, digits and hyphens (e.g. #doc-abc123),
// which works the same inside the Android app and in a browser preview.
import { useSyncExternalStore } from 'react';

const read = () => (window.location.hash || '').replace(/^#/, '') || 'home';
let current = read();
let depth = 0;
let pendingPush = false;
const subs = new Set();
const notify = () => subs.forEach((fn) => fn());

window.addEventListener('hashchange', () => {
  current = read();
  if (pendingPush) {
    depth += 1;
    pendingPush = false;
  } else {
    depth = Math.max(0, depth - 1);
  }
  window.scrollTo(0, 0);
  notify();
});

export function useRoute() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
  );
}

export function go(path, { replace = false } = {}) {
  if (path === current) return;
  if (replace) {
    try {
      window.history.replaceState(null, '', '#' + path);
    } catch {
      /* some frames disallow replaceState */
    }
    current = path;
    window.scrollTo(0, 0);
    notify();
    return;
  }
  pendingPush = true;
  window.location.hash = path;
}

export function back(fallback = 'home') {
  if (depth > 0) window.history.back();
  else go(fallback, { replace: true });
}

export const currentRoute = () => current;
