import {
  LuSettings, LuFileText, LuArrowDownLeft, LuClipboardList, LuShoppingCart, LuArrowUpRight, LuWallet,
  LuChartColumn, LuChevronRight, LuPackage, LuTriangleAlert, LuDatabase,
} from 'react-icons/lu';
import { useData } from '../lib/useData.js';
import { go } from '../router.js';
import { TopBar, Page, Banner } from '../ui.jsx';
import { fmtMoney, monthRange, num, daysBetween, todayISO } from '../lib/format.js';
import { txnEntries } from '../lib/txns.js';
import { TxnList } from './Bills.jsx';
import { IS_PREVIEW } from '../lib/platform.js';

const QUICK = [
  { label: 'Sales Invoice', icon: <LuFileText />, to: 'bill-new-sale' },
  { label: 'Payment In', icon: <LuArrowDownLeft />, to: 'payment-new-in' },
  { label: 'Quotation', icon: <LuClipboardList />, to: 'bill-new-quote' },
  { label: 'Purchase', icon: <LuShoppingCart />, to: 'bill-new-purchase' },
  { label: 'Payment Out', icon: <LuArrowUpRight />, to: 'payment-new-out' },
  { label: 'Expense', icon: <LuWallet />, to: 'expense-new' },
  { label: 'Stock', icon: <LuPackage />, to: 'report-stock' },
  { label: 'Reports', icon: <LuChartColumn />, to: 'reports' },
];

export default function Home() {
  const { s, d } = useData();
  const biz = s.settings.business;
  const m = monthRange();
  const inMonth = (date) => date >= m.from && date <= m.to;
  const sumKind = (kind) => s.vouchers.filter((v) => v.kind === kind && inMonth(v.date)).reduce((t, v) => t + d.calc.get(v.id).total, 0);
  const sales = sumKind('sale') - sumKind('cnote');
  const purchases = sumKind('purchase') - sumKind('dnote');
  const expenses = s.expenses.filter((e) => inMonth(e.date)).reduce((t, e) => t + num(e.amount), 0);
  const overdue = s.vouchers.filter((v) => v.kind === 'sale' && d.status.get(v.id)?.overdue);
  const overdueAmt = overdue.reduce((t, v) => t + d.status.get(v.id).due, 0);
  const recent = txnEntries(s, d).slice(0, 8);
  const records = s.vouchers.length + s.payments.length + s.expenses.length;
  const backupAge = s.settings.lastBackupAt ? daysBetween(s.settings.lastBackupAt.slice(0, 10), todayISO()) : Infinity;
  const monthName = new Date().toLocaleString('en-IN', { month: 'long' });

  return (
    <>
      <TopBar
        noBack
        title={biz.name || 'Hisaab Billing'}
        sub={biz.gstin ? `GSTIN ${biz.gstin}` : 'Billing & GST'}
        actions={<button type="button" className="icon-btn" aria-label="Settings and backup" onClick={() => go('more')}><LuSettings /></button>}
      />
      <Page>
        {IS_PREVIEW && s.settings.sample && (
          <Banner kind="info">You’re looking at sample data for a made-up shop. Everything you add stays in this browser only.</Banner>
        )}
        {!IS_PREVIEW && !biz.name && (
          <Banner action={<button type="button" className="link" onClick={() => go('business')}>Add</button>}>
            Add your business name, GSTIN and address so they print on your invoices.
          </Banner>
        )}
        {!IS_PREVIEW && records > 0 && backupAge > 7 && (
          <Banner action={<button type="button" className="link" onClick={() => go('backup')}>Back up</button>}>
            {s.settings.lastBackupAt ? `Last backup was ${backupAge} days ago.` : 'Your bills are stored only on this phone.'} Save a backup file somewhere safe.
          </Banner>
        )}

        <div className="money-pair">
          <button type="button" className="money-tile collect" onClick={() => go('report-outstanding')} style={{ border: 0, textAlign: 'left' }}>
            <span className="lbl"><LuArrowDownLeft /> To collect</span>
            <span className="amt">{fmtMoney(d.toCollect)}</span>
          </button>
          <button type="button" className="money-tile pay" onClick={() => go('report-outstanding')} style={{ border: 0, textAlign: 'left' }}>
            <span className="lbl"><LuArrowUpRight /> To pay</span>
            <span className="amt">{fmtMoney(d.toPay)}</span>
          </button>
        </div>

        <div className="card">
          <div className="card-pad" style={{ paddingBottom: 0 }}>
            <span className="eyebrow">{monthName} so far</span>
          </div>
          <div className="stat-strip">
            <button type="button" className="stat" style={{ border: 0, background: 'none', textAlign: 'left' }} onClick={() => go('report-sales')}>
              <span className="k">Sales</span><span className="v">{fmtMoney(sales)}</span>
            </button>
            <button type="button" className="stat" style={{ border: 0, borderLeft: '1px solid var(--line)', background: 'none', textAlign: 'left' }} onClick={() => go('report-purchases')}>
              <span className="k">Purchases</span><span className="v">{fmtMoney(purchases)}</span>
            </button>
            <button type="button" className="stat" style={{ border: 0, borderLeft: '1px solid var(--line)', background: 'none', textAlign: 'left' }} onClick={() => go('report-expenses')}>
              <span className="k">Expenses</span><span className="v">{fmtMoney(expenses)}</span>
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: '6px 6px' }}>
          <div className="quick-grid">
            {QUICK.map((q) => (
              <button key={q.to} type="button" className="quick" onClick={() => go(q.to)}>
                <span className="ic">{q.icon}</span>
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {(overdue.length > 0 || d.lowStock.length > 0) && (
          <div className="card list">
            {overdue.length > 0 && (
              <button type="button" className="row" onClick={() => go('report-outstanding')}>
                <span className="avatar c-pay" style={{ background: 'var(--pay-soft)' }}><LuTriangleAlert /></span>
                <span className="main">
                  <span className="title">{overdue.length} overdue {overdue.length === 1 ? 'invoice' : 'invoices'}</span>
                  <span className="meta">{fmtMoney(overdueAmt)} past the due date</span>
                </span>
                <LuChevronRight className="chev" />
              </button>
            )}
            {d.lowStock.length > 0 && (
              <button type="button" className="row" onClick={() => go('report-stock')}>
                <span className="avatar c-warn" style={{ background: 'var(--warn-soft)' }}><LuPackage /></span>
                <span className="main">
                  <span className="title">{d.lowStock.length} {d.lowStock.length === 1 ? 'item is' : 'items are'} low on stock</span>
                  <span className="meta">{d.lowStock.slice(0, 3).map((i) => i.name).join(', ')}</span>
                </span>
                <LuChevronRight className="chev" />
              </button>
            )}
          </div>
        )}

        <div className="section-title">
          <h2>Recent entries</h2>
          {recent.length > 0 && <button type="button" className="link" onClick={() => go('bills', { replace: true })}>See all</button>}
        </div>
        {recent.length ? (
          <div className="card"><TxnList entries={recent} /></div>
        ) : (
          <div className="card empty">
            <div className="big"><LuDatabase /></div>
            <h3>No bills yet</h3>
            <div className="small">Create your first sales invoice. Customers and items can be added while you make it.</div>
            <button type="button" className="btn primary" onClick={() => go('bill-new-sale')}>Create invoice</button>
          </div>
        )}
      </Page>
    </>
  );
}
