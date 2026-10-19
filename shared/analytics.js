// Analytics: pure calculations over a team's own records (setups, events, assets, builds, dyno
// runs). Worked out on the device from synced data, so it runs offline. Everything here takes
// plain objects: { id, values } records and returns plain rows for the charts and tables.
import { changedFields, settingFields } from './setupLayout.js';
import { toGal } from './fuel.js';
import { curvesBySpeed } from './dyno.js';

export const num = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'number' ? x : parseFloat(String(x).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const assetId = (x) => (x && typeof x === 'object' ? x.asset : null);
export const isFeature = (session) => /feature|a-?main/i.test(session || '');
export const isHeat = (session) => /heat|qualif|dash|b-?main|c-?main|last chance/i.test(session || '');
const nameKey = (x) => String(x || '').trim().toLowerCase();

// ---------------- sessions ----------------
/**
 * One row per setup sheet with what the charts need: date, track, session kind, result.
 * setups: [{ id, values }]; events: { id: values }; tracks: { id: name }.
 */
export function sessionRows(setups, events, tracks = {}) {
  const rows = [];
  for (const s of setups) {
    const vals = s.values || {};
    const ev = events[vals.event];
    if (!ev) continue;
    const start = num(vals.start); const finish = num(vals.finish);
    const trackName = (ev.venue && tracks[ev.venue]) || ev.track || '';
    rows.push({
      id: s.id, values: vals, event: vals.event, eventName: ev.name || '', date: ev.date || '', car: vals.car || '',
      track: ev.venue ? `id:${ev.venue}` : trackName ? `name:${nameKey(trackName)}` : '', trackName,
      session: vals.session || '', order: num(vals.order) ?? 0, day: num(vals.day) || 1,
      feature: isFeature(vals.session), heat: isHeat(vals.session),
      start, finish, gained: start !== null && finish !== null ? start - finish : null,
      conditions: Array.isArray(vals.track_conditions) ? vals.track_conditions : [],
      feel: [...(Array.isArray(vals.driver_feel) ? vals.driver_feel : []), ...(Array.isArray(vals.crew_feel) ? vals.crew_feel : [])],
      adr: num(vals.adr), temp: num(vals.temp),
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.day - b.day || a.order - b.order || a.session.localeCompare(b.session));
}

/** Filter: { car, from, to, track, kind: all|feature|heats, conditions: [] (any of) }. */
export function filterRows(rows, f = {}) {
  return rows.filter((r) => (!f.car || r.car === f.car)
    && (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to)
    && (!f.track || r.track === f.track)
    && (!f.kind || f.kind === 'all' || (f.kind === 'feature' ? r.feature : f.kind === 'heats' ? r.heat : true))
    && (!f.conditions?.length || f.conditions.some((c) => r.conditions.includes(c))));
}

/** How many rows lack a result — shown under charts so gaps are visible. */
export function coverage(rows) {
  return { sessions: rows.length, nights: new Set(rows.map((r) => r.event)).size, noFinish: rows.filter((r) => r.finish === null).length, noStart: rows.filter((r) => r.start === null).length };
}

// ---------------- performance ----------------
export function summary(rows) {
  const fin = rows.map((r) => r.finish).filter((x) => x !== null);
  const g = rows.map((r) => r.gained).filter((x) => x !== null);
  return { sessions: rows.length, nights: new Set(rows.map((r) => r.event)).size, wins: fin.filter((x) => x === 1).length, top5: fin.filter((x) => x <= 5).length,
    avgFinish: avg(fin), avgStart: avg(rows.map((r) => r.start).filter((x) => x !== null)), avgGained: avg(g), bestFinish: fin.length ? Math.min(...fin) : null };
}

/** Per track: nights, sessions, average finish and places gained, best finish, wins. Best average finish first. */
export function byTrack(rows) {
  const m = new Map();
  for (const r of rows) { if (!r.track) continue; (m.get(r.track) || m.set(r.track, []).get(r.track)).push(r); }
  return [...m.entries()].map(([track, rs]) => ({ track, name: rs[rs.length - 1].trackName, ...summary(rs), last: rs[rs.length - 1].date }))
    .sort((a, b) => (a.avgFinish ?? 99) - (b.avgFinish ?? 99) || b.sessions - a.sessions);
}

/** Bands of a number, e.g. ADR every 5 %: [{ label, lo, hi, ...summary }]. */
export function byBand(rows, key, width, unit = '') {
  const m = new Map();
  for (const r of rows) {
    const x = r[key]; if (x === null || x === undefined) continue;
    const lo = Math.floor(x / width) * width;
    (m.get(lo) || m.set(lo, []).get(lo)).push(r);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([lo, rs]) => ({ label: `${lo}–${lo + width}${unit}`, lo, hi: lo + width, ...summary(rs) }));
}

/** Per track-condition tag (a session can have several). */
export function byCondition(rows) {
  const m = new Map();
  for (const r of rows) for (const c of r.conditions) (m.get(c) || m.set(c, []).get(c)).push(r);
  return [...m.entries()].map(([label, rs]) => ({ label, ...summary(rs) })).sort((a, b) => b.sessions - a.sessions);
}

// ---------------- feedback ----------------
/**
 * How often each handling comment (driver and crew lead) comes up, where, and what fixed it:
 * when a comment is on one session and gone from the next session that night, the changes
 * made between them are counted as a possible fix.
 */
export function feedbackPatterns(rows, form) {
  const tags = new Map();
  const get = (t) => tags.get(t) || tags.set(t, { tag: t, count: 0, tracks: new Map(), fixes: new Map(), fixedTimes: 0 }).get(t);
  for (const r of rows) for (const t of new Set(r.feel)) {
    const x = get(t); x.count++;
    if (r.trackName) x.tracks.set(r.trackName, (x.tracks.get(r.trackName) || 0) + 1);
  }
  // consecutive sessions at the same night for the same car
  const byNight = new Map();
  for (const r of rows) { const k = `${r.event}|${r.car}`; (byNight.get(k) || byNight.set(k, []).get(k)).push(r); }
  for (const list of byNight.values()) {
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i]; const b = list[i + 1];
      const gone = [...new Set(a.feel)].filter((t) => !b.feel.includes(t));
      if (!gone.length) continue;
      const ch = describeChanges(form, a.values, b.values);
      for (const t of gone) {
        const x = get(t); x.fixedTimes++;
        for (const c of ch) x.fixes.set(c.label, { ...c, n: (x.fixes.get(c.label)?.n || 0) + 1 });
      }
    }
  }
  return [...tags.values()].map((x) => ({
    tag: x.tag, count: x.count, fixedTimes: x.fixedTimes,
    tracks: [...x.tracks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => ({ name, n })),
    fixes: [...x.fixes.values()].sort((a, b) => b.n - a.n).slice(0, 4),
  })).sort((a, b) => b.count - a.count);
}

/** Setting changes from one sheet to the next, labelled with a direction where they're numbers ("Stagger ↓"). */
export function describeChanges(form, before, after) {
  const changed = changedFields(form, after, before);
  const fields = new Map(settingFields(form).map(({ f }) => [f.key, f]));
  const out = [];
  for (const [key, c] of Object.entries(changed)) {
    const f = fields.get(key); if (!f) continue;
    if (f.type === 'corners') {
      for (const corner of Object.keys(c.corners || {})) {
        const a = num(before?.[key]?.[corner]); const b = num(after?.[key]?.[corner]);
        const dir = a !== null && b !== null ? (b > a ? '↑' : '↓') : '';
        out.push({ key: `${key}.${corner}`, label: `${corner} ${f.label.toLowerCase()}${dir ? ` ${dir}` : ' changed'}` });
      }
    } else {
      const a = num(before?.[key]); const b = num(after?.[key]);
      const dir = a !== null && b !== null ? (b > a ? '↑' : '↓') : '';
      out.push({ key, label: `${f.label}${dir ? ` ${dir}` : ' changed'}` });
    }
  }
  return out;
}

// ---------------- setups ----------------
/**
 * Numeric settings a person can chart: single numbers, each corner of four-corner numbers, and
 * text fields that are recorded as numbers on your sheets (e.g. main jet "42") when rows are given.
 */
export function numericSettings(form, rows = null) {
  const out = [];
  const mostlyNumbers = (key) => {
    if (!rows) return false;
    const vals = rows.map((r) => r.values?.[key]).filter((x) => x !== undefined && x !== null && x !== '');
    return vals.length >= 2 && vals.filter((x) => num(x) !== null).length / vals.length >= 0.6;
  };
  for (const { f, sec } of settingFields(form)) {
    if (f.type === 'number' || f.type === 'derived' || f.key === 'final_drive' || (f.type === 'text' && mostlyNumbers(f.key))) out.push({ id: f.key, key: f.key, label: f.label, unit: f.unit || '', sec });
    else if (f.type === 'corners' && (f.input || 'number') === 'number') {
      for (const c of f.corners || ['LF', 'RF', 'LR', 'RR']) out.push({ id: `${f.key}.${c}`, key: f.key, corner: c, label: `${f.label} ${c}`, unit: f.unit || '', sec });
    }
  }
  return out;
}

export const settingValue = (vals, s) => num(s.corner ? vals?.[s.key]?.[s.corner] : vals?.[s.key]);

/** Least-squares line and correlation for [{ x, y }]. */
export function fit(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = avg(points.map((p) => p.x)); const my = avg(points.map((p) => p.y));
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const p of points) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
  if (!sxx) return null;
  const slope = sxy / sxx;
  return { n, slope, intercept: my - slope * mx, r: syy ? sxy / Math.sqrt(sxx * syy) : 0 };
}

