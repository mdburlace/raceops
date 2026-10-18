// Setup advisor: combines the team's own history (what was changed after a handling complaint,
// and whether the complaint went away next session) with reference tuning guides.
// Pure functions over records, so it runs in the app (offline) and on the server (for AI).
import { nextSession, orderSessions } from './sessions.js';

const v = (rec, key) => rec?.data?.values?.[key];
const num = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'number' ? x : parseFloat(String(x).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------- problems
/** Handling problems the advisor works with, and the feedback tags that mean each one. */
export const PROBLEMS = [
  { key: 'Loose entry', group: 'loose', tags: ['Loose entry', 'Snaps loose', 'Unstable on brakes'] },
  { key: 'Loose centre', group: 'loose', tags: ['Loose centre', 'Free'] },
  { key: 'Loose exit', group: 'loose', tags: ['Loose exit'] },
  { key: 'Loose everywhere', group: 'loose', tags: ['Loose entry', 'Loose centre', 'Loose exit', 'Free'], all: true },
  { key: 'Tight entry', group: 'tight', tags: ['Tight entry', "Won't turn"] },
  { key: 'Tight centre', group: 'tight', tags: ['Tight centre', 'Pushes'] },
  { key: 'Tight exit', group: 'tight', tags: ['Tight exit'] },
  { key: 'Tight everywhere', group: 'tight', tags: ['Tight entry', 'Tight centre', 'Tight exit', 'Pushes', "Won't turn"], all: true },
  { key: 'Not enough RR bite', group: 'bite', tags: ['No drive off', 'Spins tyres', 'Loses forward bite'] },
];
export const PROBLEM = Object.fromEntries(PROBLEMS.map((p) => [p.key, p]));

/** Problems suggested by a sheet's driver and crew feedback tags. */
export function problemsFromTags(tags = []) {
  const set = new Set(tags.map((t) => String(t).toLowerCase()));
  const hits = PROBLEMS.filter((p) => !p.all && p.tags.some((t) => set.has(t.toLowerCase()))).map((p) => p.key);
  for (const g of ['loose', 'tight']) {
    const specific = PROBLEMS.filter((p) => p.group === g && !p.all).map((p) => p.key);
    if (specific.every((k) => hits.includes(k))) hits.push(g === 'loose' ? 'Loose everywhere' : 'Tight everywhere');
  }
  return hits;
}
const tagsFor = (problems) => new Set(problems.flatMap((k) => PROBLEM[k]?.tags || [k]).map((t) => t.toLowerCase()));
/** A rule written for "Loose everywhere" also helps each loose phase (and vice versa, more weakly). */
function ruleApplies(ruleProblem, problems) {
  if (problems.includes(ruleProblem)) return 1;
  const rp = PROBLEM[ruleProblem];
  if (!rp) return 0;
  return problems.some((k) => PROBLEM[k]?.group === rp.group && (PROBLEM[k].all || rp.all)) ? 0.6 : 0;
}

// ---------------------------------------------------------------- setup fields & changes
/** Setup-sheet fields a guide remedy can point at (rules use these keys). */
export const TUNING_FIELDS = [
  { key: 'pressure_cold', label: 'Tire pressure', corners: true },
  { key: 'stagger_cold', label: 'Stagger' },
  { key: 'ride_height', label: 'Ride height', corners: true },
  { key: 'blocked', label: 'Blocked', corners: true },
  { key: 'bars', label: 'Torsion bars', corners: true },
  { key: 'shock_adjust', label: 'Shock adjusters', corners: true },
  { key: 'shocks', label: 'Shocks', corners: true },
  { key: 'wheel_spacing', label: 'Wheel spacing (in/out)', corners: true },
  { key: 'wheel_offset', label: 'Wheel offset', corners: true },
  { key: 'wheel_width', label: 'Wheel width', corners: true },
  { key: 'wing_angle', label: 'Wing angle' },
  { key: 'wing_position', label: 'Wing position' },
  { key: 'nose_wing', label: 'Nose wing angle' },
  { key: 'final_drive', label: 'Gear / final drive' },
  { key: 'left_pct', label: 'Left side weight %' },
  { key: 'rear_pct', label: 'Rear weight %' },
  { key: 'cross_pct', label: 'Cross weight %' },
  { key: 'lr_radius_rod', label: 'LR radius rod' },
  { key: 'rear_steer', label: 'Rear steer' },
];
export const TUNING_FIELD = Object.fromEntries(TUNING_FIELDS.map((f) => [f.key, f]));
export const CORNER_GROUPS = { left: ['LF', 'LR'], right: ['RF', 'RR'], front: ['LF', 'RF'], rear: ['LR', 'RR'] };
const cornerMatch = (ruleCorner, corner) => !ruleCorner || ruleCorner === corner || (CORNER_GROUPS[ruleCorner] || []).includes(corner);

// fields that are results or context rather than settings
const NOT_SETTINGS = new Set(['event', 'car', 'session', 'day', 'order', 'crew_chief', 'baseline', 'baseline_name', 'temp', 'baro', 'corrected', 'alt',
  'adr', 'wb', 'laps', 'start', 'finish', 'fuel_start', 'fuel_finish', 'fuel_used', 'tach_low', 'tach_high', 'notes', 'pressure_hot', 'stagger_hot',
  'travel', 'track_conditions', 'conditions_notes', 'driver_feel', 'driver_comments', 'crew_feel', 'crew_comments', 'changes_next']);

const fieldsOf = (form) => (form?.data?.sections || []).flatMap((s) => s.fields);
/** Stiffness of a bar/spring asset from its spec or name ("1000 lb/in", "Bar 1.025"). */
const assetRate = (a) => num(String(v(a, 'spec') || '').match(/[\d.]+/)?.[0]) ?? num(String(v(a, 'name') || '').match(/[\d.]+/)?.[0]);
const assetName = (val, byId) => (val && typeof val === 'object' ? (val.asset ? v(byId.get(val.asset), 'name') || 'asset' : '') : String(val ?? ''));
const sign = (d) => (d > 0 ? '+' : d < 0 ? '-' : '');
const fmt = (x) => (Number.isFinite(x) ? String(Math.round(x * 1000) / 1000) : '');

/** Setting changes between two sheets: [{ field, corner, label, from, to, dir, text }]. */
export function diffSetups(a, b, form, byId) {
  const out = [];
  for (const f of fieldsOf(form)) {
    if (NOT_SETTINGS.has(f.key) || ['heading', 'calc', 'check', 'member', 'table', 'sweep', 'tags', 'textarea'].includes(f.type)) continue;
    const x = v(a, f.key); const y = v(b, f.key);
    if (f.type === 'corners') {
      for (const c of f.corners || ['LF', 'RF', 'LR', 'RR']) {
        const p = x?.[c]; const q = y?.[c];
        if (f.input === 'asset') {
          const pn = assetName(p, byId); const qn = assetName(q, byId);
          if (!pn || !qn || pn === qn) continue;
          const pr = typeof p === 'object' ? assetRate(byId.get(p.asset)) : num(p);
          const qr = typeof q === 'object' ? assetRate(byId.get(q.asset)) : num(q);
          out.push({ field: f.key, corner: c, label: f.label, from: pn, to: qn, dir: pr !== null && qr !== null ? sign(qr - pr) : '', text: `${f.label} ${c}: ${pn} → ${qn}` });
        } else if (f.input === 'number') {
          const pn = num(p); const qn = num(q);
          if (pn === null || qn === null || pn === qn) continue;
          out.push({ field: f.key, corner: c, label: f.label, from: pn, to: qn, dir: sign(qn - pn), text: `${f.label} ${c}: ${fmt(pn)} → ${fmt(qn)} (${qn > pn ? '+' : ''}${fmt(qn - pn)}${f.unit ? ` ${f.unit}` : ''})` });
        } else if ((p ?? '') !== (q ?? '') && p && q) {
          out.push({ field: f.key, corner: c, label: f.label, from: p, to: q, dir: '', text: `${f.label} ${c}: ${p} → ${q}` });
        }
      }
      continue;
    }
    if (f.type === 'ref') {
      if (x && y && x !== y) out.push({ field: f.key, corner: '', label: f.label, from: v(byId.get(x), 'name') || '', to: v(byId.get(y), 'name') || '', dir: '', text: `${f.label}: ${v(byId.get(x), 'name') || '?'} → ${v(byId.get(y), 'name') || '?'}` });
      continue;
    }
    if (f.type === 'asset') {
      const pn = assetName(x, byId); const qn = assetName(y, byId);
      if (pn && qn && pn !== qn) out.push({ field: f.key, corner: '', label: f.label, from: pn, to: qn, dir: '', text: `${f.label}: ${pn} → ${qn}` });
      continue;
    }
    const pn = num(x); const qn = num(y);
    if (['number', 'derived'].includes(f.type) || (pn !== null && qn !== null)) {
      if (pn === null || qn === null || pn === qn) continue;
      out.push({ field: f.key, corner: '', label: f.label, from: pn, to: qn, dir: sign(qn - pn), text: `${f.label}: ${fmt(pn)} → ${fmt(qn)} (${qn > pn ? '+' : ''}${fmt(qn - pn)}${f.unit ? ` ${f.unit}` : ''})` });
    } else if (x && y && String(x) !== String(y)) {
      out.push({ field: f.key, corner: '', label: f.label, from: x, to: y, dir: '', text: `${f.label}: ${x} → ${y}` });
    }
  }
  return out;
}

const feel = (s) => [...(v(s, 'driver_feel') || []), ...(v(s, 'crew_feel') || [])];
const hasFeedback = (s) => feel(s).length > 0 || !!(v(s, 'driver_comments') || v(s, 'crew_comments'));

// ---------------------------------------------------------------- history
/**
 * Look through the team's sheets for sessions where the problem was reported, what was changed
 * for the next session, and whether the complaint was gone afterwards.
 * ctx: { setups, events, forms (Map id→form), defaultForm, byId (Map), presets }
 * query: { problems: [], conditions: [], car, track (name), excludeId }
 */
export function analyseHistory(ctx, query) {
  const wanted = tagsFor(query.problems || []);
  if (!wanted.size) return { occurrences: [], changes: [] };
  const conds = new Set((query.conditions || []).map((c) => c.toLowerCase()));
  const evTrack = (ev) => (ev ? v(ctx.byId.get(v(ev, 'venue')), 'name') || v(ev, 'track') || '' : '');
  const occurrences = [];
  for (const s of ctx.setups) {
    if (s.id === query.excludeId) continue;
    const hit = [...new Set(feel(s).filter((t) => wanted.has(String(t).toLowerCase())))];
    if (!hit.length) continue;
    const next = nextSession(ctx.setups, s, ctx.presets);
    const form = ctx.forms.get(s.data?.form_id) || ctx.defaultForm;
    const changes = next ? diffSetups(s, next, form, ctx.byId) : [];
    const after = next && hasFeedback(next) ? feel(next).filter((t) => wanted.has(String(t).toLowerCase())) : null;
    const outcome = !next ? 'no-next' : after === null ? 'unknown' : after.length ? 'still' : 'fixed';
    const ev = ctx.byId.get(v(s, 'event'));
    const shared = (v(s, 'track_conditions') || []).filter((c) => conds.has(String(c).toLowerCase()));
    let weight = 1;
    if (query.car && v(s, 'car') === query.car) weight += 0.5;
    if (query.track && evTrack(ev) && evTrack(ev).toLowerCase() === String(query.track).toLowerCase()) weight += 1;
    weight += shared.length * 0.5;
    const fin = num(v(s, 'finish')); const nfin = next ? num(v(next, 'finish')) : null;
    occurrences.push({
      id: s.id, next: next?.id || null, event: v(ev, 'name') || '', track: evTrack(ev), date: v(ev, 'date') || '', session: v(s, 'session') || '',
      next_session: next ? v(next, 'session') || '' : '', car: v(s, 'car'), tags: hit, conditions: v(s, 'track_conditions') || [], shared_conditions: shared,
      changes, outcome, still: after || [], changes_next: v(s, 'changes_next') || '', weight,
      finish: fin, next_finish: nfin, gained: fin !== null && nfin !== null ? fin - nfin : null,
    });
  }
  occurrences.sort((a, b) => b.weight - a.weight || String(b.date).localeCompare(String(a.date)));
  // group the individual changes: "Stagger −" tried N times, fixed M
  const groups = new Map();
  for (const o of occurrences) {
    for (const c of o.changes) {
      const key = `${c.field}|${c.corner}|${c.dir}`;
      const g = groups.get(key) || { key, field: c.field, corner: c.corner, dir: c.dir, label: c.label, tried: 0, fixed: 0, still: 0, unknown: 0, score: 0, examples: [] };
      g.tried += 1;
      if (o.outcome === 'fixed') { g.fixed += 1; g.score += o.weight; } else if (o.outcome === 'still') { g.still += 1; g.score -= o.weight * 0.5; } else g.unknown += 1;
      g.examples.push({ occurrence: o.id, next: o.next, text: c.text, outcome: o.outcome, event: o.event, session: o.session, date: o.date });
      groups.set(key, g);
    }
  }
  const changes = [...groups.values()].sort((a, b) => b.score - a.score || b.fixed - a.fixed || b.tried - a.tried);
  return { occurrences, changes };
}

// ---------------------------------------------------------------- guides
export const EFFECT = { high: { label: 'Highly effective', rank: 3 }, effective: { label: 'Effective', rank: 2 }, least: { label: 'Least effective', rank: 1 }, '': { label: '', rank: 1.5 } };

/** Guide rules for the problems, each with the team's own track record for that change. */
export function matchRules(guides, problems, history, current = {}) {
  const out = [];
  for (const g of guides) {
    const rules = Array.isArray(v(g, 'rules')) ? v(g, 'rules') : [];
    rules.forEach((r, i) => {
      const fit = ruleApplies(r.problem, problems);
      if (!fit) return;
      // what happened when the team made this kind of change for this kind of problem
      const ev = { tried: 0, fixed: 0, still: 0, examples: [] };
      if (r.field) {
        for (const ch of history.changes) {
          if (ch.field !== r.field || !cornerMatch(r.corner, ch.corner) || (r.dir && ch.dir !== r.dir)) continue;
          ev.tried += ch.tried; ev.fixed += ch.fixed; ev.still += ch.still; ev.examples.push(...ch.examples);
        }
      }
      const now = r.field ? currentValue(current, r.field, r.corner) : '';
      out.push({ guide: g.id, guide_name: v(g, 'name'), publisher: v(g, 'publisher') || '', rule: r, index: i, fit, evidence: ev, now });
    });
  }
  // flag places where guides point opposite ways for the same setting
  for (const a of out) {
    if (!a.rule.field || !a.rule.dir) continue;
    a.conflict = out.some((b) => b !== a && b.rule.problem === a.rule.problem && b.rule.field === a.rule.field
      && (b.rule.corner || '') === (a.rule.corner || '') && b.rule.dir && b.rule.dir !== a.rule.dir);
  }
  const evScore = (x) => (x.evidence.tried ? (x.evidence.fixed - x.evidence.still * 0.5) / x.evidence.tried : 0);
  return out.sort((a, b) => b.fit - a.fit || evScore(b) - evScore(a) || (EFFECT[b.rule.effect || '']?.rank || 0) - (EFFECT[a.rule.effect || '']?.rank || 0) || a.index - b.index);
}

function currentValue(values, field, corner) {
  const x = values?.[field];
  if (x === undefined || x === null || x === '') return '';
  if (typeof x === 'object' && !Array.isArray(x)) {
    const cs = corner ? (CORNER_GROUPS[corner] || [corner]) : Object.keys(x);
    return cs.filter((c) => x[c] !== undefined && x[c] !== '').map((c) => `${c} ${typeof x[c] === 'object' ? '(asset)' : x[c]}`).join(' · ');
  }
  return String(x);
}

/** Everything the advisor shows, from records already on the device (or loaded on the server). */
export function advise({ setups, events, forms, assets, tracks, guides, presets }, query, current = {}) {
  const byId = new Map([...setups, ...events, ...assets, ...tracks].map((r) => [r.id, r]));
  const formMap = new Map(forms.map((f) => [f.id, f]));
  const defaultForm = forms.find((f) => f.data?.target === 'setup' && f.data?.is_default) || forms.find((f) => f.data?.target === 'setup');
  const history = analyseHistory({ setups, events, forms: formMap, defaultForm, byId, presets }, query);
  const rules = matchRules(guides, query.problems || [], history, current);
  return { history, rules };
}

export { orderSessions };
