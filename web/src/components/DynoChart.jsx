import { useMemo, useState } from 'react';
import { allFields, linearSlope, num } from '../lib/data.js';
import { curvesBySpeed, speedLabel } from '@shared/dyno.js';

const COLORS = ['var(--accent)', 'var(--info)', 'var(--ok)', '#9b59b6', '#d4a017', '#e84393', '#16a3a3', '#7a5c3e', '#5b6b8c', '#c0392b'];

function tableField(form) {
  return allFields(form).find((f) => f.type === 'table');
}

/** Overlay force/velocity (shock) or load/deflection (bar) curves from one or more dyno runs. */
export default function DynoChart({ runs: inputRuns, height = 300 }) {
  const first = inputRuns.find((r) => tableField(r.form));
  const tf = first ? tableField(first.form) : null;
  const [hidden, setHidden] = useState([]);
  // adjustable shocks: every adjuster setting becomes its own curve
  const allRuns = inputRuns.flatMap((r) => {
    const sw = r.values?.settings;
    const adjustable = r.values?.adjust_type && r.values.adjust_type !== 'Non-adjustable';
    if (tf && adjustable && Array.isArray(sw) && sw.length) {
      return sw.map((st, i) => {
        const nm = `${st.label || `Setting ${i + 1}`}${st.speed ? ` · ${speedLabel(st.speed)}` : ''}`;
        return { id: `${r.id}#${i}`, name: inputRuns.length > 1 ? `${r.name} · ${nm}` : nm, values: { [tf.key]: st.data }, form: r.form };
      });
    }
    // runs tested at several speeds: a curve per test speed
    if (tf && tf.bySpeed) {
      const curves = curvesBySpeed(r.values);
      if (curves.length > 1 || (curves.length === 1 && curves[0].speed)) {
        return curves.map((c) => ({ id: `${r.id}@${c.speed}`, name: c.speed ? (inputRuns.length > 1 ? `${r.name} · ${speedLabel(c.speed)}` : speedLabel(c.speed)) : r.name,
          values: { [tf.key]: c.rows }, form: r.form }));
      }
    }
    return [r];
  });
  const runs = allRuns.filter((r) => !hidden.includes(r.id));
  const yCols = (tf?.columns || []).filter((c) => c.key !== tf.xKey);
  const hasData = (k) => runs.some((r) => (r.values?.[tf.key] || []).some((row) => num(row[k]) !== null));
  const pickPair = (pair) => pair.filter((k) => yCols.some((c) => c.key === k) && hasData(k));
  const defaults = pickPair(['ca', 'ra']).length ? pickPair(['ca', 'ra']) : pickPair(['cc', 'rc']);
  const [picked, setPicked] = useState(null);
  const cols = picked || (defaults.length ? defaults : yCols.filter((c) => hasData(c.key)).map((c) => c.key).slice(0, 2));

  const series = useMemo(() => {
    if (!tf) return [];
    return runs.flatMap((r, ri) => cols.map((k, ci) => ({
      key: `${r.id}-${k}`, run: r.name, col: yCols.find((c) => c.key === k)?.label || k, color: COLORS[allRuns.indexOf(r) % COLORS.length] || COLORS[ri % COLORS.length], dash: ci > 0 && cols.length > 1 && !/^r/.test(k) ? '6 4' : '',
      pts: (r.values?.[tf.key] || []).map((row) => [num(row[tf.xKey]), num(row[k])]).filter(([x, y]) => x !== null && y !== null).sort((a, b) => a[0] - b[0]),
    }))).filter((s) => s.pts.length);
  }, [runs, cols, tf, allRuns]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tf) return null;
  const xCol = tf.columns.find((c) => c.key === tf.xKey);
  const all = series.flatMap((s) => s.pts);

  const W = 680, H = height, P = { l: 52, r: 16, t: 14, b: 36 };
  let x0 = Math.min(0, ...all.map((p) => p[0])), x1 = Math.max(1, ...all.map((p) => p[0]));
  let y0 = Math.min(0, ...all.map((p) => p[1])), y1 = Math.max(0, ...all.map((p) => p[1]));
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
  const sx = (x) => P.l + ((x - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const sy = (y) => H - P.b - ((y - y0) / (y1 - y0)) * (H - P.t - P.b);
  const nice = (lo, hi, n = 5) => {
    const raw = (hi - lo) / n; const mag = 10 ** Math.floor(Math.log10(raw || 1));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) || raw;
    const out = []; for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
    return out;
  };
  const yt = nice(y0, y1);
  const xt = nice(x0, x1);
  const f = (n) => String(Math.round(n * 100) / 100);

  return (
    <section className="card">
      <div className="card-head">
        <h3>{runs.length > 1 ? 'Overlay' : 'Curve'}</h3>
        {yCols.length > 2 && (
          <div className="chips tight">
            {yCols.map((c) => (
              <button type="button" key={c.key} className={`chip${cols.includes(c.key) ? ' active' : ''}`}
                onClick={() => setPicked(cols.includes(c.key) ? cols.filter((x) => x !== c.key) : [...cols, c.key])}>{c.label}</button>
            ))}
          </div>
        )}
      </div>
      {series.length === 0 ? (hidden.length
        ? <p className="muted">All curves hidden. <button type="button" className="link" onClick={() => setHidden([])}>Show all</button></p>
        : <p className="muted">Enter readings to see the curve.</p>) : (
        <div className="chart">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dyno curve">
            {yt.map((t) => <g key={`y${t}`}><line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} className="grid" /><text x={P.l - 6} y={sy(t)} className="tick" textAnchor="end" dominantBaseline="middle">{f(t)}</text></g>)}
            {xt.map((t) => <text key={`x${t}`} x={sx(t)} y={H - 18} className="tick" textAnchor="middle">{f(t)}</text>)}
            <line x1={P.l} x2={W - P.r} y1={sy(0)} y2={sy(0)} className="zero" />
            <text x={(W + P.l) / 2} y={H - 3} className="tick" textAnchor="middle">{xCol?.label}{xCol?.unit ? ` (${xCol.unit})` : ''}</text>
            {series.map((s) => (
              <g key={s.key}>
                <polyline points={s.pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} />
                {s.pts.map(([x, y], i) => <circle key={i} cx={sx(x)} cy={sy(y)} r="3" fill={s.color}><title>{`${s.run} ${s.col}: ${y} @ ${x}`}</title></circle>)}
              </g>
            ))}
          </svg>
          <div className="legend wrap">
            {allRuns.map((r, ri) => {
              const rate = tf.xKey === 'x' ? linearSlope(r.values?.[tf.key], 'x', 'load') : null;
              const off = hidden.includes(r.id);
              return (
                <button type="button" key={r.id} className={`lg lg-btn${off ? ' off' : ''}`} title={off ? 'Show' : 'Hide'}
                  onClick={() => setHidden(off ? hidden.filter((x) => x !== r.id) : [...hidden, r.id])}>
                  <i style={{ background: COLORS[ri % COLORS.length] }} />{r.name}{rate ? ` — ${rate.toFixed(1)} lb/in` : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
