// Engine build sheet: clearances and figures worked out automatically from the measurements
// already entered — oil clearances, piston-to-wall, ring gap per inch of bore, rod ratio,
// piston speed and bobweight. Nothing to type; rows appear as the numbers go in.
import { CALC, fmt, runCalc } from '@shared/calcs.js';

const n = (x) => { const v = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
const pairs = (a, b, f) => Object.keys({ ...(a || {}), ...(b || {}) }).map((k) => [k, n(a?.[k]), n(b?.[k])])
  .filter(([, x, y]) => x !== null && y !== null).map(([k, x, y]) => [k, f(x, y)]);

export function engineChecks(v) {
  const rows = [];
  const add = (label, cells, unit, dp = 4, note) => { if (cells.length) rows.push({ label, cells, unit, dp, note }); };
  add('Main bearing oil clearance', pairs(v.main_brg_id, v.main_journal, (b, j) => b - j), 'in', 4, 'Bearing I.D. − journal');
  add('Rod bearing oil clearance', pairs(v.rod_brg_id, v.rod_journal, (b, j) => b - j), 'in', 4, 'Bearing I.D. − journal');
  add('Cam bearing clearance', pairs(v.cam_brg_id, v.cam_journal, (b, j) => b - j), 'in', 4, 'Bearing I.D. − journal');
  add('Piston-to-wall clearance', pairs(v.bore_max, v.piston_size, (b, p) => b - p), 'in', 4, 'Max bore − piston size');
  const bore = (() => { const xs = Object.values(v.bore_max || {}).map(n).filter((x) => x !== null); return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null; })();
  if (bore) {
    for (const [k, l] of [['ring1_gap', 'Top ring gap per inch of bore'], ['ring2_gap', '2nd ring gap per inch of bore']]) {
      add(l, Object.entries(v[k] || {}).map(([c, g]) => [c, n(g)]).filter(([, g]) => g !== null).map(([c, g]) => [c, g / bore]), 'in/in', 5, `Gap ÷ ${fmt(bore, 4)} in bore`);
    }
  }
  const singles = [];
  const ps = runCalc(CALC['piston-speed'], { stroke: v.stroke, rpm: v.peak_rpm, rod: v.rod_length });
  if (ps.ratio) singles.push(['Rod ratio', fmt(ps.ratio, 3), '', 'Rod length ÷ stroke']);
  if (ps.mean) singles.push([`Average piston speed at ${v.peak_rpm} rpm`, fmt(ps.mean, 0), 'ft/min', 'Many builders keep this under ~4,500 for endurance']);
  if (ps.max) singles.push(['Peak piston speed', fmt(ps.max, 0), 'ft/min', `At ${fmt(ps.deg, 0)}° after TDC`]);
  const bob = runCalc(CALC.bobweight, { big: v.rod_wt_big, small: v.rod_wt_small, piston: v.piston_weight });
  if (bob.bob) singles.push(['Bobweight estimate (V8, 50%)', fmt(bob.bob, 1), 'g', 'Add bearings, pin, rings, locks and oil in the Bobweight calculator for the full figure']);
  return { rows, singles };
}

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
