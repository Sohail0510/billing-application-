import { useState } from 'react';
import { LuChevronRight, LuUserPlus, LuTrash2 } from 'react-icons/lu';
import { useData } from '../lib/useData.js';
import { back } from '../router.js';
import { TopBar, Page, Field, TextInput, NumInput, Select, Seg, Avatar, ask, toast } from '../ui.jsx';
import { upsert, remove, nextNumber } from '../lib/db.js';
import { PAYMENT_MODES, EXPENSE_CATEGORIES, GST_RATES } from '../lib/gst.js';
import { fmtMoney, fmtDateShort, num, round2, todayISO, clean } from '../lib/format.js';
import { PartyPicker, Missing, balanceLabel } from './Parties.jsx';

const parseSeq = (n) => {
  const m = /(\d+)\s*$/.exec(String(n || ''));
  return m ? Number(m[1]) : 0;
};

export function PaymentForm({ id, direction: dirProp, partyId }) {
  const { s, d } = useData();
  const existing = id ? s.payments.find((p) => p.id === id) : null;
  const [form, setForm] = useState(() => {
    if (existing) return { ...existing, amount: String(existing.amount) };
    const direction = dirProp === 'out' ? 'out' : 'in';
    const series = direction === 'in' ? 'payin' : 'payout';
    return {
      direction, number: nextNumber(series, s.payments.filter((p) => p.direction === direction)).number, date: todayISO(),
      partyId: partyId || '', amount: '', mode: 'Cash', reference: '', notes: '',
    };
  });
  const [pickOpen, setPickOpen] = useState(false);
  const [errors, setErrors] = useState({});
  if (id && !existing) return <Missing what="payment" />;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const inbound = form.direction === 'in';
  const party = s.parties.find((p) => p.id === form.partyId);
  const bal = party ? d.balance.get(party.id) || 0 : 0;
  // Balance before this payment (when editing, add the saved amount back first).
  const before = existing && existing.partyId === form.partyId ? round2(bal + (inbound ? num(existing.amount) : -num(existing.amount))) : bal;
  const after = round2(before + (inbound ? -num(form.amount) : num(form.amount)));
  const openBills = party ? s.vouchers
    .filter((v) => v.partyId === party.id && v.kind === (inbound ? 'sale' : 'purchase') && (d.status.get(v.id)?.due || 0) > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1)) : [];

  const save = async () => {
    const e = {};
    if (!form.partyId) e.party = 'Select a party.';
    if (num(form.amount) <= 0) e.amount = 'Enter the amount.';
    if (!clean(form.number)) e.number = 'Enter a number.';
    setErrors(e);
    if (Object.keys(e).length) return;
    await upsert('payments', {
      ...(existing || {}), direction: form.direction, number: clean(form.number), seq: parseSeq(form.number), date: form.date,
      partyId: form.partyId, amount: round2(num(form.amount)), mode: form.mode, reference: clean(form.reference), notes: clean(form.notes),
    });
    toast(existing ? 'Payment updated' : inbound ? 'Payment received' : 'Payment recorded');
    back('bills');
  };
  const del = async () => {
    if (!(await ask({ title: 'Delete this payment?', message: 'The party’s balance will change back.', confirmLabel: 'Delete', danger: true }))) return;
    await remove('payments', existing.id);
    toast('Payment deleted');
    back('bills');
  };

  return (
    <>
      <TopBar title={existing ? `Payment ${existing.number}` : inbound ? 'Payment In' : 'Payment Out'} sub={inbound ? 'Money received from a party' : 'Money paid to a party'} backTo="bills" />
      <Page className="form">
        {!existing && <Seg value={form.direction} onChange={(v) => setForm((f) => ({ ...f, direction: v, number: nextNumber(v === 'in' ? 'payin' : 'payout', s.payments.filter((p) => p.direction === v)).number }))} options={[['in', 'Payment In'], ['out', 'Payment Out']]} />}
        <div className="card">
          <button type="button" className="party-pick" onClick={() => setPickOpen(true)}>
            {party ? <Avatar name={party.name} /> : <span className="avatar"><LuUserPlus /></span>}
            <span className="main">
              <span className="label">{inbound ? 'Received from' : 'Paid to'}</span>
              <span style={{ display: 'block', fontWeight: 600 }}>{party ? party.name : 'Select party'}</span>
              {party && <span className={`tiny ${balanceLabel(before).cls}`}>{balanceLabel(before).text} {fmtMoney(Math.abs(before))}</span>}
              {errors.party && <span className="tiny c-danger">{errors.party}</span>}
            </span>
            <LuChevronRight className="chev" />
          </button>
        </div>
        <Field label="Amount *" error={errors.amount} htmlFor="pay-amt">
          <div className="prefix-input"><span>₹</span><NumInput id="pay-amt" value={form.amount} onChange={set('amount')} placeholder="0" error={errors.amount} /></div>
        </Field>
        {party && num(form.amount) > 0 && (
          <div className="small muted">After this, {balanceLabel(after).text.toLowerCase()} <b className={balanceLabel(after).cls}>{fmtMoney(Math.abs(after))}</b>.</div>
        )}
        {!existing && openBills.length > 0 && (
          <div className="card card-pad small">
            <div className="label" style={{ marginBottom: 4 }}>Settles the oldest unpaid {inbound ? 'invoices' : 'bills'} first</div>
            {openBills.slice(0, 5).map((v) => (
              <div key={v.id} className="kv"><span>#{v.number} · {fmtDateShort(v.date)}</span><span>{fmtMoney(d.status.get(v.id).due)}</span></div>
            ))}
            <button type="button" className="link" onClick={() => set('amount')(String(round2(openBills.reduce((t, v) => t + d.status.get(v.id).due, 0))))}>Pay all of these</button>
          </div>
        )}
        <div className="grid2">
          <Field label="Date" htmlFor="pay-date"><input id="pay-date" type="date" className="input" value={form.date} onChange={(e) => set('date')(e.target.value)} /></Field>
          <Field label="Mode" htmlFor="pay-mode"><Select id="pay-mode" value={form.mode} onChange={set('mode')} options={PAYMENT_MODES} /></Field>
        </div>
        <div className="grid2">
          <Field label="Receipt no." error={errors.number} htmlFor="pay-no"><TextInput id="pay-no" value={form.number} onChange={set('number')} /></Field>
          <Field label="Reference" htmlFor="pay-ref"><TextInput id="pay-ref" value={form.reference} onChange={set('reference')} placeholder="UPI / cheque no." /></Field>
        </div>
        <Field label="Notes" htmlFor="pay-notes"><TextInput id="pay-notes" value={form.notes} onChange={set('notes')} placeholder="Optional" /></Field>
        {existing && <button type="button" className="btn danger" onClick={del}><LuTrash2 /> Delete payment</button>}
      </Page>
      <div className="savebar"><button type="button" className="btn primary block" onClick={save}>Save payment</button></div>
      <PartyPicker open={pickOpen} onClose={() => setPickOpen(false)} onPick={(p) => set('partyId')(p.id)} kind={inbound ? 'customer' : 'supplier'} />
    </>
  );
}

