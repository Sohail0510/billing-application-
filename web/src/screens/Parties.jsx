import { useState } from 'react';
import {
  LuPlus, LuPencil, LuUsers, LuFileText, LuArrowDownLeft, LuArrowUpRight, LuScrollText, LuMessageCircle,
  LuShoppingCart, LuShare2, LuTrash2,
} from 'react-icons/lu';
import { useData } from '../lib/useData.js';
import { go, back } from '../router.js';
import {
  TopBar, Page, Field, TextInput, NumInput, Select, Seg, Switch, SearchBox, Sheet, Empty, Avatar, ask, toast,
} from '../ui.jsx';
import { upsert, remove } from '../lib/db.js';
import { STATES, gstinProblem, stateFromGstin, panFromGstin, stateName } from '../lib/gst.js';
import { fmtMoney, fmtDate, num, clean, todayISO } from '../lib/format.js';
import { partyStatement } from '../lib/ledger.js';
import { txnEntries } from '../lib/txns.js';
import { statementCsv } from '../lib/reports.js';
import { shareFile, textBytes, openExternal } from '../lib/platform.js';
import { TxnList } from './Bills.jsx';

export function balanceLabel(bal) {
  if (bal > 0.009) return { text: 'To collect', cls: 'c-collect' };
  if (bal < -0.009) return { text: 'To pay', cls: 'c-pay' };
  return { text: 'Settled', cls: 'muted' };
}

