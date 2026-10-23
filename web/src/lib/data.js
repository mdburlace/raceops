import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './store.js';
import { useSession } from './session.jsx';
import { listForField } from '@shared/platform.js';
import { consecutiveDays, eventDayList } from '@shared/calendar.js';

// Pick-lists managed by the platform admin (kept with the session so they work offline).
let PLATFORM_LISTS = {};
export const setPlatformLists = (lists) => { PLATFORM_LISTS = lists || {}; };
// the team's own "Classes we race", offered first wherever a class is picked
let TEAM_CLASSES = [];
export const setTeamClasses = (list) => { TEAM_CLASSES = Array.isArray(list) ? list : []; };
// the car form's original fixed classes, superseded by the shared Race classes list
const OLD_CAR_CLASSES = ['410 Winged Sprint', '360 Winged Sprint', '305 Winged Sprint', 'Other'];
export const platformList = (key) => PLATFORM_LISTS[key] || null;
// the team's region pack (Team → Region & currency): licence classes, tax, currency
let REGION = null;
export const setRegion = (r) => { REGION = r; };
export const teamRegion = () => REGION;

/** All live (non-deleted) records of the current team, indexed by type and id. */
export function useTeamData() {
  const { tid } = useSession();
  const recs = useLiveQuery(
    () => (tid ? db.records.where('[tenant_id+type]').between([tid, ''], [tid, '￿']).toArray() : []),
    [tid]
  );
  if (!recs) return null;
  const byType = {};
  const byId = {};
  for (const r of recs) {
    if (r.deleted) continue;
    (byType[r.type] ||= []).push(r);
    byId[r.id] = r;
  }
  return { byType, byId, list: (t) => byType[t] || [] };
}

export const useRecordById = (id) => useLiveQuery(() => (id ? db.records.get(id) : null), [id]);

// ---------- forms ----------
export function formsFor(data, target) {
  return data.list('form').filter((f) => f.data.target === target)
    .sort((a, b) => (b.data.is_default ? 1 : 0) - (a.data.is_default ? 1 : 0) || a.data.name.localeCompare(b.data.name));
}
export function formFor(data, target, formId) {
  const fs = formsFor(data, target);
  return fs.find((f) => f.id === formId) || fs[0] || null;
}
export const allFields = (form) => (form?.data.sections || []).flatMap((s) => s.fields.map((f) => ({ ...f, section: s })));
export const fieldDef = (form, key) => allFields(form).find((f) => f.key === key);

export function optionsOf(field, form, data) {
  const lk = field.list !== false && listForField(form?.data?.target, field.key);
  if (lk === 'race_classes') {
    // one class list: the team's classes, then the platform's, then any the team added to the form
    const extra = (field.options || []).filter((o) => !OLD_CAR_CLASSES.includes(o));
    return [...new Set([...TEAM_CLASSES, ...(PLATFORM_LISTS[lk] || []), ...extra])];
  }
  if (lk && PLATFORM_LISTS[lk]?.length) return PLATFORM_LISTS[lk];
  if (field.optionsFrom === 'sessions') return form?.data.sessions || [];
  if (field.optionsFrom?.startsWith('region.')) {
    const list = REGION?.[field.optionsFrom.slice(7)];
    // the region's choices first; anything else the form lists stays pickable
    return Array.isArray(list) ? [...new Set([...list, ...(field.options || [])])] : field.options || [];
  }
  if (field.optionsFrom === 'levels') return (form?.data.levels || []).map((l) => ({ value: l.key, label: l.label }));
  if (field.optionsFrom && data) {
    const [target, key] = field.optionsFrom.split('.');
    return fieldDef(formFor(data, target), key)?.options || [];
  }
  return field.options || [];
}

