// Voice assistant: turns a spoken or typed sentence into an action (open a screen, answer a question,
// or prepare an invoice for review). The parser is rule based and needs no network; it understands the
// phrasings listed below in English and Hindi. Speech in and out goes through the Android bridge when
// available, otherwise through the browser's Web Speech API.
import { bridge } from './platform.js';

// Hindi words (Devanagari and common romanised forms) mapped to the English keywords the parser uses.
const WORDS = {
  'बिक्री': 'sales', 'बिक्रि': 'sales', 'bikri': 'sales', 'sale': 'sales',
  'बिल': 'bill', 'bill': 'bill', 'इनवॉइस': 'invoice', 'इनवॉयस': 'invoice',
  'पार्टी': 'party', 'ग्राहक': 'customer', 'parti': 'party',
  'भुगतान': 'payment', 'पेमेंट': 'payment', 'payment': 'payment',
  'खर्च': 'expense', 'kharcha': 'expense', 'kharch': 'expense',
  'बकाया': 'outstanding', 'baki': 'outstanding', 'bakaya': 'outstanding',
  'कितना': 'how much', 'कितनी': 'how much', 'कितने': 'how much', 'kitna': 'how much', 'kitni': 'how much', 'kitne': 'how much',
  'स्टॉक': 'stock', 'stock': 'stock', 'आइटम': 'item', 'सामान': 'item', 'item': 'item',
  'खरीद': 'purchase', 'खरीदारी': 'purchase', 'kharid': 'purchase',
  'रिपोर्ट': 'report', 'report': 'report',
  'खोलो': 'open', 'kholo': 'open', 'दिखाओ': 'show', 'dikhao': 'show',
  'बनाओ': 'new', 'banao': 'new', 'नया': 'new', 'naya': 'new', 'नई': 'new', 'जोड़ो': 'add', 'जोडो': 'add', 'add': 'add',
  'इस': 'this', 'महीने': 'month', 'mahine': 'month', 'मंथ': 'month',
  'कुल': 'total', 'kul': 'total',
  'लेना': 'receive', 'लेने': 'receive', 'देना': 'give', 'देने': 'give',
  'होम': 'home', 'सेटिंग': 'settings', 'बैकअप': 'backup', 'कोटेशन': 'quotation', 'अनुमान': 'estimate',
  'के': '', 'का': '', 'की': '', 'को': '', 'से': '', 'है': '', 'हैं': '', 'मेरा': '', 'मेरे': '', 'मुझे': '',
  'दो': '', 'और': 'and', 'aur': 'and', 'ka': '', 'ki': '', 'ke': '', 'ko': '',

};

