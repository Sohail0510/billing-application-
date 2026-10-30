import { useState } from 'react';
import { LuPlus, LuPencil, LuPackage, LuTrash2 } from 'react-icons/lu';
import { useData } from '../lib/useData.js';
import { go, back } from '../router.js';
import { TopBar, Page, Field, TextInput, NumInput, Select, Seg, SearchBox, Sheet, Empty, ask, toast } from '../ui.jsx';
import { upsert, remove } from '../lib/db.js';
import { UNITS, GST_RATES, KINDS } from '../lib/gst.js';
import { fmtMoney, fmtQty, fmtDateShort, num, clean } from '../lib/format.js';
import { Missing } from './Parties.jsx';

export function blankItem() {
  return {
    name: '', kind: 'product', hsn: '', unit: 'PCS', gstRate: '18', salePrice: '', saleTaxIncl: true, purchasePrice: '',
    purchaseTaxIncl: false, openingStock: '', lowStock: '', description: '',
  };
}

function itemRecord(form, existing = {}) {
  return {
    ...existing,
    name: clean(form.name), kind: form.kind, hsn: clean(form.hsn), unit: form.unit, gstRate: num(form.gstRate),
    salePrice: num(form.salePrice), saleTaxIncl: Boolean(form.saleTaxIncl), purchasePrice: num(form.purchasePrice),
    purchaseTaxIncl: Boolean(form.purchaseTaxIncl), openingStock: form.kind === 'service' ? 0 : num(form.openingStock),
    lowStock: form.kind === 'service' ? 0 : num(form.lowStock), description: clean(form.description),
  };
}

function ItemFields({ form, setForm, errors, compact }) {
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const service = form.kind === 'service';
  return (
    <>
      <Seg value={form.kind} onChange={set('kind')} options={[['product', 'Product'], ['service', 'Service']]} />
      <Field label="Item name *" error={errors.name} htmlFor="i-name">
        <TextInput id="i-name" value={form.name} onChange={set('name')} placeholder={service ? 'e.g. AC installation' : 'e.g. LG 1.5 Ton 5 Star AC'} error={errors.name} />
      </Field>
      <div className="grid2">
        <Field label={service ? 'SAC code' : 'HSN code'} htmlFor="i-hsn">
          <TextInput id="i-hsn" value={form.hsn} onChange={(v) => set('hsn')(v.replace(/[^0-9]/g, ''))} inputMode="numeric" maxLength={8} placeholder="e.g. 8415" />
        </Field>
        <Field label="GST rate" htmlFor="i-gst">
          <Select id="i-gst" value={String(form.gstRate)} onChange={set('gstRate')} options={GST_RATES.map((r) => [String(r), `${r}%`])} />
        </Field>
      </div>
      <div className="grid2">
        <Field label="Sale price" htmlFor="i-sale">
          <div className="prefix-input"><span>₹</span><NumInput id="i-sale" value={form.salePrice} onChange={set('salePrice')} placeholder="0" /></div>
        </Field>
        <Field label="Unit" htmlFor="i-unit">
          <Select id="i-unit" value={form.unit} onChange={set('unit')} options={UNITS.map(([u]) => u)} />
        </Field>
      </div>
      <Seg value={form.saleTaxIncl ? 'incl' : 'excl'} onChange={(v) => set('saleTaxIncl')(v === 'incl')} options={[['incl', 'Sale price includes GST'], ['excl', 'Plus GST']]} />
      {!compact && (
        <>
          <Field label="Purchase price" htmlFor="i-pur">
            <div className="prefix-input"><span>₹</span><NumInput id="i-pur" value={form.purchasePrice} onChange={set('purchasePrice')} placeholder="0" /></div>
          </Field>
          <Seg value={form.purchaseTaxIncl ? 'incl' : 'excl'} onChange={(v) => set('purchaseTaxIncl')(v === 'incl')} options={[['incl', 'Purchase price includes GST'], ['excl', 'Plus GST']]} />
        </>
      )}
      {!service && (
        <div className="grid2">
          <Field label="Opening stock" hint={form.unit} htmlFor="i-open">
            <NumInput id="i-open" value={form.openingStock} onChange={set('openingStock')} placeholder="0" />
          </Field>
          <Field label="Low stock alert at" hint="Leave empty for no alert" htmlFor="i-low">
            <NumInput id="i-low" value={form.lowStock} onChange={set('lowStock')} placeholder="0" />
          </Field>
        </div>
      )}
      {!compact && (
        <Field label="Description (prints under the item name)" htmlFor="i-desc">
          <TextInput id="i-desc" value={form.description} onChange={set('description')} placeholder="Model number, warranty, colour…" />
        </Field>
      )}
    </>
  );
}

