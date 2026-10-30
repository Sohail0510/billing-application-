import { useState } from 'react';
import { LuChevronRight, LuShare2, LuChartColumn } from 'react-icons/lu';
import { useData } from '../lib/useData.js';
import { go } from '../router.js';
import { TopBar, Page, Select, Field, Banner, toast } from '../ui.jsx';
import { REPORTS, buildReport, cellText, reportCsv } from '../lib/reports.js';
import { fmtMoney, fmtDate, todayISO } from '../lib/format.js';
import { shareFile, textBytes } from '../lib/platform.js';
import { periodRange } from './Bills.jsx';

export function Reports() {
  return (
    <>
      <TopBar title="Reports" backTo="home" />
      <Page>
        <div className="card list menu-list">
          {REPORTS.map((r) => (
            <button key={r.key} type="button" className="row" onClick={() => go(`report-${r.key}`)}>
              <span className="ic"><LuChartColumn /></span>
              <span className="main"><span className="title">{r.title}</span><span className="meta">{r.desc}</span></span>
              <LuChevronRight className="chev" />
            </button>
          ))}
        </div>
      </Page>
    </>
  );
}

const RANGE_OPTIONS = [['month', 'This month'], ['last', 'Last month'], ['fy', 'This financial year'], ['lastfy', 'Last financial year'], ['all', 'All time'], ['custom', 'Custom dates']];

export function DataTable({ table }) {
  const rows = table.total && table.rows.length ? [...table.rows, table.total] : table.rows;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>{table.columns.map((c) => <th key={c.key} className={c.type === 'money' || c.type === 'qty' || c.align === 'r' ? 'r' : ''}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`${r._total ? 'total' : ''}${r.link ? ' click' : ''}`} onClick={() => r.link && go(r.link)}>
              {table.columns.map((c) => (
                <td key={c.key} className={`${c.type === 'money' || c.type === 'qty' || c.align === 'r' ? 'r' : ''}${c.wrap ? ' wrap' : ''}`}>{cellText(c, r)}</td>
              ))}
            </tr>
          ))}
          {!table.rows.length && <tr><td colSpan={table.columns.length} className="muted">Nothing in this period.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function ReportView({ name }) {
  const { s } = useData();
  const def = REPORTS.find((r) => r.key === name) || REPORTS[0];
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState(() => ({ ...periodRange('month') }));
  const [day, setDay] = useState(todayISO());
  let range = { from: '', to: '' };
  let label = 'As of today';
  if (def.range === 'day') {
    range = { from: day, to: day };
    label = fmtDate(day);
  } else if (def.range) {
    range = period === 'custom' ? custom : periodRange(period);
    label = range.from ? `${fmtDate(range.from)} to ${fmtDate(range.to)}` : 'All time';
  }
  const report = buildReport(def.key, s, range);
  const share = async () => {
    const { message } = await shareFile(textBytes(reportCsv(def.title, label, report)), `${def.title.replace(/[^A-Za-z0-9]+/g, '_')}_${(range.from || 'all').replace(/-/g, '')}.csv`, 'text/csv');
    if (message) toast(message);
  };
  return (
    <>
      <TopBar title={def.title} sub={label} backTo="reports" actions={<button type="button" className="icon-btn" aria-label="Share as spreadsheet" onClick={share}><LuShare2 /></button>} />
      <Page>
        <div className="report-head">
          {def.range === 'day' && (
            <Field label="Date" htmlFor="rep-day"><input id="rep-day" type="date" className="input" value={day} onChange={(e) => setDay(e.target.value || todayISO())} /></Field>
          )}
          {def.range === true && <Select id="rep-period" value={period} onChange={setPeriod} options={RANGE_OPTIONS} />}
          {def.range === true && period === 'custom' && (
            <div className="grid2">
              <Field label="From" htmlFor="rep-from"><input id="rep-from" type="date" className="input" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></Field>
              <Field label="To" htmlFor="rep-to"><input id="rep-to" type="date" className="input" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></Field>
            </div>
          )}
        </div>
        {report.kpis.length > 0 && (
          <div className="kpis">
            {report.kpis.map((k) => (
              <div key={k.k} className="kpi"><span className="k">{k.k}</span><span className="v">{k.money ? fmtMoney(k.v) : k.v}</span></div>
            ))}
          </div>
        )}
        {report.note && <Banner kind="info">{report.note}</Banner>}
        {report.tables.map((t) => (
          <section key={t.title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="section-title"><h2>{t.title}</h2>{t.rows.length > 0 && <span className="tiny muted">{t.rows.length} {t.rows.length === 1 ? 'row' : 'rows'}</span>}</div>
            <DataTable table={t} />
          </section>
        ))}
      </Page>
    </>
  );
}
