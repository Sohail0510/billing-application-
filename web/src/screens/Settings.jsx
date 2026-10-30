import { useRef, useState } from 'react';
import {
  LuBuilding2, LuFileText, LuChartColumn, LuDatabase, LuChevronRight, LuUpload, LuDownload, LuShare2, LuTrash2, LuInfo, LuPackage,
} from 'react-icons/lu';
import { useData } from '../lib/useData.js';
import { go, back } from '../router.js';
import { TopBar, Page, Field, TextInput, NumInput, Select, Switch, Banner, ask, toast } from '../ui.jsx';
import { saveSettings, exportAll, replaceAll, validateBackup, defaultSettings, COLLECTIONS } from '../lib/db.js';
import { STATES, gstinProblem, stateFromGstin, panFromGstin, KINDS } from '../lib/gst.js';
import { THEMES } from '../lib/docModel.js';
import { buildSampleData } from '../lib/sample.js';
import { fmtDateShort, num, clean, todayISO } from '../lib/format.js';
import { shareFile, saveFile, textBytes, imageFileToPng, IS_PREVIEW, isAndroidApp } from '../lib/platform.js';

export const APP_VERSION = '1.0.0';

export function More() {
  const { s } = useData();
  const items = [
    { to: 'business', icon: <LuBuilding2 />, title: 'Business profile', meta: s.settings.business.name || 'Name, GSTIN, address, logo, bank' },
    { to: 'billsetup', icon: <LuFileText />, title: 'Invoice settings', meta: 'Numbering, colour, terms, due days' },
    { to: 'reports', icon: <LuChartColumn />, title: 'Reports', meta: 'GSTR-1, GSTR-3B, profit & loss, stock' },
    { to: 'items', icon: <LuPackage />, title: 'Items & stock', meta: `${s.items.length} items` },
    { to: 'backup', icon: <LuDatabase />, title: 'Backup & restore', meta: s.settings.lastBackupAt ? `Last backup ${fmtDateShort(s.settings.lastBackupAt.slice(0, 10))}` : 'No backup yet' },
  ];
  return (
    <>
      <TopBar title="Settings" backTo="home" />
      <Page>
        <div className="card list menu-list">
          {items.map((i) => (
            <button key={i.to} type="button" className="row" onClick={() => go(i.to)}>
              <span className="ic">{i.icon}</span>
              <span className="main"><span className="title">{i.title}</span><span className="meta">{i.meta}</span></span>
              <LuChevronRight className="chev" />
            </button>
          ))}
        </div>
        <div className="card card-pad small muted" style={{ display: 'flex', gap: 10 }}>
          <LuInfo style={{ flex: 'none', marginTop: 2 }} />
          <span>Hisaab Billing {APP_VERSION}. Your bills, parties and items are stored only on this {isAndroidApp() ? 'phone' : 'device'}; nothing is sent to a server. Keep a backup file in Google Drive or WhatsApp.</span>
        </div>
      </Page>
    </>
  );
}

