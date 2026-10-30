import { useState } from 'react';
import { LuCamera, LuTrash2, LuFileSpreadsheet } from 'react-icons/lu';
import { useData } from '../lib/useData.js';
import { TopBar, Page, Field, TextInput, Select, Banner, ask, toast } from '../ui.jsx';
import { upsert, remove } from '../lib/db.js';
import { imageFileToPng, readLabelText, canReadLabels } from '../lib/platform.js';
import { parseLabel } from '../lib/units.js';
import { publishStockSheet } from '../lib/stockSheet.js';
import { clean, todayISO, uid, num } from '../lib/format.js';

const blank = () => ({ itemId: '', productName: '', brand: '', model: '', serial: '', purchasePrice: '', note: '' });

export default function Scan() {
  const { s } = useData();
  const [form, setForm] = useState(blank);
  const [photo, setPhoto] = useState('');
  const [reading, setReading] = useState(false);
  const [readText, setReadText] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const items = s.items.filter((i) => i.kind !== 'service');
  const recent = [...s.units].sort((a, b) => ((a.createdAt || '') < (b.createdAt || '') ? 1 : -1)).slice(0, 8);

  // Takes the photo, reads its text and fills in what the label says. Typing still works if reading fails.
  const onPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setReading(true);
    setReadText('');
    try {
      const dataUrl = await imageFileToPng(file, 1600);
      setPhoto(dataUrl);
      const text = await readLabelText(dataUrl.split(',')[1]);
      const r = parseLabel(text);
      setReadText(r.text);
      setForm((f) => ({ ...f, model: r.model || f.model, serial: r.serial || f.serial }));
      if (!r.model && !r.serial) toast('Could not find a model or serial number. Type them in.');
      else toast('Read from the label. Check before saving.');
    } catch (err) {
      toast(err.message || 'Could not read the photo.');
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    if (saving) return;
    let item = items.find((i) => i.id === form.itemId);
    const productName = item ? item.name : clean(form.productName);
    const serial = clean(form.serial).toUpperCase();
    const e = {};
    if (!productName) e.productName = 'Choose an item or type the product name.';
    if (!serial) e.serial = 'Enter the serial number.';
    else if (s.units.some((u) => (u.serial || '').toUpperCase() === serial)) e.serial = 'This serial number is already in your stock list.';
    setErrors(e);
    if (Object.keys(e).length) {
      toast(Object.values(e)[0]);
      return;
    }
    setSaving(true);
    try {
      // A product that isn't in the item list yet is added to it, so its stock is counted from now on.
      if (!item) {
        const same = s.items.find((i) => i.kind !== 'service' && clean(i.name).toUpperCase() === productName.toUpperCase());
        item = same || await upsert('items', {
          name: productName, kind: 'product', hsn: '', unit: 'PCS', gstRate: 18, salePrice: 0, saleTaxIncl: true,
          purchasePrice: num(form.purchasePrice), purchaseTaxIncl: false, openingStock: 0, lowStock: 0, description: '',
        });
      }
      await upsert('units', {
        id: uid(), itemId: item.id, productName: item.name, brand: clean(form.brand), model: clean(form.model).toUpperCase(),
        serial, hsn: item.hsn || '', purchasePrice: num(form.purchasePrice), note: clean(form.note), status: 'in_stock', soldIn: '', invoiceNo: '', soldDate: '',
        partyName: '', addedDate: todayISO(), source: photo ? 'scan' : 'manual',
      });
      const msg = publishStockSheet();
      // Keep the item and brand, since the next unit is usually the same product.
      setForm((f) => ({ ...blank(), itemId: f.itemId || item.id, productName: f.productName, brand: f.brand, purchasePrice: f.purchasePrice }));
      setPhoto('');
      setReadText('');
      toast(`Saved. ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const removeUnit = async (u) => {
    if (u.status === 'sold') {
      toast('This unit is sold on an invoice. Delete the invoice first.');
      return;
    }
    if (!(await ask({ title: `Delete serial ${u.serial}?`, confirmLabel: 'Delete', danger: true }))) return;
    await remove('units', u.id);
    publishStockSheet();
    toast('Deleted');
  };

  return (
    <>
      <TopBar title="Scan label" sub="Photo to model and serial number" backTo="home" />
      <Page className="form">
        {!canReadLabels() && (
          <Banner kind="info">Reading the label from a photo works in the Android app. You can still type the details below.</Banner>
        )}
        <div className="card card-pad">
          <label className="btn primary block" htmlFor="scan-file" style={{ cursor: 'pointer' }}>
            <LuCamera /> Take photo of label
          </label>
          <input id="scan-file" type="file" accept="image/*" capture="environment" onChange={onPhoto} hidden />
          {reading && <div className="small muted" role="status" style={{ marginTop: 10 }}>Reading the label…</div>}
          {photo && <img src={photo} alt="Label photo" style={{ width: '100%', borderRadius: 12, marginTop: 12 }} />}
          {readText && (
            <div className="small muted" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>
              <span className="label">Text found on the label</span>
              <div>{readText}</div>
            </div>
          )}
        </div>

        <Field label="Item from your list" hint="Optional. Leave blank to type the product name; a new item is added for it." htmlFor="scan-item">
          <Select id="scan-item" value={form.itemId} onChange={set('itemId')} options={[['', 'Type the product name'], ...items.map((i) => [i.id, i.name])]} />
        </Field>
        {!form.itemId && (
          <Field label="Product name *" error={errors.productName} htmlFor="scan-product">
            <TextInput id="scan-product" value={form.productName} onChange={set('productName')} placeholder="e.g. Split AC 1.5 ton" error={errors.productName} />
          </Field>
        )}
        <div className="grid2">
          <Field label="Model no." htmlFor="scan-model">
            <TextInput id="scan-model" value={form.model} onChange={set('model')} placeholder="From the label" />
          </Field>
          <Field label="Serial no. *" error={errors.serial} htmlFor="scan-serial">
            <TextInput id="scan-serial" value={form.serial} onChange={set('serial')} placeholder="From the label" error={errors.serial} />
          </Field>
        </div>
        <div className="grid2">
          <Field label="Brand" htmlFor="scan-brand"><TextInput id="scan-brand" value={form.brand} onChange={set('brand')} placeholder="Optional" /></Field>
          <Field label="Purchase price" htmlFor="scan-cost">
            <div className="prefix-input"><span>₹</span><input id="scan-cost" className="input" inputMode="decimal" value={form.purchasePrice} onChange={(e) => set('purchasePrice')(e.target.value)} placeholder="Optional" /></div>
          </Field>
        </div>
        <Field label="Note" htmlFor="scan-note"><TextInput id="scan-note" value={form.note} onChange={set('note')} placeholder="Optional" /></Field>

        <div className="card card-pad">
          <div className="section-title" style={{ padding: 0, marginBottom: 8 }}>
            <h2>Recent units</h2>
            <button type="button" className="link" onClick={() => { publishStockSheet(); }}><LuFileSpreadsheet /> Update Excel now</button>
          </div>
          {recent.length ? (
            <div className="list">
              {recent.map((u) => (
                <div key={u.id} className="row">
                  <span className="main">
                    <span className="title">{u.serial}{u.model ? ` · ${u.model}` : ''}</span>
                    <span className="meta">{u.productName} · {u.status === 'sold' ? `Sold #${u.invoiceNo}` : 'In stock'}</span>
                  </span>
                  <button type="button" className="icon-btn" aria-label={`Delete ${u.serial}`} onClick={() => removeUnit(u)}><LuTrash2 /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="small muted">No units yet. Each unit you save appears here and in Stock.xlsx.</div>
          )}
        </div>
      </Page>
      <div className="savebar">
        <button type="button" className="btn primary block" onClick={save} disabled={saving}>Save to stock sheet</button>
      </div>
    </>
  );
}
