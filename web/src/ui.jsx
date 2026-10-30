// Shared UI pieces: top bar, form fields, bottom sheets, confirm dialog, toast.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LuArrowLeft, LuSearch, LuX, LuTriangleAlert, LuInfo } from 'react-icons/lu';
import { back } from './router.js';
import { fmtMoney } from './lib/format.js';

// ---- Overlay stack: lets the Android back button close the top sheet first.
const overlayStack = [];
export function useOverlay(open, onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const entry = () => ref.current && ref.current();
    overlayStack.push(entry);
    return () => {
      const i = overlayStack.lastIndexOf(entry);
      if (i >= 0) overlayStack.splice(i, 1);
    };
  }, [open]);
}
export function closeTopOverlay() {
  const top = overlayStack[overlayStack.length - 1];
  if (top) {
    top();
    return true;
  }
  return false;
}

// ---- Global dialog + toast store
let uiState = { dialog: null, toast: null };
const uiSubs = new Set();
const setUi = (patch) => {
  uiState = { ...uiState, ...patch };
  uiSubs.forEach((f) => f());
};
const useUi = () => useSyncExternalStore((cb) => {
  uiSubs.add(cb);
  return () => uiSubs.delete(cb);
}, () => uiState);

let toastTimer;
export function toast(message) {
  clearTimeout(toastTimer);
  setUi({ toast: message });
  toastTimer = setTimeout(() => setUi({ toast: null }), 2600);
}

export function ask({ title, message = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    setUi({ dialog: { title, message, confirmLabel, cancelLabel, danger, resolve } });
  });
}

export function Overlays() {
  const { dialog, toast: t } = useUi();
  const close = (val) => {
    if (dialog) dialog.resolve(val);
    setUi({ dialog: null });
  };
  useOverlay(Boolean(dialog), () => close(false));
  return (
    <>
      {dialog && (
        <div className="scrim dialog-wrap" onClick={() => close(false)}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="dlg-title">{dialog.title}</h2>
            {dialog.message && <div className="muted small">{dialog.message}</div>}
            <div className="actions">
              {dialog.cancelLabel && <button type="button" className="btn secondary sm" onClick={() => close(false)}>{dialog.cancelLabel}</button>}
              <button type="button" className={`btn sm ${dialog.danger ? 'danger' : 'primary'}`} onClick={() => close(true)} autoFocus>{dialog.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
      {t && <div className="toast" role="status">{t}</div>}
    </>
  );
}

// ---- Layout
export function TopBar({ title, sub, backTo, noBack, actions }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        {!noBack && (
          <button type="button" className="icon-btn" aria-label="Back" onClick={() => back(backTo || 'home')}>
            <LuArrowLeft />
          </button>
        )}
        <h1>
          {title}
          {sub && <span className="sub">{sub}</span>}
        </h1>
        {actions}
      </div>
    </header>
  );
}

export function Page({ children, className = '' }) {
  return <main className={`page ${className}`}>{children}</main>;
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function TextInput({ id, value, onChange, error, upper, ...rest }) {
  return (
    <input
      id={id}
      className={`input${error ? ' bad' : ''}`}
      value={value ?? ''}
      onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
      autoComplete="off"
      {...rest}
    />
  );
}

export function NumInput({ id, value, onChange, error, ...rest }) {
  return (
    <input
      id={id}
      className={`input num${error ? ' bad' : ''}`}
      value={value ?? ''}
      inputMode="decimal"
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      onFocus={(e) => e.target.select()}
      autoComplete="off"
      {...rest}
    />
  );
}

export function Select({ id, value, onChange, options, placeholder }) {
  return (
    <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

export function Switch({ id, checked, onChange, label, hint }) {
  return (
    <div className="switch-row">
      <label className="txt" htmlFor={id}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {hint && <span className="tiny muted">{hint}</span>}
      </label>
      <span className="switch">
        <input id={id} type="checkbox" role="switch" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
        <span className="track" />
      </span>
    </div>
  );
}

export function Seg({ value, onChange, options }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search', id = 'search' }) {
  return (
    <div className="search">
      <LuSearch />
      <input id={id} type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      {value && <button type="button" className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Clear search" onClick={() => onChange('')}><LuX /></button>}
    </div>
  );
}

export function Sheet({ open, title, onClose, children, footer }) {
  useOverlay(open, onClose);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><LuX /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, text, action }) {
  return (
    <div className="empty">
      {icon && <div className="big">{icon}</div>}
      <h3>{title}</h3>
      {text && <div className="small">{text}</div>}
      {action}
    </div>
  );
}

export function Banner({ kind = 'warn', children, action }) {
  return (
    <div className={`banner ${kind}`}>
      {kind === 'info' ? <LuInfo /> : <LuTriangleAlert />}
      <div className="txt">{children}</div>
      {action}
    </div>
  );
}

export const Money = ({ value, className = '' }) => <span className={`num ${className}`}>{fmtMoney(value)}</span>;

export function StatusPill({ st }) {
  if (!st) return null;
  if (st.overdue) return <span className="pill overdue">Overdue</span>;
  const label = { paid: 'Paid', partial: 'Partly paid', unpaid: 'Unpaid' }[st.status];
  return <span className={`pill ${st.status}`}>{label}</span>;
}

export function Avatar({ name }) {
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <span className="avatar" aria-hidden="true">{initials || '?'}</span>;
}

// Keeps the latest form state in a ref so async save handlers see current values.
export function useForm(initial) {
  const [form, setForm] = useState(initial);
  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));
  return [form, setForm, set];
}