function BusinessFields({ form, setForm, errors, short }) {
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const fileRef = useRef(null);
  const onGstin = (v) => {
    const g = v.toUpperCase().replace(/\s/g, '');
    setForm((f) => ({ ...f, gstin: g, state: stateFromGstin(g) || f.state, pan: g.length === 15 && !f.pan ? panFromGstin(g) : f.pan }));
  };
  const pickLogo = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      set('logo')(await imageFileToPng(file));
    } catch (err) {
      toast(err.message);
    }
  };
  return (
    <>
      <Field label="Business name *" error={errors.name} htmlFor="b-name">
        <TextInput id="b-name" value={form.name} onChange={set('name')} placeholder="As it should print on invoices" error={errors.name} />
      </Field>
      <div className="grid2">
        <Field label="Mobile number" htmlFor="b-phone"><TextInput id="b-phone" value={form.phone} onChange={(v) => set('phone')(v.replace(/[^0-9+ ]/g, ''))} inputMode="tel" /></Field>
        <Field label="State *" error={errors.state} htmlFor="b-state"><Select id="b-state" value={form.state} onChange={set('state')} options={STATES.map(([c, n]) => [c, n])} placeholder="Select state" /></Field>
      </div>
      <Field label="GSTIN" error={errors.gstin} hint="Leave empty if you are not registered for GST" htmlFor="b-gstin">
        <TextInput id="b-gstin" value={form.gstin} onChange={onGstin} maxLength={15} error={errors.gstin} style={{ textTransform: 'uppercase' }} />
      </Field>
      <Field label="Address" htmlFor="b-addr"><textarea id="b-addr" className="input" rows={2} value={form.address} onChange={(e) => set('address')(e.target.value)} placeholder="Shop no., building, street, area" /></Field>
      <div className="grid2">
        <Field label="City" htmlFor="b-city"><TextInput id="b-city" value={form.city} onChange={set('city')} /></Field>
        <Field label="PIN code" htmlFor="b-pin"><TextInput id="b-pin" value={form.pincode} onChange={(v) => set('pincode')(v.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} /></Field>
      </div>
      {!short && (
        <>
          <div className="grid2">
            <Field label="PAN" htmlFor="b-pan"><TextInput id="b-pan" value={form.pan} onChange={(v) => set('pan')(v.toUpperCase())} maxLength={10} /></Field>
            <Field label="Email" htmlFor="b-email"><TextInput id="b-email" value={form.email} onChange={set('email')} inputMode="email" /></Field>
          </div>
          <div className="field">
            <span className="label">Logo</span>
            <div className="logo-pick">
              <span className="biz-logo">{form.logo ? <img src={form.logo} alt="Business logo" /> : (form.name || 'B').slice(0, 1).toUpperCase()}</span>
              <button type="button" className="btn secondary sm" onClick={() => fileRef.current && fileRef.current.click()}><LuUpload /> {form.logo ? 'Change' : 'Upload'}</button>
              {form.logo && <button type="button" className="btn ghost sm" onClick={() => set('logo')('')}>Remove</button>}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickLogo} />
            </div>
          </div>
          <div className="card card-pad form" style={{ gap: 12 }}>
            <span className="eyebrow">Bank details (print on invoices)</span>
            <div className="grid2">
              <Field label="Bank name" htmlFor="b-bank"><TextInput id="b-bank" value={form.bankName} onChange={set('bankName')} /></Field>
              <Field label="Branch" htmlFor="b-branch"><TextInput id="b-branch" value={form.branch} onChange={set('branch')} /></Field>
            </div>
            <Field label="Account holder name" htmlFor="b-acname"><TextInput id="b-acname" value={form.accountName} onChange={set('accountName')} /></Field>
            <div className="grid2">
              <Field label="Account number" htmlFor="b-acno"><TextInput id="b-acno" value={form.accountNo} onChange={(v) => set('accountNo')(v.replace(/\s/g, ''))} inputMode="numeric" /></Field>
              <Field label="IFSC" htmlFor="b-ifsc"><TextInput id="b-ifsc" value={form.ifsc} onChange={(v) => set('ifsc')(v.toUpperCase())} maxLength={11} /></Field>
            </div>
            <Field label="UPI ID" htmlFor="b-upi"><TextInput id="b-upi" value={form.upi} onChange={set('upi')} placeholder="name@bank" /></Field>
          </div>
        </>
      )}
    </>
  );
}

function validateBusiness(form) {
  const e = {};
  if (!clean(form.name)) e.name = 'Enter your business name.';
  if (!form.state) e.state = 'Select your state. GST depends on it.';
  const g = gstinProblem(form.gstin);
  if (g) e.gstin = g;
  else if (form.gstin && form.state && stateFromGstin(form.gstin) !== form.state) e.gstin = 'The GSTIN belongs to a different state than the one selected.';
  return e;
}

const cleanBusiness = (form) => Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && k !== 'logo' ? v.trim() : v]));

export function BusinessForm() {
  const { s } = useData();
  const [form, setForm] = useState(() => ({ ...s.settings.business }));
  const [errors, setErrors] = useState({});
  const save = async () => {
    const e = validateBusiness(form);
    setErrors(e);
    if (Object.keys(e).length) {
      toast(Object.values(e)[0]);
      return;
    }
    await saveSettings((st) => ({ ...st, business: cleanBusiness(form), onboarded: true }));
    toast('Business profile saved');
    back('more');
  };
  return (
    <>
      <TopBar title="Business profile" backTo="more" />
      <Page className="form"><BusinessFields form={form} setForm={setForm} errors={errors} /></Page>
      <div className="savebar"><button type="button" className="btn primary block" onClick={save}>Save</button></div>
    </>
  );
}

const SERIES = [
  ['sale', 'Sales invoices'], ['quote', 'Quotations'], ['cnote', 'Credit notes'], ['purchase', 'Purchases'], ['dnote', 'Debit notes'],
  ['payin', 'Payment In'], ['payout', 'Payment Out'], ['expense', 'Expenses'],
];