// ---------- values ----------
export const v = (rec, key) => rec?.data?.values?.[key];
export const num = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'number' ? x : parseFloat(String(x).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Track display name for an event: linked track, else the typed name. */
/** “Rd 3 · Valley Speedway”: the round (if any) and the track, as event lists show them. */
export const roundAndTrack = (round, track) => [round ? `Rd ${round}` : '', track].filter(Boolean).join(' · ');

export const eventTrack = (ev, data) => (ev ? (data?.byId[ev.data?.values?.venue] ? titleOf(data.byId[ev.data.values.venue]) : ev.data?.values?.track || '') : '');

export function titleOf(rec, data) {
  if (!rec) return '—';
  const vals = rec.data?.values || {};
  switch (rec.type) {
    case 'car': return [vals.number && `#${vals.number}`, vals.name].filter(Boolean).join(' ') || 'Car';
    case 'event': return vals.name || 'Event';
    case 'asset': return vals.name || 'Asset';
    case 'schedule': return vals.name || 'Schedule';
    case 'setup': {
      const ev = data?.byId[vals.event];
      return `${vals.session || 'Session'}${ev ? ` · ${titleOf(ev)}` : ''}`;
    }
    case 'maintenance': return `${levelLabel(vals.level)} service`;
    case 'measurement': return `${vals.kind || 'Measurement'}: ${vals.value ?? ''} ${vals.unit || ''}`.trim();
    case 'form': return rec.data.name;
    case 'gear': {
      const sm = vals.small ?? vals.upper; const lg = vals.large ?? vals.lower;
      return `${vals.name || 'Gear'}${sm && lg ? ` (${sm}/${lg})` : ''}`;
    }
    case 'gear_list': return vals.name || 'Gear list';
    case 'tire': return vals.name || 'Tire';
    case 'track_check': return `Check${vals.after_session ? ` after ${vals.after_session}` : ''}${data?.byId[vals.event] ? ` · ${titleOf(data.byId[vals.event])}` : ''}`;
    case 'dyno_run': return `${vals.label || 'Dyno run'}${data?.byId[vals.asset] ? ` · ${titleOf(data.byId[vals.asset])}` : ''}`;
    case 'engine_build': return `${vals.build_type || 'Build'}${data?.byId[vals.engine] ? ` · ${titleOf(data.byId[vals.engine])}` : ''}`;
    case 'review': return `Review${vals.period ? ` · ${vals.period}` : ''}`;
    case 'track': return vals.name || 'Track';
    case 'team_track': return titleOf(data?.byId[vals.track], data);
    case 'contact': return [vals.first_name, vals.last_name].filter(Boolean).join(' ') || vals.organisation || vals.email || 'Contact';
    case 'supplier': return vals.name || 'Supplier';
    case 'series': return `${vals.name || 'Series'}${vals.season ? ` ${vals.season}` : ''}`;
    case 'contact_link': return `${titleOf(data?.byId[vals.contact], data)} — ${vals.role || ''}`;
    case 'customer': return vals.name || 'Customer';
    case 'job': return `${vals.job_no || 'Job'}${data?.byId[vals.customer] ? ` · ${titleOf(data.byId[vals.customer])}` : ''}`;
    case 'tuning_guide': return vals.name || 'Tuning guide';
    case 'fixture': return `${vals.name || 'Calendar date'}${vals.date ? ` · ${fmtDate(vals.date)}` : ''}`;
    case 'shop_setup': return `${vals.name || 'Workshop setup'}${data?.byId[vals.car] ? ` · ${titleOf(data.byId[vals.car])}` : ''}`;
    case 'engine_tune': return `${vals.name || 'Engine tune'}${data?.byId[vals.engine] ? ` · ${titleOf(data.byId[vals.engine])}` : ''}${vals.active ? ' (active)' : ''}`;
    case 'engine_check': return `Engine check${data?.byId[vals.engine] ? ` · ${titleOf(data.byId[vals.engine])}` : ''}${vals.date ? ` · ${fmtDate(vals.date)}` : ''}`;
    case 'purchase': return `${vals.item || 'Parts order'}${vals.qty && String(vals.qty) !== '1' ? ` × ${vals.qty}` : ''}`;
    case 'expense': return `${vals.description || vals.supplier_name || vals.category || 'Expense'}${vals.date ? ` · ${fmtDate(vals.date)}` : ''}`;
    case 'income': return `${vals.description || vals.kind || 'Income'}${vals.date ? ` · ${fmtDate(vals.date)}` : ''}`;
    case 'budget': return `Budget ${vals.season || ''}`.trim();
    case 'contract': return vals.name || 'Contract';
    case 'trip': return `Trip${data?.byId[vals.event] ? ` · ${titleOf(data.byId[vals.event])}` : ''}${vals.depart_date ? ` · ${fmtDate(vals.depart_date)}` : ''}`;
    case 'load_list': return vals.is_template ? `Template: ${vals.name || 'Load list'}` : `Load list${data?.byId[vals.event] ? ` · ${titleOf(data.byId[vals.event])}` : ''}`;
    case 'pre_trip': return `Pre-trip check${data?.byId[assetId(vals.vehicle)] ? ` · ${titleOf(data.byId[assetId(vals.vehicle)])}` : ''}${vals.date ? ` · ${fmtDate(vals.date)}` : ''}`;
    case 'licence': return `${vals.member ? memberName(vals.member) : vals.holder || 'Driver'} · ${vals.class || 'Licence'}`;
    case 'sponsor': return vals.name || 'Sponsor';
    case 'livery': return `${vals.name || 'Paint scheme'}${data?.byId[vals.car] ? ` · ${titleOf(data.byId[vals.car])}` : ''}`;
    case 'guest': return vals.name || 'Guest';
    case 'media': return vals.caption || 'Photo';
    case 'social_post': return `Results post${data?.byId[vals.event] ? ` · ${titleOf(data.byId[vals.event])}` : ''}`;
    case 'merch': return `${vals.name || 'Merchandise'}${vals.variant ? ` (${vals.variant})` : ''}`;
    case 'season_plan': return `${titleOf(data?.byId[vals.series], data)}${data?.byId[vals.car] ? ` · ${titleOf(data.byId[vals.car])}` : ''}`;
    default: return rec.type;
  }
}

/** An asset field's record id: { asset: id } when picked from inventory, or a typed string. */
const assetId = (x) => (x && typeof x === 'object' ? x.asset : null);

const LEVELS = { weekly: 'Weekly', race2: 'Every 2nd race', monthly: 'Monthly / 4th race' };
/** showIf: "key=A", "key=A|B" (any of; empty allowed: "key=|A"), "key!=A|B". */
export function isVisible(field, values) {
  if (field.hidden) return false; // kept for its data, set by the app (e.g. an event's end date comes from its days)
  if (!field.showIf) return true;
  const neg = field.showIf.includes('!=');
  const [k, want] = field.showIf.split(neg ? '!=' : '=');
  const hit = want.split('|').includes(String(values?.[k] ?? ''));
  return neg ? !hit : hit;
}

// Team members are cached on the device so member fields work offline.
let MEMBERS = {};
export const setMembersCache = (list) => { MEMBERS = Object.fromEntries((list || []).map((m) => [m.id, m])); };
export const memberName = (id) => (id ? MEMBERS[id]?.name || 'Former member' : '');
export const membersList = () => Object.values(MEMBERS).sort((a, b) => a.name.localeCompare(b.name));

export const levelLabel = (k) => LEVELS[k] || k || '';
export const LEVEL_INCLUDES = { weekly: ['weekly'], race2: ['weekly', 'race2'], monthly: ['weekly', 'race2', 'monthly'] };

/** asset-type values are either free text or { asset: id } */
export const assetRefId = (val) => (val && typeof val === 'object' ? val.asset : null);

export function display(field, val, data) {
  if (val === null || val === undefined || val === '') return '';
  switch (field.type) {
    case 'ref': return typeof val === 'string' ? titleOf(data?.byId[val], data) || '(missing)' : '';
    case 'multiref': return (Array.isArray(val) ? val : []).filter((id) => id !== '__none__').map((id) => titleOf(data?.byId[id], data)).join(', ');
    case 'member': return memberName(val);
    case 'tags': return Array.isArray(val) ? val.join(', ') : String(val || '');
    case 'entityref': return typeof val === 'string' ? titleOf(data?.byId[val], data) : '';
    case 'table': return Array.isArray(val) ? `${val.filter((r) => Object.keys(r).length > 1).length} rows` : '';
    case 'sweep': return Array.isArray(val) ? val.map((x) => x.label).filter(Boolean).join(', ') : '';
    case 'asset': return assetRefId(val) ? titleOf(data?.byId[assetRefId(val)]) : String(val);
    case 'checkbox': return val ? 'Yes' : 'No';
    case 'select': {
      const labelled = (field.options || []).find((o) => typeof o === 'object' && String(o.value) === String(val));
      if (labelled) return labelled.label;
      const opt = (field.optionsFrom === 'levels') ? levelLabel(val) : val;
      return String(opt);
    }
    case 'corners':
      return (field.corners || []).map((c) => `${c} ${display({ type: field.input === 'asset' ? 'asset' : 'text' }, val?.[c], data)}`).join('  ');
    case 'check': return val?.done ? `✓${val.value ? ` ${val.value}` : ''}` : '';
    case 'date': return fmtDate(val);
    case 'days': return Array.isArray(val) ? eventDayList({ multi_day: true, days: val })
      .map((d) => [fmtDay(d.date), d.label, fmtTime(d.time), d.status].filter(Boolean).join(' · ')).join('; ') : '';
    default: return String(val);
  }
}

export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  return isNaN(dt) ? d : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
/** "Sat 6 Dec" — one day of a multi-day event. */
export const fmtDay = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '');
/** "6:30 pm" from a stored "18:30". */
export const fmtTime = (t) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(t || ''));
  return m ? new Date(2000, 0, 1, Number(m[1]), Number(m[2])).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
};
/**
 * When an event or shared date runs, in words: "6 Dec 2026"; "4 Dec 2026 – 6 Dec 2026" for days in a row;
 * "Thu 4 & Sat 6 Dec 2026" when there are gaps (values: the record's values).
 */
