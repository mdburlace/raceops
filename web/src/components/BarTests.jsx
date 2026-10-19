// Torsion bar tests: results on a test (rate at the test travel, rebound, split, against nominal
// and the baseline average) and the baseline averages on the dyno page.
import { useState } from 'react';
import { barStats, baselines, groupKey, vsBaseline } from '@shared/bars.js';
import { saveRecord } from '../lib/store.js';
import { useSession } from '../lib/session.jsx';
import { fmtDate, titleOf, v } from '../lib/data.js';

const r0 = (x) => (x === null || x === undefined ? '—' : Math.round(x).toLocaleString());
const r1 = (x) => (x === null || x === undefined ? '—' : (Math.round(x * 10) / 10).toString());
const pct = (x, dp = 1) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(dp)}%`);
const tone = (x, warn = 0.02) => (x === null || x === undefined ? '' : Math.abs(x) >= warn * 2 ? 'lvl-over' : Math.abs(x) >= warn ? 'lvl-warn' : 'lvl-ok');

/** All bar tests as { id, values } (latest first). */
export function barTests(data) {
  const forms = data.list('form').filter((f) => f.data.target === 'dyno_run' && f.data.dyno_kind === 'bar').map((f) => f.id);
  return data.list('dyno_run').filter((r) => forms.includes(r.data.form_id))
    .map((r) => ({ id: r.id, values: r.data.values || {}, rec: r }))
    .sort((a, b) => String(b.values.date || '').localeCompare(String(a.values.date || '')));
}

/** On a bar test: the numbers that matter, worked out from what's entered. */
export function BarResults({ data, id, values }) {
  const s = barStats(values);
  const g = groupKey(values);
  const base = baselines(barTests(data).filter((t) => t.id !== id || values.in_baseline).map((t) => (t.id === id ? { ...t, values } : t))).get(g.key);
  const vb = vsBaseline(values, base);
  return (
    <div className="bar-results" data-testid="bar-results">
      <div className="kpis">
        <div className="kpi"><span className="kpi-label">Rate at {r1(s.travel)} in</span><b className="kpi-value">{r0(s.rate)}</b><span className="muted small">lb/in · {r1(s.arm)} in arm</span></div>
        <div className="kpi"><span className="kpi-label">Rebound rate</span><b className="kpi-value">{r0(s.rebRate)}</b><span className="muted small">lb/in</span></div>
        <div className="kpi"><span className="kpi-label">Split (hysteresis)</span><b className="kpi-value">{r0(s.split)}</b><span className="muted small">lb{s.splitPct !== null ? ` · ${(s.splitPct * 100).toFixed(1)}% of compression` : ''}</span></div>
        <div className="kpi"><span className="kpi-label">Against baseline</span><b className={`kpi-value ${tone(vb?.rate)}`}>{vb ? pct(vb.rate) : '—'}</b>
          <span className="muted small">{base ? `${g.label}: avg ${r0(base.rate)} lb/in from ${base.n} test${base.n === 1 ? '' : 's'}` : `No baseline yet for ${g.label}`}</span></div>
      </div>
      <p className="muted small">
        {s.source === 'entered' ? 'From the compression and rebound entered below.' : s.source === 'readings' ? `Read from the table at ${r1(s.travel)} in of arm travel.` : `Enter the readings (or the compression and rebound at ${r1(s.travel)} in) to see the rate and split.`}
        {s.vsNominal !== null && ` ${pct(s.vsNominal)} against the ${values.nominal} lb/in it's sold as.`}
        {s.maxSplit !== null && s.maxSplit !== s.split && ` Widest split in the readings: ${r0(s.maxSplit)} lb.`}
      </p>
    </div>
  );
}