export function InvoiceSetup() {
  const { s } = useData();
  const [form, setForm] = useState(() => JSON.parse(JSON.stringify(s.settings.invoice)));
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setSeries = (group, key) => (v) => setForm((f) => ({ ...f, [group]: { ...f[group], [key]: v } }));
  const save = async () => {
    const startNumbers = Object.fromEntries(Object.entries(form.startNumbers).map(([k, v]) => [k, Math.max(1, Math.floor(num(v)) || 1)]));
    await saveSettings((st) => ({ ...st, invoice: { ...form, startNumbers, defaultDueDays: Math.max(0, Math.floor(num(form.defaultDueDays))) } }));
    toast('Invoice settings saved');
    back('more');
  };
  return (
    <>
      <TopBar title="Invoice settings" backTo="more" />
      <Page className="form">
        <div className="field">
          <span className="label">Invoice colour</span>
          <div className="color-dots">
            {Object.entries(THEMES).map(([k, t]) => (
              <button key={k} type="button" className={`color-dot${form.color === k ? ' on' : ''}`} style={{ background: t.accent }} aria-label={t.label} aria-pressed={form.color === k} onClick={() => set('color')(k)} />
            ))}
          </div>
        </div>
        <div className="card card-pad form" style={{ gap: 8 }}>
          <Switch id="s-round" checked={form.roundOff} onChange={set('roundOff')} label="Round off totals" hint="To the nearest rupee on new bills" />
          <Switch id="s-hsn" checked={form.showHsnSummary} onChange={set('showHsnSummary')} label="Show HSN tax summary" hint="The CGST/SGST table under the items" />
          <Switch id="s-sign" checked={form.showSignature} onChange={set('showSignature')} label="Add signature box" hint="“For your business · Authorised Signatory”" />
        </div>
        <Field label="Default due date (days after the invoice date)" htmlFor="s-due"><NumInput id="s-due" value={String(form.defaultDueDays)} onChange={set('defaultDueDays')} /></Field>
        <Field label="Terms and conditions" hint="One per line. [CITY] prints your city in capitals." htmlFor="s-terms">
          <textarea id="s-terms" className="input" rows={4} value={form.terms} onChange={(e) => set('terms')(e.target.value)} />
        </Field>
        <div className="card card-pad form" style={{ gap: 10 }}>
          <span className="eyebrow">Numbering</span>
          <span className="tiny muted">The next number is one more than the highest used, and never lower than the starting number.</span>
          {SERIES.map(([key, label]) => (
            <div key={key} className="grid3" style={{ gridTemplateColumns: '1.3fr 1fr 1fr', alignItems: 'end' }}>
              <span className="small" style={{ paddingBottom: 12, fontWeight: 600 }}>{label}</span>
              <Field label="Prefix" htmlFor={`s-pre-${key}`}><TextInput id={`s-pre-${key}`} value={form.prefixes[key] || ''} onChange={(v) => setSeries('prefixes', key)(v.replace(/\s/g, ''))} maxLength={8} /></Field>
              <Field label="Start at" htmlFor={`s-start-${key}`}><NumInput id={`s-start-${key}`} value={String(form.startNumbers[key] || 1)} onChange={setSeries('startNumbers', key)} /></Field>
            </div>
          ))}
        </div>
      </Page>
      <div className="savebar"><button type="button" className="btn primary block" onClick={save}>Save settings</button></div>
    </>
  );
}

function useRestore() {
  const ref = useRef(null);
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast('That file is not a backup from this app.');
      return;
    }
    const problem = validateBackup(data);
    if (problem) {
      toast(problem);
      return;
    }
    const count = data.vouchers.length + data.payments.length + data.expenses.length;
    const ok = await ask({
      title: 'Replace everything with this backup?',
      message: `The backup from ${data.exportedAt ? fmtDateShort(data.exportedAt.slice(0, 10)) : 'an earlier date'} has ${data.parties.length} parties, ${data.items.length} items and ${count} entries. Everything currently on this phone will be replaced.`,
      confirmLabel: 'Restore', danger: true,
    });
    if (!ok) return;
    await replaceAll({ ...data, settings: { ...data.settings, onboarded: true } });
    toast('Backup restored');
    go('home', { replace: true });
  };
  const input = <input ref={ref} type="file" accept=".json,application/json,text/plain,*/*" hidden onChange={onFile} />;
  return [input, () => ref.current && ref.current.click()];
}

