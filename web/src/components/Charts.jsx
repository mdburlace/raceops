// Small SVG charts for Analytics: a line chart (one to three series over sessions or meetings),
// a scatter with a trend line, and a hover tooltip. Points open the record they came from.
// Marks follow the app's chart palette (--viz-1…3, light/dark via color-scheme); text uses ink tokens.
import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SERIES = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)'];

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Clean axis ticks between lo and hi. */
export function ticks(lo, hi, n = 4) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / n; const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let x = Math.ceil(lo / step) * step; x <= hi + step * 1e-9; x += step) out.push(+x.toFixed(6));
  return { ticks: out, lo: Math.min(lo, out[0] ?? lo), hi: Math.max(hi, out[out.length - 1] ?? hi) };
}
export const fmtNum = (x, dp = 2) => (x === null || x === undefined || Number.isNaN(x) ? '—' : String(+x.toFixed(dp)));

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <b>{tip.title}</b>
      {tip.lines.map((l) => <span key={l.k}>{l.color && <i style={{ background: l.color }} />}{l.k}: <b>{l.v}</b></span>)}
      {tip.href && <small className="muted">Click to open</small>}
    </div>
  );
}

function Legend({ series }) {
  if (series.length < 2) return null;
  return <div className="viz-legend">{series.map((s, i) => <span key={s.name}><i style={{ background: SERIES[i] }} />{s.name}</span>)}</div>;
}

/**
 * series: [{ name, points: [{ x: index, y, id?, href? }] }], labels: x labels by index.
 * invert: smaller numbers at the top (positions). unit: shown in the tooltip.
 */