export function strength(r, n) {
  if (r === null || r === undefined || n < 5) return 'not enough sessions yet';
  const a = Math.abs(r);
  return a < 0.2 ? 'no clear link' : a < 0.4 ? 'a weak link' : a < 0.6 ? 'a moderate link' : 'a strong link';
}

/**
 * "What worked": a setting against a result (places gained or finish) across sessions.
 * Returns the points, the line, plain-language summary and banded averages.
 */
export function settingVsResult(rows, setting, outcome = 'gained') {
  const points = rows.map((r) => ({ id: r.id, x: settingValue(r.values, setting), y: r[outcome], label: `${r.session} · ${r.trackName} · ${r.date}` }))
    .filter((p) => p.x !== null && p.y !== null);
  const line = fit(points);
  let text = '';
  if (line && points.length >= 5) {
    const better = outcome === 'gained' ? line.slope > 0 : line.slope < 0; // more places gained, or a lower finish
    const s = strength(line.r, points.length);
    text = s === 'no clear link'
      ? `No clear link between ${setting.label.toLowerCase()} and ${outcome === 'gained' ? 'places gained' : 'finishing position'} in these ${points.length} sessions.`
      : `${s.charAt(0).toUpperCase()}${s.slice(1)}: ${better ? 'more' : 'less'} ${setting.label.toLowerCase()} has gone with ${outcome === 'gained' ? 'more places gained' : 'better finishes'} (${points.length} sessions).`;
  } else text = `Needs at least 5 sessions with both ${setting.label.toLowerCase()} and a result (${points.length} so far).`;
  // bands: split the range of x into up to 4 even groups
  const xs = points.map((p) => p.x);
  const bands = [];
  if (points.length >= 4) {
    const lo = Math.min(...xs); const hi = Math.max(...xs);
    const k = Math.min(4, new Set(xs).size);
    if (k >= 2 && hi > lo) {
      const w = (hi - lo) / k;
      for (let i = 0; i < k; i++) {
        const a = lo + i * w; const b = i === k - 1 ? hi : lo + (i + 1) * w;
        const ps = points.filter((p) => p.x >= a && (i === k - 1 ? p.x <= b : p.x < b));
        if (ps.length) bands.push({ from: a, to: b, n: ps.length, avg: avg(ps.map((p) => p.y)) });
      }
    }
  }
  return { points, line, text, bands };
}

