import { useState } from 'react';
import { LuPlus, LuChevronRight, LuUserPlus, LuTrash2 } from 'react-icons/lu';
import { useData } from '../lib/useData.js';
import { go } from '../router.js';
import { TopBar, Page, Field, TextInput, NumInput, Select, Seg, Switch, Sheet, Avatar, ask, toast } from '../ui.jsx';
import { upsert, nextNumber } from '../lib/db.js';
import { KINDS, STATES, GST_RATES, UNITS, PAYMENT_MODES, computeVoucher, computeLine, stateName } from '../lib/gst.js';
import { fmtMoney, fmtQty, num, round2, todayISO, addDays, daysBetween, uid, clean } from '../lib/format.js';
import { PartyPicker, Missing, balanceLabel } from './Parties.jsx';
import { ItemPicker } from './Items.jsx';
import { takeVoiceDraft } from '../lib/voice.js';
import { markSoldUnits } from '../lib/stockSheet.js';

const toFormLine = (l) => ({
  key: uid(), itemId: l.itemId || '', name: l.name || '', hsn: l.hsn || '', unit: l.unit || 'PCS', description: l.description || '',
  qty: String(l.qty ?? 1), price: l.price !== undefined && l.price !== '' ? String(l.price) : '', taxIncl: Boolean(l.taxIncl),
  gstRate: String(l.gstRate ?? 0), discountPct: l.discountPct ? String(l.discountPct) : '',
  serialIds: Array.isArray(l.serialIds) ? [...l.serialIds] : [],
});

const toLine = (l) => ({
  itemId: l.itemId || '', name: clean(l.name), hsn: clean(l.hsn), unit: l.unit, description: clean(l.description),
  qty: num(l.qty), price: num(l.price), taxIncl: Boolean(l.taxIncl), gstRate: num(l.gstRate), discountPct: num(l.discountPct),
  serialIds: Array.isArray(l.serialIds) ? l.serialIds : [],
});

const partySnapshot = (p) => (p ? {
  name: p.name, gstin: p.gstin || '', pan: p.pan || '', phone: p.phone || '', state: p.state || '',
  billingAddress: p.billingAddress || '', shippingAddress: p.shippingAddress || '',
} : null);

const parseSeq = (n) => {
  const m = /(\d+)\s*$/.exec(String(n || ''));
  return m ? Number(m[1]) : 0;
};

function initForm(s, { kind, partyId, editId, sourceId, mode }) {
  const inv = s.settings.invoice;
  const biz = s.settings.business;
  const today = todayISO();
  if (editId) {
    const v = s.vouchers.find((x) => x.id === editId);
    if (!v) return null;
    const total = computeVoucher(v, v.bizState ?? biz.state).total;
    return {
      id: v.id, kind: v.kind, number: v.number, date: v.date, dueDate: v.dueDate || '', partyId: v.partyId || '', party: v.party || null,
      taxState: v.taxState || biz.state || '', lines: (v.lines || []).map(toFormLine), roundOff: v.roundOff !== false,
      settled: num(v.settled) ? String(v.settled) : '', fullyPaid: num(v.settled) > 0 && Math.abs(num(v.settled) - total) < 0.01,
      paymentMode: v.paymentMode || 'Cash', notes: v.notes || '', terms: v.terms ?? inv.terms, refNumber: v.refNumber || '', existing: v,
    };
  }
  let k = KINDS[kind] ? kind : 'sale';
  let src = null;
  if (sourceId) {
    src = s.vouchers.find((x) => x.id === sourceId);
    if (src) {
      if (mode === 'convert') k = 'sale';
      else if (mode === 'return') k = KINDS[src.kind].side === 'purchase' ? 'dnote' : 'cnote';
      else k = src.kind;
    }
  }
  const { number } = nextNumber(k, s.vouchers.filter((v) => v.kind === k));
  // A draft prepared by the voice assistant fills the form once, when it opens.
  const voice = !src && k === 'sale' ? takeVoiceDraft('sale') : null;
  const pid = voice ? (voice.partyId || partyId) : src ? src.partyId : partyId;
  const p = pid ? s.parties.find((x) => x.id === pid) : null;
  return {
    kind: k, number, date: today, dueDate: KINDS[k].hasDue ? addDays(today, inv.defaultDueDays || 0) : '',
    partyId: p ? p.id : '', party: p ? partySnapshot(p) : (src ? src.party : null),
    taxState: (src && src.taxState) || (p && p.state) || biz.state || '',
    lines: voice ? voice.lines.map(toFormLine) : src ? (src.lines || []).map(toFormLine) : [], roundOff: inv.roundOff !== false, settled: '', fullyPaid: false,
    paymentMode: 'Cash', notes: src && mode !== 'return' ? src.notes || '' : '', terms: inv.terms,
    refNumber: src && (mode === 'return' || mode === 'convert') ? src.number : '', sourceId: src ? src.id : '', mode,
  };
}

