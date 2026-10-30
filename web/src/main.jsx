import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';
import { initStore, getSnapshot, replaceAll } from './lib/db.js';
import { buildSampleData } from './lib/sample.js';
import { IS_PREVIEW } from './lib/platform.js';

async function boot() {
  await initStore();
  const s = getSnapshot();
  const empty = !s.parties.length && !s.items.length && !s.vouchers.length;
  // The browser preview opens with sample data so every screen has something to show.
  if (IS_PREVIEW && empty && !s.settings.onboarded) {
    await replaceAll(buildSampleData(s.settings));
  }
}

boot()
  .catch((e) => console.error(e))
  .finally(() => createRoot(document.getElementById('root')).render(<App />));