/** A setting's value session by session, in running order (setup drift). */
export function settingSeries(rows, setting) {
  return rows.map((r, i) => ({ i, id: r.id, y: settingValue(r.values, setting), label: `${r.date} · ${r.session}`, event: r.event, date: r.date }))
    .filter((p) => p.y !== null);
}

/** Main jet against ADR, with the team's own line and a jet chart by ADR band. */
export function jetVsAir(rows) {
  const points = rows.map((r) => ({ id: r.id, x: r.adr, y: num(r.values.main_jet), label: `${r.session} · ${r.trackName} · ${r.date}` })).filter((p) => p.x !== null && p.y !== null);
  const line = fit(points);
  const bands = byBand(points.map((p) => ({ ...p, adr: p.x })), 'adr', 5, '%').map((b) => b); // labels only
  const chart = [];
  for (const b of bands) {
    const ps = points.filter((p) => p.x >= b.lo && p.x < b.hi);
    const jets = ps.map((p) => p.y);
    const freq = new Map(); for (const j of jets) freq.set(j, (freq.get(j) || 0) + 1);
    const most = [...freq.entries()].sort((a, c) => c[1] - a[1] || a[0] - c[0])[0];
    chart.push({ label: b.label, n: ps.length, avg: avg(jets), most: most?.[0] ?? null, min: Math.min(...jets), max: Math.max(...jets),
      predicted: line ? line.intercept + line.slope * ((b.lo + b.hi) / 2) : null });
  }
  return { points, line, chart };
}

