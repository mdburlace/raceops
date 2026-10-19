// Analytics: performance, setups, and engines & parts — worked out on the device from the
// team's own records (works offline). Every chart says what it's based on and opens the
// sessions behind it.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  byBand, byCondition, byTrack, coverage, engineTrends, feedbackPatterns, filterRows, forecast, jetVsAir, meetingGap,
  numericSettings, perMeeting, sessionRows, settingSeries, settingVsResult, shockFade, summary, trendChange,
} from '@shared/analytics.js';
import { ChartTable, LineChart, ScatterChart, fmtNum } from '../components/Charts.jsx';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { assetLife, scheduleStatus, setupsByAsset } from '../lib/compute.js';
import { formFor, titleOf, today, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { downloadCsv } from './Phase2.jsx';
import { FUEL_UNITS, fromGal } from '@shared/fuel.js';
import { useFuelUnits } from '../components/FuelPlanner.jsx';

const TABS = [['performance', 'Performance'], ['setups', 'Setups'], ['engines', 'Engines & parts']];
const signed = (x, dp = 1) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(dp)}`);
const f1 = (x) => (x === null || x === undefined ? '—' : x.toFixed(1));
const pct = (x) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`);
const setupHref = (id) => `/r/setup/${id}`;

/** All sessions as analysis rows (memoised on the data). */
export function useSessionRows(data) {
  return useMemo(() => {
    if (!data) return [];
    const events = Object.fromEntries(data.list('event').map((e) => [e.id, e.data?.values || {}]));
    const tracks = Object.fromEntries(data.list('track').map((t) => [t.id, v(t, 'name')]));
    return sessionRows(data.list('setup').map((s) => ({ id: s.id, values: s.data?.values || {} })), events, tracks);
  }, [data]);
}

function DataNote({ rows, extra }) {
  const c = coverage(rows);
  return (
    <p className="muted small data-note">
      Based on {c.sessions} session{c.sessions === 1 ? '' : 's'} over {c.nights} night{c.nights === 1 ? '' : 's'}
      {c.noFinish ? ` · ${c.noFinish} missing a finish position` : ''}{c.noStart ? ` · ${c.noStart} missing a start` : ''}{extra ? ` · ${extra}` : ''}.
    </p>
  );
}

function Tile({ label, value, sub, tone }) {
  return <div className="kpi"><span className="kpi-label">{label}</span><b className={`kpi-value${tone ? ` ${tone}` : ''}`}>{value}</b>{sub && <span className="muted small">{sub}</span>}</div>;
}
const tone = (x) => (x > 0 ? 'lvl-ok' : x < 0 ? 'lvl-over' : '');