function LineEditor({ line, onSave, onRemove, onClose, inter, stock, units = [], voucherId = '', kind = 'sale' }) {
  const [l, setL] = useState(line);
  const [serials, setSerials] = useState(() => (line.serialIds || []).slice());
  const set = (k) => (v) => setL((x) => ({ ...x, [k]: v }));
  const c = computeLine({ ...l, qty: num(l.qty), price: num(l.price), gstRate: num(l.gstRate), discountPct: num(l.discountPct) });
  // Units of this item that are in stock, or already sold on this same invoice.
  const candidates = l.itemId && kind === 'sale' ? units.filter((u) => u.itemId === l.itemId && (u.status !== 'sold' || u.soldIn === voucherId)) : [];
  // Serial units are added to stock by scanning, so a purchase bill must not add them again.
  const scannedHere = kind === 'purchase' && l.itemId && units.some((u) => u.itemId === l.itemId);
  const tooMany = serials.length > num(l.qty);
  const toggleSerial = (id) => setSerials((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <Sheet
      open={Boolean(line)}
      onClose={onClose}
      title="Item details"
      footer={<>
        <button type="button" className="btn danger" onClick={onRemove} aria-label="Remove item"><LuTrash2 /></button>
        <button type="button" className="btn primary block" onClick={() => onSave({ ...l, serialIds: serials.filter((id) => candidates.some((u) => u.id === id)) })} disabled={!clean(l.name) || num(l.qty) <= 0 || tooMany}>Done</button>
      </>}
    >
      <div className="form">
        <Field label="Item name" htmlFor="l-name"><TextInput id="l-name" value={l.name} onChange={set('name')} /></Field>
        <div className="grid2">
          <Field label="Quantity" hint={stock !== undefined ? `${fmtQty(stock)} ${l.unit} in stock` : undefined} htmlFor="l-qty">
            <NumInput id="l-qty" value={l.qty} onChange={set('qty')} />
          </Field>
          <Field label="Unit" htmlFor="l-unit"><Select id="l-unit" value={l.unit} onChange={set('unit')} options={UNITS.map(([u]) => u)} /></Field>
        </div>
        <Field label="Price per unit" htmlFor="l-price">
          <div className="prefix-input"><span>₹</span><NumInput id="l-price" value={l.price} onChange={set('price')} placeholder="0" /></div>
        </Field>
        <Seg value={l.taxIncl ? 'incl' : 'excl'} onChange={(v) => set('taxIncl')(v === 'incl')} options={[['incl', 'Price includes GST'], ['excl', 'Plus GST']]} />
        <div className="grid2">
          <Field label="GST rate" htmlFor="l-gst"><Select id="l-gst" value={l.gstRate} onChange={set('gstRate')} options={GST_RATES.map((r) => [String(r), `${r}%`])} /></Field>
          <Field label="Discount %" htmlFor="l-disc"><NumInput id="l-disc" value={l.discountPct} onChange={set('discountPct')} placeholder="0" /></Field>
        </div>
        <div className="grid2">
          <Field label="HSN / SAC" htmlFor="l-hsn"><TextInput id="l-hsn" value={l.hsn} onChange={(v) => set('hsn')(v.replace(/[^0-9]/g, ''))} inputMode="numeric" maxLength={8} /></Field>
          <Field label="Description" htmlFor="l-desc"><TextInput id="l-desc" value={l.description} onChange={set('description')} placeholder="Optional" /></Field>
        </div>
        {scannedHere && (
          <div className="banner warn">This item’s serial-numbered units are added to stock when you scan them. Only add a purchase here for quantities you have not scanned, or you will count them twice.</div>
        )}
        {candidates.length > 0 && (
          <Field label="Serial numbers" error={tooMany ? 'More serial numbers than the quantity.' : undefined} hint={`${serials.length} of ${fmtQty(num(l.qty))} selected. Only units in stock are listed.`}>
            <div className="list">
              {candidates.map((u) => (
                <label key={u.id} className="row">
                  <input type="checkbox" checked={serials.includes(u.id)} onChange={() => toggleSerial(u.id)} aria-label={`Serial ${u.serial}`} />
                  <span className="main">
                    <span className="title">{u.serial}</span>
                    <span className="meta">{u.model || 'No model no.'}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        )}
        <div className="card card-pad">
          <div className="kv"><span className="muted">Rate before tax</span><span>{fmtMoney(c.unitRate)}</span></div>
          {c.discountAmt > 0 && <div className="kv"><span className="muted">Discount</span><span>− {fmtMoney(c.discountAmt)}</span></div>}
          <div className="kv"><span className="muted">Taxable value</span><span>{fmtMoney(c.taxable)}</span></div>
          <div className="kv"><span className="muted">{inter ? `IGST ${fmtQty(c.gstRate)}%` : `CGST + SGST ${fmtQty(c.gstRate)}%`}</span><span>{fmtMoney(c.tax)}</span></div>
          <div className="kv strong"><span>Line total</span><span>{fmtMoney(c.amount)}</span></div>
        </div>
      </div>
    </Sheet>
  );
}

export default function VoucherForm(props) {
  const { s, d } = useData();
  const [form, setForm] = useState(() => initForm(s, props));
  const [partyOpen, setPartyOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  if (!form) return <Missing what="bill" />;
  const k = KINDS[form.kind];
  const biz = s.settings.business;
  const bizState = form.existing ? form.existing.bizState ?? biz.state : biz.state;
  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));
  const draft = { ...form, lines: form.lines.map(toLine) };
  const c = computeVoucher(draft, bizState);
  const settledNum = form.fullyPaid ? c.total : num(form.settled);
  const balanceDue = round2(c.total - settledNum);
  const party = form.partyId ? s.parties.find((p) => p.id === form.partyId) : null;
  const partyBal = party ? d.balance.get(party.id) || 0 : 0;
  const isEdit = Boolean(form.existing);
  const title = isEdit ? `Edit ${k.label}` : form.mode === 'convert' ? 'Convert to invoice' : `New ${k.label}`;
  const roleLabel = k.partyRole.toLowerCase();

  const pickParty = (p) => setForm((f) => ({ ...f, partyId: p.id, party: partySnapshot(p), taxState: p.state || biz.state || f.taxState }));
  const pickItem = (it) => {
    const purchase = k.side === 'purchase';
    const line = toFormLine({
      itemId: it.id, name: it.name, hsn: it.hsn, unit: it.unit, qty: 1, price: purchase ? it.purchasePrice : it.salePrice,
      taxIncl: purchase ? it.purchaseTaxIncl : it.saleTaxIncl, gstRate: it.gstRate, description: it.description,
    });
    setForm((f) => ({ ...f, lines: [...f.lines, line] }));
    setEditing(line);
  };
  const saveLine = (l) => {
    setForm((f) => ({ ...f, lines: f.lines.map((x) => (x.key === l.key ? l : x)) }));
    setEditing(null);
  };
  const removeLine = () => {
    const key = editing.key;
    setForm((f) => ({ ...f, lines: f.lines.filter((x) => x.key !== key) }));
    setEditing(null);
  };

  const save = async () => {
    if (saving) return;
    const e = {};
    if (!clean(form.number)) e.number = 'Enter a number.';
    else if (s.vouchers.some((v) => v.kind === form.kind && v.id !== form.id && String(v.number).toLowerCase() === clean(form.number).toLowerCase())) {
      e.number = `${k.label} ${clean(form.number)} already exists.`;
    }
    if (!form.date) e.date = 'Pick a date.';
    if (['purchase', 'cnote', 'dnote'].includes(form.kind) && !form.partyId) e.party = `Select the ${roleLabel}.`;
    if (!form.lines.length) e.lines = 'Add at least one item.';
    if (form.lines.some((l) => (l.serialIds || []).length > num(l.qty))) e.lines = 'A line has more serial numbers than its quantity.';
    if (settledNum > c.total + 0.009) e.settled = 'This is more than the bill total.';
    setErrors(e);
    if (Object.keys(e).length) {
      toast(Object.values(e)[0]);
      return;
    }
    if (form.dueDate && form.dueDate < form.date && !(await ask({ title: 'Due date is before the bill date', message: 'Save anyway?', confirmLabel: 'Save' }))) return;
    setSaving(true);
    const terms = form.terms === s.settings.invoice.terms ? undefined : form.terms;
    const rec = {
      ...(form.existing || {}),
      kind: form.kind, number: clean(form.number), seq: parseSeq(form.number), date: form.date, dueDate: k.hasDue ? form.dueDate : '',
      partyId: form.partyId, party: party ? partySnapshot(party) : form.party, taxState: form.taxState || bizState || '', bizState: bizState || '',
      lines: form.lines.map(toLine), roundOff: form.roundOff, settled: k.settleLabel ? round2(settledNum) : 0,
      paymentMode: form.paymentMode, notes: clean(form.notes), terms, refNumber: clean(form.refNumber),
    };
    if (form.kind === 'quote') rec.status = (form.existing && form.existing.status) || 'open';
    if (form.sourceId) rec.sourceId = form.sourceId;
    if (form.id) rec.id = form.id;
    const saved = await upsert('vouchers', rec);
    await markSoldUnits(saved);
    if (form.mode === 'convert' && form.sourceId) {
      const src = s.vouchers.find((v) => v.id === form.sourceId);
      if (src) await upsert('vouchers', { ...src, status: 'converted', convertedTo: saved.id });
    }
    toast(isEdit ? 'Changes saved' : `${k.label} ${saved.number} saved`);
    go(`doc-${saved.id}`, { replace: true });
  };

  const dueDays = form.dueDate && form.date ? daysBetween(form.date, form.dueDate) : null;

  return (
    <>
      <TopBar title={title} backTo="bills" />
      <Page>
        <div className="card card-pad form" style={{ gap: 12 }}>
          <div className="grid2">
            <Field label={k.numberLabel} error={errors.number} htmlFor="v-number">
              <TextInput id="v-number" value={form.number} onChange={set('number')} error={errors.number} />
            </Field>
            <Field label={k.dateLabel} error={errors.date} htmlFor="v-date">
              <input id="v-date" type="date" className="input" value={form.date} onChange={(e) => set('date')(e.target.value)} />
            </Field>
          </div>
          {k.hasDue && (
            <div className="grid2">
              <Field label={k.dueLabel} hint={dueDays !== null && dueDays >= 0 ? `${dueDays} ${dueDays === 1 ? 'day' : 'days'} after the bill date` : undefined} htmlFor="v-due">
                <input id="v-due" type="date" className="input" value={form.dueDate} onChange={(e) => set('dueDate')(e.target.value)} />
              </Field>
              <Field label="Quick due date" htmlFor="v-due-days">
                <Select id="v-due-days" value="" onChange={(v) => v !== '' && set('dueDate')(addDays(form.date, Number(v)))} options={[['0', 'Same day'], ['7', '7 days'], ['15', '15 days'], ['30', '30 days'], ['45', '45 days']]} placeholder="Choose…" />
              </Field>
            </div>
          )}
          {(form.kind === 'cnote' || form.kind === 'dnote') && (
            <Field label={form.kind === 'cnote' ? 'Against invoice no.' : 'Against bill no.'} htmlFor="v-ref">
              <TextInput id="v-ref" value={form.refNumber} onChange={set('refNumber')} placeholder="Optional" />
            </Field>
          )}
        </div>

        <div className={`card${errors.party ? ' bad' : ''}`}>
          <button type="button" className="party-pick" onClick={() => setPartyOpen(true)}>
            {form.party ? <Avatar name={form.party.name} /> : <span className="avatar"><LuUserPlus /></span>}
            <span className="main">
              <span className="label">{k.side === 'purchase' ? 'Bill from' : 'Bill to'}</span>
              <span style={{ display: 'block', fontWeight: 600 }}>{form.party ? form.party.name : form.kind === 'sale' ? 'Cash sale (no customer)' : `Select ${roleLabel}`}</span>
              {party && <span className={`tiny ${balanceLabel(partyBal).cls}`}>{balanceLabel(partyBal).text} {fmtMoney(Math.abs(partyBal))}{party.gstin ? ` · ${party.gstin}` : ''}</span>}
              {errors.party && <span className="tiny c-danger">{errors.party}</span>}
            </span>
            <LuChevronRight className="chev" />
          </button>
          <div style={{ padding: '0 14px 12px' }}>
            <Field label={k.side === 'purchase' ? 'Supplier’s state' : 'Place of supply'} hint={c.inter ? 'Different state: IGST applies' : 'Same state: CGST + SGST apply'} htmlFor="v-pos">
              <Select id="v-pos" value={form.taxState} onChange={set('taxState')} options={STATES.map(([code, n]) => [code, `${code} · ${n}`])} placeholder="Select state" />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-pad" style={{ paddingBottom: 6 }}><span className="eyebrow">Items</span></div>
          {form.lines.map((l) => {
            const lc = computeLine(toLine(l));
            const stock = l.itemId ? d.stock.get(l.itemId) : undefined;
            const short = k.stock < 0 && stock !== undefined && num(l.qty) > stock;
            return (
              <button key={l.key} type="button" className="line-card" onClick={() => setEditing(l)}>
                <span className="line-top"><span className="nm">{l.name || 'Unnamed item'}</span><span className="amt">{fmtMoney(lc.amount)}</span></span>
                <span className="line-sub">
                  {fmtQty(lc.qty)} {l.unit} × {fmtMoney(lc.unitRate)}{num(l.discountPct) ? ` − ${fmtQty(l.discountPct)}%` : ''} · GST {fmtQty(lc.gstRate)}% {fmtMoney(lc.tax)}
                </span>
                {short && <span className="tiny c-warn">Only {fmtQty(stock)} {l.unit} in stock</span>}
              </button>
            );
          })}
          {errors.lines && !form.lines.length && <div className="card-pad tiny c-danger">{errors.lines}</div>}
          <button type="button" className="add-line" onClick={() => setItemOpen(true)}><LuPlus /> Add item</button>
        </div>

        {form.lines.length > 0 && (
          <div className="card card-pad">
            <div className="kv"><span className="muted">Taxable value</span><span>{fmtMoney(c.taxable)}</span></div>
            {c.discount > 0 && <div className="kv"><span className="muted">Discount given</span><span>{fmtMoney(c.discount)}</span></div>}
            {c.inter
              ? <div className="kv"><span className="muted">IGST</span><span>{fmtMoney(c.igst)}</span></div>
              : <>
                <div className="kv"><span className="muted">CGST</span><span>{fmtMoney(c.cgst)}</span></div>
                <div className="kv"><span className="muted">SGST</span><span>{fmtMoney(c.sgst)}</span></div>
              </>}
            <Switch id="v-round" checked={form.roundOff} onChange={set('roundOff')} label="Round off total" hint={c.roundOff ? `${c.roundOff > 0 ? '+' : ''}${fmtMoney(c.roundOff)}` : undefined} />
            <div className="kv strong"><span>Total</span><span>{fmtMoney(c.total)}</span></div>
          </div>
        )}

        {k.settleLabel && form.lines.length > 0 && (
          <div className="card card-pad form" style={{ gap: 10 }}>
            <Switch
              id="v-paid"
              checked={form.fullyPaid}
              onChange={set('fullyPaid')}
              label={form.kind === 'sale' ? 'Fully paid now' : form.kind === 'purchase' ? 'Paid in full' : 'Settled in cash now'}
              hint={form.kind === 'sale' ? 'Turn off if the customer will pay later' : undefined}
            />
            {!form.fullyPaid && (
              <div className="grid2">
                <Field label={k.settleLabel} error={errors.settled} htmlFor="v-settled">
                  <div className="prefix-input"><span>₹</span><NumInput id="v-settled" value={form.settled} onChange={set('settled')} placeholder="0" error={errors.settled} /></div>
                </Field>
                <Field label="Balance" htmlFor="v-balance">
                  <input id="v-balance" className="input num" readOnly value={fmtMoney(Math.max(0, balanceDue))} />
                </Field>
              </div>
            )}
            {settledNum > 0 && (
              <Field label="Payment mode" htmlFor="v-mode">
                <Select id="v-mode" value={form.paymentMode} onChange={set('paymentMode')} options={PAYMENT_MODES} />
              </Field>
            )}
          </div>
        )}

        <details className="card card-pad">
          <summary style={{ fontWeight: 600, cursor: 'pointer' }}>Notes and terms</summary>
          <div className="form" style={{ marginTop: 12 }}>
            <Field label="Notes (printed on the bill)" htmlFor="v-notes">
              <textarea id="v-notes" className="input" value={form.notes} onChange={(e) => set('notes')(e.target.value)} rows={2} placeholder="e.g. Delivered by van TS09 AB 1234" />
            </Field>
            <Field label="Terms and conditions" hint="One per line. Change the default in Settings → Invoice settings." htmlFor="v-terms">
              <textarea id="v-terms" className="input" value={form.terms} onChange={(e) => set('terms')(e.target.value)} rows={3} />
            </Field>
          </div>
        </details>
        {stateName(bizState) === '' && (
          <div className="tiny muted">Tip: set your business state in Settings so GST is split correctly between CGST/SGST and IGST.</div>
        )}
      </Page>
      <div className="savebar">
        <span className="total"><span className="tiny muted">Total{form.lines.length ? ` · ${fmtQty(c.qty)} qty` : ''}</span><b>{fmtMoney(c.total)}</b></span>
        <button type="button" className="btn primary" onClick={save} disabled={saving}>{isEdit ? 'Save changes' : `Save ${k.label.split(' ')[0].toLowerCase() === 'sales' ? 'invoice' : k.label.toLowerCase()}`}</button>
      </div>
      <PartyPicker open={partyOpen} onClose={() => setPartyOpen(false)} onPick={pickParty} kind={k.side === 'purchase' ? 'supplier' : 'customer'} />
      <ItemPicker open={itemOpen} onClose={() => setItemOpen(false)} onPick={pickItem} side={k.side} />
      {editing && (
        <LineEditor
          key={editing.key}
          line={editing}
          onSave={saveLine}
          onRemove={removeLine}
          onClose={() => setEditing(null)}
          inter={c.inter}
          stock={editing.itemId ? d.stock.get(editing.itemId) : undefined}
          units={s.units}
          voucherId={form.id || ''}
          kind={form.kind}
        />
      )}
    </>
  );
}
