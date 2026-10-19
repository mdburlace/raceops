// The initial measurement (at purchase or first build) of a shock or bar: a note on each run that
// says how it compares, and a warning when another run is already marked as the initial one.
import { shockFade } from '@shared/analytics.js';
import { initialRun } from '@shared/dyno.js';
import { fmtDate, v } from '../lib/data.js';

const pct = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}%`);
const runsOf = (data) => data.list('dyno_run').map((r) => ({ id: r.id, values: r.data.values || {} }));

/** Shock run: force against the initial run, at about 5 in/s. */
export function ShockVsInitial({ data, id, values }) {
  if (!values.asset) return null;
  if (values.initial) return <p className="muted small" data-testid="vs-initial">This run is the shock’s initial measurement — later runs are compared with it.</p>;
  const init = initialRun(runsOf(data), values.asset, id);
  if (!init) return <p className="muted small" data-testid="vs-initial">No initial measurement marked for this shock yet. Tick <b>Initial measurement</b> on its first run (at purchase or first build) to compare.</p>;
  // adjustable shocks: compare each adjuster setting with the same setting in the initial run
  const sweep = (vv) => (Array.isArray(vv.settings) ? vv.settings : []).filter((b) => Array.isArray(b.data) && b.data.length);
  const key = (b) => `${String(b.label || '').trim().toLowerCase()}|${b.speed || ''}`;
  if (sweep(values).length) {
    const before = new Map(sweep(init.values).map((b) => [key(b), b]));
    const rows = sweep(values).map((b) => {
      const o = before.get(key(b));
      if (!o) return { label: b.label, missing: true };
      const f = shockFade([{ id: 'a', values: { date: '0', data: o.data, initial: true } }, { id: 'b', values: { date: '1', data: b.data } }]);
      const now = f.find((x) => x.id === 'b');
      return { label: b.label, v: now?.v, comp: now?.compChange, reb: now?.rebChange };
    });
    return (
      <div className="small" data-testid="vs-initial">
        <p>Against the initial measurement ({init.values.label || 'run'}, {fmtDate(init.values.date)}), setting by setting:</p>
        <table className="table compact"><thead><tr><th>Setting</th><th>Compression</th><th>Rebound</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}{r.v ? <span className="muted"> · {r.v} in/s</span> : ''}</td>
            {r.missing ? <td colSpan={2} className="muted">Not in the initial run</td> : <><td>{pct(r.comp)}</td><td>{pct(r.reb)}</td></>}</tr>)}</tbody></table>
      </div>
    );
  }
  const f = shockFade([{ ...init, values: { ...init.values, initial: true } }, { id: id || 'new', values }]);
  const now = f.find((x) => x.id === (id || 'new'));
  return (
    <p className="small" data-testid="vs-initial">
      Against the initial measurement ({init.values.label || 'run'}, {fmtDate(init.values.date)}){now ? `, at about ${now.v} in/s: compression ${pct(now.compChange)}, rebound ${pct(now.rebChange)}.` : ': add readings to compare.'}
    </p>
  );
}

/** Ticking "Initial measurement" when another run of the same shock/bar already has it. */
export function InitialClash({ data, id, values }) {
  if (!values.initial || !values.asset) return null;
  const other = initialRun(runsOf(data), values.asset, id);
  if (!other) return null;
  return <div className="notice small" data-testid="initial-clash">{other.values.label || 'Another run'} ({fmtDate(other.values.date)}) is marked as the initial measurement for this {v(data.byId[values.asset], 'category') === 'Torsion Bar' ? 'bar' : 'shock'}. Saving makes this run the initial one instead.</div>;
}
