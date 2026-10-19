// Setup sheet layout helpers shared by the app and the form upgrades:
//  - which fields are post-session readings ("after"), and the −/+ step for quick edits;
//  - a person's own section order / hidden / folded sections (users.prefs.setup_layout);
//  - what changed compared with the session the sheet was copied from.

/** Readings taken after the session — labelled "after", and shown by the Before / After switch. */
export const AFTER_KEYS = ['pressure_hot', 'stagger_hot', 'travel', 'laps', 'finish', 'fuel_finish', 'fuel_used', 'tach_low', 'tach_high',
  'track_conditions', 'conditions_notes', 'driver_feel', 'driver_comments', 'crew_feel', 'crew_comments', 'changes_next'];

/** −/+ step for values that get nudged between sessions. Shock adjusters step by 1 click. */
export const STEPS = { pressure_cold: 0.5, pressure_hot: 0.5, wing_angle: 0.5, nose_wing: 0.5, main_jet: 1 };
export const ADJUSTER_STEP = 1;

const ID = /^[a-z0-9_-]{1,40}$/;
const ids = (x) => [...new Set((Array.isArray(x) ? x : []).filter((k) => typeof k === 'string' && ID.test(k)))].slice(0, 40);

/** Clean a setup_layout preference: { order, hidden, collapsed } (lists of section ids). */
export function cleanLayout(p) {
  if (!p || typeof p !== 'object') return {};
  const out = {};
  for (const k of ['order', 'hidden', 'collapsed']) if (k in p) out[k] = ids(p[k]);
  return out;
}

/** Sections in the person's order: their order first, then any sections they haven't placed, in the form's order. */
export function orderSections(sections, layout = {}) {
  const pos = new Map((layout.order || []).map((id, i) => [id, i]));
  return sections.map((s, i) => ({ s, i })).sort((a, b) => {
    const pa = pos.has(a.s.id) ? pos.get(a.s.id) : 1000 + a.i;
    const pb = pos.has(b.s.id) ? pos.get(b.s.id) : 1000 + b.i;
    return pa - pb;
  }).map((x) => x.s);
}

/** A section can't be hidden if it holds a required field. */
export const canHide = (sec) => !sec.fields.some((f) => f.required);

/** Move a section up (-1) or down (+1) in a person's order; returns the new full order. */
export function moveSection(sections, layout, id, dir) {
  const order = orderSections(sections, layout).map((s) => s.id);
  const i = order.indexOf(id); const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  [order[i], order[j]] = [order[j], order[i]];
  return order;
}

// ---- what changed since the copied session ----
const assetId = (x) => (x && typeof x === 'object' ? x.asset : null);
const norm = (x) => {
  if (x === undefined || x === null) return '';
  if (typeof x === 'object' && !Array.isArray(x)) return assetId(x) ? `asset:${assetId(x)}` : JSON.stringify(x);
  if (Array.isArray(x)) return JSON.stringify(x);
  const s = String(x).trim();
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? String(n) : s;
};
export const sameValue = (a, b) => norm(a) === norm(b);

/** Fields that count as "setup" (copied between sessions): not post-session, not calculated. */
export function settingFields(form) {
  return (form?.data?.sections || []).filter((s) => s.carry !== false && s.id !== 'session' && s.id !== 'weather')
    .flatMap((s) => s.fields.map((f) => ({ f, sec: s.id })))
    .filter(({ f }) => f.key && f.stage !== 'after' && !f.nocopy && !['heading', 'calc', 'derived'].includes(f.type));
}

/**
 * Changes on this sheet compared with `base` (the copied session's values).
 * Returns { [key]: { sec, prev, corners?: { LF: prev, … } } } — corners lists only the corners that changed.
 */
export function changedFields(form, values, base) {
  const out = {};
  if (!base) return out;
  for (const { f, sec } of settingFields(form)) {
    const a = values?.[f.key]; const b = base[f.key];
    if (f.type === 'corners') {
      const corners = {};
      for (const c of f.corners || ['LF', 'RF', 'LR', 'RR']) if (!sameValue(a?.[c], b?.[c])) corners[c] = b?.[c];
      if (Object.keys(corners).length) out[f.key] = { sec, prev: b, corners };
    } else if (!sameValue(a, b)) out[f.key] = { sec, prev: b };
  }
  return out;
}

/** Changed-field counts per section id. */
export const changeCounts = (changed) => Object.values(changed).reduce((m, c) => ({ ...m, [c.sec]: (m[c.sec] || 0) + 1 }), {});

/** Add or take away one step, keeping the step's decimals (14 + 0.5 → 14.5). Empty starts from 0. */
export function stepValue(value, step, dir) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  const base = value === '' || value === undefined || value === null || !Number.isFinite(n) ? 0 : n;
  const dp = (String(step).split('.')[1] || '').length;
  const dpv = (String(value ?? '').split('.')[1] || '').length;
  return (base + dir * step).toFixed(Math.max(dp, Math.min(dpv, 3)));
}
