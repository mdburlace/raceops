// Engine tunes (each engine's tune sheet, in versions, one marked active) and workshop engine checks (the
// between-race engine service, compared with the tune and the last check). Also the tune panel on setup
// sheets and workshop setups, and an engine builder's shared tunes on a linked engine.
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { CHECK_LIMITS, activeTune, compareCheck, engineIdOf, fuelRowFor, previousCheck, tuneFromPack, tuneToSheet, tunesFor } from '@shared/engineTune.js';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { allFields, fmtDate, formFor, memberName, titleOf, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { saveRecord } from '../lib/store.js';

const engines = (data) => data.list('asset').filter((a) => v(a, 'category') === 'Engine' && v(a, 'status') !== 'Retired')
  .sort((a, b) => titleOf(a).localeCompare(titleOf(b)));

/** Mark one version active and the engine's other versions not. */
export async function makeActive(tid, userId, data, tune) {
  for (const r of tunesFor(data.list('engine_tune'), v(tune, 'engine'))) {
    const want = r.id === tune.id;
    if (!!v(r, 'active') !== want) await saveRecord(tid, 'engine_tune', r.id, { ...r.data, values: { ...r.data.values, active: want } }, userId);
  }
}

const chartRows = (tv) => (tv.fuel_chart || []).filter((r) => r.main || r.hs || r.hs_psi);
const hsText = (r) => [r.hs_psi && `${r.hs_psi} psi`, r.hs].filter(Boolean).join(' / ') || '—';

function chartText(tv) {
  const rows = chartRows(tv);
  return rows.length ? `${rows.length} weather band${rows.length === 1 ? '' : 's'} by ${tv.fuel_by === 'Density altitude' ? 'density altitude' : 'ADR'}` : 'No pill settings yet';
}

/** Engine Builds → Engine tunes: one card per engine with its versions. */
export function EngineTunes() {
  const data = useTeamData();
  const { tid, user, canType } = useSession();
  if (!data) return null;
  const tunes = data.list('engine_tune');
  const canEdit = canType('engine_tune', 'edit');
  const list = engines(data);
  return (
    <div>
      <PageHeader title="Engine tunes" sub="How each engine should be run: pill settings for the weather, the ending tune and the fuel system">
        {canType('asset', 'edit') && <Link className="btn ghost" to="/r/asset/new?category=Engine">New engine</Link>}
      </PageHeader>
      {!list.length && <Empty>Add your engines as assets (category “Engine”) first.</Empty>}
      <div className="engine-grid">
        {list.map((e) => {
          const mine = tunesFor(tunes, e.id);
          const act = activeTune(tunes, e.id);
          return (
            <section key={e.id} className="card engine-card" data-testid="tune-engine">
              <div className="card-head">
                <div><h3 className="plain">{v(e, 'name')}</h3><span className="muted small">{act ? `Running ${v(act, 'name')}` : 'No tune yet'}</span></div>
                {canEdit && <Link className="btn small primary" to={`/r/engine_tune/new?engine=${e.id}`}>{mine.length ? 'New version' : 'New tune'}</Link>}
              </div>
              {act && (
                <dl className="pack-specs small">
                  <div><dt>Pill settings</dt><dd>{chartText(act.data.values)}</dd></div>
                  {v(act, 'timing') && <div><dt>Timing</dt><dd>{v(act, 'timing')}</dd></div>}
                  {v(act, 'plugs') && <div><dt>Plugs</dt><dd>{v(act, 'plugs')}{v(act, 'plug_gap') ? ` @ ${v(act, 'plug_gap')} in` : ''}</dd></div>}
                  {(v(act, 'lash_int') || v(act, 'lash_exh')) && <div><dt>Lash</dt><dd>I {v(act, 'lash_int') || '—'} / E {v(act, 'lash_exh') || '—'}{v(act, 'lash_when') ? ` (${v(act, 'lash_when').toLowerCase()})` : ''}</dd></div>}
                </dl>
              )}
              {mine.length > 0 && (
                <div className="list">
                  {mine.map((t) => (
                    <div key={t.id} className="list-row static" data-testid="tune-row">
                      <Link className="grow" to={`/r/engine_tune/${t.id}`}>
                        <span className="row-title">{v(t, 'name') || 'Tune'}{t.id === act?.id && <Pill level="ok">active</Pill>}</span>
                        <span className="row-sub">{[fmtDate(v(t, 'date')), v(t, 'source') === 'Engine builder' ? `from ${v(t, 'builder') || 'the engine builder'}` : 'our tune'].filter(Boolean).join(' · ')}</span>
                      </Link>
                      {canEdit && t.id !== act?.id && <button type="button" className="btn small ghost" onClick={() => makeActive(tid, user.id, data, t)}>Make active</button>}
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

/** Under a tune in the editor: the engine's other versions. */
export function TuneVersions({ rec, values }) {
  const data = useTeamData();
  const { tid, user, canType } = useSession();
  if (!data || !rec) return null;
  const mine = tunesFor(data.list('engine_tune'), values.engine);
  const act = activeTune(data.list('engine_tune'), values.engine);
  return (
    <Section title="Versions of this engine’s tune" className="tune-versions">
      {act?.id !== rec.id && <div className="notice small">This isn’t the active version. Setup sheets use <b>{v(act, 'name')}</b>.</div>}
      <div className="list">
        {mine.map((t) => (
          <div key={t.id} className={`list-row static${t.id === rec.id ? ' selected' : ''}`}>
            <Link className="grow" to={`/r/engine_tune/${t.id}`}><span className="row-title">{v(t, 'name') || 'Tune'}{t.id === act?.id && <Pill level="ok">active</Pill>}</span>
              <span className="row-sub">{fmtDate(v(t, 'date'))}</span></Link>
            {canType('engine_tune', 'edit') && t.id !== act?.id && <button type="button" className="btn small ghost" onClick={() => makeActive(tid, user.id, data, t)}>Make active</button>}
          </div>
        ))}
      </div>
      {canType('engine_tune', 'edit') && <p className="small"><Link to={`/r/engine_tune/new?engine=${values.engine}`}>New version</Link> starts from the newest version.</p>}
    </Section>
  );
}

/** The jetting chart, with the row for the weather marked. */
function Chart({ tv, match }) {
  const rows = chartRows(tv);
  if (!rows.length) return <p className="muted small">This tune has no pill settings yet.</p>;
  const unit = tv.fuel_by === 'Density altitude' ? (tv.da_unit === 'm' ? 'm' : 'ft') : '%';
  return (
    <table className="ps-table small tune-chart">
      <thead><tr><th>{tv.fuel_by === 'Density altitude' ? `Density altitude (${unit})` : 'ADR %'}</th><th>Main pill</th><th>H/S psi</th><th>H/S pill</th><th>Note</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className={match?.row === r ? `hit${match.exact ? '' : ' near'}` : ''} data-testid={match?.row === r ? 'tune-row-match' : undefined}>
          <td>{[r.from, r.to].filter((x) => x !== undefined && x !== '').join(' – ')}</td><td>{r.main}</td><td>{r.hs_psi}</td><td>{r.hs}</td><td>{r.note}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

/**
 * On a setup sheet (type 'setup') or workshop setup ('shop_setup'), in the Engine section: the motor's tune,
 * and on a setup sheet the jetting for the session's ADR or density altitude, with a button to fill it in.
 */
export function TunePanel({ type, form, values, setValues, readOnly, units }) {
  const data = useTeamData();
  const { canType } = useSession();
  if (!data || !canType('engine_tune', 'view')) return null;
  const eid = engineIdOf(values.engine);
  if (!eid) return <p className="muted small tune-panel">Pick the motor to see its tune.</p>;
  const tunes = data.list('engine_tune');
  const act = activeTune(tunes, eid);
  const tune = (values.engine_tune && data.byId[values.engine_tune]) || act;
  if (!tune) {
    return (
      <div className="tune-panel muted small" data-testid="tune-panel">No tune for this motor yet.{canType('engine_tune', 'edit') && <> <Link to={`/r/engine_tune/new?engine=${eid}`}>Add its tune</Link>.</>}</div>
    );
  }
  const tv = tune.data.values || {};
  const keys = new Set(allFields(form).map((f) => f.key));
  const match = type === 'setup' ? fuelRowFor(tv, { adr: values.adr, alt: values.alt, altUnit: units === 'metric' ? 'm' : 'ft' }) : null;
  const fill = Object.fromEntries(Object.entries(tuneToSheet(tv, type === 'setup' ? match?.row : null)).filter(([k]) => keys.has(k)));
  const reading = match ? (match.unit === '%' ? `ADR ${match.value}%` : `density altitude ${Math.round(match.value)} ${match.unit}`) : '';
  const same = Object.entries(fill).every(([k, x]) => String(values[k] ?? '') === x) && values.engine_tune === tune.id;
  return (
    <div className="tune-panel" data-testid="tune-panel">
      <div className="inline-row wrap">
        <div className="grow tune-head"><span>Engine tune:</span> <Link to={`/r/engine_tune/${tune.id}`}><b>{v(tune, 'name') || 'Tune'}</b></Link>
          {tune.id === act?.id ? <Pill level="ok">active</Pill> : <Pill level="warn">not the active version</Pill>}
          {v(tune, 'source') === 'Engine builder' && <span className="muted small">from {v(tune, 'builder') || 'the engine builder'}</span>}</div>
        {!readOnly && Object.keys(fill).length > 0 && (
          <button type="button" className="btn small" disabled={same} onClick={() => setValues((s) => ({ ...s, ...fill, engine_tune: tune.id }))}>
            {type === 'setup' ? (match?.row ? 'Use this jetting' : 'Fill fuel system from the tune') : 'Fill timing & fuel system from the tune'}
          </button>
        )}
      </div>
      {type === 'setup' && (
        <>
          <p className="small" data-testid="tune-advice">{!match
            ? `Enter the ${tv.fuel_by === 'Density altitude' ? 'density altitude (ALT)' : 'ADR'} in Weather, or pull the weather, to pick the jetting.`
            : match.exact ? <>For {reading}: <b>main pill {match.row.main || '—'}</b>, <b>high-speed {hsText(match.row)}</b>.</>
              : <>{reading} is outside the chart. Nearest row: main pill {match.row.main || '—'}, high-speed {hsText(match.row)}. Check with your engine builder.</>}</p>
          <Chart tv={tv} match={match} />
        </>
      )}
      <p className="muted small">{[tv.timing && `Timing ${tv.timing}`, tv.plugs && `plugs ${tv.plugs}${tv.plug_gap ? ` @ ${tv.plug_gap} in` : ''}`,
        (tv.ls_psi || tv.ls_pill) && `low speed ${[tv.ls_psi && `${tv.ls_psi} psi`, tv.ls_pill].filter(Boolean).join(' / ')}`,
        (tv.nozzles_down || tv.nozzles_up) && `nozzles ${[tv.nozzles_down && `${tv.nozzles_down} down`, tv.nozzles_up && `${tv.nozzles_up} up`].filter(Boolean).join(', ')}`].filter(Boolean).join(' · ')}</p>
    </div>
  );
}

// ---------------------------------------------------------------- engine checks

/** In the Workshop → Engine checks: each engine's checks, newest first, with anything flagged. */
export function EngineCheckList() {
  const data = useTeamData();
  const { canType } = useSession();
  if (!data) return null;
  const checks = data.list('engine_check');
  const tunes = data.list('engine_tune');
  const list = engines(data);
  return (
    <div>
      <PageHeader title="Engine checks" sub="The engine service between races: leak-down, lash, springs, plugs, fuel system, oil and torque" />
      {!list.length && <Empty>Add your engines as assets (category “Engine”) first.</Empty>}
      {list.map((e) => {
        const mine = checks.filter((c) => v(c, 'engine') === e.id).sort((a, b) => String(v(b, 'date')).localeCompare(String(v(a, 'date'))));
        return (
          <Section key={e.id} title={v(e, 'name')} actions={<div className="inline-row">
            <Link className="btn small ghost" to={`/print/engine-check/blank?engine=${e.id}`}>Print blank</Link>
            {canType('engine_check', 'edit') && <Link className="btn small primary" to={`/r/engine_check/new?engine=${e.id}`}>New engine check</Link>}
          </div>}>
            {!mine.length ? <p className="muted">No checks yet.</p> : (
              <div className="list">
                {mine.map((c) => {
                  const cmp = compareCheck(c.data.values, data.byId[v(c, 'engine_tune')]?.data.values || activeTune(tunes, e.id)?.data.values, previousCheck(checks, e.id, c)?.data.values);
                  const bad = cmp.flags.filter((f) => f.level === 'over').length;
                  return (
                    <Link key={c.id} className="list-row" to={`/r/engine_check/${c.id}`} data-testid="engine-check-row">
                      <span className="grow"><span className="row-title">{fmtDate(v(c, 'date')) || 'Engine check'}</span>
                        <span className="row-sub">{[v(c, 'checked_by') && memberName(v(c, 'checked_by')), v(c, 'signed_off') ? 'signed off' : 'not signed off', v(c, 'parts_needed') && 'parts needed'].filter(Boolean).join(' · ')}</span></span>
                      {cmp.flags.length ? <Pill level={bad ? 'over' : 'warn'}>{cmp.flags.length} to look at</Pill> : <Pill level="ok">all good</Pill>}
                    </Link>
                  );
                })}
              </div>
            )}
          </Section>
        );
      })}
    </div>
  );
}

const fmtN = (x) => (x === null || x === undefined ? '' : String(x));

/** Under an engine check: its readings against the tune and the engine's last check. */
export function CheckCompare({ rec, values }) {
  const data = useTeamData();
  if (!data || !values.engine) return null;
  const tune = data.byId[values.engine_tune] || activeTune(data.list('engine_tune'), values.engine);
  const me = rec || { id: null, created_at: null, data: { values } };
  const prev = previousCheck(data.list('engine_check'), values.engine, { ...me, data: { ...me.data, values } });
  const { cylinders, flags } = compareCheck(values, tune?.data.values, prev?.data.values);
  const tv = tune?.data.values || {};
  const cell = (x, extra) => <td className={x.level ? `cmp-${x.level}` : ''}>{fmtN(x.now) || '—'}{extra}</td>;
  return (
    <Section title="Compared with the tune and the last check" className="check-compare">
      <p className="muted small" data-testid="check-compare-against">
        Tune: {tune ? <Link to={`/r/engine_tune/${tune.id}`}>{v(tune, 'name')}</Link> : 'none'} · Last check: {prev ? <Link to={`/r/engine_check/${prev.id}`}>{fmtDate(v(prev, 'date'))}</Link> : 'none (this is the first)'}
      </p>
      {flags.length ? (
        <ul className="check-flags" data-testid="check-flags">{flags.map((f, i) => <li key={i} className={`cmp-${f.level}`}>{f.text}</li>)}</ul>
      ) : <p className="small" data-testid="check-flags-none">Nothing out of line.</p>}
      <div className="table-scroll">
        <table className="ps-table small cmp-table" data-testid="check-compare">
          <thead>
            <tr><th>Cyl</th><th>Leak-down %</th><th>was</th><th>Lash I{tv.lash_int ? ` (${tv.lash_int})` : ''}</th><th>Lash E{tv.lash_exh ? ` (${tv.lash_exh})` : ''}</th>
              <th>Spring I{tv.spring_int ? ` (${tv.spring_int})` : ''}</th><th>was</th><th>Spring E{tv.spring_exh ? ` (${tv.spring_exh})` : ''}</th><th>was</th><th>Plug</th></tr>
          </thead>
          <tbody>
            {cylinders.map((r) => (
              <tr key={r.cyl}>
                <td>{r.cyl}</td>{cell(r.leak)}<td className="muted">{fmtN(r.leak.was)}</td>{cell(r.lash_int)}{cell(r.lash_exh)}
                {cell(r.spring_int, r.spring_int.drop !== null && r.spring_int.drop > 0 ? <small> −{r.spring_int.drop.toFixed(0)}%</small> : null)}<td className="muted">{fmtN(r.spring_int.was)}</td>
                {cell(r.spring_exh, r.spring_exh.drop !== null && r.spring_exh.drop > 0 ? <small> −{r.spring_exh.drop.toFixed(0)}%</small> : null)}<td className="muted">{fmtN(r.spring_exh.was)}</td>
                <td>{r.plug}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Flagged: leak-down of {CHECK_LIMITS.leakHigh}% or more, or up {CHECK_LIMITS.leakRise} points since the last check; lash more than {CHECK_LIMITS.lash} in off the tune;
        a spring {CHECK_LIMITS.springDropPct}% or more down on the last check, or {CHECK_LIMITS.springBelowSpecPct}% under the tune; plugs not reading good.</p>
    </Section>
  );
}

// ---------------------------------------------------------------- tunes from the engine builder

/** On a linked engine: the builder's shared tunes, and copying one into the team's tunes. */
export function BuilderTunes({ link }) {
  const data = useTeamData();
  const { tid, user, canType } = useSession();
  const [msg, setMsg] = useState('');
  const tunes = link?.pack?.tunes || [];
  if (!tunes.length || !data) return null;
  const ours = data.list('engine_tune').filter((r) => v(r, 'engine') === link.team_asset_id);
  const copyOf = (t) => ours.find((r) => v(r, 'builder_tune') === t.id);
  const canEdit = canType('engine_tune', 'edit') && link.status === 'active';
  const use = async (t) => {
    const values = tuneFromPack(t, { engineId: link.team_asset_id, shop: link.shop });
    const existing = copyOf(t);
    const saved = await saveRecord(tid, 'engine_tune', existing?.id || null, { ...(existing?.data || {}), values: { ...(existing?.data.values || {}), ...values } }, user.id);
    await makeActive(tid, user.id, { list: (type) => (type === 'engine_tune' ? [...ours.filter((r) => r.id !== saved.id), saved] : []) }, saved);
    setMsg(`${t.name || 'Tune'} is now your active tune for this engine.`);
  };
  return (
    <Section title={`Engine tunes from ${link.shop}`} className="builder-tunes">
      {msg && <div className="notice info small" role="status">{msg}</div>}
      <div className="list">
        {tunes.map((t) => {
          const c = copyOf(t);
          const newer = c && t.updated_at && v(c, 'builder_updated') && String(t.updated_at) > String(v(c, 'builder_updated'));
          return (
            <div key={t.id} className="list-row static" data-testid="builder-tune">
              <span className="grow"><span className="row-title">{t.name || 'Tune'}{t.active && <Pill level="info">builder’s current</Pill>}</span>
                <span className="row-sub">{[fmtDate(t.date), chartText(t.values || {}), c ? (newer ? 'updated since you copied it' : 'in your tunes') : ''].filter(Boolean).join(' · ')}</span></span>
              {c && <Link className="btn small ghost" to={`/r/engine_tune/${c.id}`}>Open ours</Link>}
              {canEdit && (!c || newer) && <button type="button" className="btn small" onClick={() => use(t)}>{c ? 'Update ours' : 'Use this tune'}</button>}
            </div>
          );
        })}
      </div>
      <p className="muted small">Using a tune copies it into your engine tunes (Engine Builds → Engine tunes) as the active version, so it’s on hand at the track without a connection.</p>
    </Section>
  );
}

// ---------------------------------------------------------------- printing

const dash = (x) => (x === undefined || x === null || x === '' ? '' : String(x));
const Line = ({ label, children }) => <div><dt>{label}</dt><dd>{children}</dd></div>;

/** A tune sheet to print or save as a PDF, laid out like an engine builder's tune sheet. */
export function TunePrint() {
  const { id } = useParams();
  const nav = useNavigate();
  const data = useTeamData();
  const { membership } = useSession();
  if (!data) return <p className="pad muted">Loading…</p>;
  const t = data.byId[id];
  if (!t || t.type !== 'engine_tune') return <p className="pad">Tune not found.</p>;
  const tv = t.data.values || {};
  const engine = data.byId[tv.engine];
  const build = data.byId[tv.build];
  const bv = build?.data?.values || {};
  const rows = (tv.fuel_chart || []).filter((r) => r.from || r.to || r.main || r.hs || r.hs_psi);
  const unit = tv.fuel_by === 'Density altitude' ? `Density altitude (${tv.da_unit === 'm' ? 'm' : 'ft'})` : 'ADR %';
  return (
    <div className="print-page">
      <div className="print-tools no-print">
        <button type="button" className="btn ghost" onClick={() => nav(-1)}>‹ Back</button>
        <button type="button" className="btn primary" onClick={() => window.print()}>Print / save as PDF</button>
      </div>
      <article className="print-sheet tune-print" data-testid="tune-print">
        <header className="ps-head">
          <div><h1>{membership?.tenant_name}</h1><p className="muted">Engine tune sheet</p></div>
          <div className="ps-meta"><b>{tv.name}</b><span>{fmtDate(tv.date)}</span><span>{tv.active ? 'Active version' : 'Not the active version'}</span></div>
        </header>
        <dl className="ps-specs">
          <Line label="Engine">{engine ? titleOf(engine) : ''}</Line>
          <Line label="Engine type">{dash(v(engine, 'model'))}</Line>
          <Line label="Injection / induction">{dash(tv.induction)}</Line>
          <Line label="Bore">{dash(bv.bore)}{bv.bore ? ' in' : ''}</Line>
          <Line label="Stroke">{dash(bv.stroke)}{bv.stroke ? ' in' : ''}</Line>
          <Line label="From">{tv.source === 'Engine builder' ? (tv.builder || 'Engine builder') : 'Our team'}</Line>
        </dl>
        <section><h3>Pill settings</h3>
          <table className="ps-table"><thead><tr><th>{unit}</th><th>Main pill</th><th>H/S pressure (psi)</th><th>H/S pill</th><th>Note</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{[r.from, r.to].filter((x) => x !== undefined && x !== '').join('–')}</td><td>{r.main}</td><td>{r.hs_psi}</td><td>{r.hs}</td><td>{r.note}</td></tr>)}</tbody>
          </table>
        </section>
        <section><h3>Engine tune-up information</h3>
          <dl className="ps-specs">
            <Line label="Spark plug">{dash(tv.plugs)}</Line>
            <Line label="Gap (in)">{dash(tv.plug_gap)}</Line>
            <Line label={`Valve lash${tv.lash_when ? ` (${tv.lash_when.toLowerCase()})` : ''}`}>I {dash(tv.lash_int) || '—'} / E {dash(tv.lash_exh) || '—'}</Line>
            <Line label="Spring tension (lb)">I {dash(tv.spring_int) || '—'} / E {dash(tv.spring_exh) || '—'}</Line>
            <Line label="Springs">{dash(tv.springs)}</Line>
            <Line label="Timing">{dash(tv.timing)}</Line>
            <Line label="Ram tube length">{dash(tv.ram_tube)}</Line>
            <Line label="Oil level">{dash(tv.oil_level)}</Line>
            <Line label="Oil">{dash(tv.oil_type)}</Line>
          </dl>
        </section>
        <section><h3>Fuel system</h3>
          <dl className="ps-specs">
            <Line label="Fuel pump">{dash(tv.fuel_pump)}</Line>
            <Line label="Metering block">{dash(tv.metering_block)}{tv.metering_block ? '%' : ''}</Line>
            <Line label="Low speed">{[tv.ls_psi && `${tv.ls_psi} psi`, tv.ls_pill && `pill ${tv.ls_pill}`].filter(Boolean).join(' / ')}</Line>
            <Line label="High speed">{dash(tv.hs_type)}</Line>
            <Line label="Nozzles">{[tv.nozzles_down && `${tv.nozzles_down} down`, tv.nozzles_up && `${tv.nozzles_up} up`].filter(Boolean).join(' / ')}</Line>
          </dl>
        </section>
        {(tv.valve_procedure || tv.rocker_stud || tv.rocker_stand) && (
          <section><h3>Adjustment reference</h3>
            {tv.valve_procedure && <p className="pre">{tv.valve_procedure}</p>}
            <dl className="ps-specs">
              <Line label="Rocker stud">{[tv.rocker_stud, tv.rocker_stud_torque && `${tv.rocker_stud_torque} lb-ft`].filter(Boolean).join(' · ')}</Line>
              <Line label="Rocker stand bolt">{[tv.rocker_stand, tv.rocker_stand_torque && `${tv.rocker_stand_torque} lb-ft`].filter(Boolean).join(' · ')}</Line>
            </dl>
          </section>
        )}
        <section><h3>Notes / changes / run results</h3><p className="pre">{tv.notes || ' '}</p></section>
        <section className="ps-grid">
          <div><h3>Prepared by</h3><p>{dash(tv.prepared_by)}</p></div>
          <div><h3>Session / run reference</h3><p>{dash(tv.run_ref)}</p></div>
        </section>
      </article>
    </div>
  );
}

const box = (on) => (on ? '☑' : '☐');

/** An engine check to print: filled in, or blank (with the tune's figures) to take to the bench. */
export function CheckPrint() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const data = useTeamData();
  const { membership } = useSession();
  if (!data) return <p className="pad muted">Loading…</p>;
  const blank = id === 'blank';
  const rec = blank ? null : data.byId[id];
  if (!blank && (!rec || rec.type !== 'engine_check')) return <p className="pad">Engine check not found.</p>;
  const cv = rec?.data.values || {};
  const engineId = blank ? params.get('engine') : cv.engine;
  const engine = data.byId[engineId];
  const tune = data.byId[cv.engine_tune] || (engineId ? activeTune(data.list('engine_tune'), engineId) : null);
  const tv = tune?.data.values || {};
  const form = formFor(data, 'engine_check', rec?.data.form_id);
  const cyls = ['#1', '#3', '#5', '#7', '#2', '#4', '#6', '#8'];
  const perCyl = (key, label, spec) => (
    <tr><th>{label}{spec ? <small> ({spec})</small> : null}</th>{cyls.map((c) => <td key={c}>{dash(cv[key]?.[c])}</td>)}</tr>
  );
  return (
    <div className="print-page">
      <div className="print-tools no-print">
        <button type="button" className="btn ghost" onClick={() => nav(-1)}>‹ Back</button>
        <button type="button" className="btn primary" onClick={() => window.print()}>Print / save as PDF</button>
      </div>
      <article className="print-sheet check-print" data-testid="check-print">
        <header className="ps-head">
          <div><h1>{membership?.tenant_name}</h1><p className="muted">Workshop engine check</p></div>
          <div className="ps-meta"><b>{engine ? titleOf(engine) : 'Engine'}</b><span>{blank ? 'Date: ____________' : fmtDate(cv.date)}</span><span>Tune: {tune ? v(tune, 'name') : '—'}</span></div>
        </header>
        <section><h3>Engine health {cv.leakdown_temp ? `(leak-down ${cv.leakdown_temp.toLowerCase()})` : ''}</h3>
          <table className="ps-table cyl-table">
            <thead><tr><th />{cyls.map((c) => <th key={c}>Cyl {c.slice(1)}</th>)}</tr></thead>
            <tbody>
              {perCyl('leakdown', 'Leak-down %')}
              {perCyl('lash_int', 'Lash intake', tv.lash_int && `${tv.lash_int}${tv.lash_when ? ` ${tv.lash_when.toLowerCase()}` : ''}`)}
              {perCyl('lash_exh', 'Lash exhaust', tv.lash_exh)}
              {perCyl('spring_int', 'Spring intake lb', tv.spring_int)}
              {perCyl('spring_exh', 'Spring exhaust lb', tv.spring_exh)}
              {perCyl('plug_read', 'Plug reading')}
            </tbody>
          </table>
          <p>Plug gap verified at: <b>{dash(cv.plug_gap) || '______'}</b>{tv.plug_gap ? ` (tune ${tv.plug_gap} in)` : ''}
            {' · '}Main bypass pill: <b>{dash(cv.bypass_pill) || '______'}</b>{tv.ls_pill ? ` (tune ${tv.ls_pill})` : ''}</p>
        </section>
        {(form?.data?.sections || []).filter((sec) => !['check', 'health', 'signoff'].includes(sec.id)).map((sec) => (
          <section key={sec.id}><h3>{sec.title}</h3>
            <ul className="ps-checks">
              {sec.fields.map((f) => (f.type === 'check'
                ? <li key={f.key}>{box(!!cv[f.key])} {f.label}</li>
                : <li key={f.key}>{f.label}: <b>{dash(cv[f.key]) || (f.options ? f.options.map((o) => `☐ ${o}`).join('  ') : '__________')}</b></li>))}
            </ul>
          </section>
        ))}
        <section className="ps-grid">
          <div><h3>Checked by</h3><p>{cv.checked_by ? memberName(cv.checked_by) : '______________________'}</p></div>
          <div><h3>Sign-off</h3><p>{cv.signed_off ? memberName(cv.signed_off) : '______________________'}</p></div>
        </section>
        <section><h3>Notes / parts required for the next race</h3><p className="pre">{[cv.parts_needed, cv.notes].filter(Boolean).join('\n\n') || '\n\n\n'}</p></section>
      </article>
    </div>
  );
}
