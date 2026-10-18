import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './store.js';
import { useSession } from './session.jsx';

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
    default: return rec.type;
  }
}

const LEVELS = { weekly: 'Weekly', race2: 'Every 2nd race', monthly: 'Monthly / 4th race' };
export const levelLabel = (k) => LEVELS[k] || k || '';
export const LEVEL_INCLUDES = { weekly: ['weekly'], race2: ['weekly', 'race2'], monthly: ['weekly', 'race2', 'monthly'] };

/** asset-type values are either free text or { asset: id } */
export const assetRefId = (val) => (val && typeof val === 'object' ? val.asset : null);

export function display(field, val, data) {
  if (val === null || val === undefined || val === '') return '';
  switch (field.type) {
    case 'ref': return titleOf(data?.byId[val], data) || '(missing)';
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

// ---------- safe formula evaluation (numbers, + - * / and parentheses only) ----------
export function evalFormula(expr, values) {
  const toks = String(expr || '').match(/\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_.]*|[-+*/()]/g) || [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  const atom = () => {
    const t = next();
    if (t === '(') { const x = sum(); next(); return x; }
    if (t === '-') return -atom();
    if (/^\d/.test(t || '')) return parseFloat(t);
    if (t) {
      const [k, corner] = t.split('.');
      const raw = corner ? values?.[k]?.[corner] : values?.[k];
      const n = num(raw);
      if (n === null) throw new Error('missing');
      return n;
    }
    throw new Error('syntax');
  };
  const prod = () => { let x = atom(); while (peek() === '*' || peek() === '/') { const op = next(); const y = atom(); x = op === '*' ? x * y : x / y; } return x; };
  const sum = () => { let x = prod(); while (peek() === '+' || peek() === '-') { const op = next(); const y = prod(); x = op === '+' ? x + y : x - y; } return x; };
  try {
    const r = sum();
    return Number.isFinite(r) ? Math.round(r * 1000) / 1000 : null;
  } catch { return null; }
}