export function LineChart({ series, labels, invert = false, unit = '', height = 230, yLabel = '', dp = 2, ariaLabel }) {
  const [ref, W] = useWidth();
  const nav = useNavigate();
  const [hover, setHover] = useState(null);
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <div ref={ref} className="viz-empty muted small">Nothing to chart yet.</div>;
  const P = { l: 44, r: series.length > 1 ? 70 : 16, t: yLabel ? 24 : 12, b: 26 };
  const n = labels.length;
  let { ticks: yt, lo, hi } = ticks(Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.y)));
  if (invert && lo >= 1 && Math.min(...all.map((p) => p.y)) >= 1) { lo = 1; if (yt[0] !== 1) yt = [1, ...yt.filter((t) => t > 1)]; } // positions: 1st at the top
  const sx = (i) => P.l + (n <= 1 ? (W - P.l - P.r) / 2 : (i / (n - 1)) * (W - P.l - P.r));
  const sy = (y) => (invert ? P.t + ((y - lo) / (hi - lo || 1)) * (height - P.t - P.b) : height - P.b - ((y - lo) / (hi - lo || 1)) * (height - P.t - P.b));
  // x labels: evenly spaced, at least ~85px apart, always including the last
  const shownX = new Set();
  { let lastX = -1e9; const lastPos = sx(n - 1);
    for (let i = 0; i < n; i++) { const x = sx(i); if (x - lastX >= 85 && (i === n - 1 || lastPos - x >= 120)) { shownX.add(i); lastX = x + (i === 0 ? 38 : 0); /* the first label is left-aligned, so it reaches further right */ } }
    shownX.add(n - 1); }
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = Math.max(0, Math.min(n - 1, Math.round(((x - P.l) / (W - P.l - P.r || 1)) * (n - 1))));
    setHover(i);
  };
  // end labels: nudge apart when two series finish at about the same height
  const ends = series.map((s, si) => { const pts = s.points.slice().sort((a, b) => a.x - b.x); const l = pts[pts.length - 1]; return l ? { si, y: sy(l.y) + 4 } : null; }).filter(Boolean)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  const endY = Object.fromEntries(ends.map((e) => [e.si, e.y]));
  const at = hover === null ? [] : series.map((s, si) => ({ s, si, p: s.points.find((p) => p.x === hover) })).filter((x) => x.p);
  const tip = at.length ? {
    x: Math.min(sx(hover) + 12, W - 180), y: 8, title: labels[hover],
    lines: at.map(({ s, si, p }) => ({ k: s.name, v: `${fmtNum(p.y, dp)}${unit ? ` ${unit}` : ''}`, color: SERIES[si] })),
    href: at[0].p.href,
  } : null;
  return (
    <div ref={ref} className="viz">
      <Legend series={series} />
      <div className="viz-plot" style={{ height }}>
        <svg width={W} height={height} role="img" aria-label={ariaLabel || yLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}
          onClick={() => { if (tip?.href) nav(tip.href); }} style={{ cursor: tip?.href ? 'pointer' : 'default' }}>
          {yt.map((t) => (
            <g key={t}>
              <line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} className="viz-grid" />
              <text x={P.l - 6} y={sy(t) + 4} textAnchor="end" className="viz-axis">{fmtNum(t, 3)}</text>
            </g>
          ))}
          {labels.map((l, i) => shownX.has(i) && (
            <text key={i} x={sx(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="viz-axis">{String(l).split(' · ')[0]}</text>
          ))}
          {yLabel && <text x={4} y={10} className="viz-axis">{yLabel}</text>}
          {hover !== null && <line x1={sx(hover)} x2={sx(hover)} y1={P.t} y2={height - P.b} className="viz-cross" />}
          {series.map((s, si) => {
            const pts = s.points.slice().sort((a, b) => a.x - b.x);
            const last = pts[pts.length - 1];
            return (
              <g key={s.name}>
                {pts.length > 1 && <polyline points={pts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} fill="none" stroke={SERIES[si]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
                {pts.map((p) => <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={hover === p.x ? 5.5 : 4} fill={SERIES[si]} className="viz-dot" />)}
                {series.length > 1 && last && <text x={sx(last.x) + 8} y={endY[si]} className="viz-label">{s.name}</text>}
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </div>
  );
}

/** points: [{ x, y, id, href, label }], line: { slope, intercept } — a scatter with its trend line. */
export function ScatterChart({ points, line, xLabel, yLabel, invert = false, height = 260, dp = 2 }) {
  const [ref, W] = useWidth();
  const nav = useNavigate();
  const [hover, setHover] = useState(null);
  if (!points.length) return <div ref={ref} className="viz-empty muted small">Nothing to chart yet.</div>;
  const P = { l: 44, r: 16, t: 24, b: 34 };
  const X = ticks(Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x)));
  const Y = ticks(Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y)));
  const sx = (x) => P.l + ((x - X.lo) / (X.hi - X.lo || 1)) * (W - P.l - P.r);
  const sy = (y) => (invert ? P.t + ((y - Y.lo) / (Y.hi - Y.lo || 1)) * (height - P.t - P.b) : height - P.b - ((y - Y.lo) / (Y.hi - Y.lo || 1)) * (height - P.t - P.b));
  const near = (e) => {
    const r = e.currentTarget.getBoundingClientRect(); const mx = e.clientX - r.left; const my = e.clientY - r.top;
    let best = null; let d = 18 ** 2;
    points.forEach((p, i) => { const dd = (sx(p.x) - mx) ** 2 + (sy(p.y) - my) ** 2; if (dd < d) { d = dd; best = i; } });
    return best;
  };
  const hp = hover !== null ? points[hover] : null;
  const tip = hp ? { x: Math.min(sx(hp.x) + 12, W - 190), y: Math.max(4, sy(hp.y) - 60), title: hp.label, href: hp.href,
    lines: [{ k: xLabel, v: fmtNum(hp.x, dp) }, { k: yLabel, v: fmtNum(hp.y, dp) }] } : null;
  return (
    <div ref={ref} className="viz">
      <div className="viz-plot" style={{ height }}>
        <svg width={W} height={height} role="img" aria-label={`${yLabel} against ${xLabel}`}
          onMouseMove={(e) => setHover(near(e))} onMouseLeave={() => setHover(null)} onClick={(e) => { const i = near(e); if (i !== null && points[i].href) nav(points[i].href); }}
          style={{ cursor: hp?.href ? 'pointer' : 'default' }}>
          {Y.ticks.map((t) => (
            <g key={`y${t}`}><line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} className="viz-grid" />
              <text x={P.l - 6} y={sy(t) + 4} textAnchor="end" className="viz-axis">{fmtNum(t, 3)}</text></g>
          ))}
          {X.ticks.map((t) => <text key={`x${t}`} x={sx(t)} y={height - 18} textAnchor="middle" className="viz-axis">{fmtNum(t, 3)}</text>)}
          <text x={W - P.r} y={height - 3} textAnchor="end" className="viz-axis">{xLabel} →</text>
          <text x={4} y={10} className="viz-axis">{yLabel}{invert ? ' (better ↑)' : ''}</text>
          {line && <line x1={sx(X.lo)} x2={sx(X.hi)} y1={sy(line.intercept + line.slope * X.lo)} y2={sy(line.intercept + line.slope * X.hi)} className="viz-fit" />}
          {points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={hover === i ? 6 : 4.5} fill="var(--viz-1)" className="viz-dot" />)}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </div>
  );
}

/** "Show as table" under a chart, so every value is readable without the chart. */
export function ChartTable({ head, rows }) {
  if (!rows.length) return null;
  return (
    <details className="viz-table">
      <summary>Show as table</summary>
      <div className="table-scroll"><table className="table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
  );
}