// ---------------- engines & parts ----------------
/**
 * When will a part reach its limit? perMeeting = its average use per race meeting (laps or 1),
 * gapDays = the usual days between meetings. Returns meetings left and an approximate date.
 */
export function forecast({ used, limit, perMeeting, gapDays, today }) {
  if (!limit || used === null || used === undefined) return null;
  const left = limit - used;
  if (left <= 0) return { left, meetings: 0, date: today, overdue: true };
  if (!perMeeting) return { left, meetings: null, date: null, overdue: false };
  const meetings = left / perMeeting;
  let date = null;
  if (gapDays) {
    const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Math.round(Math.max(0, meetings - 1) * gapDays) + 1);
    date = d.toISOString().slice(0, 10);
  }
  return { left, meetings, date, overdue: false };
}

/** Typical days between race meetings from the dates given (median gap, ignoring gaps over 60 days). */
export function meetingGap(dates) {
  const ds = [...new Set(dates.filter(Boolean))].sort();
  const gaps = [];
  for (let i = 1; i < ds.length; i++) {
    const g = (new Date(`${ds[i]}T00:00:00Z`) - new Date(`${ds[i - 1]}T00:00:00Z`)) / 864e5;
    if (g > 0 && g <= 60) gaps.push(g);
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** Average use per meeting for a part over its last `last` meetings: laps, or 1 race each. */
export function perMeeting(rowsUsingPart, unit, last = 6) {
  const nights = new Map();
  for (const r of rowsUsingPart) nights.set(r.event, (nights.get(r.event) || 0) + (num(r.values.laps) || 0));
  const recent = [...nights.entries()].slice(-last);
  if (!recent.length) return null;
  return unit === 'Races' ? 1 : avg(recent.map(([, laps]) => laps)) || null;
}

/** Engine health by meeting: fuel per lap (US gallons), highest and lowest tach; plus dyno results by build. */
export function engineTrends(engineIdValue, rows, builds = []) {
  const mine = rows.filter((r) => assetId(r.values.engine) === engineIdValue);
  const nights = new Map();
  for (const r of mine) {
    const n = nights.get(r.event) || { event: r.event, date: r.date, label: `${r.date} · ${r.trackName}`, used: 0, laps: 0, tachHigh: null, tachLow: null, ids: [] };
    const s = num(r.values.fuel_start); const f = num(r.values.fuel_finish); const l = num(r.values.laps);
    if (s !== null && f !== null && l && s - f > 0) { n.used += toGal(s - f, r.values.fuel_unit); n.laps += l; } // US gallons
    const th = num(r.values.tach_high); const tl = num(r.values.tach_low);
    if (th !== null) n.tachHigh = Math.max(n.tachHigh ?? th, th);
    if (tl !== null) n.tachLow = Math.min(n.tachLow ?? tl, tl);
    n.ids.push(r.id);
    nights.set(r.event, n);
  }
  const list = [...nights.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    sessions: mine.length,
    fuel: list.filter((n) => n.laps).map((n) => ({ id: n.ids[0], label: n.label, y: n.used / n.laps })),
    tachHigh: list.filter((n) => n.tachHigh !== null).map((n) => ({ id: n.ids[0], label: n.label, y: n.tachHigh })),
    tachLow: list.filter((n) => n.tachLow !== null).map((n) => ({ id: n.ids[0], label: n.label, y: n.tachLow })),
    hp: builds.filter((b) => num(b.values.hp) !== null).sort((a, b) => String(a.values.date).localeCompare(String(b.values.date)))
      .map((b) => ({ id: b.id, label: `${b.values.date || ''} · ${b.values.build_type || 'build'}`, y: num(b.values.hp) })),
    torque: builds.filter((b) => num(b.values.torque) !== null).sort((a, b) => String(a.values.date).localeCompare(String(b.values.date)))
      .map((b) => ({ id: b.id, label: `${b.values.date || ''} · ${b.values.build_type || 'build'}`, y: num(b.values.torque) })),
  };
}

/** Change from first to last, as a fraction, for a trend summary ("+6 %"). */
export function trendChange(series) {
  if (series.length < 2 || !series[0].y) return null;
  return (series[series.length - 1].y - series[0].y) / Math.abs(series[0].y);
}

/**
 * Shock fade: a shock's dyno runs over time, comparing force at a test velocity (in/s, up to the
 * test's top speed). Runs tested at several speeds are compared at the speed most runs share.
 * Uses the average columns (CA / RA) when there, else the mean of open/closed. Fixed (single-table) runs only.
 */
export function shockFade(runs, at = 5) {
  const pick = (row, a, b, c) => num(row[a]) ?? (num(row[b]) !== null && num(row[c]) !== null ? (num(row[b]) + num(row[c])) / 2 : num(row[b]) ?? num(row[c]));
  const sorted = [...runs].sort((a, b) => String(a.values.date).localeCompare(String(b.values.date)));
  const curves = sorted.map((r) => ({ r, curves: curvesBySpeed(r.values) }));
  const count = new Map();
  for (const { curves: cs } of curves) for (const c of cs) if (c.speed) count.set(c.speed, (count.get(c.speed) || 0) + 1);
  const common = [...count.entries()].sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0]?.[0] || '';
  const out = [];
  for (const { r, curves: cs } of curves) {
    const curve = cs.find((c) => c.speed === common) || cs.find((c) => !c.speed) || null;
    const rows = (curve?.rows || []).filter((x) => num(x.v) !== null);
    if (!rows.length) continue;
    const target = Math.min(at, Math.max(...rows.map((x) => num(x.v))));
    const row = rows.reduce((best, x) => (Math.abs(num(x.v) - target) < Math.abs(num(best.v) - target) ? x : best), rows[0]);
    const comp = pick(row, 'ca', 'co', 'cc'); const reb = pick(row, 'ra', 'ro', 'rc');
    if (comp === null && reb === null) continue;
    out.push({ id: r.id, date: r.values.date || '', label: r.values.label || r.values.date || 'run', speed: curve.speed, v: num(row.v), comp, reb: reb === null ? null : Math.abs(reb) });
  }
  // compared with the initial measurement (at purchase or first build) when one is marked, else the first run
  const first = out.find((x) => sorted.find((r) => r.id === x.id)?.values?.initial) || out[0];
  return out.map((x) => ({ ...x, initial: x.id === first?.id && !!sorted.find((r) => r.id === x.id)?.values?.initial,
    compChange: first?.comp ? (x.comp - first.comp) / first.comp : null, rebChange: first?.reb ? (x.reb - first.reb) / first.reb : null }));
}