export function Items() {
  const { s, d } = useData();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const list = s.items.filter((i) => !q || `${i.name} ${i.hsn}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <TopBar noBack title="Items" actions={<button type="button" className="icon-btn" aria-label="Add item" onClick={() => go('item-new')}><LuPlus /></button>} />
      <Page>
        <SearchBox value={query} onChange={setQuery} placeholder="Search items or HSN" id="item-search" />
        {list.length ? (
          <div className="card list">
            {list.map((i) => {
              const st = d.stock.get(i.id);
              const low = i.kind !== 'service' && num(i.lowStock) > 0 && st <= num(i.lowStock);
              return (
                <button key={i.id} type="button" className="row" onClick={() => go(`item-${i.id}`)}>
                  <span className="main">
                    <span className="title">{i.name}</span>
                    <span className="meta">{fmtMoney(i.salePrice)}{i.saleTaxIncl ? ' incl. GST' : ' + GST'} · {i.gstRate}%{i.hsn ? ` · HSN ${i.hsn}` : ''}</span>
                  </span>
                  <span className="end">
                    {i.kind === 'service' ? <span className="pill neutral">Service</span> : (
                      <>
                        <span className={`stock-badge num ${st <= 0 ? 'c-pay' : low ? 'c-warn' : ''}`}>{fmtQty(st)} {i.unit}</span>
                        <span className="tiny muted">{st <= 0 ? 'Out of stock' : low ? 'Low stock' : 'In stock'}</span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <Empty icon={<LuPackage />} title={q ? 'No matching items' : 'No items yet'} text={q ? 'Try a different name.' : 'Save products and services once, then add them to bills in a tap.'} action={<button type="button" className="btn primary sm" onClick={() => go('item-new')}>Add item</button>} />
          </div>
        )}
      </Page>
    </>
  );
}

export function ItemForm({ id }) {
  const { s } = useData();
  const existing = id ? s.items.find((i) => i.id === id) : null;
  const [form, setForm] = useState(() => (existing ? {
    ...blankItem(), ...existing, gstRate: String(existing.gstRate),
    salePrice: existing.salePrice ? String(existing.salePrice) : '', purchasePrice: existing.purchasePrice ? String(existing.purchasePrice) : '',
    openingStock: existing.openingStock ? String(existing.openingStock) : '', lowStock: existing.lowStock ? String(existing.lowStock) : '',
  } : blankItem()));
  const [errors, setErrors] = useState({});
  if (id && !existing) return <Missing what="item" />;
  const save = async () => {
    const e = {};
    if (!clean(form.name)) e.name = 'Enter the item name.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const rec = await upsert('items', itemRecord(form, existing || {}));
    toast(existing ? 'Item updated' : 'Item added');
    if (existing) back(`item-${rec.id}`);
    else go(`item-${rec.id}`, { replace: true });
  };
  return (
    <>
      <TopBar title={existing ? 'Edit item' : 'New item'} backTo="items" />
      <Page className="form"><ItemFields form={form} setForm={setForm} errors={errors} /></Page>
      <div className="savebar"><button type="button" className="btn primary block" onClick={save}>Save item</button></div>
    </>
  );
}

export function ItemDetail({ id }) {
  const { s, d } = useData();
  const it = s.items.find((x) => x.id === id);
  if (!it) return <Missing what="item" />;
  const moves = [];
  for (const v of s.vouchers) {
    const k = KINDS[v.kind];
    for (const l of v.lines || []) {
      if (l.itemId !== id) continue;
      moves.push({ v, k, qty: num(l.qty) * (k.stock || 0), rawQty: num(l.qty), date: v.date });
    }
  }
  moves.sort((a, b) => (a.date < b.date ? 1 : -1));
  const stock = d.stock.get(id);
  const del = async () => {
    if (moves.length) {
      await ask({ title: 'This item is used in bills', message: 'Items on saved bills are kept so the bills stay correct. You can rename it instead.', confirmLabel: 'OK', cancelLabel: '' });
      return;
    }
    if (await ask({ title: `Delete ${it.name}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) {
      await remove('items', id);
      toast('Item deleted');
      back('items');
    }
  };
  return (
    <>
      <TopBar title={it.name} sub={it.kind === 'service' ? 'Service' : 'Product'} backTo="items" actions={<button type="button" className="icon-btn" aria-label="Edit item" onClick={() => go(`item-edit-${id}`)}><LuPencil /></button>} />
      <Page>
        <div className="kpis">
          <div className="kpi"><span className="k">Sale price</span><span className="v">{fmtMoney(it.salePrice)}</span><span className="tiny muted">{it.saleTaxIncl ? 'Includes' : 'Plus'} {it.gstRate}% GST</span></div>
          <div className="kpi"><span className="k">Purchase price</span><span className="v">{fmtMoney(it.purchasePrice)}</span><span className="tiny muted">{it.purchaseTaxIncl ? 'Includes GST' : 'Plus GST'}</span></div>
          {it.kind !== 'service' && <div className="kpi"><span className="k">In stock</span><span className={`v ${stock <= 0 ? 'c-pay' : ''}`}>{fmtQty(stock)} {it.unit}</span></div>}
          <div className="kpi"><span className="k">{it.kind === 'service' ? 'SAC' : 'HSN'}</span><span className="v">{it.hsn || '—'}</span></div>
        </div>
        <div className="section-title"><h2>Stock movement</h2></div>
        <div className="card list">
          {it.kind !== 'service' && (
            <div className="row"><span className="main"><span className="title">Opening stock</span></span><span className="end"><span className="amt">{fmtQty(it.openingStock)} {it.unit}</span></span></div>
          )}
          {moves.map((m, i) => (
            <button key={i} type="button" className="row" onClick={() => go(`doc-${m.v.id}`)}>
              <span className="main">
                <span className="title">{(m.v.party && m.v.party.name) || 'Cash Sale'}</span>
                <span className="meta">{m.k.label} #{m.v.number} · {fmtDateShort(m.v.date)}</span>
              </span>
              <span className="end"><span className={`amt ${m.qty > 0 ? 'c-collect' : m.qty < 0 ? 'c-pay' : 'muted'}`}>{m.qty > 0 ? '+' : m.qty < 0 ? '−' : ''}{fmtQty(m.rawQty)} {it.unit}</span></span>
            </button>
          ))}
          {!moves.length && it.kind === 'service' && <Empty title="Not billed yet" />}
        </div>
        <button type="button" className="btn danger" onClick={del}><LuTrash2 /> Delete item</button>
      </Page>
    </>
  );
}

