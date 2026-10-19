import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './store.js';
import { useSession } from './session.jsx';
import { listForField } from '@shared/platform.js';

// Pick-lists managed by the platform admin (kept with the session so they work offline).
let PLATFORM_LISTS = {};
export const setPlatformLists = (lists) => { PLATFORM_LISTS = lists || {}; };
export const platformList = (key) => PLATFORM_LISTS[key] || null;

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
  if (lk && PLATFORM_LISTS[lk]?.length) return PLATFORM_LISTS[lk];
  if (field.optionsFrom === 'sessions') return form?.data.sessions || [];
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
    default: return rec.type;
  }
}

const LEVELS = { weekly: 'Weekly', race2: 'Every 2nd race', monthly: 'Monthly / 4th race' };
/** showIf: "key=A", "key=A|B" (any of; empty allowed: "key=|A"), "key!=A|B". */
export function isVisible(field, values) {
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
      const opt = (field.optionsFrom === 'levels') ? levelLabel(val) : val;
      return String(opt);
    }
    case 'corners':
      return (field.corners || []).map((c) => `${c} ${display({ type: field.input === 'asset' ? 'asset' : 'text' }, val?.[c], data)}`).join('  ');
    case 'check': return val?.done ? `✓${val.value ? ` ${val.value}` : ''}` : '';
    case 'date': return fmtDate(val);
    default: return String(val);
  }
}

export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  return isNaN(dt) ? d : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
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