/** Dyno page (bars): baseline averages by size and type, and setting a baseline from the latest tests. */
export function BarBaselines({ data }) {
  const { canType, tid, user } = useSession();
  const tests = barTests(data);
  const bases = baselines(tests);
  const [setting, setSetting] = useState(null); // group key being set
  const [pick, setPick] = useState([]);
  const [busy, setBusy] = useState(false);
  // latest test per bar, grouped by size/type
  const latest = new Map();
  for (const t of tests) { const k = t.values.asset || t.id; if (!latest.has(k)) latest.set(k, t); }
  const groups = new Map();
  for (const t of latest.values()) { const g = groupKey(t.values); (groups.get(g.key) || groups.set(g.key, { ...g, tests: [] }).get(g.key)).tests.push(t); }
  if (!tests.length) return null;
  const start = (key) => { setSetting(key); setPick(groups.get(key).tests.filter((t) => barStats(t.values).rate !== null).map((t) => t.id)); };
  const save = async () => {
    setBusy(true);
    try {
      const inGroup = tests.filter((t) => groupKey(t.values).key === setting);
      for (const t of inGroup) {
        const on = pick.includes(t.id);
        if (!!t.values.in_baseline !== on) await saveRecord(tid, 'dyno_run', t.id, { ...t.rec.data, values: { ...t.values, in_baseline: on } }, user.id);
      }
      setSetting(null);
    } finally { setBusy(false); }
  };
  return (
    <section className="card bar-baselines" data-testid="bar-baselines">
      <div className="card-head"><h3>Rate baselines</h3></div>
      <p className="muted small">Average rate and split for each bar size and type, from the tests ticked “Use in baseline averages”. Each bar’s latest test is compared with it.</p>
      <div className="table-scroll"><table className="table">
        <thead><tr><th>Size · type</th><th>Bars</th><th>Baseline rate</th><th>Range</th><th>Baseline split</th><th /></tr></thead>
        <tbody>{[...groups.values()].sort((a, b) => a.label.localeCompare(b.label)).map((g) => {
          const b = bases.get(g.key);
          return (
            <tr key={g.key}>
              <td><b>{g.label}</b></td>
              <td>{g.tests.length}{b ? <span className="muted small"> · {b.n} in baseline</span> : ''}</td>
              <td>{b ? `${r0(b.rate)} lb/in` : '—'}</td>
              <td>{b && b.n > 1 ? `${r0(b.min)}–${r0(b.max)}` : '—'}</td>
              <td>{b && b.split !== null ? `${r0(b.split)} lb` : '—'}</td>
              <td>{canType('dyno_run', 'edit') && <button type="button" className="btn small ghost" onClick={() => start(g.key)}>{b ? 'Change baseline' : 'Set baseline'}</button>}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {setting && (
        <div className="baseline-pick">
          <p className="small"><b>{groups.get(setting).label}</b> — tick the tests to average. Usually new bars, or a set you trust.</p>
          <div className="list">{groups.get(setting).tests.map((t) => {
            const s = barStats(t.values);
            return (
              <label key={t.id} className="list-row selectable">
                <input type="checkbox" disabled={s.rate === null} checked={pick.includes(t.id)} aria-label={`Include ${titleOf(data.byId[t.values.asset]) || t.values.label}`}
                  onChange={(e) => setPick(e.target.checked ? [...pick, t.id] : pick.filter((x) => x !== t.id))} />
                <span className="grow"><span className="row-title">{titleOf(data.byId[t.values.asset])}</span><span className="row-sub">{[t.values.label, t.values.serial && `#${t.values.serial}`, fmtDate(t.values.date)].filter(Boolean).join(' · ')}</span></span>
                <span className="row-meta">{s.rate === null ? 'no rate' : `${r0(s.rate)} lb/in`}</span>
              </label>
            );
          })}</div>
          <div className="inline-row end">
            <button type="button" className="btn ghost" onClick={() => setSetting(null)}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy} onClick={save}>Save baseline ({pick.length})</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Short results for a bar test in the dyno list. */
export function barRowMeta(values, bases) {
  const s = barStats(values);
  const vb = vsBaseline(values, bases.get(groupKey(values).key));
  return { s, vb, tone: tone(vb?.rate) };
}
