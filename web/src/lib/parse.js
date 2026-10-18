// Parsers for pasting dyno printouts and gear charts into table / sweep fields.

const NUM = /^[-+]?(\d+(\.\d*)?|\.\d+)$/;
const isNumTok = (t) => NUM.test(t) || /^nan$/i.test(t);
const tokens = (line) => line.trim().split(/[\t,;]+|\s+/).filter(Boolean);
const clean = (t) => (/^nan$/i.test(t) ? '' : t);
const norm = (t) => t.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const IGNORE = /^(speed\s*:|amplitude|frequency|rodforce|samplefrequency|stroke|notes|field|constant|value|page|rebound close|compression open|force vs|thursday|monday|tuesday|wednesday|friday|saturday|sunday)\b/i;

/** Map header tokens to column keys; returns array (one per header token) or null if not a header. */
function headerMap(line, columns, xKey) {
  const toks = line.trim().split(/\t|\s{2,}|,|\s(?=[A-Za-z])/).map((t) => t.trim()).filter(Boolean);
  const map = toks.map((t) => {
    const n = norm(t);
    if (['speed', 'velocity', 'vel'].includes(n)) return xKey;
    const c = columns.find((col) => norm(col.label) === n || norm(col.key) === n);
    return c ? c.key : undefined;
  });
  return map.filter(Boolean).length >= 2 ? map : null;
}

function numericRow(line, map, columns) {
  const toks = tokens(line);
  if (!toks.length || !toks.every(isNumTok)) return null;
  const keys = map || columns.map((c) => c.key);
  const row = {};
  toks.forEach((t, i) => { if (keys[i]) row[keys[i]] = clean(t); });
  return row;
}

/** Plain numeric table: optional header row, then rows of numbers. */
export function parseTable(text, columns, xKey) {
  let map = null;
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const h = headerMap(line, columns, xKey);
    if (h) { map = h; continue; }
    const r = numericRow(line, map, columns);
    if (r) rows.push(r);
  }
  return rows;
}

/** Several settings in one paste: a non-numeric, non-header line starts a new setting. */
export function parseSweep(text, columns, xKey) {
  const out = [];
  let map = null;
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = headerMap(line, columns, xKey);
    if (h) { map = h; continue; }
    const r = numericRow(line, map, columns);
    if (r) {
      if (!cur) { cur = { label: `Setting ${out.length + 1}`, adj: {}, note: '', data: [] }; out.push(cur); }
      cur.data.push(r);
      continue;
    }
    if (IGNORE.test(line)) continue;
    const label = line.replace(/^■\s*/, '').replace(/^[\d.]+\s*in\/s\s*:\s*[\d.]+\s*in\s*-\s*/i, '').trim();
    cur = { label, adj: {}, note: '', data: [] };
    out.push(cur);
  }
  return out.filter((s) => s.data.length || s.label);
}

/** Gear chart lines: "<set no> ... 21/22 ..." — the first a/b pair is small/large teeth. */
export function parseGearSets(text) {
  const rows = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(/^(\S+(?:\s*\([^)]*\))?)\s+(?:.*?\s)?(\d{1,3})\s*\/\s*(\d{1,3})\b/);
    if (!m) continue;
    const a = Number(m[2]); const b = Number(m[3]);
    rows.push({ set: m[1], small: String(Math.min(a, b)), large: String(Math.max(a, b)), note: /low\s*h(orse)?p/i.test(line) ? 'Low horsepower only' : '' });
  }
  return rows;
}

/** Evenly spaced x values, e.g. 0 → 10 step 0.25. */
export function fillX(start, end, step) {
  const s = Number(start); const e = Number(end); const st = Number(step);
  if (!(st > 0) || !Number.isFinite(s) || !Number.isFinite(e) || e < s) return [];
  const out = [];
  for (let x = s; x <= e + 1e-9 && out.length < 500; x += st) out.push(String(Math.round(x * 1000) / 1000));
  return out;
}
