import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { infoFor } from '@shared/fieldInfo.js';
import { ADJUSTERS } from '@shared/baseForms2.js';
import { FieldCalc } from './Calculator.jsx';
import { assetRefId, display, evalFormula, isVisible, LEVEL_INCLUDES, membersList, optionsOf, titleOf, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { SweepField, TableField } from './TableFields.jsx';

/** ⓘ beside a field label: shows on hover or keyboard focus, toggles on tap; Esc closes. */
export function InfoTip({ info, label }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [shift, setShift] = useState(0);
  const tip = useRef(null);
  const wrap = useRef(null);
  const id = useId();
  useLayoutEffect(() => {
    if (!open || !tip.current) { setShift(0); return; }
    // clientWidth, not innerWidth: on phones the layout viewport can grow to fit the tip itself
    const vw = document.documentElement.clientWidth;
    const r = tip.current.getBoundingClientRect();
    const over = r.right - (vw - 8);
    if (over > 0) setShift(-Math.min(over, r.left - 8));
  }, [open]);
  useEffect(() => {
    if (!pinned) return undefined;
    const away = (e) => { if (!wrap.current?.contains(e.target)) { setPinned(false); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [pinned]);
  if (!info) return null;
  return (
    <span className="info-wrap" ref={wrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => { if (!pinned) setOpen(false); }}>
      <button type="button" className={`info-btn${open ? ' open' : ''}`} aria-label={`About ${label}`} aria-describedby={open ? id : undefined} aria-expanded={open}
        onFocus={() => setOpen(true)} onBlur={() => { if (!pinned) setOpen(false); }}
        onClick={(e) => { e.preventDefault(); const p = !pinned; setPinned(p); setOpen(p); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { setPinned(false); setOpen(false); } }}>i</button>
      {open && (
        <span role="tooltip" id={id} ref={tip} className="info-tip" style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          onClick={(e) => { e.preventDefault(); setPinned(false); setOpen(false); }}>
          {info.text && <span className="info-text">{info.text}</span>}
          {info.source && <span className="info-src"><b>Where to find it:</b> {info.source}</span>}
        </span>
      )}
    </span>
  );
}

function Opt({ o }) {
  const value = typeof o === 'object' ? o.value : o;
  const label = typeof o === 'object' ? o.label : o;
  return <option value={value}>{label}</option>;
}

/**
 * scope (corner pickers on setup sheets): { corner, car } — by default only assets for that
 * position (or with no position) and that car (or no car) are listed; "Show all" lists the rest.
 */
function AssetPicker({ field, value, onChange, data, compact, scope }) {
  const assets = useMemo(() => data.list('asset')
    .filter((a) => !field.category || v(a, 'category') === field.category)
    .filter((a) => v(a, 'status') !== 'Retired' || a.id === assetRefId(value))
    .sort((a, b) => titleOf(a).localeCompare(titleOf(b))), [data, field.category, value]);
  const id = assetRefId(value);
  const [textMode, setTextMode] = useState(!id && !!value);
  const [all, setAll] = useState(false);
  const fits = (a) => !scope || ((!v(a, 'position') || ['N/A', 'Any'].includes(v(a, 'position')) || v(a, 'position') === scope.corner)
    && (!scope.car || !v(a, 'car') || v(a, 'car') === scope.car));
  const main = assets.filter((a) => fits(a) || a.id === id);
  const others = scope ? assets.filter((a) => !main.includes(a)) : [];
  const label = (a) => `${titleOf(a)}${v(a, 'spec') ? ` (${v(a, 'spec')})` : ''}${scope && v(a, 'position') && v(a, 'position') !== scope.corner ? ` — ${v(a, 'position')}` : ''}`;
  const sel = id || (textMode ? '__text' : '');
  return (
    <div className={`asset-picker${compact ? ' compact' : ''}`}>
      <select id={`f-${field.key}`} value={sel} onChange={(e) => {
        const x = e.target.value;
        if (x === '__all') { setAll(true); return; }
        if (x === '__text') { setTextMode(true); onChange(''); }
        else { setTextMode(false); onChange(x ? { asset: x } : ''); }
      }}>
        <option value="">—</option>
        {main.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
        {all && others.length > 0 && <optgroup label={`Other ${String(field.category || 'asset').toLowerCase()}s`}>{others.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}</optgroup>}
        {!all && others.length > 0 && <option value="__all">Show all {String(field.category || 'asset').toLowerCase()}s ({others.length} more)…</option>}
        <option value="__text">Type a value…</option>
      </select>
      {sel === '__text' && (
        <input value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || 'Value'} autoFocus />
      )}
    </div>
  );
}

/** Label used in pickers: tracks show their location so duplicates are distinguishable. */
export function refLabel(r, data) {
  if (!r) return '';
  if (r.type === 'track') return [v(r, 'name'), [v(r, 'city'), v(r, 'region'), v(r, 'country')].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
  if (r.type === 'contact' && v(r, 'organisation')) return `${titleOf(r, data)} (${v(r, 'organisation')})`;
  return titleOf(r, data);
}

/** Searchable picker for long lists (track directory, contacts). */
export function RefSearch({ id, recs, value, onChange, data, placeholder = 'Type to search…' }) {
  const label = (r) => refLabel(r, data);
  const cur = recs.find((r) => r.id === value);
  const [text, setText] = useState(cur ? label(cur) : '');
  useEffect(() => { setText(cur ? label(cur) : ''); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const listId = `dl-${id}`;
  const matched = !!cur && text === label(cur);
  return (
    <div className="ref-search">
      <input id={id} value={text} placeholder={placeholder} list={listId} autoComplete="off"
        onChange={(e) => {
          const x = e.target.value;
          setText(x);
          const hit = recs.find((r) => label(r) === x);
          if (hit) onChange(hit.id); else if (!x) onChange('');
        }} />
      <datalist id={listId}>{recs.slice(0, 2000).map((r) => <option key={r.id} value={label(r)} />)}</datalist>
      {text && !matched && <small className="muted">Pick a match from the list</small>}
    </div>
  );
}

function TagsInput({ id, value, onChange, suggestions = [], quick = [] }) {
  const tags = Array.isArray(value) ? value : value ? [String(value)] : [];
  const [text, setText] = useState('');
  const [more, setMore] = useState(false);
  const add = (x) => { const tg = x.trim(); if (tg && !tags.includes(tg)) onChange([...tags, tg]); setText(''); };
  return (
    <div className="tags-input">
      {tags.map((tg) => (
        <span key={tg} className="chip active">{tg}<button type="button" aria-label={`Remove ${tg}`} onClick={() => onChange(tags.filter((x) => x !== tg))}>×</button></span>
      ))}
      <input id={id} value={text} list={`dl-${id}`} placeholder="Add…" onChange={(e) => { if (e.target.value.endsWith(',')) add(e.target.value.slice(0, -1)); else setText(e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }} onBlur={() => text && add(text)} />
      <datalist id={`dl-${id}`}>{suggestions.filter((x) => !tags.includes(x)).slice(0, 500).map((x) => <option key={x} value={x} />)}</datalist>
      {quick.length > 0 && (
        <div className="quick-tags">
          {quick.filter((x) => !tags.includes(x)).slice(0, more ? 200 : 12).map((x) => (
            <button type="button" key={x} className="chip" onClick={() => onChange([...tags, x])}>+ {x}</button>
          ))}
          {quick.filter((x) => !tags.includes(x)).length > 12 && <button type="button" className="link small" onClick={() => setMore(!more)}>{more ? 'fewer' : 'more…'}</button>}
        </div>
      )}
    </div>
  );
}

export function FieldInput({ field, value, onChange, data, form, suggestions, compact, values, scope }) {
  const common = { id: `f-${field.key}`, placeholder: field.placeholder || '' };
  switch (field.type) {
    case 'textarea':
      return <textarea {...common} rows={3} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input {...common} inputMode="decimal" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="num" />;
    case 'date':
      return <input {...common} type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'checkbox':
      return (
        <label className="toggle">
          <input id={common.id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <span>{value ? 'Yes' : 'No'}</span>
        </label>
      );
    case 'select':
      if (field.allowCustom) {
        // pick from the list or type a name that isn't in it
        const opts = optionsOf(field, form, data).map((o) => (typeof o === 'object' ? o.value : o));
        return (
          <>
            <input {...common} list={`dl-${field.key}`} autoComplete="off" value={value ?? ''} placeholder={field.placeholder || 'Choose or type…'} onChange={(e) => onChange(e.target.value)} />
            <datalist id={`dl-${field.key}`}>{opts.map((o) => <option key={o} value={o} />)}</datalist>
          </>
        );
      }
      return (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(() => {
            const opts = optionsOf(field, form, data);
            const has = (x) => opts.some((o) => (typeof o === 'object' ? o.value : o) === x);
            return [...opts, ...(value && !has(value) ? [value] : [])].map((o) => <Opt key={typeof o === 'object' ? o.value : o} o={o} />);
          })()}
        </select>
      );
    case 'member':
      return (
        <select {...common} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {membersList().map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          {value && !membersList().some((m) => m.id === value) && <option value={value}>Former member</option>}
        </select>
      );
    case 'multiref': {
      const sel = (Array.isArray(value) ? value : []).filter((x) => x !== '__none__');
      return (
        <div className="chips multi">
          {data.list(field.ref).map((r) => (
            <label key={r.id} className={`chip${sel.includes(r.id) ? ' active' : ''}`}>
              <input type="checkbox" hidden checked={sel.includes(r.id)}
                onChange={(e) => onChange(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} />
              {titleOf(r, data)}
            </label>
          ))}
          {data.list(field.ref).length === 0 && <span className="muted small">None yet</span>}
        </div>
      );
    }
    case 'tags':
      return <TagsInput id={common.id} value={value} onChange={onChange} suggestions={suggestions || []} quick={optionsOf(field, form, data)} />;
    case 'entityref': {
      const t = values?.[field.typeKey];
      if (!t) return <span className="muted small">Choose what it links to first</span>;
      const recs = data.list(t).slice().sort((a, b) => refLabel(a, data).localeCompare(refLabel(b, data)));
      return <RefSearch id={common.id} recs={recs} value={value} data={data} onChange={onChange} />;
    }
    case 'ref': {
      let opts = data.list(field.ref).filter((r) => !field.category || v(r, 'category') === field.category || r.id === value).slice().sort((a, b) => titleOf(a, data).localeCompare(titleOf(b, data)));
      if (field.ref === 'track') {
        // the team's own tracks first, then the rest of the directory; closed venues last
        const ours = new Set(data.list('team_track').filter((l) => v(l, 'link') !== 'Hidden').map((l) => v(l, 'track')));
        const rank = (r) => (ours.has(r.id) ? 0 : v(r, 'status') === 'Closed' ? 2 : 1);
        opts = opts.sort((a, b) => rank(a) - rank(b));
      }
      if (opts.length > 40) return <RefSearch id={common.id} recs={opts} value={value} data={data} onChange={onChange} />;
      return (
        <select {...common} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{titleOf(r, data)}</option>)}
        </select>
      );
    }
    case 'asset':
      return <AssetPicker field={field} value={value} onChange={onChange} data={data} compact={compact} scope={scope} />;
    case 'text':
    default:
      return (
        <>
          <input {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} list={suggestions ? `dl-${field.key}` : undefined} />
          {suggestions && <datalist id={`dl-${field.key}`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
        </>
      );
  }
}

/** Adjuster names for the shock picked at a corner: null = unknown (free text), [] = not adjustable. */
export function shockAdjusters(values, corner, data) {
  const a = data?.byId[assetRefId(values?.shocks?.[corner])];
  if (!a) return null;
  const t = v(a, 'adjust_type');
  if (!t) return null;
  return t === 'Non-adjustable' ? [] : ADJUSTERS[t] || null;
}
const ADJ_SEP = ' · ';
export const parseAdjust = (s, names) => {
  const out = {};
  for (const part of String(s || '').split(ADJ_SEP)) {
    const n = names.find((x) => part.startsWith(`${x} `));
    if (n) out[n] = part.slice(n.length + 1);
  }
  return out;
};
const joinAdjust = (obj, names) => names.filter((n) => String(obj[n] ?? '').trim() !== '').map((n) => `${n} ${String(obj[n]).trim()}`).join(ADJ_SEP);

function ShockAdjust({ field, corner, value, values, data, onChange }) {
  const names = shockAdjusters(values, corner, data);
  if (names === null) return <input id={`f-${field.key}-${corner}`} value={value || ''} placeholder={field.placeholder || 'e.g. 3 clicks'} onChange={(e) => onChange(e.target.value)} />;
  if (!names.length) return <span className="ro muted small">Not adjustable</span>;
  const parsed = parseAdjust(value, names);
  const legacy = value && !Object.keys(parsed).length ? value : '';
  return (
    <div className={`adj-inputs n${names.length}`}>
      {names.map((n) => (
        <label key={n} className="adj-input"><span>{n}</span>
          <input id={`f-${field.key}-${corner}-${n.replace(/\s+/g, '_')}`} inputMode="decimal" className="num" value={parsed[n] ?? ''} placeholder="clicks"
            aria-label={`${corner} ${n}`} onChange={(e) => onChange(joinAdjust({ ...parsed, [n]: e.target.value }, names))} /></label>
      ))}
      {legacy && <small className="muted span-all">Was: {legacy}</small>}
    </div>
  );
}

function Corners({ field, value, onChange, data, form, readOnly, values }) {
  const corners = field.corners || ['LF', 'RF', 'LR', 'RR'];
  const sub = { ...field, type: field.input === 'asset' ? 'asset' : field.input || 'number', key: field.key };
  const val = value || {};
  // setup sheets: shocks (and anything marked filterByCorner) list that corner's & car's assets first
  const scoped = form?.data?.target === 'setup' && field.input === 'asset' && (field.category === 'Shock' || field.filterByCorner);
  const adjust = form?.data?.target === 'setup' && field.key === 'shock_adjust';
  return (
    <div className={`corners n${corners.length}`}>
      {corners.map((c) => (
        <div key={c} className="corner">
          <span className="corner-tag">{c}</span>
          {readOnly
            ? <span className="ro">{display(sub, val[c], data) || '—'}</span>
            : adjust
              ? <ShockAdjust field={field} corner={c} value={val[c]} values={values} data={data} onChange={(x) => onChange({ ...val, [c]: x })} />
              : <FieldInput compact field={{ ...sub, key: `${field.key}-${c}` }} value={val[c]} data={data} form={form}
                  scope={scoped ? { corner: c, car: values?.car } : undefined} onChange={(x) => onChange({ ...val, [c]: x })} />}
        </div>
      ))}
    </div>
  );
}

function CheckItem({ field, value, onChange, readOnly }) {
  const val = value || {};
  const [showNote, setShowNote] = useState(!!val.note);
  const set = (patch) => onChange({ ...val, ...patch });
  return (
    <div className={`check-item${val.done ? ' done' : ''}`}>
      <label className="check-main">
        <input type="checkbox" disabled={readOnly} checked={!!val.done} onChange={(e) => set({ done: e.target.checked })} />
        <span className="check-label">{field.label}</span>
        {field.info && <InfoTip info={{ text: field.info, source: field.source }} label={field.label} />}
        <span className={`freq freq-${field.freq}`}>{{ weekly: 'W', race2: '2R', monthly: 'M' }[field.freq] || ''}</span>
      </label>
      <div className="check-extra">
        {field.measure && (
          <span className="measure">
            <input inputMode="decimal" className="num" disabled={readOnly} value={val.value || ''} placeholder="value"
              onChange={(e) => set({ value: e.target.value })} />
            <small>{field.measure}</small>
          </span>
        )}
        {!readOnly && !showNote && <button type="button" className="link small" onClick={() => setShowNote(true)}>+ note</button>}
      </div>
      {(showNote || (readOnly && val.note)) && (
        <input className="check-note" disabled={readOnly} value={val.note || ''} placeholder="Note"
          onChange={(e) => set({ note: e.target.value })} />
      )}
    </div>
  );
}

const visible = isVisible;

export default function FormRenderer({ form, values, onChange, data, readOnly, level, recordType, errors = {}, hideKeys = [], sectionExtras = {}, calcCtx = null }) {
  useSession(); // re-render when the cached member list arrives
  const suggestions = useMemo(() => {
    const out = {};
    for (const s of form?.data.sections || []) for (const f of s.fields) {
      if (f.type === 'tags') {
        out[f.key] = [...new Set([...optionsOf(f, form, data), ...data.list(recordType).flatMap((r) => (Array.isArray(v(r, f.key)) ? v(r, f.key) : []))])];
        continue;
      }
      if (!f.suggest) continue;
      out[f.key] = [...new Set(data.list(recordType).map((r) => v(r, f.key)).filter((x) => typeof x === 'string' && x))].sort();
    }
    return out;
  }, [form, data, recordType]);

  if (!form) return <p className="muted">No form defined for this record type.</p>;
  const include = level ? LEVEL_INCLUDES[level] || [] : null;

  return (
    <div className="form-sections">
      {form.data.sections.map((sec) => {
        const fields = sec.fields.filter((f) => !hideKeys.includes(f.key) && visible(f, values))
          .filter((f) => f.type !== 'check' || !include || include.includes(f.freq));
        // drop headings with nothing under them
        const shown = fields.filter((f, i) => f.type !== 'heading' || (fields[i + 1] && fields[i + 1].type !== 'heading'));
        if (!shown.length) return null;
        const isChecklist = shown.some((f) => f.type === 'check');
        if (isChecklist) {
          const total = shown.filter((f) => f.type === 'check');
          const done = total.filter((f) => values[f.key]?.done).length;
          return (
            <section key={sec.id} className="card form-section checklist">
              <h3>{sec.title}<span className="count">{done}/{total.length}</span></h3>
              {shown.map((f, i) => f.type === 'heading'
                ? <h4 key={`h${i}`} className="subhead">{f.label}</h4>
                : f.type === 'check'
                  ? <CheckItem key={f.key} field={f} value={values[f.key]} readOnly={readOnly} onChange={(x) => onChange(f.key, x)} />
                  : <Field key={f.key} f={f} {...{ values, onChange, data, form, readOnly, errors, suggestions, calcCtx }} />)}
            </section>
          );
        }
        return (
          <section key={sec.id} className="card form-section">
            <h3>{sec.title}</h3>
            {sectionExtras[sec.id] || null}
            <div className="field-grid">
              {shown.map((f, i) => f.type === 'heading'
                ? <h4 key={`h${i}`} className="subhead span-all">{f.label}</h4>
                : <Field key={f.key} f={f} {...{ values, onChange, data, form, readOnly, errors, suggestions, calcCtx }} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Field({ f, values, onChange, data, form, readOnly, errors, suggestions, calcCtx }) {
  const wide = ['textarea', 'corners', 'table', 'multiref', 'sweep', 'tags'].includes(f.type);
  let body;
  if (f.type === 'derived') {
    body = <div className="calc">{values[f.key] || '—'}{values[f.key] && f.unit ? <small> {f.unit}</small> : null}</div>;
  } else if (f.type === 'calc') {
    const r = evalFormula(f.formula, values);
    body = <div className="calc">{r ?? '—'}{r !== null && f.unit ? <small> {f.unit}</small> : null}</div>;
  } else if (f.type === 'sweep') {
    body = <SweepField field={f} value={values[f.key]} values={values} readOnly={readOnly} onChange={(x) => onChange(f.key, x)} />;
  } else if (f.type === 'table') {
    body = <TableField field={f} value={values[f.key]} readOnly={readOnly} onChange={(x) => onChange(f.key, x)} />;
  } else if (f.type === 'corners') {
    // adjuster settings only when a picked shock is adjustable (or the shock isn't known)
    if (f.key === 'shock_adjust' && form?.data?.target === 'setup') {
      const known = (f.corners || ['LF', 'RF', 'LR', 'RR']).map((c) => shockAdjusters(values, c, data));
      if (known.every((x) => Array.isArray(x) && x.length === 0) && !Object.values(values.shock_adjust || {}).some(Boolean)) return null;
    }
    body = <Corners field={f} value={values[f.key]} data={data} form={form} readOnly={readOnly} values={values} onChange={(x) => onChange(f.key, x)} />;
  } else if (readOnly) {
    body = <div className="ro">{display(f, values[f.key], data) || '—'}{values[f.key] && f.unit && f.type === 'number' ? <small> {f.unit}</small> : null}</div>;
  } else {
    body = <FieldInput field={f} value={values[f.key]} values={values} data={data} form={form} suggestions={suggestions[f.key]} onChange={(x) => onChange(f.key, x)} />;
  }
  return (
    <div className={`field${wide ? ' span-all' : ''}${errors[f.key] ? ' has-error' : ''}`}>
      <div className="field-label">
        <label htmlFor={`f-${f.key}`}>
          {f.label}{f.required && !readOnly ? <span className="req">*</span> : null}
          {f.unit && f.type !== 'calc' ? <span className="unit">{f.unit}</span> : null}
        </label>
        <InfoTip info={infoFor(form?.data?.target, f)} label={f.label} />
        {calcCtx && !readOnly && <FieldCalc target={form?.data?.target} field={f} ctx={calcCtx} onUse={(x) => onChange(f.key, x)} />}
      </div>
      {body}
      {f.help && !readOnly ? <small className="help">{f.help}</small> : null}
      {errors[f.key] ? <small className="error-text">{errors[f.key]}</small> : null}
    </div>
  );
}