export function fmtDays(values) {
  const days = eventDayList(values);
  if (days.length <= 1) return fmtDate(values?.date);
  const first = days[0].date; const last = days[days.length - 1].date;
  if (consecutiveDays(days)) return `${fmtDate(first)} – ${fmtDate(last)}`;
  const at = (s) => new Date(`${s}T00:00:00`);
  const sameMonth = days.every((d) => d.date.slice(0, 7) === first.slice(0, 7));
  // "Fri 13", or "Fri 13 Nov" when the days run into another month
  const parts = days.map((d) => `${at(d.date).toLocaleDateString(undefined, { weekday: 'short' })} ${Number(d.date.slice(8))}${sameMonth ? '' : ` ${at(d.date).toLocaleDateString(undefined, { month: 'short' })}`}`);
  const tail = sameMonth ? at(last).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : String(at(last).getFullYear());
  return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]} ${tail}`;
}
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- safe formula evaluation ----------
// Numbers, + - * / ( ), field keys, corner values (key.LF / key.#1), `pi`, and
// functions over corner/table fields: avg(key) sum(key) min(key) max(key) slope(table, xcol, ycol)
function cornerNums(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  return Object.values(v).map(num).filter((x) => x !== null);
}
const FUNCS = {
  avg: (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null),
  sum: (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) : null),
  min: (xs) => (xs.length ? Math.min(...xs) : null),
  max: (xs) => (xs.length ? Math.max(...xs) : null),
};
export function linearSlope(rows, xk, yk) {
  const pts = (Array.isArray(rows) ? rows : []).map((r) => [num(r?.[xk]), num(r?.[yk])]).filter(([x, y]) => x !== null && y !== null);
  if (pts.length < 2) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  if (!sxx) return null;
  return pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
}

export function evalFormula(expr, values) {
  const toks = String(expr || '').match(/\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*(?:\.[#A-Za-z0-9_& ]*[A-Za-z0-9_])?|[-+*/(),]/g) || [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  const fail = () => { throw new Error('bad'); };
  const atom = () => {
    const t = next();
    if (t === '(') { const x = sum(); if (next() !== ')') fail(); return x; }
    if (t === '-') return -atom();
    if (/^\d/.test(t || '')) return parseFloat(t);
    if (!t) fail();
    if (t === 'pi') return Math.PI;
    if (peek() === '(' && (FUNCS[t] || t === 'slope')) {
      next();
      const args = [];
      while (peek() && peek() !== ')') { const a = next(); if (a !== ',') args.push(a); }
      next();
      const r = t === 'slope' ? linearSlope(values?.[args[0]], args[1], args[2]) : FUNCS[t](cornerNums(values?.[args[0]]));
      if (r === null || r === undefined) fail();
      return r;
    }
    const dot = t.indexOf('.');
    const raw = dot > 0 ? values?.[t.slice(0, dot)]?.[t.slice(dot + 1)] : values?.[t];
    const n = num(raw);
    if (n === null) fail();
    return n;
  };
  const prod = () => { let x = atom(); while (peek() === '*' || peek() === '/') { const op = next(); const y = atom(); x = op === '*' ? x * y : x / y; } return x; };
  const sum = () => { let x = prod(); while (peek() === '+' || peek() === '-') { const op = next(); const y = prod(); x = op === '+' ? x + y : x - y; } return x; };
  try {
    const r = sum();
    if (i < toks.length) return null;
    return Number.isFinite(r) ? Math.round(r * 1000) / 1000 : null;
  } catch { return null; }
}