export function Backup() {
  const { s } = useData();
  const [restoreInput, openRestore] = useRestore();
  const counts = COLLECTIONS.map((c) => [c, s[c].length]);
  const backupBytes = () => textBytes(JSON.stringify(exportAll()));
  const fileName = `hisaab-backup-${todayISO()}.json`;
  const markDone = () => saveSettings((st) => ({ ...st, lastBackupAt: new Date().toISOString() }));
  const share = async () => {
    const { ok, message } = await shareFile(backupBytes(), fileName, 'application/json', 'Hisaab Billing backup');
    if (message) toast(message);
    if (ok) await markDone();
  };
  const save = async () => {
    const msg = saveFile(backupBytes(), fileName, 'application/json');
    toast(msg);
    if (!IS_PREVIEW && !/^Could not|blocked/.test(msg)) await markDone();
  };
  const erase = async () => {
    if (!(await ask({ title: 'Erase all data?', message: 'Every bill, party, item, payment and setting on this phone will be deleted.', confirmLabel: 'Continue', danger: true }))) return;
    if (!(await ask({ title: 'Are you sure?', message: 'Save a backup first if you might need this data again. This cannot be undone.', confirmLabel: 'Erase everything', danger: true }))) return;
    await replaceAll({ settings: defaultSettings(), parties: [], items: [], vouchers: [], payments: [], expenses: [] });
    toast('All data erased');
    go('home', { replace: true });
  };
  const loadSample = async () => {
    if (!(await ask({ title: 'Load sample data?', message: 'This replaces what is on this phone with a made-up shop’s bills so you can try every screen. Erase it later from this page.', confirmLabel: 'Load sample' }))) return;
    await replaceAll(buildSampleData(s.settings));
    toast('Sample data loaded');
    go('home', { replace: true });
  };
  const hasData = counts.some(([, n]) => n > 0);
  return (
    <>
      <TopBar title="Backup & restore" backTo="more" />
      <Page>
        <Banner kind="info">
          Your data lives only on this phone. If the phone is lost, reset or the app is uninstalled, it is gone unless you have a backup file. Share the backup to Google Drive, email or WhatsApp (send to yourself).
        </Banner>
        <div className="card card-pad small" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="kv"><span className="muted">Last backup</span><span>{s.settings.lastBackupAt ? fmtDateShort(s.settings.lastBackupAt.slice(0, 10)) : 'Never'}</span></div>
          {counts.map(([c, n]) => <div key={c} className="kv"><span className="muted" style={{ textTransform: 'capitalize' }}>{c === 'vouchers' ? 'Bills' : c}</span><span>{n}</span></div>)}
        </div>
        <button type="button" className="btn primary" onClick={share}><LuShare2 /> Share backup file</button>
        <button type="button" className="btn secondary" onClick={save}><LuDownload /> Save backup to phone</button>
        <button type="button" className="btn secondary" onClick={openRestore}><LuUpload /> Restore from a backup file</button>
        {restoreInput}
        <div className="section-title" style={{ marginTop: 8 }}><h2>Other</h2></div>
        {!hasData || s.settings.sample ? (
          <button type="button" className="btn secondary" onClick={loadSample}>Load sample data to try the app</button>
        ) : null}
        <button type="button" className="btn danger" onClick={erase}><LuTrash2 /> Erase all data</button>
      </Page>
    </>
  );
}

export function Welcome() {
  const { s } = useData();
  const [form, setForm] = useState(() => ({ ...s.settings.business }));
  const [errors, setErrors] = useState({});
  const [restoreInput, openRestore] = useRestore();
  const start = async () => {
    const e = validateBusiness(form);
    setErrors(e);
    if (Object.keys(e).length) {
      toast(Object.values(e)[0]);
      return;
    }
    await saveSettings((st) => ({ ...st, business: cleanBusiness(form), onboarded: true }));
    go('home', { replace: true });
  };
  const sample = async () => {
    await replaceAll(buildSampleData(s.settings));
    go('home', { replace: true });
  };
  return (
    <>
      <header className="topbar"><div className="topbar-inner"><h1>Hisaab Billing<span className="sub">GST invoices, stock and accounts on your phone</span></h1></div></header>
      <Page className="form">
        <div>
          <h2 style={{ fontSize: 20 }}>Set up your business</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>These details print at the top of every invoice. You can add your logo and bank details later in Settings.</p>
        </div>
        <BusinessFields form={form} setForm={setForm} errors={errors} short />
        <button type="button" className="btn primary block" onClick={start}>Start billing</button>
        <div className="grid2">
          <button type="button" className="btn secondary" onClick={openRestore}><LuUpload /> Restore backup</button>
          <button type="button" className="btn secondary" onClick={sample}>Try sample data</button>
        </div>
        {restoreInput}
        <p className="tiny muted" style={{ margin: 0 }}>Everything stays on this phone. No account or internet connection is needed.</p>
      </Page>
    </>
  );
}

export const kindsForSettings = KINDS;
