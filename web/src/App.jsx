import { useEffect, useState } from 'react';
import {
  LuHouse, LuReceipt, LuPlus, LuUsers, LuPackage, LuFileText, LuClipboardList, LuShoppingCart,
  LuArrowDownLeft, LuArrowUpRight, LuWallet, LuUndo2, LuFileMinus, LuCamera,
} from 'react-icons/lu';
import { useData } from './lib/useData.js';
import { useRoute, go, back, currentRoute } from './router.js';
import { Overlays, Sheet, closeTopOverlay } from './ui.jsx';
import { installBackHandler } from './lib/platform.js';
import Home from './screens/Home.jsx';
import Bills from './screens/Bills.jsx';
import { Parties, PartyDetail, PartyForm, PartyStatement } from './screens/Parties.jsx';
import { Items, ItemDetail, ItemForm } from './screens/Items.jsx';
import VoucherForm from './screens/VoucherForm.jsx';
import VoucherView from './screens/VoucherView.jsx';
import { PaymentForm, ExpenseForm } from './screens/MoneyForms.jsx';
import { Reports, ReportView } from './screens/Reports.jsx';
import { More, BusinessForm, InvoiceSetup, Backup, Welcome } from './screens/Settings.jsx';
import { VoiceButton } from './screens/Voice.jsx';
import Scan from './screens/Scan.jsx';

export const CREATE_OPTIONS = [
  { label: 'Sales Invoice', icon: <LuFileText />, to: 'bill-new-sale' },
  { label: 'Payment In', icon: <LuArrowDownLeft />, to: 'payment-new-in' },
  { label: 'Quotation', icon: <LuClipboardList />, to: 'bill-new-quote' },
  { label: 'Purchase', icon: <LuShoppingCart />, to: 'bill-new-purchase' },
  { label: 'Payment Out', icon: <LuArrowUpRight />, to: 'payment-new-out' },
  { label: 'Expense', icon: <LuWallet />, to: 'expense-new' },
  { label: 'Credit Note', icon: <LuUndo2 />, to: 'bill-new-cnote' },
  { label: 'Debit Note', icon: <LuFileMinus />, to: 'bill-new-dnote' },
  { label: 'New Party', icon: <LuUsers />, to: 'party-new' },
  { label: 'Scan label', icon: <LuCamera />, to: 'scan' },
];

const TABS = [
  { key: 'home', label: 'Home', icon: <LuHouse /> },
  { key: 'bills', label: 'Bills', icon: <LuReceipt /> },
  { key: 'create' },
  { key: 'parties', label: 'Parties', icon: <LuUsers /> },
  { key: 'items', label: 'Items', icon: <LuPackage /> },
];

function TabBar({ route }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav className="tabbar" aria-label="Main">
        <div className="tabbar-inner">
          {TABS.map((t) => (t.key === 'create' ? (
            <button key="create" type="button" className="tab tab-create" onClick={() => setOpen(true)} aria-label="Create a bill or entry">
              <span className="plus"><LuPlus /></span>
              <span>Create</span>
            </button>
          ) : (
            <button key={t.key} type="button" className={`tab${route === t.key ? ' active' : ''}`} aria-current={route === t.key ? 'page' : undefined} onClick={() => go(t.key, { replace: true })}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          )))}
        </div>
      </nav>
      <CreateSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function CreateSheet({ open, onClose }) {
  return (
    <Sheet open={open} title="Create" onClose={onClose}>
      <div className="create-grid">
        {CREATE_OPTIONS.map((o) => (
          <button key={o.to} type="button" className="quick" onClick={() => { onClose(); go(o.to); }}>
            <span className="ic">{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function resolve(route) {
  const p = route.split('-');
  switch (p[0]) {
    case 'home': return <Home />;
    case 'bills': return <Bills />;
    case 'parties': return <Parties />;
    case 'party':
      if (p[1] === 'new') return <PartyForm />;
      if (p[1] === 'edit') return <PartyForm id={p[2]} />;
      return <PartyDetail id={p[1]} />;
    case 'statement': return <PartyStatement id={p[1]} />;
    case 'items': return <Items />;
    case 'item':
      if (p[1] === 'new') return <ItemForm />;
      if (p[1] === 'edit') return <ItemForm id={p[2]} />;
      return <ItemDetail id={p[1]} />;
    case 'bill': return <VoucherForm key={route} kind={p[2]} partyId={p[3]} />;
    case 'doc':
      if (p[1] === 'edit') return <VoucherForm key={route} editId={p[2]} />;
      if (p[1] === 'convert') return <VoucherForm key={route} kind="sale" sourceId={p[2]} mode="convert" />;
      if (p[1] === 'copy') return <VoucherForm key={route} sourceId={p[2]} mode="copy" />;
      if (p[1] === 'return') return <VoucherForm key={route} sourceId={p[2]} mode="return" />;
      return <VoucherView id={p[1]} />;
    case 'payment':
      if (p[1] === 'new') return <PaymentForm key={route} direction={p[2]} partyId={p[3]} />;
      return <PaymentForm key={route} id={p[2]} />;
    case 'expense':
      if (p[1] === 'new') return <ExpenseForm key={route} />;
      return <ExpenseForm key={route} id={p[2]} />;
    case 'reports': return <Reports />;
    case 'report': return <ReportView name={p[1]} />;
    case 'more': return <More />;
    case 'business': return <BusinessForm />;
    case 'billsetup': return <InvoiceSetup />;
    case 'backup': return <Backup />;
    case 'scan': return <Scan />;
    default: return <Home />;
  }
}

export default function App() {
  const { s } = useData();
  const route = useRoute();
  useEffect(() => {
    installBackHandler(() => {
      if (closeTopOverlay()) return true;
      if (currentRoute() !== 'home') {
        back('home');
        return true;
      }
      return false;
    });
  }, []);
  if (!s.ready) {
    return <div className="app"><div className="empty">Opening your books…</div></div>;
  }
  if (!s.settings.onboarded && (route === 'home' || route === 'welcome')) {
    return (
      <div className="app">
        <Welcome />
        <Overlays />
      </div>
    );
  }
  const tabbed = ['home', 'bills', 'parties', 'items'].includes(route);
  return (
    <div className={`app${tabbed ? ' with-tabs' : ''}`}>
      {resolve(route)}
      {tabbed && <VoiceButton />}
      {tabbed && <TabBar route={route} />}
      <Overlays />
    </div>
  );
}
