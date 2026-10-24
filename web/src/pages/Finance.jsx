// Finance: expenses (receipts read by the AI), income, the season budget, profit and loss for each
// event and the season, contracts, and the accounting export (the same in every region).
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { fmtDate, titleOf, today, useTeamData, v } from '../lib/data.js';
import { saveRecord } from '../lib/store.js';
import { useSession } from '../lib/session.jsx';
import { setupsByAsset } from '../lib/compute.js';
import { baseAmount, budgetFor, eventPnl, periodPnl } from '@shared/finance.js';
import { buildExport, CONNECTORS, exportRows } from '@shared/accounting.js';
import { useMoney } from './Business.jsx';

const TABS = [['expenses', 'Expenses'], ['income', 'Income'], ['budget', 'Budget'], ['events', 'Event P&L'], ['season', 'Season P&L'], ['contracts', 'Contracts'], ['export', 'Export']];

export function Finance() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'expenses';
  const { canMoney } = useSession();
  return (
    <div>
      <PageHeader title="Finance" sub="Budget, expenses, income and contracts — with a profit and loss for every event" />
      <div className="tabs scroll">
        {TABS.map(([k, label]) => <button type="button" key={k} className={tab === k ? 'active' : ''} onClick={() => setParams(k === 'expenses' ? {} : { tab: k })}>{label}</button>)}
      </div>
      {!canMoney && <div className="notice">Your role can’t see costs and amounts, so totals are hidden. Ask an owner to add “See costs, prices and amounts” to your role.</div>}
      {tab === 'expenses' && <Ledger type="expense" />}
      {tab === 'income' && <Ledger type="income" />}
      {tab === 'budget' && <Budget />}
      {tab === 'events' && <EventsPnl />}
      {tab === 'season' && <SeasonPnl />}
      {tab === 'contracts' && <Contracts />}
      {tab === 'export' && <Export />}
    </div>
  );
}

