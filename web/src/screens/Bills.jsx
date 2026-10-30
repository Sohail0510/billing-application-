import { useState } from 'react';
import { LuReceipt } from 'react-icons/lu';
import { useData } from '../lib/useData.js';
import { go } from '../router.js';
import { TopBar, Page, SearchBox, StatusPill, Empty, Select } from '../ui.jsx';
import { txnEntries, FILTERS } from '../lib/txns.js';
import { fmtMoney, monthRange, financialYear, addDays, todayISO } from '../lib/format.js';

export function TxnList({ entries }) {
  return (
    <div className="list">
      {entries.map((e) => (
        <button key={e.type + e.id} type="button" className="row" onClick={() => go(e.link)}>
          <span className="main">
            <span className="title">{e.title}</span>
            <span className="meta">{e.meta}</span>
          </span>
          <span className="end">
            <span className={`amt ${e.amountClass || ''}`}>{e.sign ? e.sign + ' ' : ''}{fmtMoney(e.amount)}</span>
            {e.st ? <StatusPill st={e.st} /> : e.tag ? <span className="pill neutral">{e.tag}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

export function periodRange(key) {
  const t = todayISO();
  if (key === 'month') return monthRange(t);
  if (key === 'last') return monthRange(addDays(monthRange(t).from, -1));
  if (key === 'fy') return financialYear(t);
  if (key === 'lastfy') return financialYear(addDays(financialYear(t).from, -1));
  return { from: '', to: '' };
}

export const PERIODS = [['all', 'All dates'], ['month', 'This month'], ['last', 'Last month'], ['fy', 'This financial year'], ['lastfy', 'Last financial year']];

export default function Bills() {
  const { s, d } = useData();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('all');
  const r = periodRange(period);
  const entries = txnEntries(s, d, { filter, query, from: r.from, to: r.to });
  const shown = entries.slice(0, 300);
  return (
    <>
      <TopBar noBack title="Bills & entries" />
      <Page>
        <SearchBox value={query} onChange={setQuery} placeholder="Search party, number or type" id="bills-search" />
        <div className="chips" role="tablist" aria-label="Filter entries">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} className={`chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <Select id="bills-period" value={period} onChange={setPeriod} options={PERIODS} />
        {shown.length ? (
          <div className="card">
            <TxnList entries={shown} />
            {entries.length > shown.length && <div className="empty small">Showing the latest 300 of {entries.length}. Narrow the dates to see older entries.</div>}
          </div>
        ) : (
          <div className="card">
            <Empty icon={<LuReceipt />} title="Nothing here yet" text={query ? 'No entries match your search.' : 'Entries you create appear here, newest first.'} />
          </div>
        )}
      </Page>
    </>
  );
}
