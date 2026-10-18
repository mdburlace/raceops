import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import DynoChart from '../components/DynoChart.jsx';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { assetLife, setupsByAsset } from '../lib/compute.js';
import {
  allFields, assetRefId, evalFormula, fieldDef, fmtDate, formFor, linearSlope, memberName, membersList, num, titleOf, today, useTeamData, v,
} from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

const byDateDesc = (a, b) => (v(b, 'date') || '').localeCompare(v(a, 'date') || '') || b.client_updated_at.localeCompare(a.client_updated_at);
const carOk = (rec, car) => !car || !(v(rec, 'available_for') || []).length || v(rec, 'available_for').includes(car);
const csvCell = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
export function downloadCsv(name, header, rows) {
  const text = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const isFeature = (s) => /feature|a-?main/i.test(v(s, 'session') || '');

// ======================= At the track: between-round checks =======================
export function TrackChecks() {
  const data = useTeamData();
  const { canType } = useSession();
  const [car, setCar] = useState('');
  if (!data) return null;
  const t = today();
  const current = data.list('event').filter((e) => (v(e, 'end_date') || v(e, 'date') || '') >= t)
    .sort((a, b) => (v(a, 'date') || '').localeCompare(v(b, 'date') || ''))[0];
  const cars = data.list('car').filter((c) => v(c, 'active') !== false);
  const rows = data.list('track_check').filter((c) => !car || v(c, 'car') === car).sort((a, b) => b.client_updated_at.localeCompare(a.client_updated_at));
  return (
    <div>
      <PageHeader title="Between-round checks" sub="Quick checks and fixes between sessions">
        {canType('track_check', 'edit') && cars.length > 0 && (
          <Link className="btn primary" to={`/r/track_check/new?car=${car || cars[0].id}${current ? `&event=${current.id}` : ''}`}>New check</Link>
        )}
      </PageHeader>
      <div className="toolbar">
        <select value={car} onChange={(e) => setCar(e.target.value)}>
          <option value="">All cars</option>{data.list('car').map((c) => <option key={c.id} value={c.id}>{titleOf(c)}</option>)}
        </select>
      </div>
      {rows.length === 0 ? <Empty>No checks yet. Record one after each session to track fuel, damage and parts changed.</Empty> : (
        <div className="card list">
          {rows.map((c) => {
            const form = formFor(data, 'track_check', c.data.form_id);
            const items = allFields(form).filter((f) => f.type === 'check');
            const done = items.filter((f) => c.data.values?.[f.key]?.done).length;
            return (
              <Link key={c.id} to={`/r/track_check/${c.id}`} className="list-row">
                <span className="grow">
                  <span className="row-title">{titleOf(c, data)}</span>
                  <span className="row-sub">{titleOf(data.byId[v(c, 'car')])}{v(c, 'issues') ? ` · ${v(c, 'issues')}` : ''}</span>
                </span>
                {v(c, 'issues') ? <Pill level="warn">issues</Pill> : null}
                <Pill level={done === items.length ? 'ok' : 'info'}>{done}/{items.length}</Pill>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ======================= At the track: gears, tires & stagger =======================
export function GearsTires() {
  const data = useTeamData();
  const { canType } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'gears';
  const [car, setCar] = useState('');
  const [circ, setCirc] = useState('105');
  const [rpm, setRpm] = useState('8000');
  const [axle, setAxle] = useState('rear');
  const [target, setTarget] = useState('');
  const [tol, setTol] = useState('0.5');
  const [showUsed, setShowUsed] = useState(false);

  const gears = useMemo(() => {
    if (!data) return [];
    return data.list('gear').filter((g) => carOk(g, car) && v(g, 'status') !== 'Retired').map((g) => {
      const form = formFor(data, 'gear', g.data.form_id);
      const f = fieldDef(form, 'final_ratio');
      const ratio = f?.type === 'calc' ? evalFormula(f.formula, g.data.values) : num(v(g, 'final_ratio'));
      const mph = ratio && num(circ) && num(rpm) ? (num(rpm) * num(circ)) / (ratio * 1056) : null;
      return { g, ratio, mph };
    }).sort((a, b) => (a.ratio ?? 99) - (b.ratio ?? 99));
  }, [data, car, circ, rpm]);

  const tires = useMemo(() => (data ? data.list('tire').filter((t) => carOk(t, car))
    .filter((t) => showUsed || v(t, 'status') !== 'Worn out')
    .sort((a, b) => String(v(a, 'position')).localeCompare(String(v(b, 'position'))) || (num(v(a, 'circumference')) || 0) - (num(v(b, 'circumference')) || 0)) : []), [data, car, showUsed]);

  const combos = useMemo(() => {
    const [L, R] = axle === 'rear' ? ['LR', 'RR'] : ['LF', 'RF'];
    const usable = tires.filter((t) => v(t, 'status') !== 'Worn out' && num(v(t, 'circumference')) !== null);
    const left = usable.filter((t) => [L, 'Any', undefined, ''].includes(v(t, 'position')));
    const right = usable.filter((t) => [R, 'Any', undefined, ''].includes(v(t, 'position')));
    const out = [];
    for (const l of left) for (const r of right) {
      if (l.id === r.id) continue;
      const st = num(v(r, 'circumference')) - num(v(l, 'circumference'));
      out.push({ l, r, st: Math.round(st * 1000) / 1000 });
    }
    const tg = num(target);
    return out.filter((c) => tg === null || Math.abs(c.st - tg) <= (num(tol) ?? 0.5))
      .sort((a, b) => (tg === null ? b.st - a.st : Math.abs(a.st - tg) - Math.abs(b.st - tg))).slice(0, 60);
  }, [tires, axle, target, tol]);

  if (!data) return null;
  const set = (t) => setParams(t === 'gears' ? {} : { tab: t });
  return (
    <div>
      <PageHeader title="Gears & tires" sub="Quick-change gear chart, tire inventory and stagger combinations">
        {tab === 'gears' && canType('gear', 'edit') && <Link className="btn primary" to="/r/gear/new">New gear set</Link>}
        {tab !== 'gears' && canType('tire', 'edit') && <Link className="btn primary" to="/r/tire/new">New tire</Link>}
      </PageHeader>
      <div className="tabs">
        <button type="button" className={tab === 'gears' ? 'active' : ''} onClick={() => set('gears')}>Gear chart</button>
        <button type="button" className={tab === 'tires' ? 'active' : ''} onClick={() => set('tires')}>Tires</button>
        <button type="button" className={tab === 'stagger' ? 'active' : ''} onClick={() => set('stagger')}>Stagger combos</button>
      </div>
      <div className="toolbar">
        <select value={car} onChange={(e) => setCar(e.target.value)}>
          <option value="">Any car</option>{data.list('car').map((c) => <option key={c.id} value={c.id}>Available for {titleOf(c)}</option>)}
        </select>
        {tab === 'gears' && (
          <>
            <label className="inline-field">RR circumference <input inputMode="decimal" className="num" value={circ} onChange={(e) => setCirc(e.target.value)} /> in</label>
            <label className="inline-field">at <input inputMode="decimal" className="num" value={rpm} onChange={(e) => setRpm(e.target.value)} /> rpm</label>
          </>
        )}
        {tab === 'tires' && <label className="toggle small"><input type="checkbox" checked={showUsed} onChange={(e) => setShowUsed(e.target.checked)} /><span>Show worn out</span></label>}
      </div>

      {tab === 'gears' && (gears.length === 0 ? <Empty>No gear sets yet. Add each quick-change set with its tooth counts.</Empty> : (
        <div className="card table-card">
          <table className="table">
            <thead><tr><th>Set</th><th>Upper / lower</th><th>R&amp;P</th><th>Final</th><th>mph</th><th>Qty</th><th>Status</th><th>Available for</th></tr></thead>
            <tbody>{gears.map(({ g, ratio, mph }) => (
              <tr key={g.id}>
                <td><Link to={`/r/gear/${g.id}`}><b>{v(g, 'name')}</b></Link></td>
                <td>{v(g, 'upper')} / {v(g, 'lower')}</td>
                <td>{v(g, 'rp_ratio')}</td>
                <td><b>{ratio?.toFixed(3) ?? '—'}</b></td>
                <td>{mph ? mph.toFixed(1) : '—'}</td>
                <td>{v(g, 'qty')}</td>
                <td><Pill level={v(g, 'status') === 'Available' ? 'ok' : v(g, 'status') === 'Damaged' ? 'over' : 'info'}>{v(g, 'status') || '—'}</Pill></td>
                <td className="muted">{(v(g, 'available_for') || []).map((id) => titleOf(data.byId[id])).join(', ') || 'Any'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {tab === 'tires' && (tires.length === 0 ? <Empty>No tires yet. Record each tire with its measured circumference to work out stagger.</Empty> : (
        <div className="card table-card">
          <table className="table">
            <thead><tr><th>Tire</th><th>Pos.</th><th>Circ.</th><th>Compound</th><th>Size</th><th>Duro</th><th>Laps</th><th>Status</th></tr></thead>
            <tbody>{tires.map((t) => (
              <tr key={t.id}>
                <td><Link to={`/r/tire/${t.id}`}><b>{v(t, 'name')}</b></Link><div className="muted small">{v(t, 'brand')}</div></td>
                <td>{v(t, 'position')}</td><td><b>{v(t, 'circumference')}</b></td><td>{v(t, 'compound')}</td><td>{v(t, 'size')}</td>
                <td>{v(t, 'durometer')}</td><td>{v(t, 'laps')}</td>
                <td><Pill level={v(t, 'status') === 'Worn out' ? 'muted' : v(t, 'status') === 'New' ? 'ok' : 'info'}>{v(t, 'status')}</Pill></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {tab === 'stagger' && (
        <>
          <div className="card toolbar">
            <select value={axle} onChange={(e) => setAxle(e.target.value)}>
              <option value="rear">Rear (LR / RR)</option><option value="front">Front (LF / RF)</option>
            </select>
            <label className="inline-field">Target stagger <input inputMode="decimal" className="num" value={target} placeholder="any" onChange={(e) => setTarget(e.target.value)} /> in</label>
            <label className="inline-field">± <input inputMode="decimal" className="num" value={tol} onChange={(e) => setTol(e.target.value)} /> in</label>
          </div>
          <p className="muted small">Stagger = right tire circumference − left tire circumference. Tires marked “Any” can go on either side.</p>
          {combos.length === 0 ? <Empty>No combinations match. Add tires with circumferences, or widen the tolerance.</Empty> : (
            <div className="card table-card">
              <table className="table">
                <thead><tr><th>Stagger</th><th>{axle === 'rear' ? 'LR' : 'LF'}</th><th>{axle === 'rear' ? 'RR' : 'RF'}</th><th>Compounds</th></tr></thead>
                <tbody>{combos.map(({ l, r, st }) => (
                  <tr key={`${l.id}-${r.id}`}>
                    <td><b className={num(target) !== null && Math.abs(st - num(target)) < 0.125 ? 'lvl-ok' : ''}>{st.toFixed(3)}</b></td>
                    <td><Link to={`/r/tire/${l.id}`}>{v(l, 'name')}</Link> <span className="muted">({v(l, 'circumference')})</span></td>
                    <td><Link to={`/r/tire/${r.id}`}>{v(r, 'name')}</Link> <span className="muted">({v(r, 'circumference')})</span></td>
                    <td className="muted">{[v(l, 'compound'), v(r, 'compound')].filter(Boolean).join(' / ')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ======================= Workshop: dyno =======================
export function Dyno() {
  const data = useTeamData();
  const { canType } = useSession();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState(params.get('kind') || 'shock');
  const [asset, setAsset] = useState(params.get('asset') || '');
  const selParam = params.get('ids');
  const setupId = params.get('setup');

  const forms = data ? data.list('form').filter((f) => f.data.target === 'dyno_run') : [];
  const formKind = (r) => forms.find((f) => f.id === r.data.form_id)?.data.dyno_kind || 'shock';
  const runs = data ? data.list('dyno_run').filter((r) => formKind(r) === kind).filter((r) => !asset || v(r, 'asset') === asset).sort(byDateDesc) : [];

  // Pre-select: explicit ids, or latest run on/before the event for each shock/bar on a setup sheet.
  const preset = useMemo(() => {
    if (!data) return [];
    if (selParam) return selParam.split(',');
    if (setupId && data.byId[setupId]) {
      const s = data.byId[setupId];
      const evDate = v(data.byId[v(s, 'event')], 'date') || today();
      const ids = new Set();
      for (const k of ['shocks', 'bars']) for (const val of Object.values(s.data.values?.[k] || {})) { const id = assetRefId(val); if (id) ids.add(id); }
      return [...ids].map((aid) => data.list('dyno_run').filter((r) => v(r, 'asset') === aid && (v(r, 'date') || '') <= evDate).sort(byDateDesc)[0]).filter(Boolean).map((r) => r.id);
    }
    if (asset) return runs.slice(0, 6).map((r) => r.id);
    return runs.slice(0, 2).map((r) => r.id);
  }, [data, selParam, setupId, asset]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState(null);
  const selected = sel || preset;

  if (!data) return null;
  const shockForm = forms.find((f) => f.data.dyno_kind === 'shock');
  const barForm = forms.find((f) => f.data.dyno_kind === 'bar');
  const chartRuns = selected.map((id) => data.byId[id]).filter(Boolean).map((r) => ({
    id: r.id, name: `${v(r, 'label') || 'Run'} · ${titleOf(data.byId[v(r, 'asset')])} · ${fmtDate(v(r, 'date'))}`, values: r.data.values,
    form: formFor(data, 'dyno_run', r.data.form_id),
  }));
  const category = kind === 'bar' ? 'Torsion Bar' : 'Shock';
  const toggle = (id) => setSel((selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]).slice(-6));

  return (
    <div>
      <PageHeader title="Shock & bar dyno" sub={setupId ? `Latest runs for the shocks/bars on ${titleOf(data.byId[setupId], data)}` : 'Overlay runs to compare valving, rebuilds and history'}>
        {canType('dyno_run', 'edit') && shockForm && <Link className="btn primary" to={`/r/dyno_run/new?form=${shockForm.id}${asset && kind === 'shock' ? `&asset=${asset}` : ''}`}>New shock run</Link>}
        {canType('dyno_run', 'edit') && barForm && <Link className="btn" to={`/r/dyno_run/new?form=${barForm.id}${asset && kind === 'bar' ? `&asset=${asset}` : ''}`}>New bar test</Link>}
      </PageHeader>
      <div className="tabs">
        <button type="button" className={kind === 'shock' ? 'active' : ''} onClick={() => { setKind('shock'); setAsset(''); setSel(null); setParams({}); }}>Shocks</button>
        <button type="button" className={kind === 'bar' ? 'active' : ''} onClick={() => { setKind('bar'); setAsset(''); setSel(null); setParams({ kind: 'bar' }); }}>Torsion bars</button>
      </div>
      <div className="toolbar">
        <select value={asset} onChange={(e) => { setAsset(e.target.value); setSel(null); }}>
          <option value="">All {kind === 'bar' ? 'bars' : 'shocks'}</option>
          {data.list('asset').filter((a) => v(a, 'category') === category).map((a) => <option key={a.id} value={a.id}>{titleOf(a)} — history</option>)}
        </select>
        {selected.length > 0 && <button type="button" className="btn ghost small" onClick={() => setSel([])}>Clear selection</button>}
      </div>
      {chartRuns.length > 0 && <DynoChart runs={chartRuns} />}
      {runs.length === 0 ? <Empty>No {kind === 'bar' ? 'torsion bar tests' : 'shock dyno runs'} yet.</Empty> : (
        <div className="card list">
          {runs.map((r) => {
            const rate = kind === 'bar' ? linearSlope(r.data.values?.data, 'x', 'load') : null;
            return (
              <div key={r.id} className={`list-row selectable${selected.includes(r.id) ? ' selected' : ''}`}>
                <input type="checkbox" aria-label="Overlay this run" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                <Link to={`/r/dyno_run/${r.id}`} className="grow">
                  <span className="row-title">{v(r, 'label') || 'Run'}</span>
                  <span className="row-sub">{[titleOf(data.byId[v(r, 'asset')]), v(r, 'purpose'), v(r, 'gas') && `${v(r, 'gas')} psi`].filter(Boolean).join(' · ')}</span>
                </Link>
                {rate ? <span className="row-meta"><b>{rate.toFixed(1)}</b> lb/in</span> : null}
                <span className="row-meta">{fmtDate(v(r, 'date'))}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ======================= Engines =======================
export function Engines() {
  const data = useTeamData();
  const { canType } = useSession();
  const nav = useNavigate();
  const [sel, setSel] = useState([]);
  if (!data) return null;
  const byAsset = setupsByAsset(data);
  const engines = data.list('asset').filter((a) => v(a, 'category') === 'Engine').sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  const builds = data.list('engine_build').slice().sort(byDateDesc);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-4)));
  return (
    <div>
      <PageHeader title="Engine builds" sub="Every build and freshen, per engine">
        <button type="button" className="btn" disabled={sel.length < 2} onClick={() => nav(`/compare?ids=${sel.join(',')}`)}>Compare builds{sel.length ? ` (${sel.length})` : ''}</button>
        {canType('asset', 'edit') && <Link className="btn ghost" to="/r/asset/new?category=Engine">New engine</Link>}
      </PageHeader>
      {engines.length === 0 && <Empty>Add your engines as assets (category “Engine”) to start recording builds.</Empty>}
      <div className="engine-grid">
        {engines.map((e) => {
          const mine = builds.filter((b) => v(b, 'engine') === e.id);
          const last = mine[0];
          const life = assetLife(e, data, byAsset);
          const lapsSince = last ? life.setups.filter((s) => (v(data.byId[v(s, 'event')], 'date') || '') > (v(last, 'date') || '')).reduce((a, s) => a + (num(v(s, 'laps')) || 0), 0) : life.laps;
          return (
            <section key={e.id} className="card engine-card">
              <div className="card-head">
                <div><h3 className="plain">{v(e, 'name')}</h3><span className="muted small">{[v(e, 'spec'), v(e, 'status')].filter(Boolean).join(' · ')}</span></div>
                {canType('engine_build', 'edit') && <Link className="btn small primary" to={`/r/engine_build/new?engine=${e.id}`}>New build</Link>}
              </div>
              <div className="stat-row">
                <div><b>{lapsSince}</b><small>laps since last build</small></div>
                <div><b>{mine.length}</b><small>builds</small></div>
                <div><b>{last ? (evalFormula(fieldDef(formFor(data, 'engine_build', last.data.form_id), 'cr')?.formula, last.data.values) ?? '—') : '—'}</b><small>compression</small></div>
              </div>
              {mine.length === 0 ? <p className="muted">No builds recorded.</p> : (
                <div className="list">
                  {mine.map((b) => (
                    <div key={b.id} className={`list-row selectable${sel.includes(b.id) ? ' selected' : ''}`}>
                      <input type="checkbox" aria-label="Select to compare" checked={sel.includes(b.id)} onChange={() => toggle(b.id)} />
                      <Link to={`/r/engine_build/${b.id}`} className="grow">
                        <span className="row-title">{v(b, 'build_type') || 'Build'}</span>
                        <span className="row-sub">{fmtDate(v(b, 'date'))}{v(b, 'builder') ? ` · ${memberName(v(b, 'builder'))}` : ''}{v(b, 'hp') ? ` · ${v(b, 'hp')} hp` : ''}</span>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ======================= Team: reports =======================
function resultsFor(setups) {
  const feats = setups.filter(isFeature);
  const fin = feats.map((s) => num(v(s, 'finish'))).filter((x) => x !== null);
  const st = feats.map((s) => num(v(s, 'start'))).filter((x) => x !== null);
  const gained = feats.map((s) => (num(v(s, 'start')) !== null && num(v(s, 'finish')) !== null ? num(v(s, 'start')) - num(v(s, 'finish')) : null)).filter((x) => x !== null);
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    events: new Set(setups.map((s) => v(s, 'event'))).size,
    sessions: setups.length,
    features: feats.length,
    wins: fin.filter((x) => x === 1).length,
    top5: fin.filter((x) => x <= 5).length,
    avgStart: avg(st), avgFinish: avg(fin), avgGained: avg(gained),
    laps: setups.reduce((a, s) => a + (num(v(s, 'laps')) || 0), 0),
  };
}
const f1 = (x) => (x === null || x === undefined ? '—' : x.toFixed(1));

export function Reports() {
  const data = useTeamData();
  const years = useMemo(() => (data ? [...new Set(data.list('event').map((e) => (v(e, 'date') || '').slice(0, 4)).filter(Boolean))].sort().reverse() : []), [data]);
  const [year, setYear] = useState('');
  if (!data) return null;
  const y = year || years[0] || String(new Date().getFullYear());
  const inYear = (d) => (d || '').startsWith(y);
  const setups = data.list('setup').filter((s) => inYear(v(data.byId[v(s, 'event')], 'date')));
  const cars = data.list('car');
  const carRows = cars.map((c) => ({ c, r: resultsFor(setups.filter((s) => v(s, 'car') === c.id)) }));
  const maint = cars.map((c) => {
    const logs = data.list('maintenance').filter((m) => v(m, 'car') === c.id && inYear(v(m, 'date')));
    const checks = data.list('track_check').filter((m) => v(m, 'car') === c.id && inYear(v(data.byId[v(m, 'event')], 'date')));
    return { c, weekly: logs.filter((m) => v(m, 'level') === 'weekly').length, race2: logs.filter((m) => v(m, 'level') === 'race2').length, monthly: logs.filter((m) => v(m, 'level') === 'monthly').length, checks: checks.length };
  });
  const spend = {};
  for (const t of ['asset', 'tire']) for (const r of data.list(t)) {
    if (!inYear(v(r, 'purchase_date'))) continue;
    const k = t === 'tire' ? 'Tires' : v(r, 'category') || 'Other';
    spend[k] = (spend[k] || 0) + (num(v(r, 'cost')) || 0);
  }
  const spendRows = Object.entries(spend).sort((a, b) => b[1] - a[1]);
  const total = spendRows.reduce((a, [, x]) => a + x, 0);

  return (
    <div>
      <PageHeader title="Reports" sub={`Season ${y}`}>
        <select value={y} onChange={(e) => setYear(e.target.value)}>{(years.length ? years : [y]).map((x) => <option key={x}>{x}</option>)}</select>
      </PageHeader>
      <Section title="Results by car" actions={<button type="button" className="btn ghost small" onClick={() => downloadCsv(`results-${y}`, ['Car', 'Events', 'Features', 'Wins', 'Top 5', 'Avg start', 'Avg finish', 'Avg gained', 'Laps'],
        carRows.map(({ c, r }) => [titleOf(c), r.events, r.features, r.wins, r.top5, f1(r.avgStart), f1(r.avgFinish), f1(r.avgGained), r.laps]))}>CSV</button>}>
        <div className="table-scroll"><table className="table">
          <thead><tr><th>Car</th><th>Events</th><th>Features</th><th>Wins</th><th>Top 5</th><th>Avg start</th><th>Avg finish</th><th>Gained</th><th>Laps</th></tr></thead>
          <tbody>{carRows.map(({ c, r }) => (
            <tr key={c.id}><td><b>{titleOf(c)}</b></td><td>{r.events}</td><td>{r.features}</td><td>{r.wins}</td><td>{r.top5}</td><td>{f1(r.avgStart)}</td><td>{f1(r.avgFinish)}</td>
              <td className={r.avgGained > 0 ? 'lvl-ok' : r.avgGained < 0 ? 'lvl-over' : ''}>{r.avgGained > 0 ? '+' : ''}{f1(r.avgGained)}</td><td>{r.laps}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="muted small">Feature results use sessions named “Feature” or “A-Main”. Gained = start − finish.</p>
      </Section>
      <div className="grid-2">
        <Section title="Maintenance completed" actions={<button type="button" className="btn ghost small" onClick={() => downloadCsv(`maintenance-${y}`, ['Car', 'Weekly', 'Every 2nd race', 'Monthly', 'Between-round checks'], maint.map((m) => [titleOf(m.c), m.weekly, m.race2, m.monthly, m.checks]))}>CSV</button>}>
          <table className="table">
            <thead><tr><th>Car</th><th>Weekly</th><th>2nd race</th><th>Monthly</th><th>Track checks</th></tr></thead>
            <tbody>{maint.map((m) => <tr key={m.c.id}><td><b>{titleOf(m.c)}</b></td><td>{m.weekly}</td><td>{m.race2}</td><td>{m.monthly}</td><td>{m.checks}</td></tr>)}</tbody>
          </table>
        </Section>
        <Section title="Spend by category" actions={<button type="button" className="btn ghost small" onClick={() => downloadCsv(`spend-${y}`, ['Category', 'Spend'], spendRows)}>CSV</button>}>
          {spendRows.length === 0 ? <p className="muted">No purchases with dates and costs this season.</p> : (
            <div className="bars">
              {spendRows.map(([k, x]) => (
                <div key={k} className="bar-row"><span>{k}</span><span className="bar"><i style={{ width: `${(x / spendRows[0][1]) * 100}%` }} /></span><b>${x.toLocaleString()}</b></div>
              ))}
              <div className="bar-row total"><span>Total</span><span /><b>${total.toLocaleString()}</b></div>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

export function CrewStats() {
  const data = useTeamData();
  const { canModule } = useSession();
  const [year, setYear] = useState('all');
  if (!data) return null;
  const years = [...new Set(data.list('event').map((e) => (v(e, 'date') || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const setups = data.list('setup').filter((s) => year === 'all' || (v(data.byId[v(s, 'event')], 'date') || '').startsWith(year));
  const ids = [...new Set(setups.map((s) => v(s, 'crew_chief')).filter(Boolean))];
  const reviews = canModule('reviews') ? data.list('review') : [];
  const rows = ids.map((id) => {
    const r = resultsFor(setups.filter((s) => v(s, 'crew_chief') === id));
    const rv = reviews.filter((x) => v(x, 'member') === id).map((x) => evalFormula(fieldDef(formFor(data, 'review', x.data.form_id), 'overall')?.formula, x.data.values)).filter((x) => x !== null);
    return { id, r, review: rv.length ? rv.reduce((a, b) => a + b, 0) / rv.length : null };
  }).sort((a, b) => (a.r.avgFinish ?? 99) - (b.r.avgFinish ?? 99));
  const unassigned = setups.filter((s) => !v(s, 'crew_chief')).length;

  return (
    <div>
      <PageHeader title="Crew Chief stats" sub="Results from the setup sheets each Crew Chief ran">
        <select value={year} onChange={(e) => setYear(e.target.value)}><option value="all">All seasons</option>{years.map((x) => <option key={x}>{x}</option>)}</select>
      </PageHeader>
      {rows.length === 0 ? <Empty>No setup sheets have a Crew Chief yet. New sheets default to the person filling them in.</Empty> : (
        <div className="card table-card">
          <table className="table">
            <thead><tr><th>Crew Chief</th><th>Events</th><th>Sheets</th><th>Features</th><th>Wins</th><th>Top 5</th><th>Avg start</th><th>Avg finish</th><th>Gained</th>{reviews.length > 0 && <th>Review avg</th>}</tr></thead>
            <tbody>{rows.map(({ id, r, review }) => (
              <tr key={id}>
                <td><b>{memberName(id)}</b></td><td>{r.events}</td><td>{r.sessions}</td><td>{r.features}</td><td>{r.wins}</td><td>{r.top5}</td>
                <td>{f1(r.avgStart)}</td><td><b>{f1(r.avgFinish)}</b></td>
                <td className={r.avgGained > 0 ? 'lvl-ok' : r.avgGained < 0 ? 'lvl-over' : ''}>{r.avgGained > 0 ? '+' : ''}{f1(r.avgGained)}</td>
                {reviews.length > 0 && <td>{review !== null ? `${review.toFixed(1)} / 5` : '—'}</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {unassigned > 0 && <p className="muted small">{unassigned} setup sheet{unassigned === 1 ? '' : 's'} have no Crew Chief recorded.</p>}
    </div>
  );
}

export function Reviews() {
  const data = useTeamData();
  const { canType } = useSession();
  const [member, setMember] = useState('');
  if (!data) return null;
  const rows = data.list('review').filter((r) => !member || v(r, 'member') === member).sort(byDateDesc);
  return (
    <div>
      <PageHeader title="Performance reviews" sub="Only roles with review access can see these">
        {canType('review', 'edit') && <Link className="btn primary" to={`/r/review/new${member ? `?member=${member}` : ''}`}>New review</Link>}
      </PageHeader>
      <div className="toolbar">
        <select value={member} onChange={(e) => setMember(e.target.value)}>
          <option value="">Everyone</option>{membersList().map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      {rows.length === 0 ? <Empty>No reviews yet.</Empty> : (
        <div className="card list">
          {rows.map((r) => {
            const overall = evalFormula(fieldDef(formFor(data, 'review', r.data.form_id), 'overall')?.formula, r.data.values);
            return (
              <Link key={r.id} to={`/r/review/${r.id}`} className="list-row">
                <span className="grow">
                  <span className="row-title">{memberName(v(r, 'member'))}{v(r, 'role_reviewed') ? <span className="muted"> · {v(r, 'role_reviewed')}</span> : null}</span>
                  <span className="row-sub">{fmtDate(v(r, 'date'))}{v(r, 'period') ? ` · ${v(r, 'period')}` : ''} · by {memberName(v(r, 'reviewer'))}</span>
                </span>
                {overall !== null && <Pill level={overall >= 4 ? 'ok' : overall >= 3 ? 'info' : 'warn'}>{overall.toFixed(1)} / 5</Pill>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