function Ledger({ type }) {
  const data = useTeamData();
  const { canType, canMoney, membership } = useSession();
  const money = useMoney();
  const [month, setMonth] = useState('');
  if (!data) return null;
  const all = data.list(type).slice().sort((a, b) => String(v(b, 'date') || '').localeCompare(String(v(a, 'date') || '')));
  const months = [...new Set(all.map((r) => String(v(r, 'date') || '').slice(0, 7)).filter(Boolean))];
  const list = all.filter((r) => !month || String(v(r, 'date') || '').startsWith(month));
  const total = list.reduce((a, r) => a + baseAmount(r, membership?.settings), 0);
  return (
    <>
      <div className="toolbar">
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          <option value="">All dates</option>
          {months.map((m) => <option key={m} value={m}>{new Date(`${m}-01T00:00:00`).toLocaleString(undefined, { month: 'long', year: 'numeric' })}</option>)}
        </select>
        {canMoney && <span className="muted">Total {money(total)}</span>}
        {canType(type, 'edit') && <Link className="btn primary" to={`/r/${type}/new`}>{type === 'expense' ? 'New expense' : 'New income'}</Link>}
      </div>
      {type === 'expense' && <p className="muted small">Take a photo of the receipt: open a new expense and use <b>Fill from photo</b> — the AI reads the supplier, business number, amount and tax.</p>}
      {list.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
        <div className="card list">
          {list.map((r) => (
            <Link key={r.id} to={`/r/${type}/${r.id}`} className="list-row" data-testid={`${type}-row`}>
              <span className="grow">
                <span className="row-title">{v(r, 'description') || v(r, 'supplier_name') || v(r, 'payer') || v(r, 'category') || v(r, 'kind')}</span>
                <span className="row-sub">{[fmtDate(v(r, 'date')), v(r, 'category') || v(r, 'kind'), data.byId[v(r, 'event')] && titleOf(data.byId[v(r, 'event')])].filter(Boolean).join(' · ')}</span>
              </span>
              {v(r, 'paid') === false && <Pill level="warn">{type === 'expense' ? `unpaid${v(r, 'due_date') ? ` · due ${fmtDate(v(r, 'due_date'))}` : ''}` : 'owed'}</Pill>}
              {v(r, 'exported') && <Pill level="info">exported</Pill>}
              {canMoney && <span className="row-meta">{money(v(r, 'amount'), v(r, 'currency'))}</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function Budget() {
  const data = useTeamData();
  const { canType, membership } = useSession();
  const money = useMoney();
  if (!data) return null;
  const budgets = data.list('budget').slice().sort((a, b) => String(v(b, 'start') || '').localeCompare(String(v(a, 'start') || '')));
  const cur = budgetFor(data, today()) || budgets[0];
  const p = cur ? periodPnl(data, { from: v(cur, 'start'), to: v(cur, 'end'), settings: membership?.settings }) : null;
  const warn = Number(v(cur, 'alert_pct')) || 80;
  return (
    <>
      <div className="toolbar">
        {cur && canType('budget', 'edit') && <Link className="btn" to={`/r/budget/${cur.id}`}>Edit {v(cur, 'season')} budget</Link>}
        {canType('budget', 'edit') && <Link className="btn primary" to="/r/budget/new">New season budget</Link>}
      </div>
      {!cur ? <Empty>No budget yet. Set one up for the season by category — car, engine, parts, crew, travel, entry fees and a contingency reserve — with the income you expect.</Empty> : (
        <Section title={`${v(cur, 'season')} — budget vs spent`}>
          <div className="table-scroll-x"><table className="table budget-table" data-testid="budget-table">
            <thead><tr><th>Category</th><th>Budget</th><th>Spent</th><th /></tr></thead>
            <tbody>
              {p.groups.map((g) => [
                <tr key={`g-${g.key}`} className="budget-group" data-testid="budget-group">
                  <th>{g.label}</th><th>{g.budget === null ? '—' : money(g.budget)}</th><th>{money(g.spent)}</th>
                  <th>{g.pct === null ? null : <Pill level={g.pct >= 100 ? 'over' : g.pct >= warn ? 'warn' : 'ok'}>{g.pct}%</Pill>}</th>
                </tr>,
                ...g.rows.map((r) => (
                  <tr key={r.category} className="budget-cat">
                    <td>{r.category}</td><td>{r.budget === null ? '—' : money(r.budget)}</td><td>{money(r.spent)}</td>
                    <td>{r.pct === null ? <span className="muted small">no budget</span> : <Pill level={r.pct >= 100 ? 'over' : r.pct >= warn ? 'warn' : 'ok'}>{r.pct}%</Pill>}</td>
                  </tr>
                )),
              ])}
              <tr className="budget-total"><th>Total</th><th>{money(p.totalBudget)}</th><th>{money(p.totalSpent)}</th><th /></tr>
            </tbody>
          </table></div>
          <p className="muted small">A category shows in Reminders when its spend reaches {warn}% of its budget.</p>
        </Section>
      )}
      {cur && p.reserve && (
        <Section title="Contingency reserve">
          <div className="reserve" data-testid="reserve">
            <dl className="kv">
              <dt>Reserve</dt><dd>{money(p.reserve.amount)}{p.reserve.pct ? <span className="muted small"> ({p.reserve.pct}% of the rest of the budget)</span> : null}</dd>
              <dt>Used</dt><dd>{money(p.reserve.used)} <span className="muted small">· {p.reserve.count} expense{p.reserve.count === 1 ? '' : 's'}</span></dd>
              <dt>Left</dt><dd><Pill level={p.reserve.left < 0 ? 'over' : p.reserve.usedPct >= warn ? 'warn' : 'ok'}>{money(p.reserve.left)}</Pill></dd>
            </dl>
            <div className="meter" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, p.reserve.usedPct))}%` }} className={p.reserve.usedPct >= 100 ? 'over' : p.reserve.usedPct >= warn ? 'warn' : ''} /></div>
          </div>
          <p className="muted small">Crash damage and mechanical failures: expenses in <b>Crash &amp; failure repairs</b>, or ticked <b>Paid from the contingency reserve</b>, come out of it. It shows in Reminders at {warn}% used.</p>
        </Section>
      )}
      {cur && p.incomeRows.length > 0 && (
        <Section title={`${v(cur, 'season')} — income expected vs received`}>
          <table className="table" data-testid="income-budget">
            <thead><tr><th>Kind</th><th>Expected</th><th>Received</th><th /></tr></thead>
            <tbody>
              {p.incomeRows.map((r) => (
                <tr key={r.kind}><td>{r.kind}</td><td>{r.expected === null ? '—' : money(r.expected)}</td><td>{money(r.received)}</td>
                  <td>{r.pct === null ? <span className="muted small">not budgeted</span> : <Pill level={r.pct >= 100 ? 'ok' : 'warn'}>{r.pct}%</Pill>}</td></tr>
              ))}
              <tr className="budget-total"><th>Total</th><th>{money(p.totalExpected)}</th><th>{money(p.totalIncome)}</th><th /></tr>
            </tbody>
          </table>
          <p className="muted small">Net so far: <b>{money(p.net)}</b>{p.totalExpected ? <> · budgeted net {money(p.totalExpected - p.totalBudget)}</> : null}</p>
        </Section>
      )}
      {budgets.length > 1 && (
        <Section title="Other seasons">
          <div className="list">{budgets.filter((b) => b.id !== cur?.id).map((b) => <Link key={b.id} to={`/r/budget/${b.id}`} className="list-row"><span className="grow">{titleOf(b)}</span><span className="row-meta">{fmtDate(v(b, 'start'))} – {fmtDate(v(b, 'end'))}</span></Link>)}</div>
        </Section>
      )}
    </>
  );
}

export function PnlTable({ pnl }) {
  const money = useMoney();
  return (
    <table className="table pnl" data-testid="pnl-table">
      <tbody>
        <tr className="pnl-head"><th colSpan={2}>Income</th></tr>
        {pnl.income.length ? pnl.income.map((r) => <tr key={`i${r.label}`}><td>{r.label}</td><td className="num">{money(r.amount)}</td></tr>) : <tr><td className="muted">None recorded</td><td /></tr>}
        <tr className="pnl-head"><th colSpan={2}>Costs</th></tr>
        {pnl.costs.length ? pnl.costs.map((r) => <tr key={`c${r.label}`}><td>{r.label}</td><td className="num">{money(r.amount)}</td></tr>) : <tr><td className="muted">None recorded</td><td /></tr>}
        {pnl.wear.length > 0 && <tr className="pnl-head"><th colSpan={2}>Wear (estimated from laps)</th></tr>}
        {pnl.wear.map((r) => <tr key={`w${r.id}`}><td>{r.kind}: {r.label} <small className="muted">{r.note}</small></td><td className="num">{money(r.amount)}</td></tr>)}
        <tr className="pnl-total"><th>Net</th><th className="num">{money(pnl.net)}</th></tr>
      </tbody>
    </table>
  );
}

function EventsPnl() {
  const data = useTeamData();
  const { membership, canMoney } = useSession();
  const [params, setParams] = useSearchParams();
  const money = useMoney();
  const usage = useMemo(() => (data ? setupsByAsset(data) : {}), [data]);
  if (!data) return null;
  if (!canMoney) return null;
  const events = data.list('event').filter((e) => (v(e, 'date') || '') <= today()).sort((a, b) => String(v(b, 'date')).localeCompare(String(v(a, 'date'))));
  const pick = params.get('event') || '';
  const rows = events.map((e) => ({ e, p: eventPnl(data, e.id, { settings: membership?.settings, usage }) }));
  const chosen = rows.find((r) => r.e.id === pick);
  return (
    <>
      {chosen && (
        <Section title={`${v(chosen.e, 'name')} · ${fmtDate(v(chosen.e, 'date'))}`} actions={<Link className="btn ghost small" to={`/events/${chosen.e.id}`}>Event</Link>}>
          <PnlTable pnl={chosen.p} />
          <p className="muted small">Wear shares each tyre’s cost by the laps it ran here, spreads the engine’s last rebuild cost over its laps to the next freshen, and charges parts with a life in laps by cost ÷ life.</p>
        </Section>
      )}
      {rows.length === 0 ? <Empty>No past events yet.</Empty> : (
        <div className="card list">
          {rows.map(({ e, p }) => (
            <button type="button" key={e.id} className={`list-row as-btn${e.id === pick ? ' selected' : ''}`} onClick={() => setParams({ tab: 'events', event: e.id })}>
              <span className="grow"><span className="row-title">{v(e, 'name')}</span><span className="row-sub">{fmtDate(v(e, 'date'))} · {p.laps} laps · {p.count} entries</span></span>
              <span className="row-meta">{money(p.net)}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function SeasonPnl() {
  const data = useTeamData();
  const { membership, canMoney } = useSession();
  const money = useMoney();
  const b = data ? budgetFor(data, today()) : null;
  const [from, setFrom] = useState(v(b, 'start') || `${today().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(v(b, 'end') || `${today().slice(0, 4)}-12-31`);
  if (!data || !canMoney) return null;
  const p = periodPnl(data, { from, to, settings: membership?.settings });
  return (
    <Section title="Profit & loss for a period">
      <div className="inline-row wrap">
        <label className="inline-field">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline-field">to <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <table className="table pnl" data-testid="season-pnl">
        <tbody>
          <tr className="pnl-head"><th colSpan={2}>Income</th></tr>
          {p.income.map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{money(r.amount)}</td></tr>)}
          <tr><th>Total income</th><th className="num">{money(p.totalIncome)}</th></tr>
          <tr className="pnl-head"><th colSpan={2}>Spent</th></tr>
          {p.rows.filter((r) => r.spent).map((r) => <tr key={r.category}><td>{r.category}</td><td className="num">{money(r.spent)}</td></tr>)}
          <tr><th>Total spent</th><th className="num">{money(p.totalSpent)}</th></tr>
          <tr className="pnl-total"><th>Net</th><th className="num">{money(p.net)}</th></tr>
        </tbody>
      </table>
    </Section>
  );
}

function Contracts() {
  const data = useTeamData();
  const { canType, canMoney } = useSession();
  const money = useMoney();
  if (!data) return null;
  const list = data.list('contract').slice().sort((a, b) => String(v(a, 'renewal_date') || v(a, 'end') || '9').localeCompare(String(v(b, 'renewal_date') || v(b, 'end') || '9')));
  return (
    <>
      <div className="toolbar">{canType('contract', 'edit') && <Link className="btn primary" to="/r/contract/new">New contract</Link>}</div>
      {list.length === 0 ? <Empty>No contracts yet — sponsorship, supply, driver and venue agreements with their renewal dates.</Empty> : (
        <div className="card list">{list.map((c) => (
          <Link key={c.id} to={`/r/contract/${c.id}`} className="list-row">
            <span className="grow"><span className="row-title">{v(c, 'name')}</span><span className="row-sub">{[v(c, 'party'), v(c, 'kind'), (v(c, 'renewal_date') || v(c, 'end')) && `renew by ${fmtDate(v(c, 'renewal_date') || v(c, 'end'))}`].filter(Boolean).join(' · ')}</span></span>
            {canMoney && v(c, 'value') && <span className="row-meta">{money(v(c, 'value'), v(c, 'currency'))}</span>}
          </Link>
        ))}</div>
      )}
    </>
  );
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function Export() {
  const data = useTeamData();
  const { tid, user, membership, region, canMoney, can, canType } = useSession();
  const [connector, setConnector] = useState(membership?.settings?.accounting?.connector || region.accounting[0]);
  const [from, setFrom] = useState(`${today().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today());
  const [onlyNew, setOnlyNew] = useState(true);
  const [msg, setMsg] = useState('');
  if (!data) return null;
  if (!canMoney) return null;
  const accounts = membership?.settings?.accounting?.accounts || {};
  const rows = exportRows(data, { settings: membership?.settings, from, to, accounts }).filter((r) => !onlyNew || !r.exported);
  const run = async () => {
    const file = buildExport(connector, rows, membership?.settings);
    download(file.filename, file.text);
    {
      for (const r of rows) {
        const rec = data.byId[r.id];
        if (rec && canType(rec.type, 'edit')) await saveRecord(tid, rec.type, rec.id, { ...rec.data, values: { ...rec.data.values, exported: today() } }, user.id);
      }
    }
    setMsg(`${rows.length} line${rows.length === 1 ? '' : 's'} exported to ${file.filename} and marked as exported.`);
  };
  const ready = CONNECTORS.filter((c) => !c.future).sort((a, b) => region.accounting.indexOf(a.key) - region.accounting.indexOf(b.key));
  return (
    <>
      <Section title="Export to accounting software">
        <p className="muted small">The same export works in every region. Your region ({region.label}) sets the tax codes ({region.tax.name}) and suggests {ready[0].label} first. Map categories to account codes in Team → Region & currency.</p>
        <div className="inline-row wrap">
          <label className="inline-field">Export for
            <select value={connector} onChange={(e) => setConnector(e.target.value)} data-testid="connector">
              {ready.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <label className="inline-field">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="inline-field">to <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="check-row"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> Only lines not exported yet</label>
        </div>
        <p className="muted small">{CONNECTORS.find((c) => c.key === connector)?.note} {rows.length} line{rows.length === 1 ? '' : 's'} ready.</p>
        <button type="button" className="btn primary" disabled={!rows.length} onClick={run}>Download {rows.length} line{rows.length === 1 ? '' : 's'}</button>
        {msg && <p className="notice info small" role="status">{msg}</p>}
        {!can('team.manage') && <p className="muted small">Account codes are set by someone who can edit team settings.</p>}
      </Section>
      <Section title="Coming later">
        <ul className="tips">{CONNECTORS.filter((c) => c.future).map((c) => <li key={c.key}><b>{c.label}</b>{c.kind === 'enterprise' ? ' — for larger teams and engine builders with several entities' : ' — sends lines straight to your accounts without a file'}</li>)}</ul>
        <p className="muted small">The export already carries what these need: entity, currency and rate, cost centres per car and event, and a side for every line.</p>
      </Section>
    </>
  );
}