const norm = (t) => String(t || '')
  .toLowerCase()
  .replace(/₹|rs\.?|rupees?/g, ' ')
  .replace(/[^\p{L}\p{M}\p{N}&\s.@-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Replaces Hindi words with English keywords, one word at a time, so sentences keep their order.
export function translate(text) {
  return norm(text).split(' ').map((w) => (Object.prototype.hasOwnProperty.call(WORDS, w) ? WORDS[w] : w)).filter(Boolean).join(' ');
}

// 'fans' should find 'Fan': compare with a trailing 's' removed on both sides.
const single = (w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const inText = (t, n) => ` ${t.split(' ').map(single).join(' ')} `.includes(` ${n.split(' ').map(single).join(' ')} `);

const has = (t, ...phrases) => phrases.some((p) => new RegExp(`(^|\\s)${p}(\\s|$)`).test(t));

// Screens reached by plain navigation, longest phrase first so "sales report" beats "sales".
const NAV = [
  ['gstr 3b', 'report-gstr3b'], ['gstr3b', 'report-gstr3b'], ['gstr 1', 'report-gstr1'], ['gstr1', 'report-gstr1'], ['gst report', 'report-gstr1'],
  ['sales report', 'report-sales'], ['purchase report', 'report-purchases'], ['purchases report', 'report-purchases'],
  ['expense report', 'report-expenses'], ['expenses report', 'report-expenses'], ['stock report', 'report-stock'],
  ['profit and loss', 'report-pnl'], ['profit loss', 'report-pnl'], ['p and l', 'report-pnl'], ['profit', 'report-pnl'],
  ['outstanding report', 'report-outstanding'], ['receivable', 'report-outstanding'], ['payable', 'report-outstanding'],
  ['day book', 'report-daybook'], ['daybook', 'report-daybook'], ['hsn', 'report-hsn'],
  ['reports', 'reports'], ['report', 'reports'],
  ['home', 'home'], ['dashboard', 'home'],
  ['bills', 'bills'], ['entries', 'bills'], ['transactions', 'bills'],
  ['parties', 'parties'], ['party list', 'parties'], ['party', 'parties'], ['customers', 'parties'],
  ['items', 'items'], ['stock', 'items'], ['products', 'items'],
  ['settings', 'more'], ['more', 'more'], ['backup', 'backup'],
];

const CREATE = [
  ['credit note', 'bill-new-cnote'], ['debit note', 'bill-new-dnote'],
  ['payment in', 'payment-new-in'], ['payment received', 'payment-new-in'], ['receive payment', 'payment-new-in'], ['received payment', 'payment-new-in'], ['payment receive', 'payment-new-in'],
  ['payment out', 'payment-new-out'], ['payment made', 'payment-new-out'], ['pay supplier', 'payment-new-out'], ['payment give', 'payment-new-out'],
  ['sales invoice', 'bill-new-sale'], ['sale invoice', 'bill-new-sale'], ['invoice', 'bill-new-sale'], ['bill', 'bill-new-sale'],
  ['quotation', 'bill-new-quote'], ['estimate', 'bill-new-quote'],
  ['purchase', 'bill-new-purchase'],
  ['expense', 'expense-new'],
  ['new party', 'party-new'], ['add party', 'party-new'], ['customer', 'party-new'], ['supplier', 'party-new'], ['party', 'party-new'],
  ['new item', 'item-new'], ['add item', 'item-new'], ['product', 'item-new'], ['item', 'item-new'],
];

const money = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;

// Finds the party whose name appears in the sentence. Longest name wins; a single shared first name
// only counts when exactly one party has it.
export function findParty(text, parties) {
  const t = ` ${norm(text)} `;
  let best = null;
  for (const p of parties) {
    const n = norm(p.name);
    if (n.length >= 3 && t.includes(` ${n} `) && (!best || n.length > norm(best.name).length)) best = p;
  }
  if (best) return best;
  const words = t.trim().split(' ').filter((w) => w.length >= 3);
  const firsts = parties.filter((p) => { const f = norm(p.name).split(' ')[0]; return f.length >= 3 && words.includes(f); });
  return firsts.length === 1 ? firsts[0] : null;
}

// Finds an item by name the same way.
export function findItem(text, items) {
  const t = ` ${norm(text)} `;
  let best = null;
  for (const i of items) {
    // 'COPPER PIPE (PER MTR)' should match 'copper pipe'.
    const n = norm(i.name.replace(/\([^)]*\)/g, ' '));
    if (n.length >= 2 && inText(t.trim(), n) && (!best || n.length > norm(best.name).length)) best = i;
  }
  return best;
}

// Parses "invoice for Ali, 2 fans at 1500 and 1 bulb at 300" into a draft sale.
export function parseInvoiceDraft(raw, ctx) {
  const m = /^(?:make |create |new )?(?:sales? )?(?:invoice|bill) (?:for|to) (.+)$/i.exec(norm(raw));
  if (!m) return null;
  const rest = m[1];
  const party = findParty(rest, ctx.parties);
  // Drop the party name from the start of the sentence before reading the items.
  let body = rest;
  if (party) {
    const pn = norm(party.name);
    const idx = norm(rest).indexOf(pn);
    if (idx >= 0) body = norm(rest).slice(idx + pn.length);
  }
  const chunks = body.split(/,| and | aur /).map((c) => c.trim()).filter(Boolean);
  const lines = [];
  const unknown = [];
  for (const c of chunks) {
    const a = /^(\d+(?:\.\d+)?)\s+(.+?)\s+(?:at|@|rate|for)\s+(\d+(?:\.\d+)?)$/.exec(c);
    const b = /^(.+?)\s+(\d+(?:\.\d+)?)\s+(?:at|@|rate|for)\s+(\d+(?:\.\d+)?)$/.exec(c);
    let qty, name, price;
    if (a) [, qty, name, price] = a;
    else if (b) [, name, qty, price] = b;
    else { unknown.push(c); continue; }
    const item = findItem(name, ctx.items);
    lines.push({
      itemId: item ? item.id : '', name: item ? item.name : name.replace(/\b\w/g, (ch) => ch.toUpperCase()),
      hsn: item ? item.hsn || '' : '', unit: item ? item.unit || 'PCS' : 'PCS', description: '',
      qty: Number(qty), price: Number(price), taxIncl: item ? Boolean(item.saleTaxIncl ?? true) : true,
      gstRate: item ? Number(item.gstRate ?? 0) : 0, discountPct: 0,
    });
  }
  if (!lines.length) return { empty: true, partyId: party ? party.id : '', partyName: party ? party.name : '', lines: [], unknown };
  return { kind: 'sale', partyId: party ? party.id : '', partyName: party ? party.name : '', lines, unknown };
}

// Main entry: returns one of
//   { type: 'navigate', to, reply }
//   { type: 'draft', draft, reply }
//   { type: 'answer', reply }
//   { type: 'unknown', reply }
export function interpret(raw, ctx) {
  const t = translate(raw);
  if (!t) return { type: 'unknown', reply: 'I did not catch that. Please try again.' };

  const draftAttempt = parseInvoiceDraft(translate(raw), ctx) || parseInvoiceDraft(raw, ctx);
  if (draftAttempt) {
    if (draftAttempt.empty) {
      if (draftAttempt.partyId) return { type: 'navigate', to: `bill-new-sale-${draftAttempt.partyId}`, reply: `Opening a new invoice for ${draftAttempt.partyName}.` };
      return { type: 'unknown', reply: 'I could not hear any items. Say something like "invoice for Ali, 2 fans at 1500".' };
    }
    const who = draftAttempt.partyName ? ` for ${draftAttempt.partyName}` : '';
    const note = draftAttempt.unknown.length ? ` I did not understand ${draftAttempt.unknown.length} part${draftAttempt.unknown.length > 1 ? 's' : ''}; check the lines.` : '';
    return { type: 'draft', draft: draftAttempt, reply: `Drafted a sales invoice${who} with ${draftAttempt.lines.length} item${draftAttempt.lines.length > 1 ? 's' : ''}. Check it and save.${note}` };
  }

  const asksHow = has(t, 'how much', 'total', 'kitna', 'what is', 'what are', 'show me', 'kya');
  const party = findParty(t, ctx.parties);

  if (party && has(t, 'owe', 'owes', 'balance', 'due', 'outstanding', 'collect', 'pay', 'baki', 'bakaya', 'how much', 'kitna', 'total', 'receive')) {
    const bal = ctx.balanceOf(party.id);
    if (bal > 0.009) return { type: 'answer', reply: `${party.name} owes you ${money(bal)}.` };
    if (bal < -0.009) return { type: 'answer', reply: `You owe ${party.name} ${money(-bal)}.` };
    return { type: 'answer', reply: `${party.name} has no balance.` };
  }

  if (has(t, 'sales') && has(t, 'month', 'this', 'total') && !has(t, 'report', 'open', 'show')) {
    return { type: 'answer', reply: `Sales this month are ${money(ctx.monthSales)}.` };
  }
  if (has(t, 'collect', 'receivable', 'receivables', 'outstanding') && asksHow) {
    return { type: 'answer', reply: `You have ${money(ctx.toCollect)} to collect.` };
  }
  if (has(t, 'pay') && asksHow && !has(t, 'payment', 'in', 'out')) {
    return { type: 'answer', reply: `You have ${money(ctx.toPay)} to pay.` };
  }
  if (has(t, 'low') && has(t, 'stock')) {
    const n = ctx.lowStockCount;
    return { type: 'answer', reply: n ? `${n} item${n > 1 ? 's are' : ' is'} low on stock.` : 'No items are low on stock.' };
  }

  const creating = has(t, 'new', 'create', 'add', 'make', 'naya', 'banao', 'add');
  if (creating) {
    const hit = CREATE.find(([k]) => has(t, k));
    if (hit) return { type: 'navigate', to: hit[1], reply: 'Opening it now.' };
  }
  const nav = NAV.find(([k]) => has(t, k));
  if (nav) return { type: 'navigate', to: nav[1], reply: 'Opening it now.' };
  const create = CREATE.find(([k]) => has(t, k));
  if (create && !party) return { type: 'navigate', to: create[1], reply: 'Opening it now.' };

  return { type: 'unknown', reply: 'Sorry, I did not understand. Try "sales report", "new payment in" or "how much does Ali owe".' };
}

// ---- Draft hand-off to the invoice form -------------------------------------------------------

let pendingDraft = null;
export function setVoiceDraft(draft) { pendingDraft = draft; }
// Read by the invoice form when it opens; cleared after one use.
export function takeVoiceDraft(kind) {
  if (!pendingDraft || pendingDraft.kind !== kind) return null;
  const d = pendingDraft;
  pendingDraft = null;
  return d;
}

// ---- Speech ----------------------------------------------------------------------------------

const SpeechRec = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined);

export function canListen() {
  const b = bridge();
  if (b && typeof b.canListen === 'function') return Boolean(b.canListen());
  return Boolean(SpeechRec());
}

// Calls onResult(text) once, or onError(message). Returns a function that cancels listening.
export function listen(lang, { onResult, onError }) {
  const b = bridge();
  if (b && typeof b.listen === 'function') {
    window.__hisaabSpeech = (text) => { window.__hisaabSpeech = null; window.__hisaabSpeechError = null; onResult(String(text || '')); };
    window.__hisaabSpeechError = (msg) => { window.__hisaabSpeech = null; window.__hisaabSpeechError = null; onError(String(msg || 'Could not hear you.')); };
    try {
      b.listen(lang);
    } catch {
      onError('Voice is not available on this phone.');
    }
    return () => { window.__hisaabSpeech = null; window.__hisaabSpeechError = null; };
  }
  const Rec = SpeechRec();
  if (!Rec) {
    onError('Voice is not available in this browser. Type your command instead.');
    return () => {};
  }
  const r = new Rec();
  r.lang = lang;
  r.interimResults = false;
  r.maxAlternatives = 1;
  let done = false;
  r.onresult = (e) => { done = true; onResult(e.results[0][0].transcript); };
  r.onerror = (e) => { done = true; onError(e.error === 'no-speech' ? 'I did not hear anything. Try again.' : e.error === 'not-allowed' ? 'Microphone permission is needed.' : 'Could not hear you.'); };
  r.onend = () => { if (!done) onError('I did not hear anything. Try again.'); };
  try { r.start(); } catch { onError('Could not start listening.'); }
  return () => { done = true; try { r.abort(); } catch { /* ignore */ } };
}

export function speak(text, lang) {
  const b = bridge();
  if (b && typeof b.speak === 'function') {
    try { b.speak(text, lang); } catch { /* ignore */ }
    return;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }
}
