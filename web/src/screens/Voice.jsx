import { useState, useRef } from 'react';
import { LuMic, LuMicOff, LuSend, LuVolume2 } from 'react-icons/lu';
import { useData } from '../lib/useData.js';
import { go } from '../router.js';
import { Sheet, Seg, toast } from '../ui.jsx';
import { monthRange } from '../lib/format.js';
import { interpret, setVoiceDraft, canListen, listen, speak } from '../lib/voice.js';

const LANG = { en: 'en-IN', hi: 'hi-IN' };

// Sales this month, net of credit notes (same rule as the Home screen).
function useVoiceContext() {
  const { s, d } = useData();
  return () => {
    const m = monthRange();
    const sumKind = (kind) => s.vouchers.filter((v) => v.kind === kind && v.date >= m.from && v.date <= m.to).reduce((t, v) => t + d.calc.get(v.id).total, 0);
    return {
      parties: s.parties,
      items: s.items,
      balanceOf: (id) => d.balance.get(id) || 0,
      monthSales: sumKind('sale') - sumKind('cnote'),
      toCollect: d.toCollect,
      toPay: d.toPay,
      lowStockCount: d.lowStock.length,
    };
  };
}

export function VoiceButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="voice-fab" aria-label="Voice assistant" onClick={() => setOpen(true)}>
        <LuMic />
      </button>
      <VoiceSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function VoiceSheet({ open, onClose }) {
  const [lang, setLang] = useState('en');
  const [status, setStatus] = useState('Tap the mic and speak, or type a command.');
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState('');
  const [reply, setReply] = useState('');
  const [heard, setHeard] = useState('');
  const cancelRef = useRef(() => {});
  const context = useVoiceContext();
  const supported = canListen();

  const handle = (text) => {
    const clean = String(text || '').trim();
    setHeard(clean);
    if (!clean) return;
    const r = interpret(clean, context());
    if (r.type === 'navigate') {
      setReply(r.reply);
      onClose();
      go(r.to);
      return;
    }
    if (r.type === 'draft') {
      setVoiceDraft(r.draft);
      setReply(r.reply);
      onClose();
      go(r.draft.partyId ? `bill-new-sale-${r.draft.partyId}` : 'bill-new-sale');
      toast('Invoice drafted from your voice. Check it before saving.');
      return;
    }
    setReply(r.reply);
    setStatus(r.type === 'answer' ? '' : 'Try another command.');
    if (r.type === 'answer') speak(r.reply, LANG[lang]);
  };

  const startListening = () => {
    setListening(true);
    setStatus('Listening…');
    setReply('');
    cancelRef.current = listen(LANG[lang], {
      onResult: (text) => {
        setListening(false);
        setStatus('');
        handle(text);
      },
      onError: (msg) => {
        setListening(false);
        setStatus(msg);
      },
    });
  };

  const stopListening = () => {
    cancelRef.current();
    setListening(false);
    setStatus('');
  };

  const submitTyped = (e) => {
    e.preventDefault();
    handle(typed);
    setTyped('');
  };

  return (
    <Sheet open={open} title="Voice assistant" onClose={() => { stopListening(); onClose(); }}>
      <div className="voice">
        <Seg
          value={lang}
          onChange={setLang}
          options={[['en', 'English'], ['hi', 'हिन्दी']]}
        />
        <div className="voice-mic">
          {supported ? (
            <button
              type="button"
              className={`voice-big${listening ? ' on' : ''}`}
              onClick={listening ? stopListening : startListening}
              aria-label={listening ? 'Stop listening' : 'Start listening'}
            >
              {listening ? <LuMicOff /> : <LuMic />}
            </button>
          ) : (
            <div className="small muted">Voice is not available on this device. Type your command below.</div>
          )}
          {status && <div className="small muted" role="status">{status}</div>}
        </div>
        {heard && <div className="voice-line"><span className="label">You said</span><div>{heard}</div></div>}
        {reply && (
          <div className="voice-line">
            <span className="label">Hisaab</span>
            <div>{reply}</div>
            <button type="button" className="link" onClick={() => speak(reply, LANG[lang])}><LuVolume2 /> Hear it again</button>
          </div>
        )}
        <form className="voice-type" onSubmit={submitTyped}>
          <input
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={lang === 'hi' ? 'जैसे: इस महीने बिक्री कितनी है' : 'e.g. how much does Ali owe'}
            aria-label="Type a command"
          />
          <button type="submit" className="btn primary" disabled={!typed.trim()} aria-label="Send command"><LuSend /></button>
        </form>
        <div className="small muted">Try: “open sales report”, “new payment in”, “how much does Ali owe”, “invoice for Ali, 2 fans at 1500”.</div>
      </div>
    </Sheet>
  );
}

