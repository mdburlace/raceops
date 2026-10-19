// Shock dyno: a run is tested at one or more test speeds (in/s); readings rows carry the speed
// they were taken at in `s`. Older runs have rows without `s`.
export const TEST_SPEEDS = ['3.00', '6.00', '10.00'];

const n = (x) => { const y = parseFloat(String(x ?? '').replace(/,/g, '')); return Number.isFinite(y) ? y : null; };
/** "6" → "6.00": how a speed is shown and stored on rows. */
export const speedKey = (x) => (n(x) === null ? '' : n(x).toFixed(2));
export const speedLabel = (x) => `${speedKey(x)} in/s`;

/** The run's test speeds, cleaned and in order. */
export function runSpeeds(values) {
  const list = Array.isArray(values?.test_speeds) ? values.test_speeds : [];
  return [...new Set(list.map(speedKey).filter(Boolean))].sort((a, b) => n(a) - n(b));
}

/** Readings rows at a speed — or, when the run has a single speed, rows saved without one. */
export function rowsAt(rows, speed, speeds) {
  const k = speedKey(speed);
  return (Array.isArray(rows) ? rows : []).filter((r) => (r.s ? speedKey(r.s) === k : speeds.length === 1 && speeds[0] === k));
}

/** Default velocity rows for a test: 0 up to the test speed, every 1 in/s (and the speed itself). */
export function defaultRowsFor(speed) {
  const top = n(speed) || 10;
  const xs = [];
  for (let x = 0; x < top - 1e-9; x += 1) xs.push(String(x));
  xs.push(String(+top.toFixed(2)));
  return xs.map((v) => ({ v }));
}

/**
 * Curves in a run: one per test speed (table runs) — [{ speed, rows }]. Older rows without a
 * speed form one curve with speed ''.
 */
export function curvesBySpeed(values) {
  const rows = Array.isArray(values?.data) ? values.data : [];
  const speeds = runSpeeds(values);
  const out = [];
  for (const sp of speeds) { const rs = rowsAt(rows, sp, speeds); if (rs.length) out.push({ speed: sp, rows: rs }); }
  const loose = rows.filter((r) => !r.s && !(speeds.length === 1));
  if (loose.length) out.push({ speed: '', rows: loose });
  return out;
}

/**
 * The initial measurement for a shock or bar: the run marked "Initial measurement" (taken at purchase
 * or first build) for that asset. runs: [{ id, values }]. Leaves out `exceptId` (the run being viewed).
 */
export function initialRun(runs, assetId, exceptId = null) {
  if (!assetId) return null;
  return runs.filter((r) => r.id !== exceptId && r.values?.asset === assetId && r.values?.initial)
    .sort((a, b) => String(a.values.date || '').localeCompare(String(b.values.date || '')))[0] || null;
}