export function ExpenseForm({ id }) {
  const { s } = useData();
  const existing = id ? s.expenses.find((e) => e.id === id) : null;
  const [form, setForm] = useState(() => (existing
    ? { ...existing, amount: String(existing.amount), gstRate: String(existing.gstRate || 0) }
    : { number: nextNumber('expense', s.expenses).number, date: todayISO(), category: 'Rent', amount: '', paymentMode: 'Cash', paidTo: '', notes: '', gstRate: '0' }));
  const [custom, setCustom] = useState('');
  const [errors, setErrors] = useState({});
  if (id && !existing) return <Missing what="expense" />;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const cats = [...new Set([...EXPENSE_CATEGORIES, ...s.expenses.map((e) => e.category).filter(Boolean)])];
  const rate = num(form.gstRate);
  const taxable = rate ? round2(num(form.amount) / (1 + rate / 100)) : num(form.amount);
  const save = async () => {
    const e = {};
    if (num(form.amount) <= 0) e.amount = 'Enter the amount.';
    const category = form.category === '__new' ? clean(custom) : form.category;
    if (!category) e.category = 'Name the category.';
    setErrors(e);
    if (Object.keys(e).length) return;
    await upsert('expenses', {
      ...(existing || {}), number: clean(form.number), seq: parseSeq(form.number), date: form.date, category, amount: round2(num(form.amount)),
      paymentMode: form.paymentMode, paidTo: clean(form.paidTo), notes: clean(form.notes), gstRate: rate,
    });
    toast(existing ? 'Expense updated' : 'Expense saved');
    back('bills');
  };
  const del = async () => {
    if (!(await ask({ title: 'Delete this expense?', confirmLabel: 'Delete', danger: true }))) return;
    await remove('expenses', existing.id);
    toast('Expense deleted');
    back('bills');
  };
  return (
    <>
      <TopBar title={existing ? `Expense ${existing.number}` : 'New expense'} backTo="bills" />
      <Page className="form">
        <Field label="Amount paid *" error={errors.amount} htmlFor="ex-amt">
          <div className="prefix-input"><span>₹</span><NumInput id="ex-amt" value={form.amount} onChange={set('amount')} placeholder="0" error={errors.amount} /></div>
        </Field>
        <Field label="Category" error={errors.category} htmlFor="ex-cat">
          <Select id="ex-cat" value={form.category} onChange={set('category')} options={[...cats.map((c) => [c, c]), ['__new', '+ New category']]} />
        </Field>
        {form.category === '__new' && <Field label="New category name" htmlFor="ex-newcat"><TextInput id="ex-newcat" value={custom} onChange={setCustom} placeholder="e.g. Packing material" /></Field>}
        <div className="grid2">
          <Field label="Date" htmlFor="ex-date"><input id="ex-date" type="date" className="input" value={form.date} onChange={(e) => set('date')(e.target.value)} /></Field>
          <Field label="Paid by" htmlFor="ex-mode"><Select id="ex-mode" value={form.paymentMode} onChange={set('paymentMode')} options={PAYMENT_MODES} /></Field>
        </div>
        <Field label="Paid to" htmlFor="ex-to"><TextInput id="ex-to" value={form.paidTo} onChange={set('paidTo')} placeholder="Optional" /></Field>
        <Field label="GST on this bill" hint={rate ? `Includes ${fmtMoney(round2(num(form.amount) - taxable))} GST you can claim as input credit` : 'Choose a rate if you have a GST bill for this expense'} htmlFor="ex-gst">
          <Select id="ex-gst" value={form.gstRate} onChange={set('gstRate')} options={GST_RATES.map((r) => [String(r), r ? `${r}% (amount includes GST)` : 'No GST bill'])} />
        </Field>
        <div className="grid2">
          <Field label="Expense no." htmlFor="ex-no"><TextInput id="ex-no" value={form.number} onChange={set('number')} /></Field>
          <Field label="Notes" htmlFor="ex-notes"><TextInput id="ex-notes" value={form.notes} onChange={set('notes')} placeholder="Optional" /></Field>
        </div>
        {existing && <button type="button" className="btn danger" onClick={del}><LuTrash2 /> Delete expense</button>}
      </Page>
      <div className="savebar"><button type="button" className="btn primary block" onClick={save}>Save expense</button></div>
    </>
  );
}
