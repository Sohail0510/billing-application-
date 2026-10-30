import { useEffect, useRef, useState } from 'react';
import {
  LuPencil, LuShare2, LuDownload, LuMessageCircle, LuArrowDownLeft, LuArrowUpRight, LuCopy, LuFileCheck, LuUndo2, LuTrash2,
} from 'react-icons/lu';
import { useData } from '../lib/useData.js';
import { go, back } from '../router.js';
import { TopBar, Page, StatusPill, ask, toast } from '../ui.jsx';
import { remove, upsert } from '../lib/db.js';
import { releaseSoldUnits } from '../lib/stockSheet.js';
import { KINDS } from '../lib/gst.js';
import { fmtMoney, fmtDateShort } from '../lib/format.js';
import { buildDocModel } from '../lib/docModel.js';
import { shareFile, saveFile, openExternal } from '../lib/platform.js';
import { Missing } from './Parties.jsx';
import { registerPreviewFonts } from '../pdf/fonts.js';

// HTML twin of the PDF layout, scaled to the screen width.
export function Paper({ model }) {
  const wrapRef = useRef(null);
  const paperRef = useRef(null);
  const [scale, setScale] = useState(0.6);
  const [height, setHeight] = useState(500);
  useEffect(() => {
    registerPreviewFonts();
    const measure = () => {
      if (!wrapRef.current || !paperRef.current) return;
      const sc = wrapRef.current.clientWidth / 595;
      setScale(sc);
      setHeight(paperRef.current.offsetHeight * sc);
    };
    measure();
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(wrapRef.current);
      ro.observe(paperRef.current);
    }
    window.addEventListener('resize', measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [model]);
  const m = model;
  const cols = ['S.NO.', 'ITEMS', 'HSN', 'QTY.', 'RATE', ...(m.hasDisc ? ['DISC.'] : []), 'TAX', 'AMOUNT'];
  const span = cols.length;
  return (
    <div className="paper-wrap" ref={wrapRef} style={{ height }} aria-label="Bill preview">
      <div className="paper" ref={paperRef} style={{ transform: `scale(${scale})`, '--paper-fill': m.theme.fill }}>
        <div className="ttl"><b>{m.title}</b>{m.copyLabel && <span className="copy">{m.copyLabel}</span>}</div>
        <div className="bx hd">
          <div className="bizcol">
            {m.business.logo && <img src={m.business.logo} alt="" />}
            <div>
              <div className="bizname" style={{ color: m.theme.accent }}>{m.business.name}</div>
              {m.business.address && <div>{m.business.address}</div>}
              {(m.business.gstin || m.business.phone) && (
                <div style={{ display: 'flex', gap: 24, marginTop: 1 }}>
                  {m.business.gstin && <div><b>GSTIN:</b><br />{m.business.gstin}</div>}
                  {m.business.phone && <div><b>Mobile:</b><br />{m.business.phone}</div>}
                </div>
              )}
              {m.business.pan && <div><b>PAN Number:</b> {m.business.pan}</div>}
              {m.business.email && <div>{m.business.email}</div>}
            </div>
          </div>
          <div className="meta">
            {m.meta.map((x) => <div key={x.label}><b>{x.label}</b><br />{x.value}</div>)}
          </div>
        </div>
        <div className={`bx pt${m.shipTo ? '' : ' one'}`}>
          {[m.billTo, m.shipTo].filter(Boolean).map((p) => (
            <div key={p.heading}>
              <div>{p.heading}</div>
              <b>{p.name}</b>
              {p.address && <div className="addr"><span>Address:</span><span>{p.address}</span></div>}
              {(p.gstin || p.pos) && <div>{p.gstin && <>GSTIN: {p.gstin}&nbsp;&nbsp;&nbsp;</>}{p.pos && <>Place of Supply: {p.pos}</>}</div>}
              {p.pan && <div>PAN Number: {p.pan}</div>}
              {p.phone && <div>Mobile: {p.phone}</div>}
            </div>
          ))}
        </div>
        <div className="bx grid">
          <table>
            <thead><tr>{cols.map((c) => <th key={c} className="c">{c}</th>)}</tr></thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.sno}>
                  <td className="c">{r.sno}</td>
                  <td>{r.name}{r.desc && <div className="muted2">{r.desc}</div>}</td>
                  <td className="r">{r.hsn}</td>
                  <td className="r">{r.qty}</td>
                  <td className="r">{r.rate}</td>
                  {m.hasDisc && <td className="r">{r.disc}</td>}
                  <td className="r">{r.tax}<div className="pct">{r.taxPct}</div></td>
                  <td className="r">{r.amount}</td>
                </tr>
              ))}
              <tr className="filler">{cols.map((c) => <td key={c} />)}</tr>
              {m.summary.map((x) => (
                <tr key={x.label} className="rcv"><td colSpan={2} className="r" style={{ borderTop: '0.6px solid #262626' }}><b>{x.label}</b></td><td colSpan={span - 3} style={{ borderTop: '0.6px solid #262626' }} /><td className="r" style={{ borderTop: '0.6px solid #262626' }}>{x.value}</td></tr>
              ))}
              <tr className="tot">
                <td /><td className="r"><b>TOTAL</b></td><td /><td className="r"><b>{m.totals.qty}</b></td><td />
                {m.hasDisc && <td />}
                <td className="r"><b>{m.totals.tax}</b></td><td className="r"><b>{m.totals.amount}</b></td>
              </tr>
              {m.settleRows.map((x) => (
                <tr key={x.label} className="rcv"><td /><td className="r"><b>{x.label}</b></td>{cols.slice(3).map((c) => <td key={c} />)}<td className="r"><b>{x.value}</b></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {m.showHsn && (
          <div className="hsn">
            <table>
              <thead>
                <tr>
                  <th rowSpan={2}>HSN/SAC</th><th rowSpan={2}>Taxable Value</th>
                  {m.hsn.inter ? <th colSpan={2}>IGST</th> : <><th colSpan={2}>CGST</th><th colSpan={2}>SGST</th></>}
                  <th rowSpan={2}>Total Tax Amount</th>
                </tr>
                <tr className="sub">{(m.hsn.inter ? ['Rate', 'Amount'] : ['Rate', 'Amount', 'Rate', 'Amount']).map((h, i) => <th key={i}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {[...m.hsn.rows, ...(m.hsn.total ? [{ ...m.hsn.total, hsn: 'Total', rate: '', total: true }] : [])].map((r, i) => (
                  <tr key={i} style={r.total ? { fontWeight: 700 } : undefined}>
                    <td className="r">{r.hsn}</td><td className="r">{r.taxable}</td>
                    {m.hsn.inter
                      ? <><td className="r">{r.rate}</td><td className="r">{r.igst}</td></>
                      : <><td className="r">{r.rate}</td><td className="r">{r.cgst}</td><td className="r">{r.rate}</td><td className="r">{r.sgst}</td></>}
                    <td className="r">{r.tax}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="bx foot">
          <div className="h">Total Amount (in words)</div>
          <div>{m.words}</div>
        </div>
        {(m.bank.length > 0 || m.signature) && (
          <div className="bx" style={{ display: 'flex' }}>
            {m.bank.length > 0 && (
              <div style={{ flex: 3, padding: '5px 8px' }}>
                <b>Bank Details</b>
                {m.bank.map(([k, v]) => <div key={k}><span className="muted2">{k}: </span>{v}</div>)}
              </div>
            )}
            {m.signature && (
              <div style={{ flex: 2, padding: '5px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 60, borderLeft: m.bank.length ? '0.6px solid #262626' : 0 }}>
                <b>For {m.signature}</b>
                <span className="muted2">Authorised Signatory</span>
              </div>
            )}
          </div>
        )}
        {m.notes && <div className="bx" style={{ padding: '5px 8px' }}><div>Notes</div><div style={{ whiteSpace: 'pre-wrap' }}>{m.notes}</div></div>}
        {m.terms.length > 0 && (
          <div className="bx" style={{ padding: '5px 8px' }}>
            <div>Terms and Conditions</div>
            {m.terms.map((t, i) => <div key={i}>{i + 1}. {t}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

let pdfModule;
const loadPdf = async () => {
  if (!pdfModule) pdfModule = await import('../pdf/invoicePdf.js');
  return pdfModule;
};

export default function VoucherView({ id }) {
  const { s, d } = useData();
  const [busy, setBusy] = useState(false);
  const v = s.vouchers.find((x) => x.id === id);
  if (!v) return <Missing what="bill" />;
  const k = KINDS[v.kind];
  const c = d.calc.get(v.id);
  const st = d.status.get(v.id);
  const model = buildDocModel(v, s, d);
  const party = v.partyId ? s.parties.find((p) => p.id === v.partyId) : null;
  const phone = String((party && party.phone) || (v.party && v.party.phone) || '').replace(/\D/g, '').slice(-10);

  const makePdf = async () => {
    const { renderInvoicePdf } = await loadPdf();
    return renderInvoicePdf(model);
  };
  const sharePdf = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const bytes = await makePdf();
      const { message } = await shareFile(bytes, model.fileName, 'application/pdf', `${k.label} ${v.number} from ${s.settings.business.name || ''}`.trim());
      if (message) toast(message);
    } catch (e) {
      toast('Could not make the PDF: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  };
  const downloadPdf = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const msg = saveFile(await makePdf(), model.fileName, 'application/pdf');
      if (msg) toast(msg);
    } catch (e) {
      toast('Could not make the PDF: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  };
  const whatsapp = () => {
    const biz = s.settings.business.name || '';
    const lines = [
      `Dear ${model.billTo.name},`,
      `${k.label} ${v.number} dated ${fmtDateShort(v.date)} for ${fmtMoney(c.total)}${biz ? ` from ${biz}` : ''}.`,
    ];
    if (st && st.due > 0) lines.push(`Balance due: ${fmtMoney(st.due)}${v.dueDate ? ` by ${fmtDateShort(v.dueDate)}` : ''}.`);
    lines.push('Thank you for your business.');
    openExternal(`https://wa.me/${phone ? '91' + phone : ''}?text=${encodeURIComponent(lines.join('\n'))}`);
  };
  const del = async () => {
    const ok = await ask({ title: `Delete ${k.label} ${v.number}?`, message: 'Stock and party balances will be updated. This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await remove('vouchers', v.id);
    await releaseSoldUnits(v.id);
    if (v.sourceId) {
      const src = s.vouchers.find((x) => x.id === v.sourceId);
      if (src && src.kind === 'quote' && src.convertedTo === v.id) await upsert('vouchers', { ...src, status: 'open', convertedTo: '' });
    }
    toast('Deleted');
    back('bills');
  };

  const actions = [
    { label: busy ? 'Preparing…' : 'Share PDF', icon: <LuShare2 />, run: sharePdf },
    { label: 'Download', icon: <LuDownload />, run: downloadPdf },
    { label: 'WhatsApp', icon: <LuMessageCircle />, run: whatsapp },
    { label: 'Edit', icon: <LuPencil />, run: () => go(`doc-edit-${v.id}`) },
  ];
  if (v.kind === 'sale' && st && st.due > 0 && v.partyId) actions.push({ label: 'Get paid', icon: <LuArrowDownLeft />, run: () => go(`payment-new-in-${v.partyId}`) });
  if (v.kind === 'purchase' && st && st.due > 0 && v.partyId) actions.push({ label: 'Pay', icon: <LuArrowUpRight />, run: () => go(`payment-new-out-${v.partyId}`) });
  if (v.kind === 'quote' && v.status !== 'converted') actions.push({ label: 'Make invoice', icon: <LuFileCheck />, run: () => go(`doc-convert-${v.id}`) });
  if ((v.kind === 'sale' || v.kind === 'purchase') && v.partyId) actions.push({ label: 'Return', icon: <LuUndo2 />, run: () => go(`doc-return-${v.id}`) });
  actions.push({ label: 'Duplicate', icon: <LuCopy />, run: () => go(`doc-copy-${v.id}`) });
  actions.push({ label: 'Delete', icon: <LuTrash2 />, run: del });

  return (
    <>
      <TopBar title={`${k.label} #${v.number}`} sub={fmtDateShort(v.date)} backTo="bills" />
      <Page>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div className="label">{k.side === 'purchase' ? 'From' : 'To'}</div>
              {v.partyId
                ? <button type="button" className="link" style={{ fontSize: 16, textAlign: 'left' }} onClick={() => go(`party-${v.partyId}`)}>{model.billTo.name}</button>
                : <div style={{ fontWeight: 600 }}>{model.billTo.name}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="label">Total</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }} className="num">{fmtMoney(c.total)}</div>
            </div>
          </div>
          {st && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <StatusPill st={st} />
              <span className="small muted num">
                {st.due > 0 ? `Balance ${fmtMoney(st.due)}` : `Paid ${fmtMoney(st.paid)}`}
                {v.dueDate && st.due > 0 ? ` · due ${fmtDateShort(v.dueDate)}` : ''}
              </span>
            </div>
          )}
          {v.kind === 'quote' && (
            <div><span className={`pill ${v.status === 'converted' ? 'accent' : 'neutral'}`}>{v.status === 'converted' ? 'Converted to invoice' : 'Open'}</span></div>
          )}
        </div>
        <div className="card" style={{ padding: 6 }}>
          <div className="action-grid">
            {actions.map((a) => (
              <button key={a.label} type="button" className="quick" onClick={a.run} disabled={busy && a.label !== 'Edit'}>
                <span className="ic">{a.icon}</span>{a.label}
              </button>
            ))}
          </div>
        </div>
        <Paper model={model} />
      </Page>
    </>
  );
}