export function ItemPicker({ open, onClose, onPick, side = 'sale' }) {
  const { s, d } = useData();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankItem);
  const [errors, setErrors] = useState({});
  const q = query.trim().toLowerCase();
  const list = s.items.filter((i) => !q || `${i.name} ${i.hsn}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  const close = () => {
    setAdding(false);
    setQuery('');
    onClose();
  };
  const saveNew = async () => {
    if (!clean(form.name)) {
      setErrors({ name: 'Enter the item name.' });
      return;
    }
    const base = itemRecord(form);
    if (side === 'purchase') {
      base.purchasePrice = base.salePrice;
      base.purchaseTaxIncl = base.saleTaxIncl;
      base.salePrice = 0;
    }
    const rec = await upsert('items', base);
    setForm(blankItem());
    setAdding(false);
    setErrors({});
    onPick(rec);
    close();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title={adding ? 'New item' : 'Add item'}
      footer={adding
        ? <><button type="button" className="btn secondary" onClick={() => setAdding(false)}>Back</button><button type="button" className="btn primary block" onClick={saveNew}>Save &amp; add</button></>
        : <button type="button" className="btn primary block" onClick={() => { setForm({ ...blankItem(), name: query }); setAdding(true); }}><LuPlus /> Create new item</button>}
    >
      {adding ? (
        <div className="form">
          <ItemFields form={form} setForm={setForm} errors={errors} compact />
          {side === 'purchase' && <div className="tiny muted">The price above is saved as the purchase price.</div>}
        </div>
      ) : (
        <>
          <SearchBox value={query} onChange={setQuery} placeholder="Search items or HSN" id="picker-item-search" />
          <div className="card list">
            {list.map((i) => {
              const st = d.stock.get(i.id);
              const price = side === 'purchase' ? i.purchasePrice : i.salePrice;
              return (
                <button key={i.id} type="button" className="row" onClick={() => { onPick(i); close(); }}>
                  <span className="main">
                    <span className="title">{i.name}</span>
                    <span className="meta">{fmtMoney(price)} · GST {i.gstRate}%{i.hsn ? ` · HSN ${i.hsn}` : ''}</span>
                  </span>
                  <span className="end">
                    {i.kind === 'service' ? <span className="pill neutral">Service</span> : <span className={`stock-badge num ${st <= 0 ? 'c-pay' : ''}`}>{fmtQty(st)} {i.unit}</span>}
                  </span>
                </button>
              );
            })}
            {!list.length && <Empty title={q ? 'No match' : 'No items yet'} text="Create a new item below." />}
          </div>
        </>
      )}
    </Sheet>
  );
}