// ---------------- filters ----------------
function Filters({ data, rows, f, setF, show }) {
  const years = [...new Set(rows.map((r) => r.date.slice(0, 4)).filter(Boolean))].sort().reverse();
  const tracks = [...new Map(rows.filter((r) => r.track).map((r) => [r.track, r.trackName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const conds = [...new Set(rows.flatMap((r) => r.conditions))].sort();
  const cars = data.list('car');
  return (
    <div className="toolbar analytics-filters">
      {cars.length > 1 && (
        <select aria-label="Car" value={f.car} onChange={(e) => setF({ ...f, car: e.target.value })}>
          <option value="">All cars</option>{cars.map((c) => <option key={c.id} value={c.id}>{titleOf(c, data)}</option>)}
        </select>
      )}
      <select aria-label="Period" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}>
        <option value="all">All time</option><option value="12m">Last 12 months</option>
        {years.map((y) => <option key={y} value={y}>Season {y}</option>)}
      </select>
      {show.track && (
        <select aria-label="Track" value={f.track} onChange={(e) => setF({ ...f, track: e.target.value })}>
          <option value="">All tracks</option>{tracks.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      )}
      {show.kind && (
        <select aria-label="Sessions" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          <option value="all">All sessions</option><option value="feature">Features</option><option value="heats">Heats & qualifying</option>
        </select>
      )}
      {show.conditions && conds.length > 0 && (
        <select aria-label="Track conditions" value="" onChange={(e) => e.target.value && setF({ ...f, conditions: [...new Set([...f.conditions, e.target.value])] })}>
          <option value="">{f.conditions.length ? 'Add a condition…' : 'Any track conditions'}</option>{conds.filter((c) => !f.conditions.includes(c)).map((c) => <option key={c}>{c}</option>)}
        </select>
      )}
      {f.conditions.map((c) => <button key={c} type="button" className="chip active" onClick={() => setF({ ...f, conditions: f.conditions.filter((x) => x !== c) })} aria-label={`Remove ${c}`}>{c} ✕</button>)}
    </div>
  );
}

function periodRange(p) {
  if (p === 'all' || !p) return {};
  if (p === '12m') { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return { from: d.toISOString().slice(0, 10) }; }
  return { from: `${p}-01-01`, to: `${p}-12-31` };
}

// ---------------- page ----------------
export function AnalyticsPage() {
  const data = useTeamData();
  const { canModule } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'performance';
  const rows = useSessionRows(data);
  const latestYear = rows.length ? rows[rows.length - 1].date.slice(0, 4) : '';
  const [f, setF] = useState(null);
  const filt = f || { car: '', period: latestYear && rows.filter((r) => r.date.startsWith(latestYear)).length >= 8 ? latestYear : 'all', track: '', kind: 'all', conditions: [] };
  if (!canModule('analytics')) {
    return <div><PageHeader title="Analytics" /><div className="notice">Analytics isn’t included in your role or your team’s plan. Ask a team owner.</div></div>;
  }
  if (!data) return <p className="muted pad">Loading…</p>;
  const form = formFor(data, 'setup');
  const range = periodRange(filt.period);
  const sel = filterRows(rows, { ...filt, ...range });

  return (
    <div className="analytics">
      <PageHeader title="Analytics" sub="Trends from your own setup sheets, parts and dyno runs"
        below={(
          <>
            <div className="tabs">{TABS.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'active' : ''} onClick={() => setParams(k === 'performance' ? {} : { tab: k })}>{l}</button>)}</div>
            <Filters data={data} rows={rows} f={filt} setF={setF} show={{ track: tab !== 'engines', kind: tab !== 'engines', conditions: tab !== 'engines' }} />
          </>
        )} />
      {!rows.length && tab !== 'engines' ? <Empty>No setup sheets yet. Analytics fills in as you record sessions: start, finish, setup, weather and feedback.</Empty>
        : tab === 'performance' ? <Performance rows={sel} form={form} />
          : tab === 'setups' ? <Setups rows={sel} form={form} />
            : <EnginesParts data={data} rows={filterRows(rows, { car: filt.car, ...range })} allRows={rows} car={filt.car} />}
    </div>
  );
}

// ---------------- performance ----------------
function Performance({ rows, form }) {
  const s = summary(rows);
  const results = rows.filter((r) => r.start !== null || r.finish !== null);
  const labels = results.map((r) => `${r.date} · ${r.session} · ${r.trackName}`);
  const tracks = byTrack(rows);
  const conds = byCondition(rows);
  const adr = byBand(rows, 'adr', 5, '%');
  const temp = byBand(rows, 'temp', 10, '°');
  const fb = feedbackPatterns(rows, form);
  if (!rows.length) return <Empty>No sessions match these filters.</Empty>;
  return (
    <>
      <div className="kpis">
        <Tile label="Nights" value={s.nights} sub={`${s.sessions} sessions`} />
        <Tile label="Average finish" value={f1(s.avgFinish)} sub={s.bestFinish ? `best ${s.bestFinish}` : ''} />
        <Tile label="Places gained" value={signed(s.avgGained)} sub="average per session" tone={tone(s.avgGained)} />
        <Tile label="Wins · top 5" value={`${s.wins} · ${s.top5}`} />
      </div>

      <Section title="Results over time">
        <LineChart labels={labels} invert yLabel="Position" dp={0} ariaLabel="Start and finish positions by session"
          series={[
            { name: 'Finish', points: results.map((r, i) => (r.finish !== null ? { x: i, y: r.finish, href: setupHref(r.id) } : null)).filter(Boolean) },
            { name: 'Start', points: results.map((r, i) => (r.start !== null ? { x: i, y: r.start, href: setupHref(r.id) } : null)).filter(Boolean) },
          ]} />
        <DataNote rows={rows} />
        <ChartTable head={['Date', 'Session', 'Track', 'Start', 'Finish', 'Gained']}
          rows={results.map((r) => [r.date, <Link key="l" to={setupHref(r.id)}>{r.session}</Link>, r.trackName, r.start ?? '—', r.finish ?? '—', signed(r.gained, 0)])} />
      </Section>

      <Section title="By track" actions={<button type="button" className="btn ghost small" onClick={() => downloadCsv('results-by-track', ['Track', 'Nights', 'Sessions', 'Avg finish', 'Avg gained', 'Best', 'Wins', 'Last raced'], tracks.map((t) => [t.name, t.nights, t.sessions, f1(t.avgFinish), signed(t.avgGained), t.bestFinish ?? '', t.wins, t.last]))}>CSV</button>}>
        <div className="table-scroll"><table className="table">
          <thead><tr><th>Track</th><th>Nights</th><th>Avg finish</th><th>Places gained</th><th>Best</th><th>Wins</th><th>Last raced</th></tr></thead>
          <tbody>{tracks.map((t) => (
            <tr key={t.track}><td><b>{t.name}</b></td><td>{t.nights}</td><td>{f1(t.avgFinish)}</td><td className={tone(t.avgGained)}>{signed(t.avgGained)}</td><td>{t.bestFinish ?? '—'}</td><td>{t.wins}</td><td>{t.last}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="muted small">Best average finish first.</p>
      </Section>

      <div className="grid-2">
        <Section title="Track conditions">
          {conds.length ? <ResultTable rows={conds} first="Conditions" /> : <p className="muted small">Tick track conditions on your sheets to see how you go when it’s slick, heavy or tacky.</p>}
        </Section>
        <Section title="The air">
          {adr.length ? <ResultTable rows={adr} first="ADR" /> : <p className="muted small">Record ADR on your sheets (or pull the weather) to see results by air density.</p>}
          {temp.length > 0 && <ResultTable rows={temp} first="Temp" />}
        </Section>
      </div>

      <Section title="Handling comments">
        {!fb.length ? <p className="muted small">Driver and crew lead comments (e.g. “Loose exit”) appear here once they’re on your sheets.</p> : (
          <div className="fb-list">
            {fb.map((x) => (
              <div key={x.tag} className="fb-item">
                <div className="fb-head"><b>{x.tag}</b><span className="muted small">{x.count} session{x.count === 1 ? '' : 's'}{x.tracks.length ? ` · mostly ${x.tracks.map((t) => `${t.name} (${t.n})`).join(', ')}` : ''}</span></div>
                {x.fixes.length > 0
                  ? <div className="fb-fixes"><span className="muted small">Went away after {x.fixedTimes > 1 ? `(${x.fixedTimes} times)` : ''}:</span>{x.fixes.map((c) => <span key={c.key} className="chip static">{c.label}{c.n > 1 ? ` ×${c.n}` : ''}</span>)}</div>
                  : <span className="muted small">Not yet followed by a session without it.</span>}
              </div>
            ))}
          </div>
        )}
        <p className="muted small">“Went away after” lists what changed between a session with the comment and the next session that night without it. It shows what you tried, not proof it was the fix.</p>
      </Section>
    </>
  );
}

function ResultTable({ rows, first }) {
  return (
    <div className="table-scroll"><table className="table">
      <thead><tr><th>{first}</th><th>Sessions</th><th>Avg finish</th><th>Places gained</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{r.sessions}</td><td>{f1(r.avgFinish)}</td><td className={tone(r.avgGained)}>{signed(r.avgGained)}</td></tr>)}</tbody>
    </table></div>
  );
}

// ---------------- setups ----------------
function Setups({ rows, form }) {
  const settings = useMemo(() => numericSettings(form, rows), [form, rows]);
  const has = (id) => settings.some((s) => s.id === id);
  const [pick, setPick] = useState(has('stagger_cold') ? 'stagger_cold' : settings[0]?.id || '');
  const [outcome, setOutcome] = useState('gained');
  const [drift, setDrift] = useState(() => ['stagger_cold', 'wing_angle', 'pressure_cold.RR'].filter(has));
  const setting = settings.find((s) => s.id === pick);
  const w = setting ? settingVsResult(rows, setting, outcome) : null;
  const jet = jetVsAir(rows);
  const groups = [...new Set(settings.map((s) => s.sec))];
  const secTitle = (id) => form.data.sections.find((s) => s.id === id)?.title || id;
  const SettingSelect = ({ value, onChange, label }) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {groups.map((g) => <optgroup key={g} label={secTitle(g)}>{settings.filter((s) => s.sec === g).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}
    </select>
  );
  if (!rows.length) return <Empty>No sessions match these filters.</Empty>;
  return (
    <>
      <Section title="What worked">
        <div className="inline-row wrap analytics-picks">
          <label className="small">Setting <SettingSelect value={pick} onChange={setPick} label="Setting" /></label>
          <label className="small">against
            <select aria-label="Result" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="gained">Places gained</option><option value="finish">Finishing position</option>
            </select></label>
        </div>
        {w && (
          <>
            <p className="insight" data-testid="what-worked">{w.text}</p>
            <ScatterChart points={w.points.map((p) => ({ ...p, href: setupHref(p.id) }))} line={w.line} xLabel={`${setting.label}${setting.unit ? ` (${setting.unit})` : ''}`}
              yLabel={outcome === 'gained' ? 'Places gained' : 'Finish'} invert={outcome === 'finish'} />
            {w.bands.length > 1 && (
              <div className="table-scroll"><table className="table">
                <thead><tr><th>{setting.label}</th><th>Sessions</th><th>{outcome === 'gained' ? 'Avg places gained' : 'Avg finish'}</th></tr></thead>
                <tbody>{w.bands.map((b) => <tr key={b.from}><td>{fmtNum(b.from)}–{fmtNum(b.to)}</td><td>{b.n}</td><td className={outcome === 'gained' ? tone(b.avg) : ''}>{outcome === 'gained' ? signed(b.avg) : f1(b.avg)}</td></tr>)}</tbody>
              </table></div>
            )}
            <p className="muted small">Filter by track conditions above to compare like with like (e.g. only slick nights). A link here isn’t proof: the draw, traffic and other changes matter too.</p>
          </>
        )}
      </Section>

      <Section title="Setup drift">
        <div className="inline-row wrap analytics-picks">
          {drift.map((id) => <button key={id} type="button" className="chip active" onClick={() => setDrift(drift.filter((x) => x !== id))} aria-label={`Remove ${id}`}>{settings.find((s) => s.id === id)?.label} ✕</button>)}
          {drift.length < 4 && (
            <select aria-label="Add a setting to follow" value="" onChange={(e) => e.target.value && setDrift([...drift, e.target.value])}>
              <option value="">Add a setting…</option>
              {groups.map((g) => <optgroup key={g} label={secTitle(g)}>{settings.filter((s) => s.sec === g && !drift.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}
            </select>
          )}
        </div>
        <div className="drift-grid">
          {drift.map((id) => {
            const st = settings.find((s) => s.id === id); if (!st) return null;
            const ser = settingSeries(rows, st);
            const labels = rows.map((r) => `${r.date} · ${r.session}`);
            const ch = trendChange(ser);
            return (
              <div key={id} className="drift-cell">
                <div className="drift-head"><b>{st.label}</b>{st.unit && <span className="muted small"> {st.unit}</span>}
                  {ser.length > 1 && <span className="muted small"> · {fmtNum(ser[0].y)} → {fmtNum(ser[ser.length - 1].y)}{ch !== null ? ` (${pct(ch)})` : ''}</span>}</div>
                <LineChart labels={labels} height={150} unit={st.unit} series={[{ name: st.label, points: ser.map((p) => ({ x: p.i, y: p.y, href: setupHref(p.id) })) }]} />
              </div>
            );
          })}
        </div>
        <p className="muted small">Each chart follows one setting session by session, so creeping changes stand out.</p>
      </Section>

      <Section title="Jetting vs air">
        {jet.points.length < 2 ? <p className="muted small">Needs sessions with both ADR and main jet recorded ({jet.points.length} so far).</p> : (
          <>
            <ScatterChart points={jet.points.map((p) => ({ ...p, href: setupHref(p.id) }))} line={jet.line} xLabel="ADR (%)" yLabel="Main jet" dp={1} />
            <div className="table-scroll"><table className="table" data-testid="jet-chart">
              <thead><tr><th>ADR</th><th>Sessions</th><th>Jet you ran most</th><th>Range</th><th>Your line says</th></tr></thead>
              <tbody>{jet.chart.map((b) => <tr key={b.label}><td>{b.label}</td><td>{b.n}</td><td><b>{fmtNum(b.most, 1)}</b></td><td>{b.min === b.max ? fmtNum(b.min, 1) : `${fmtNum(b.min, 1)}–${fmtNum(b.max, 1)}`}</td><td>{b.predicted === null ? '—' : fmtNum(b.predicted, 1)}</td></tr>)}</tbody>
            </table></div>
            <p className="muted small">Your own jet chart: the main jet you ran at each air density, and the trend line through it. Higher ADR (denser air) usually takes a bigger jet.</p>
          </>
        )}
      </Section>
    </>
  );
}

// ---------------- engines & parts ----------------
/** Parts and schedules with a forecast of when they're due. Exported for the Home card. */
export function partForecasts(data, rows) {
  const byAsset = setupsByAsset(data);
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const gap = meetingGap(rows.filter((r) => r.date >= yearAgo.toISOString().slice(0, 10)).map((r) => r.date)) || 14;
  const t = today();
  const out = [];
  for (const a of data.list('asset')) {
    if (v(a, 'status') === 'Retired') continue;
    const life = assetLife(a, data, byAsset);
    if (!life.limit || !['Laps', 'Races'].includes(life.unit)) continue;
    const used = (byAsset[a.id] || []).map((s) => rowById.get(s.id)).filter(Boolean);
    const per = perMeeting(used, life.unit);
    out.push({ id: a.id, href: `/assets/${a.id}`, name: titleOf(a, data), kind: v(a, 'category') || 'Part', unit: life.unit, used: life.used, limit: life.limit, per, level: life.level,
      f: forecast({ used: life.used, limit: life.limit, perMeeting: per, gapDays: gap, today: t }) });
  }
  for (const sch of data.list('schedule')) {
    const st = scheduleStatus(sch, data, byAsset);
    if (!st.interval || !['Laps', 'Races'].includes(st.unit)) continue;
    const used = v(sch, 'applies_to') === 'Car' ? rows.filter((r) => r.car === v(sch, 'car')) : (byAsset[v(sch, 'asset')] || []).map((s) => rowById.get(s.id)).filter(Boolean);
    const per = perMeeting(used, st.unit);
    out.push({ id: sch.id, href: '/maintenance', name: titleOf(sch, data), kind: 'Schedule', unit: st.unit, used: st.used, limit: st.interval, per, level: st.level,
      f: forecast({ used: st.used, limit: st.interval, perMeeting: per, gapDays: gap, today: t }) });
  }
  return out.sort((a, b) => (a.f?.meetings ?? 1e9) - (b.f?.meetings ?? 1e9));
}

function EnginesParts({ data, rows, allRows, car }) {
  const fuelU = useFuelUnits();
  const parts = partForecasts(data, allRows);
  const engines = data.list('asset').filter((a) => v(a, 'category') === 'Engine' && v(a, 'status') !== 'Retired');
  const shocks = data.list('asset').filter((a) => v(a, 'category') === 'Shock' && data.list('dyno_run').some((r) => v(r, 'asset') === a.id));
  const [eng, setEng] = useState(engines[0]?.id || '');
  const [shock, setShock] = useState(shocks[0]?.id || '');
  const builds = data.list('engine_build').filter((b) => v(b, 'engine') === eng).map((b) => ({ id: b.id, values: b.data.values || {} }));
  const et = eng ? engineTrends(eng, rows, builds) : null;
  const fade = shock ? shockFade(data.list('dyno_run').filter((r) => v(r, 'asset') === shock).map((r) => ({ id: r.id, values: r.data.values || {} }))) : [];
  const mini = (title, ser, unit, dp, href) => (
    <div className="drift-cell">
      <div className="drift-head"><b>{title}</b>{ser.length > 1 && <span className="muted small"> · {fmtNum(ser[0].y, dp)} → {fmtNum(ser[ser.length - 1].y, dp)} {unit} ({pct(trendChange(ser))})</span>}</div>
      {ser.length ? <LineChart labels={ser.map((p) => p.label)} height={150} unit={unit} dp={dp} series={[{ name: title, points: ser.map((p, i) => ({ x: i, y: p.y, href: href(p.id) })) }]} />
        : <p className="muted small">No readings yet.</p>}
    </div>
  );
  return (
    <>
      <Section title="Service forecast" actions={parts.length > 0 && <button type="button" className="btn ghost small" onClick={() => downloadCsv('service-forecast', ['Part', 'Type', 'Used', 'Limit', 'Unit', 'Per meeting', 'Meetings left', 'Due about'], parts.map((p) => [p.name, p.kind, Math.round(p.used), p.limit, p.unit, p.per ? Math.round(p.per) : '', p.f?.meetings !== null && p.f?.meetings !== undefined ? p.f.meetings.toFixed(1) : '', p.f?.date || '']))}>CSV</button>}>
        {!parts.length ? <p className="muted small">Give parts a life limit in laps or races (Assets), or add service schedules, to see when each is due.</p> : (
          <div className="table-scroll"><table className="table forecast" data-testid="forecast">
            <thead><tr><th>Part</th><th>Used</th><th>Per meeting</th><th>Meetings left</th><th>Due about</th></tr></thead>
            <tbody>{parts.map((p) => (
              <tr key={p.id}>
                <td><Link to={p.href}><b>{p.name}</b></Link><br /><span className="muted small">{p.kind}</span></td>
                <td><span className="life-bar"><i className={`lvl-${p.level}`} style={{ width: `${Math.min(100, (p.used / p.limit) * 100)}%` }} /></span>
                  <span className="small">{Math.round(p.used)} / {p.limit} {p.unit.toLowerCase()}</span></td>
                <td>{p.per ? `${Math.round(p.per)} ${p.unit === 'Races' ? 'race' : 'laps'}` : '—'}</td>
                <td>{p.f?.overdue ? <Pill level="over">due now</Pill> : p.f?.meetings !== null && p.f?.meetings !== undefined ? <b>{p.f.meetings < 10 ? p.f.meetings.toFixed(1) : Math.round(p.f.meetings)}</b> : '—'}</td>
                <td>{p.f?.overdue ? 'now' : p.f?.date || '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="muted small">Forecasts use each part’s average use over its last six meetings and your usual gap between meetings. Soonest first.</p>
      </Section>

      <Section title="Engine health" actions={engines.length > 1 && (
        <select aria-label="Engine" value={eng} onChange={(e) => setEng(e.target.value)}>{engines.map((e) => <option key={e.id} value={e.id}>{titleOf(e, data)}</option>)}</select>
      )}>
        {!et ? <p className="muted small">Add your engines in Assets and pick them on setup sheets.</p> : (
          <>
            <div className="drift-grid">
              {mini('Fuel per lap', et.fuel.map((p) => ({ ...p, y: fromGal(p.y, fuelU) })), FUEL_UNITS[fuelU].short, 3, setupHref)}
              {mini('Highest rpm', et.tachHigh, 'rpm', 0, setupHref)}
              {mini('Lowest rpm', et.tachLow, 'rpm', 0, setupHref)}
              {mini('Dyno HP', et.hp, 'hp', 0, (id) => `/r/engine_build/${id}`)}
            </div>
            <p className="muted small">By meeting{car ? ' for this car' : ''}, from {et.sessions} session{et.sessions === 1 ? '' : 's'} with this engine. Rising fuel per lap or falling rpm can point to wear; dyno HP comes from its build sheets.</p>
          </>
        )}
      </Section>

      <Section title="Shock fade" actions={shocks.length > 1 && (
        <select aria-label="Shock" value={shock} onChange={(e) => setShock(e.target.value)}>{shocks.map((s) => <option key={s.id} value={s.id}>{titleOf(s, data)}</option>)}</select>
      )}>
        {!shocks.length ? <p className="muted small">Record dyno runs for a shock to compare it over time.</p> : fade.length === 0 ? <p className="muted small">This shock’s runs have no single-table readings to compare.</p> : (
          <>
            <LineChart labels={fade.map((x) => `${x.date} · ${x.label}`)} unit="lb" dp={0} yLabel={`Force at ${fmtNum(fade[0].v)} in/s`}
              series={[{ name: 'Compression', points: fade.map((x, i) => (x.comp !== null ? { x: i, y: x.comp, href: `/r/dyno_run/${x.id}` } : null)).filter(Boolean) },
                { name: 'Rebound', points: fade.map((x, i) => (x.reb !== null ? { x: i, y: x.reb, href: `/r/dyno_run/${x.id}` } : null)).filter(Boolean) }]} />
            <div className="table-scroll"><table className="table" data-testid="fade">
              <thead><tr><th>Run</th><th>Compression</th><th>Change</th><th>Rebound</th><th>Change</th></tr></thead>
              <tbody>{fade.map((x) => <tr key={x.id}><td><Link to={`/r/dyno_run/${x.id}`}>{x.date}</Link> <span className="muted small">{x.label !== x.date ? x.label : ''}</span></td><td>{fmtNum(x.comp, 0)}</td><td>{pct(x.compChange)}</td><td>{fmtNum(x.reb, 0)}</td><td>{pct(x.rebChange)}</td></tr>)}</tbody>
            </table></div>
            <p className="muted small">Force at about {fmtNum(fade[0].v)} in/s{fade[0].speed ? ` in the ${Number(fade[0].speed)} in/s test` : ''} on each run, against the first run. A steady drop usually means the shock needs a service.</p>
          </>
        )}
      </Section>
    </>
  );
}

// ---------------- Home card ----------------
/** Headline numbers on Home: recent form and what's due soon. */
export function AnalyticsKpis() {
  const data = useTeamData();
  const { canModule } = useSession();
  const rows = useSessionRows(data);
  const parts = useMemo(() => (data && canModule('analytics') ? partForecasts(data, rows) : []), [data, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !canModule('analytics') || !rows.length) return null;
  const feats = rows.filter((r) => r.feature && r.finish !== null).slice(-5);
  const s = summary(feats);
  const due = parts.filter((p) => p.f && (p.f.overdue || (p.f.meetings !== null && p.f.meetings <= 2)));
  return (
    <section className="card analytics-home" data-testid="analytics-home">
      <div className="card-head"><h3>Form & what’s due</h3><Link className="btn small ghost" to="/analytics">Analytics</Link></div>
      <div className="kpis">
        <Tile label="Last 5 features" value={feats.length ? f1(s.avgFinish) : '—'} sub="average finish" />
        <Tile label="Places gained" value={feats.length ? signed(s.avgGained) : '—'} sub="last 5 features" tone={tone(s.avgGained)} />
        <Tile label="Due within 2 meetings" value={due.length} sub={due.slice(0, 2).map((p) => p.name).join(', ')} tone={due.length ? 'lvl-warn' : ''} />
      </div>
    </section>
  );
}
