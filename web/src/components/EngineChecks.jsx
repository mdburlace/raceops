// Engine build sheet: clearances and figures worked out automatically from the measurements
// already entered — oil clearances, piston-to-wall, ring gap per inch of bore, rod ratio,
// piston speed and bobweight. Nothing to type; rows appear as the numbers go in.
import { fmt } from '@shared/calcs.js';
import { engineChecks } from '@shared/engineChecks.js';

export { engineChecks };

export function EngineChecks({ values }) {
  const { rows, singles } = engineChecks(values || {});
  if (!rows.length && !singles.length) return null;
  return (
    <section className="card engine-checks" aria-label="Clearances and checks">
      <div className="card-head"><h3>Clearances &amp; checks</h3><span className="muted small">Worked out from the measurements above</span></div>
      {singles.length > 0 && (
        <dl className="kv">
          {singles.map(([l, x, u, note]) => <div key={l} className="kv-row"><dt>{l}</dt><dd><b>{x}</b>{u && <small> {u}</small>}{note && <small className="muted"> — {note}</small>}</dd></div>)}
        </dl>
      )}
      {rows.map((r) => (
        <div key={r.label} className="check-row-calc">
          <div className="small"><b>{r.label}</b> <span className="muted">({r.unit}; {r.note})</span></div>
          <div className="check-cells">
            {r.cells.map(([k, x]) => <span key={k} className="check-cell"><small className="muted">{k}</small> {fmt(x, r.dp)}</span>)}
          </div>
        </div>
      ))}
    </section>
  );
}
