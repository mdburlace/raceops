// Torsion bar tests: spring rate at a standard arm travel (usually 3 in on a 15 in arm),
// compression (winding up) and rebound (releasing) readings, the split between them
// (hysteresis), and baseline averages to compare bars of the same size and type against.
export const BAR_TYPES = ['Solid', 'Hollow (gun-drilled)', 'Titanium', 'Other'];
export const CORNERS = ['LF', 'RF', 'LR', 'RR'];
export const DEFAULT_TRAVEL = 3;
export const DEFAULT_ARM = 15;

const n = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const y = typeof x === 'number' ? x : parseFloat(String(x).replace(/,/g, ''));
  return Number.isFinite(y) ? y : null;
};

/** Value of y at x from table rows, interpolating between the nearest readings (null if out of range). */
export function interp(rows, xKey, yKey, x) {
  const pts = (Array.isArray(rows) ? rows : []).map((r) => [n(r[xKey]), n(r[yKey])]).filter(([a, b]) => a !== null && b !== null).sort((a, b) => a[0] - b[0]);
  if (!pts.length) return null;
  const hit = pts.find(([a]) => Math.abs(a - x) < 1e-9);
  if (hit) return hit[1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
    if (x0 <= x && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return null;
}

function slope(rows, xKey, yKey) {
  const pts = (Array.isArray(rows) ? rows : []).map((r) => [n(r[xKey]), n(r[yKey])]).filter(([a, b]) => a !== null && b !== null);
  if (pts.length < 2) return null;
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length; const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxy = 0; let sxx = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  return sxx ? sxy / sxx : null;
}

/**
 * Results for one test. Compression and rebound at the test travel come from the readings
 * table (interpolated), unless typed in directly. Rate = force ÷ travel (lb/in at the arm).
 * Split = compression − rebound at that travel.
 */
export function barStats(values) {
  const v = values || {};
  const travel = n(v.rate_travel) || DEFAULT_TRAVEL;
  const rows = v.data;
  const comp = n(v.comp_at) ?? interp(rows, 'x', 'load', travel);
  const rebRaw = n(v.reb_at) ?? interp(rows, 'x', 'unload', travel);
  const reb = rebRaw === null ? null : Math.abs(rebRaw);
  const rate = comp !== null ? comp / travel : null;
  const rebRate = reb !== null ? reb / travel : null;
  const split = comp !== null && reb !== null ? comp - reb : null;
  // the widest split anywhere in the readings
  let maxSplit = null;
  for (const r of Array.isArray(rows) ? rows : []) {
    const c = n(r.load); const u = n(r.unload);
    if (c !== null && u !== null) { const s = c - Math.abs(u); if (maxSplit === null || s > maxSplit) maxSplit = s; }
  }
  const nominal = n(v.nominal);
  return {
    travel, arm: n(v.arm) || DEFAULT_ARM, comp, reb, rate, rebRate, split,
    splitPct: split !== null && comp ? split / comp : null, maxSplit,
    slope: slope(rows, 'x', 'load'),
    vsNominal: rate !== null && nominal ? (rate - nominal) / nominal : null,
    source: n(v.comp_at) !== null ? 'entered' : comp !== null ? 'readings' : null,
  };
}

/** Bars are compared with others of the same size and type. */
export function groupKey(values) {
  const size = String(values?.diameter ?? '').trim();
  const nominal = String(values?.nominal ?? '').trim();
  const type = values?.bar_type || '';
  const sizeLabel = size ? `${size} in` : nominal ? `${nominal} lb/in nominal` : 'Size not set';
  return { key: `${size || `nom:${nominal}`}|${type}`, label: [sizeLabel, type].filter(Boolean).join(' · ') };
}

/**
 * Baseline averages: for each size/type, the average rate and split of the tests marked
 * "Use in baseline averages". tests: [{ id, values }].
 */
export function baselines(tests) {
  const groups = new Map();
  for (const t of tests) {
    if (!t.values?.in_baseline) continue;
    const s = barStats(t.values);
    if (s.rate === null) continue;
    const g = groupKey(t.values);
    const cur = groups.get(g.key) || { key: g.key, label: g.label, tests: [], rates: [], splits: [] };
    cur.tests.push(t.id); cur.rates.push(s.rate); if (s.split !== null) cur.splits.push(s.split);
    groups.set(g.key, cur);
  }
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return new Map([...groups.entries()].map(([k, g]) => [k, {
    key: k, label: g.label, n: g.tests.length, tests: g.tests,
    rate: avg(g.rates), min: Math.min(...g.rates), max: Math.max(...g.rates), split: avg(g.splits),
  }]));
}

/** How a test compares with its group's baseline: rate and split difference. */
export function vsBaseline(values, base) {
  if (!base) return null;
  const s = barStats(values);
  if (s.rate === null || !base.rate) return null;
  return { rate: (s.rate - base.rate) / base.rate, rateDiff: s.rate - base.rate, split: s.split !== null && base.split !== null ? s.split - base.split : null };
}