export function Parties() {
  const { s, d } = useData();
  const [kind, setKind] = useState('customer');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const list = s.parties
    .filter((p) => (p.kind || 'customer') === kind)
    .filter((p) => !q || `${p.name} ${p.phone} ${p.gstin}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <TopBar noBack title="Parties" actions={<button type="button" className="icon-btn" aria-label="Add party" onClick={() => go('party-new')}><LuPlus /></button>} />
      <Page>
        <div className="money-pair">
          <div className="money-tile collect"><span className="lbl">To collect</span><span className="amt">{fmtMoney(d.toCollect)}</span></div>
          <div className="money-tile pay"><span className="lbl">To pay</span><span className="amt">{fmtMoney(d.toPay)}</span></div>
        </div>
        <Seg value={kind} onChange={setKind} options={[['customer', 'Customers'], ['supplier', 'Suppliers']]} />
        <SearchBox value={query} onChange={setQuery} placeholder="Search name, phone or GSTIN" id="party-search" />
        {list.length ? (
          <div className="card list">
            {list.map((p) => {
              const bal = d.balance.get(p.id) || 0;
              const bl = balanceLabel(bal);
              return (
                <button key={p.id} type="button" className="row" onClick={() => go(`party-${p.id}`)}>
                  <Avatar name={p.name} />
                  <span className="main">
                    <span className="title">{p.name}</span>
                    <span className="meta">{[p.phone, p.gstin].filter(Boolean).join(' · ') || stateName(p.state) || 'No phone added'}</span>
                  </span>
                  <span className="end">
                    <span className={`amt ${bl.cls}`}>{fmtMoney(Math.abs(bal))}</span>
                    <span className="tiny muted">{bl.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <Empty
              icon={<LuUsers />}
              title={q ? 'No matching parties' : kind === 'customer' ? 'No customers yet' : 'No suppliers yet'}
              text={q ? 'Try a different name or number.' : 'Add the people and businesses you bill or buy from.'}
              action={<button type="button" className="btn primary sm" onClick={() => go('party-new')}>Add {kind}</button>}
            />
          </div>
        )}
      </Page>
    </>
  );
}

export function blankParty(s, kind = 'customer') {
  return {
    name: '', kind, phone: '', email: '', gstin: '', pan: '', state: s.settings.business.state || '',
    billingAddress: '', shippingAddress: '', sameShip: true, openingBalance: '', openingType: kind === 'supplier' ? 'pay' : 'receive', openingDate: '',
  };
}

function PartyFields({ form, setForm, compact, errors }) {
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const onGstin = (v) => {
    const g = v.toUpperCase().replace(/\s/g, '');
    setForm((f) => {
      const next = { ...f, gstin: g };
      if (g.length >= 2 && stateFromGstin(g)) next.state = stateFromGstin(g);
      if (g.length === 15 && !f.pan) next.pan = panFromGstin(g);
      return next;
    });
  };
  return (
    <>
      <Field label="Party name *" error={errors.name} htmlFor="p-name">
        <TextInput id="p-name" value={form.name} onChange={set('name')} placeholder="e.g. Jaanvi Electronics" error={errors.name} />
      </Field>
      {!compact && <Seg value={form.kind} onChange={set('kind')} options={[['customer', 'Customer'], ['supplier', 'Supplier']]} />}
      <div className="grid2">
        <Field label="Mobile number" htmlFor="p-phone">
          <TextInput id="p-phone" value={form.phone} onChange={(v) => set('phone')(v.replace(/[^0-9+ ]/g, ''))} inputMode="tel" placeholder="10-digit mobile" />
        </Field>
        <Field label="State" htmlFor="p-state">
          <Select id="p-state" value={form.state} onChange={set('state')} options={STATES.map(([c, n]) => [c, n])} placeholder="Select state" />
        </Field>
      </div>
      <Field label="GSTIN" error={errors.gstin} hint="Fills the state and PAN for you" htmlFor="p-gstin">
        <TextInput id="p-gstin" value={form.gstin} onChange={onGstin} maxLength={15} placeholder="15-character GSTIN" error={errors.gstin} style={{ textTransform: 'uppercase' }} />
      </Field>
      <Field label="Billing address" htmlFor="p-addr">
        <textarea id="p-addr" className="input" value={form.billingAddress} onChange={(e) => set('billingAddress')(e.target.value)} rows={3} placeholder="Building, street, area, city, PIN" />
      </Field>
      {!compact && (
        <>
          <Field label="PAN" htmlFor="p-pan">
            <TextInput id="p-pan" value={form.pan} onChange={(v) => set('pan')(v.toUpperCase())} maxLength={10} placeholder="10-character PAN" />
          </Field>
          <Switch id="p-same" checked={form.sameShip} onChange={set('sameShip')} label="Shipping address same as billing" />
          {!form.sameShip && (
            <Field label="Shipping address" htmlFor="p-ship">
              <textarea id="p-ship" className="input" value={form.shippingAddress} onChange={(e) => set('shippingAddress')(e.target.value)} rows={3} />
            </Field>
          )}
          <Field label="Email" htmlFor="p-email">
            <TextInput id="p-email" value={form.email} onChange={set('email')} inputMode="email" />
          </Field>
          <div className="card card-pad form" style={{ gap: 10 }}>
            <span className="label">Opening balance (before you started using the app)</span>
            <Seg value={form.openingType} onChange={set('openingType')} options={[['receive', 'They owe me'], ['pay', 'I owe them']]} />
            <div className="prefix-input">
              <span>₹</span>
              <NumInput id="p-open" value={form.openingBalance} onChange={set('openingBalance')} placeholder="0" />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function validateParty(form) {
  const errors = {};
  if (!clean(form.name)) errors.name = 'Enter the party’s name.';
  const g = gstinProblem(form.gstin);
  if (g) errors.gstin = g;
  return errors;
}

function partyRecord(form, existing = {}) {
  return {
    ...existing,
    name: clean(form.name), kind: form.kind, phone: clean(form.phone), email: clean(form.email), gstin: clean(form.gstin).toUpperCase(),
    pan: clean(form.pan).toUpperCase(), state: form.state, billingAddress: clean(form.billingAddress),
    shippingAddress: form.sameShip ? '' : clean(form.shippingAddress), openingBalance: num(form.openingBalance), openingType: form.openingType,
    openingDate: form.openingDate || existing.openingDate || '',
  };
}

export function PartyForm({ id }) {
  const { s } = useData();
  const existing = id ? s.parties.find((p) => p.id === id) : null;
  const [form, setForm] = useState(() => (existing ? {
    ...blankParty(s), ...existing, openingBalance: existing.openingBalance ? String(existing.openingBalance) : '', sameShip: !existing.shippingAddress,
  } : blankParty(s)));
  const [errors, setErrors] = useState({});
  if (id && !existing) return <Missing what="party" />;
  const save = async () => {
    const e = validateParty(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    const dup = s.parties.find((p) => p.id !== id && p.name.toLowerCase() === clean(form.name).toLowerCase());
    if (dup && !(await ask({ title: 'A party with this name exists', message: `“${dup.name}” is already saved. Save another party with the same name?`, confirmLabel: 'Save anyway' }))) return;
    const rec = await upsert('parties', partyRecord(form, existing || {}));
    toast(existing ? 'Party updated' : 'Party added');
    if (existing) back(`party-${rec.id}`);
    else go(`party-${rec.id}`, { replace: true });
  };
  return (
    <>
      <TopBar title={existing ? 'Edit party' : 'New party'} backTo="parties" />
      <Page className="form">
        <PartyFields form={form} setForm={setForm} errors={errors} />
      </Page>
      <div className="savebar">
        <button type="button" className="btn primary block" onClick={save}>Save party</button>
      </div>
    </>
  );
}

export function PartyDetail({ id }) {
  const { s, d } = useData();
  const p = s.parties.find((x) => x.id === id);
  if (!p) return <Missing what="party" />;
  const bal = d.balance.get(p.id) || 0;
  const bl = balanceLabel(bal);
  const entries = txnEntries(s, d, { partyId: p.id });
  const supplier = p.kind === 'supplier';
  const remind = () => {
    const biz = s.settings.business.name || 'us';
    const msg = `Dear ${p.name}, a payment of ${fmtMoney(bal)} is pending with ${biz}. Please pay at your earliest convenience. Thank you.`;
    const phone = String(p.phone).replace(/\D/g, '').slice(-10);
    openExternal(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`);
  };
  const del = async () => {
    if (entries.length) {
      await ask({ title: 'This party has entries', message: 'Delete or move its bills and payments first. Parties with entries are kept so your accounts stay correct.', confirmLabel: 'OK', cancelLabel: '' });
      return;
    }
    if (await ask({ title: `Delete ${p.name}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) {
      await remove('parties', p.id);
      toast('Party deleted');
      back('parties');
    }
  };
  const actions = [
    supplier
      ? { label: 'Purchase', icon: <LuShoppingCart />, to: `bill-new-purchase-${p.id}` }
      : { label: 'Invoice', icon: <LuFileText />, to: `bill-new-sale-${p.id}` },
    { label: 'Payment In', icon: <LuArrowDownLeft />, to: `payment-new-in-${p.id}` },
    { label: 'Payment Out', icon: <LuArrowUpRight />, to: `payment-new-out-${p.id}` },
    { label: 'Statement', icon: <LuScrollText />, to: `statement-${p.id}` },
  ];
  return (
    <>
      <TopBar
        title={p.name}
        sub={supplier ? 'Supplier' : 'Customer'}
        backTo="parties"
        actions={<button type="button" className="icon-btn" aria-label="Edit party" onClick={() => go(`party-edit-${p.id}`)}><LuPencil /></button>}
      />
      <Page>
        <div className={`money-tile ${bal < 0 ? 'pay' : 'collect'}`}>
          <span className="lbl">{bl.text}</span>
          <span className={`amt ${bl.cls}`}>{fmtMoney(Math.abs(bal))}</span>
          {bal > 0.009 && p.phone && (
            <button type="button" className="btn secondary sm" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={remind}>
              <LuMessageCircle /> Send WhatsApp reminder
            </button>
          )}
        </div>
        <div className="card card-pad small" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {p.phone && <div><span className="muted">Mobile </span><span style={{ userSelect: 'all' }}>{p.phone}</span></div>}
          {p.gstin && <div><span className="muted">GSTIN </span>{p.gstin}</div>}
          {p.state && <div><span className="muted">State </span>{stateName(p.state)}</div>}
          {p.billingAddress && <div><span className="muted">Address </span>{p.billingAddress}</div>}
          {!p.phone && !p.gstin && !p.billingAddress && <div className="muted">No contact details yet. Tap the pencil to add them.</div>}
        </div>
        <div className="card" style={{ padding: 6 }}>
          <div className="action-grid">
            {actions.map((a) => (
              <button key={a.label} type="button" className="quick" onClick={() => go(a.to)}>
                <span className="ic">{a.icon}</span>{a.label}
              </button>
            ))}
          </div>
        </div>
        <div className="section-title"><h2>Entries</h2></div>
        {entries.length ? <div className="card"><TxnList entries={entries} /></div> : <div className="card"><Empty title="No entries yet" text="Bills and payments for this party will appear here." /></div>}
        <button type="button" className="btn danger" onClick={del}><LuTrash2 /> Delete party</button>
      </Page>
    </>
  );
}

export function PartyStatement({ id }) {
  const { s } = useData();
  const p = s.parties.find((x) => x.id === id);
  if (!p) return <Missing what="party" />;
  const rows = partyStatement(s, id);
  const share = async () => {
    const { message } = await shareFile(textBytes(statementCsv(s, p)), `statement_${p.name.replace(/[^A-Za-z0-9]+/g, '_')}.csv`, 'text/csv');
    if (message) toast(message);
  };
  const last = rows.length ? rows[rows.length - 1].balance : 0;
  return (
    <>
      <TopBar title="Statement" sub={p.name} backTo={`party-${id}`} actions={<button type="button" className="icon-btn" aria-label="Share statement as a spreadsheet" onClick={share}><LuShare2 /></button>} />
      <Page>
        <div className="kpis">
          <div className="kpi"><span className="k">Closing balance</span><span className={`v ${balanceLabel(last).cls}`}>{fmtMoney(Math.abs(last))}</span></div>
          <div className="kpi"><span className="k">Status</span><span className="v">{balanceLabel(last).text}</span></div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Particulars</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Balance</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.link ? 'click' : ''} onClick={() => r.link && go(r.link)}>
                  <td>{fmtDate(r.date)}</td>
                  <td className="wrap">{r.label}{r.ref ? ` #${r.ref}` : ''}</td>
                  <td className="r">{r.debit ? fmtMoney(r.debit) : ''}</td>
                  <td className="r">{r.credit ? fmtMoney(r.credit) : ''}</td>
                  <td className="r">{fmtMoney(Math.abs(r.balance))} {r.balance > 0.009 ? 'Dr' : r.balance < -0.009 ? 'Cr' : ''}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="muted">No entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="tiny muted">Dr means the party owes you. Cr means you owe the party. Share sends the statement as a spreadsheet file.</div>
      </Page>
    </>
  );
}

// Party chooser used inside bill and payment forms, with a quick "add new" form.
export function PartyPicker({ open, onClose, onPick, kind = 'customer' }) {
  const { s, d } = useData();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(() => blankParty(s, kind));
  const [errors, setErrors] = useState({});
  const q = query.trim().toLowerCase();
  const list = s.parties
    .filter((p) => !q || `${p.name} ${p.phone} ${p.gstin}`.toLowerCase().includes(q))
    .sort((a, b) => ((a.kind || 'customer') === kind ? 0 : 1) - ((b.kind || 'customer') === kind ? 0 : 1) || a.name.localeCompare(b.name));
  const close = () => {
    setAdding(false);
    setQuery('');
    onClose();
  };
  const saveNew = async () => {
    const e = validateParty(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    const rec = await upsert('parties', partyRecord({ ...form, kind }));
    setForm(blankParty(s, kind));
    onPick(rec);
    close();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title={adding ? `New ${kind}` : `Select ${kind}`}
      footer={adding
        ? <><button type="button" className="btn secondary" onClick={() => setAdding(false)}>Back</button><button type="button" className="btn primary block" onClick={saveNew}>Save &amp; select</button></>
        : <button type="button" className="btn primary block" onClick={() => { setForm({ ...blankParty(s, kind), name: query }); setAdding(true); }}><LuPlus /> Add new {kind}</button>}
    >
      {adding ? (
        <div className="form"><PartyFields form={form} setForm={setForm} compact errors={errors} /></div>
      ) : (
        <>
          <SearchBox value={query} onChange={setQuery} placeholder="Search name, phone or GSTIN" id="picker-party-search" />
          <div className="list card">
            {list.map((p) => {
              const bal = d.balance.get(p.id) || 0;
              const bl = balanceLabel(bal);
              return (
                <button key={p.id} type="button" className="row" onClick={() => { onPick(p); close(); }}>
                  <Avatar name={p.name} />
                  <span className="main">
                    <span className="title">{p.name}</span>
                    <span className="meta">{[(p.kind || 'customer') === 'supplier' ? 'Supplier' : 'Customer', p.phone, p.gstin].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="end"><span className={`amt small ${bl.cls}`}>{fmtMoney(Math.abs(bal))}</span><span className="tiny muted">{bl.text}</span></span>
                </button>
              );
            })}
            {!list.length && <Empty title={q ? 'No match' : 'No parties yet'} text="Add a new one below." />}
          </div>
        </>
      )}
    </Sheet>
  );
}

export function Missing({ what }) {
  return (
    <>
      <TopBar title="Not found" />
      <Page><Empty title={`This ${what} no longer exists`} text="It may have been deleted." action={<button type="button" className="btn primary sm" onClick={() => go('home', { replace: true })}>Go home</button>} /></Page>
    </>
  );
}

export const today = todayISO;
