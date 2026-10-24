// Engine teardown & pre-check: findings under each part of the sheet, the summary (likely causes and the
// suggested reuse / machine / replace for each part), and the link between a teardown and its rebuild sheet.
import { Link } from 'react-router-dom';
import { applySuggestions, boreMap, teardownBefore, teardownFindings } from '@shared/engineTeardown.js';
import { fmtDate, titleOf, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

const CLS = { bad: 'cmp-over', warn: 'cmp-warn' };
const f4 = (x) => (x === null || x === undefined ? '—' : x.toFixed(4));

function FindingList({ items, testid }) {
  if (!items.length) return null;
  return <ul className="check-flags" data-testid={testid}>{items.map((f, i) => <li key={i} className={CLS[f.level]}>{f.text}</li>)}</ul>;
}

/** The findings for one part of the sheet, shown at the end of that section. */
export function TeardownSection({ section, values, data }) {
  const build = data?.byId[values.build];
  const { items } = teardownFindings(values, build);
  const mine = items.filter((f) => f.section === section);
  const bores = section === 'rotating' ? boreMap(values.bores) : [];
  if (!mine.length && !bores.length) return null;
  return (
    <div className="teardown-findings" data-testid={`teardown-${section}`}>
      {bores.length > 0 && (
        <div className="table-scroll">
          <table className="ps-table small cmp-table" data-testid="bore-map">
            <thead><tr><th>Cyl</th>{bores.map((b) => <th key={b.cyl}>{b.cyl}</th>)}</tr></thead>
            <tbody>
              <tr><th>Taper</th>{bores.map((b) => <td key={b.cyl} className={b.taper !== null && values.bore_taper_max && b.taper > Number(values.bore_taper_max) ? 'cmp-over' : ''}>{f4(b.taper)}</td>)}</tr>
              <tr><th>Out-of-round</th>{bores.map((b) => <td key={b.cyl} className={b.oor !== null && values.bore_oor_max && b.oor > Number(values.bore_oor_max) ? 'cmp-over' : ''}>{f4(b.oor)}</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
      <FindingList items={mine} />
    </div>
  );
}

/** Everything found, the likely causes, and the suggested decision for each part (Findings & decisions). */
export function TeardownSummary({ rec, values, readOnly, setValues, data }) {
  const { canType } = useSession();
  const build = data?.byId[values.build];
  const { items, suggest, causes, unset } = teardownFindings(values, build);
  const bad = items.filter((f) => f.level === 'bad').length;
  const warn = items.length - bad;
  const parts = Array.isArray(values.parts) ? values.parts : [];
  const pending = Object.entries(suggest).filter(([part]) => !parts.some((r) => String(r.part || '').toLowerCase() === part.toLowerCase() && r.decision));
  const rebuilds = rec ? data.list('engine_build').filter((b) => v(b, 'teardown') === rec.id) : [];
  return (
    <div className="teardown-summary" data-testid="teardown-summary">
      <p className="small" data-testid="teardown-count">
        {items.length ? <><b>{bad}</b> over a limit or failed · <b>{warn}</b> to watch</> : 'Nothing out of line in the readings so far.'}
        {build ? <> · Build torn down: <Link to={`/r/engine_build/${build.id}`}>{titleOf(build, data)} · {fmtDate(v(build, 'date'))}</Link></> : null}
      </p>
      {causes.length > 0 && (
        <div data-testid="teardown-causes">
          <b className="small">What the evidence points to</b>
          <ul className="small">
            {causes.map((c) => <li key={c.cause}><b>{c.cause}</b> — {c.evidence.join('; ')}</li>)}
          </ul>
        </div>
      )}
      {Object.keys(suggest).length > 0 && (
        <div data-testid="teardown-suggest">
          <b className="small">Suggested from the measurements</b>
          <ul className="small">
            {Object.entries(suggest).map(([part, s]) => <li key={part}><b>{part}: {s.decision}</b> — {s.why.join('; ')}</li>)}
          </ul>
          {!readOnly && pending.length > 0 && (
            <button type="button" className="btn small" onClick={() => setValues((x) => ({ ...x, parts: applySuggestions(x.parts, suggest) }))}>
              Fill in {pending.length} suggested decision{pending.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}
      {unset.length > 0 && <p className="muted small" data-testid="teardown-unset">No limit or new-part figure yet for: {unset.join(', ')}. Add them under <b>Limits &amp; new-part baseline</b> to check these readings.</p>}
      {rec && (
        <p className="small inline-row wrap">
          {rebuilds.map((b) => <Link key={b.id} to={`/r/engine_build/${b.id}`} data-testid="teardown-rebuild">Rebuild sheet · {fmtDate(v(b, 'date'))}</Link>)}
          {canType('engine_build', 'edit') && !rebuilds.length && (
            <Link className="btn small primary" data-testid="start-rebuild"
              to={`/r/engine_build/new?engine=${values.engine}&build_type=Rebuild&teardown=${rec.id}${values.engine_laps ? `&engine_laps=${encodeURIComponent(values.engine_laps)}` : ''}`}>Start the rebuild sheet</Link>
          )}
        </p>
      )}
    </div>
  );
}

/** On a build sheet: the teardown that came before it. */
export function BuildTeardown({ rec, values }) {
  const data = useTeamData();
  if (!data || !values.engine) return null;
  const me = { id: rec?.id || null, data: { values } };
  const td = teardownBefore(data.list('engine_teardown'), me);
  if (!td) return null;
  const { items } = teardownFindings(td.data.values, data.byId[v(td, 'build')]);
  const bad = items.filter((f) => f.level === 'bad').length;
  return (
    <section className="card" data-testid="build-teardown">
      <div className="card-head"><h3>Teardown before this build</h3></div>
      <p className="small">
        <Link to={`/r/engine_teardown/${td.id}`}>Teardown · {fmtDate(v(td, 'date'))}</Link>
        {v(td, 'root_cause') ? <> · Root cause: <b>{v(td, 'root_cause')}</b></> : null}
        {` · ${bad} finding${bad === 1 ? '' : 's'} over a limit`}
      </p>
      {(v(td, 'parts') || []).some((r) => r.decision && r.decision !== 'Reuse') && (
        <p className="small">{(v(td, 'parts') || []).filter((r) => r.decision && r.decision !== 'Reuse').map((r) => `${r.part}: ${r.decision.toLowerCase()}`).join(' · ')}</p>
      )}
      {v(td, 'tuning') ? <p className="small pre"><b>Tuning limits:</b> {v(td, 'tuning')}</p> : null}
    </section>
  );
}
