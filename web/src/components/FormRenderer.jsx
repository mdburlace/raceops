import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { infoFor } from '@shared/fieldInfo.js';
import { ADJUSTERS } from '@shared/baseForms2.js';
import { ADJUSTER_STEP, orderSections, stepValue } from '@shared/setupLayout.js';
import { speedKey } from '@shared/dyno.js';
import { engineIdOf } from '@shared/engineTune.js';
import { isShop } from '@shared/shop.js';
import { FieldCalc } from './Calculator.jsx';
import { assetRefId, display, evalFormula, isVisible, LEVEL_INCLUDES, membersList, optionsOf, titleOf, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { saveRecord } from '../lib/store.js';
import { SpeedTables, SweepField, TableField } from './TableFields.jsx';
import DaysField from './DaysField.jsx';
import { QuickAddProvider, useQuickAdd } from './QuickAdd.jsx';
import { QUICK_ADD_TARGETS } from '@shared/setupQuickAdd.js';

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

const PLACE = { Top: 'the top wing', Front: 'the front wing' };
const POSITIONS = ['LF', 'RF', 'LR', 'RR', 'Front', 'Rear', 'Top'];
const RETIRED = ['Retired', 'Worn out'];

/** Short details shown beside an inventory item in a picker. */
function invDetail(a) {
  if (a.type === 'tire') {
    const c = v(a, 'circumference');
    return [[v(a, 'brand'), v(a, 'compound'), v(a, 'size')].filter(Boolean).join(' '), c && `${c}"`].filter(Boolean).join(', ');
  }
  return v(a, 'spec') || '';
}

/**
 * Pick an item from inventory — assets of a category, or tyres (field.ref = 'tire') — or enter it by hand.
 * scope (setup sheets): { corner, car } — the items meant for that corner (or wing position) and car are listed
 * first; "Show all" lists the rest. A typed value can be saved to inventory in one tap.
 */
function AssetPicker({ field, value, onChange, data, compact, scope }) {
  const { tid, user, canType } = useSession();
  const src = field.ref || 'asset';
  const thing = src === 'tire' ? 'tire' : String(field.category || 'asset').toLowerCase();
  const assets = useMemo(() => data.list(src)
    .filter((a) => src !== 'asset' || !field.category || v(a, 'category') === field.category)
    .filter((a) => !RETIRED.includes(v(a, 'status')) || a.id === assetRefId(value))
    .sort((a, b) => titleOf(a).localeCompare(titleOf(b))), [data, src, field.category, value]);
  const id = assetRefId(value);
  const [textMode, setTextMode] = useState(!id && !!value);
  const [all, setAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const carOk = (a) => {
    if (!scope?.car) return true;
    if (a.type === 'tire') { const av = v(a, 'available_for'); return !Array.isArray(av) || !av.filter((x) => x !== '__none__').length || av.includes(scope.car); }
    return !v(a, 'car') || v(a, 'car') === scope.car;
  };
  const fits = (a) => !scope || ((!v(a, 'position') || ['N/A', 'Any'].includes(v(a, 'position')) || v(a, 'position') === scope.corner) && carOk(a));
  const main = assets.filter((a) => fits(a) || a.id === id);
  const others = scope ? assets.filter((a) => !main.includes(a)) : [];
  const label = (a) => {
    const d = invDetail(a);
    return `${titleOf(a)}${d ? ` (${d})` : ''}${scope && v(a, 'position') && !['N/A', 'Any'].includes(v(a, 'position')) && v(a, 'position') !== scope.corner ? ` — ${v(a, 'position')}` : ''}`;
  };
  const sel = id || (textMode ? '__text' : '');
  const canSave = textMode && typeof value === 'string' && value.trim() && canType?.(src, 'edit') && tid;
  // a typed value becomes a new inventory item for this corner and car, and the sheet points at it
  const saveToInventory = async () => {
    setSaving(true);
    try {
      const form = data.list('form').find((f) => f.data?.target === src && f.data?.is_default) || data.list('form').find((f) => f.data?.target === src);
      const name = value.trim();
      const corner = scope?.corner;
      const values = src === 'tire'
        ? { name, position: ['LF', 'RF', 'LR', 'RR'].includes(corner) ? corner : 'Any', status: 'Mounted', ...(scope?.car ? { available_for: [scope.car] } : {}) }
        : { name, category: field.category, status: 'In Service', spec: name, ...(POSITIONS.includes(corner) ? { position: corner } : {}), ...(scope?.car ? { car: scope.car } : {}) };
      const rec = await saveRecord(tid, src, null, { form_id: form?.id, values }, user.id);
      setTextMode(false);
      onChange({ asset: rec.id });
    } finally { setSaving(false); }
  };
  const place = scope ? PLACE[scope.corner] || scope.corner : '';
  return (
    <div className={`asset-picker${compact ? ' compact' : ''}`}>
      <select id={`f-${field.key}`} value={sel} onChange={(e) => {
        const x = e.target.value;
        if (x === '__all') { setAll(true); return; }
        if (x === '__text') { setTextMode(true); onChange(''); }
        else { setTextMode(false); onChange(x ? { asset: x } : ''); }
      }}>
        <option value="">—</option>
        {scope && main.length > 0 ? <optgroup label={`For ${place}`}>{main.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}</optgroup>
          : main.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
        {all && others.length > 0 && <optgroup label={`Other ${thing}s`}>{others.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}</optgroup>}
        {!all && others.length > 0 && <option value="__all">Show all {thing}s ({others.length} more)…</option>}
        <option value="__text">Enter manually…</option>
      </select>
      {sel === '__text' && (
        <input value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || 'As it’s on the car'}
          aria-label={`${field.label || thing}${scope?.corner && !PLACE[scope.corner] ? ` ${scope.corner}` : ''} entered manually`} autoFocus />
      )}
      {canSave && (
        <button type="button" className="link-btn small" disabled={saving} onClick={saveToInventory} title={`Add “${value.trim()}” to your ${thing}s${place ? ` for ${place}` : ''}`}>
          + Save to inventory</button>
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

function TagsInput({ id, value, onChange, suggestions = [], quick = [], normalize = (x) => x.trim() }) {
  const tags = Array.isArray(value) ? value : value ? [String(value)] : [];
  const [text, setText] = useState('');
  const [more, setMore] = useState(false);
  const add = (x) => { const tg = normalize(x); if (tg && !tags.includes(tg)) onChange([...tags, tg]); setText(''); };
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
      return <NumberBox common={common} field={field} value={value} onChange={onChange} />;
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
      return <TagsInput id={common.id} value={value} onChange={onChange} suggestions={suggestions || []} quick={optionsOf(field, form, data)}
        normalize={field.normalize === 'speed' ? (x) => speedKey(x) : undefined} />;
    case 'entityref': {
      const t = values?.[field.typeKey];
      if (!t) return <span className="muted small">Choose what it links to first</span>;
      const recs = data.list(t).slice().sort((a, b) => refLabel(a, data).localeCompare(refLabel(b, data)));
      return <RefSearch id={common.id} recs={recs} value={value} data={data} onChange={onChange} />;
    }
    case 'ref': {
      let opts = data.list(field.ref).filter((r) => (!field.category || v(r, 'category') === field.category || r.id === value)
        && (!field.matchCar || !values?.car || v(r, 'car') === values.car || r.id === value)
        && (!field.match || !engineIdOf(values?.[field.match]) || v(r, field.match) === engineIdOf(values[field.match]) || r.id === value)).slice().sort((a, b) => titleOf(a, data).localeCompare(titleOf(b, data)));
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
      return <AssetPicker field={field} value={value} onChange={onChange} data={data} compact={compact}
        scope={scope || (field.scopePosition ? { corner: field.scopePosition, car: values?.car } : undefined)} />;
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

/** A number box; on a setup sheet a long press opens the quick add screen (QuickAdd.jsx). */
function NumberBox({ common, field, value, onChange }) {
  const quick = useQuickAdd(field.quickField || field, value, onChange);
  if (field.step) return <Stepper id={common.id} value={value} step={field.step} label={field.label} placeholder={common.placeholder} onChange={onChange} inputProps={quick} />;
  return <input {...common} {...quick} inputMode="decimal" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="num" />;
}

/** Number box with − and + buttons, for values that get nudged between sessions. */
export function Stepper({ id, value, step, label, placeholder, ariaLabel, onChange, inputProps }) {
  return (
    <div className="stepper">
      <button type="button" tabIndex={-1} aria-label={`Less ${label}`} onClick={() => onChange(stepValue(value, step, -1))}>−</button>
      <input id={id} inputMode="decimal" className="num" value={value ?? ''} placeholder={placeholder || ''} aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)} {...inputProps} />
      <button type="button" tabIndex={-1} aria-label={`More ${label}`} onClick={() => onChange(stepValue(value, step, 1))}>+</button>
    </div>
  );
}

/** Adjuster boxes for the shock at a corner: one stepper per adjuster for its type; free text if the type isn't known. */
function ShockAdjust({ field, corner, value, values, data, onChange, prev }) {
  const names = shockAdjusters(values, corner, data);
  if (names === null) return <input id={`f-${field.key}-${corner}`} value={value || ''} placeholder={field.placeholder || 'e.g. 3 clicks'} aria-label={`${corner} adjusters`} onChange={(e) => onChange(e.target.value)} />;
  if (!names.length) return <span className="ro muted small">Not adjustable{value ? ` — was ${value}` : ''}</span>;
  const parsed = parseAdjust(value, names);
  const before = prev === undefined ? null : parseAdjust(prev, names); // highlight just the adjusters that changed
  const legacy = value && !Object.keys(parsed).length ? value : '';
  return (
    <div className={`adj-inputs n${names.length}`}>
      {names.map((n) => (
        <div key={n} className={`adj-input${before && String(before[n] ?? '') !== String(parsed[n] ?? '') ? ' changed' : ''}`}>
          <Stepper id={`f-${field.key}-${corner}-${n.replace(/\s+/g, '_')}`} value={parsed[n] ?? ''} step={ADJUSTER_STEP} label={`${corner} ${n}`}
            ariaLabel={`${corner} ${n}`} onChange={(x) => onChange(joinAdjust({ ...parsed, [n]: x }, names))} />
          <span>{n}</span>
        </div>
      ))}
      {legacy && <small className="muted span-all">Was: {legacy}</small>}
    </div>
  );
}

const CORNERS4 = ['LF', 'RF', 'LR', 'RR'];
const cornerSub = (f) => ({ ...f, type: f.input === 'asset' ? 'asset' : f.input || 'number' });
const isScoped = (f, form) => form?.data?.target === 'setup' && f.input === 'asset' && (f.category === 'Shock' || f.filterByCorner);

/** "was 4" under a value that differs from the session this sheet was copied from. */
function Was({ field, prev, data }) {
  const text = prev === undefined || prev === null || prev === '' ? 'blank' : display(field, prev, data) || String(prev);
  return <small className="was" title={`Before: ${text}`}>was {text}</small>;
}

/** Label row for a field: name, required star, unit, "after" tag, ⓘ and calculator. */
function FieldLabel({ f, form, readOnly, calcCtx, onChange, htmlFor }) {
  return (
    <div className="field-label">
      <label htmlFor={htmlFor || `f-${f.key}`}>
        {f.label}{f.required && !readOnly ? <span className="req">*</span> : null}
        {f.unit && f.type !== 'calc' ? <span className="unit">{f.unit}</span> : null}
        {f.stage === 'after' && form?.data?.target === 'setup' ? <span className="stage-tag" title="Recorded after the session">after</span> : null}
      </label>
      <InfoTip info={infoFor(form?.data?.target, f)} label={f.label} />
      {calcCtx && !readOnly && <FieldCalc target={form?.data?.target} field={f} ctx={calcCtx} onUse={(x) => onChange(f.key, x)} />}
    </div>
  );
}

/** One value at one corner: the input (or the stored value when read-only), with its "was" note. */
function CornerCell({ f, c, values, onChange, data, form, readOnly, changed }) {
  const sub = cornerSub(f);
  const val = values[f.key] || {};
  const ch = changed?.[f.key]?.corners;
  const set = (x) => onChange(f.key, { ...val, [c]: x });
  let input;
  if (readOnly) input = <span className="ro">{display(sub, val[c], data) || '—'}</span>;
  else if (f.key === 'shock_adjust' && form?.data?.target === 'setup') input = <ShockAdjust field={f} corner={c} value={val[c]} values={values} data={data} onChange={set} prev={ch && c in ch ? ch[c] ?? '' : undefined} />;
  else {
    input = <FieldInput compact field={{ ...sub, key: `${f.key}-${c}`, quickField: { ...f, corner: c } }} value={val[c]} data={data} form={form}
      scope={isScoped(f, form) ? { corner: c, car: values?.car } : undefined} onChange={set} />;
  }
  return (
    <div className={`cg-cell${ch && c in ch && f.key !== 'shock_adjust' ? ' changed' : ''}`}>
      <span className="cg-tag">{c}</span>
      {input}
      {ch && c in ch && <Was field={sub} prev={ch[c]} data={data} />}
    </div>
  );
}

/**
 * Four-corner values as rows: one row per field with a column per corner (LF RF LR RR), so a whole
 * set of pressures or ride heights sits on one line. On a phone the label sits above its row.
 */
function CornerGrid({ fields, values, onChange, data, form, readOnly, errors, calcCtx, changed }) {
  const corners = fields[0].corners || CORNERS4;
  return (
    <div className={`corner-grid span-all n${corners.length}`}>
      <div className="cg-head" aria-hidden="true"><span /><div className="cg-cells">{corners.map((c) => <span key={c}>{c}</span>)}</div></div>
      {fields.map((f) => {
        if (f.key === 'shock_adjust' && form?.data?.target === 'setup') {
          const known = corners.map((c) => shockAdjusters(values, c, data));
          if (known.every((x) => Array.isArray(x) && x.length === 0) && !Object.values(values.shock_adjust || {}).some(Boolean)) return null;
        }
        const sub = cornerSub(f);
        const wide = sub.type !== 'number' || !!f.step || f.key === 'shock_adjust';
        return (
          <div key={f.key} className={`field cg-row${wide ? ' wide' : ''}${errors[f.key] ? ' has-error' : ''}${changed?.[f.key] ? ' changed' : ''}`}>
            <FieldLabel f={f} form={form} readOnly={readOnly} calcCtx={calcCtx} onChange={onChange} htmlFor={`f-${f.key}-${corners[0]}`} />
            <div className="cg-cells">
              {corners.map((c) => <CornerCell key={c} {...{ f, c, values, onChange, data, form, readOnly, changed }} />)}
            </div>
            {f.help && !readOnly ? <small className="help">{f.help}</small> : null}
            {errors[f.key] ? <small className="error-text">{errors[f.key]}</small> : null}
          </div>
        );
      })}
    </div>
  );
}

const shortBump = (label) => { const t = String(label).replace(/^bump rubber\s*/i, ''); return t.charAt(0).toUpperCase() + t.slice(1); };

/**
 * Setup sheet shocks: one card per corner, laid out like the car (LF RF / LR RR). Each card has the
 * shock, its adjusters (only for an adjustable shock), bump rubber details on one line, and travel.
 */
function ShockCards({ fields, values, onChange, data, form, readOnly, changed, changesOnly }) {
  const shockF = fields.find((f) => f.key === 'shocks');
  const adjF = fields.find((f) => f.key === 'shock_adjust');
  const bumps = fields.filter((f) => f.key.startsWith('bump_'));
  const others = fields.filter((f) => f !== shockF && f !== adjF && !bumps.includes(f));
  const all = form.data.sections.flatMap((s) => s.fields);
  const shockDef = shockF || all.find((f) => f.key === 'shocks');
  const has = (f, c) => !changesOnly || (changed?.[f.key]?.corners && c in changed[f.key].corners);
  const cell = (f, c, extra = {}) => <CornerCell {...{ f, c, values, onChange, data, form, readOnly, changed }} {...extra} />;
  const rowLabel = (f, c, text) => (
    <span className="sc-label"><label htmlFor={`f-${f.key}-${c}`}>{text || f.label}</label>{f.unit ? <span className="unit">{f.unit}</span> : null}
      {f.stage === 'after' ? <span className="stage-tag">after</span> : null}<InfoTip info={infoFor('setup', f)} label={f.label} /></span>
  );
  return (
    <div className="shock-cards span-all">
      {CORNERS4.map((c) => {
        const names = shockAdjusters(values, c, data);
        const adjVal = values.shock_adjust?.[c];
        const showAdj = adjF && has(adjF, c) && !(Array.isArray(names) && names.length === 0 && !adjVal);
        const myBumps = bumps.filter((f) => has(f, c));
        const myOthers = others.filter((f) => has(f, c));
        const showShock = shockF && has(shockF, c);
        if (changesOnly && !showShock && !showAdj && !myBumps.length && !myOthers.length) return null;
        return (
          <div key={c} className="shock-card" data-corner={c}>
            <div className="sc-head">
              <b className="sc-corner">{c}</b>
              {showShock ? cell(shockF, c)
                : <span className="ro">{shockDef ? display(cornerSub(shockDef), values.shocks?.[c], data) || 'No shock picked' : ''}</span>}
            </div>
            {showAdj && <div className="sc-row stack">{rowLabel(adjF, c, 'Adjusters')}{cell(adjF, c)}</div>}
            {myBumps.length > 0 && (
              <div className="sc-row stack">
                <span className="sc-label">Bump rubber<InfoTip info={{ text: 'Bump rubber (bump stop) on this shock: type, spec, free height, packers under it and the gap to the shock body at ride height.' }} label="Bump rubber" /></span>
                <div className={`sc-bump n${myBumps.length}`}>
                  {myBumps.map((f) => (
                    <div key={f.key} className="sc-mini">
                      {cell({ ...f, placeholder: '' }, c)}
                      <small>{shortBump(f.label)}{f.unit ? ` (${f.unit})` : ''}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {myOthers.map((f) => <div key={f.key} className="sc-row">{rowLabel(f, c)}{cell(f, c)}</div>)}
          </div>
        );
      })}
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

/** Split a section's fields into runs: consecutive four-corner fields (same corners) become one corner grid. */
function runs(fields) {
  const out = [];
  for (const f of fields) {
    const last = out[out.length - 1];
    if (f.type === 'corners' && last?.grid && String(last.fields[0].corners || CORNERS4) === String(f.corners || CORNERS4)) last.fields.push(f);
    else if (f.type === 'corners') out.push({ grid: true, fields: [f] });
    else out.push({ field: f });
  }
  return out;
}

/** A short line for a folded section: the session's name, or how many values are filled in. */
function sectionSummary(sec, fields, values, data) {
  if (sec.id === 'session') {
    return [values.session, titleOf(data.byId[values.car], data), values.baseline ? 'baseline' : '', values.day > 1 ? `day ${values.day}` : ''].filter(Boolean).join(' · ');
  }
  const filled = fields.filter((f) => {
    const x = values[f.key];
    if (x && typeof x === 'object' && !Array.isArray(x) && !x.asset) return Object.values(x).some((y) => y !== '' && y !== null && y !== undefined);
    return Array.isArray(x) ? x.length > 0 : x !== undefined && x !== null && x !== '';
  }).length;
  return filled ? `${filled} of ${fields.length} filled` : 'empty';
}

/** Enter moves to the next box (LF → RF → LR → RR, then the next row), like a paper sheet. */
function nextOnEnter(e) {
  if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
  const t = e.target;
  if (t.tagName !== 'INPUT' || ['checkbox', 'radio', 'file', 'submit', 'button'].includes(t.type)) return;
  const all = [...e.currentTarget.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([disabled]), select:not([disabled]), textarea:not([disabled])')]
    .filter((x) => x.offsetParent !== null);
  const i = all.indexOf(t);
  if (i >= 0 && all[i + 1]) { e.preventDefault(); all[i + 1].focus(); all[i + 1].select?.(); }
}

/**
 * layout (setup sheets): { order, hidden, collapsed: Set, toggle(id), stage: 'all'|'before'|'after',
 * changesOnly, changed: changedFields(), openAll } — the person's section order, folded sections,
 * the Before / After switch and change highlighting.
 */
export default function FormRenderer({ form, values, onChange, data, readOnly: allReadOnly, level, recordType, recordId = null, errors = {}, hideKeys = [], roKeys = [], roSections = null, sectionExtras = {}, sectionAfter = {}, calcCtx = null, layout = null }) {
  const { membership } = useSession(); // also re-renders when the cached member list arrives
  const shopTeam = isShop(membership);
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
  const changed = layout?.changed || null;
  const stage = layout?.stage || 'all';
  const sections = layout ? orderSections(form.data.sections, layout).filter((s) => !(layout.hidden || []).includes(s.id)) : form.data.sections;
  const setup = form.data.target === 'setup';

  return (
    <QuickAddProvider enabled={!allReadOnly && QUICK_ADD_TARGETS.includes(form.data.target)} data={data} recordType={recordType} values={values} recordId={recordId}>
    <div className="form-sections" onKeyDown={nextOnEnter}>
      {sections.map((sec) => {
        // part rights: only some sections can be changed (roSections lists the ones that can't)
        const readOnly = allReadOnly || (roSections ? roSections.includes(sec.id) : false);
        let fields = sec.fields.filter((f) => !hideKeys.includes(f.key) && visible(f, values) && (!f.shopOnly || shopTeam))
          .filter((f) => f.type !== 'check' || !include || include.includes(f.freq));
        if (layout && stage !== 'all') fields = fields.filter((f) => f.type === 'heading' || (stage === 'after') === (f.stage === 'after'));
        if (layout?.changesOnly) fields = fields.filter((f) => changed?.[f.key]);
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
                  : <Field key={f.key} f={f} {...{ values, onChange, data, form, readOnly, errors, suggestions, calcCtx, changed, recordId }} />)}
            </section>
          );
        }
        const hasError = shown.some((f) => errors[f.key]);
        const folded = !!layout && layout.collapsed?.has(sec.id) && !hasError && !layout.changesOnly;
        const nChanged = changed ? shown.filter((f) => changed[f.key]).length : 0;
        const extras = !layout || (stage !== 'after' && !layout.changesOnly) ? sectionExtras[sec.id] || null : null;
        const after = !layout || (stage !== 'after' && !layout.changesOnly) ? sectionAfter[sec.id] || null : null; // shown under the section's fields
        const shockCards = setup && sec.id === 'shocks';
        const props = { values, onChange, data, form, readOnly, errors, suggestions, calcCtx, changed, recordId };
        return (
          <section key={sec.id} id={`sec-${sec.id}`} data-sec={sec.id} className={`card form-section${folded ? ' folded' : ''}`}>
            {layout ? (
              <div className="sec-head">
                <h3><button type="button" className="sec-toggle" aria-expanded={!folded} onClick={() => layout.toggle(sec.id)}>
                  <span className="sec-caret" aria-hidden="true">{folded ? '▸' : '▾'}</span>{sec.title}</button></h3>
                {nChanged > 0 && <span className="sec-changes">{nChanged} changed</span>}
                {folded && <span className="sec-summary muted small">{sectionSummary(sec, shown, values, data)}</span>}
              </div>
            ) : <h3>{sec.title}</h3>}
            {!folded && (
              <>
                {extras}
                {shockCards && (
                  <ShockCards fields={shown.filter((f) => f.type === 'corners')} {...props} changesOnly={!!layout?.changesOnly} />
                )}
                <div className="field-grid">
                  {runs(shockCards ? shown.filter((f) => f.type !== 'corners') : shown).map((r, i) => (r.grid
                    ? <CornerGrid key={`g${i}`} fields={r.fields} {...props} />
                    : r.field.type === 'heading'
                      ? <h4 key={`h${i}`} className="subhead span-all">{r.field.label}</h4>
                      : <Field key={r.field.key} f={r.field} {...props} readOnly={readOnly || roKeys.includes(r.field.key)} />))}
                </div>
                {after}
              </>
            )}
          </section>
        );
      })}
    </div>
    </QuickAddProvider>
  );
}

function Field({ f, values, onChange, data, form, readOnly, errors, suggestions, calcCtx, changed, recordId }) {
  const wide = ['textarea', 'corners', 'table', 'multiref', 'sweep', 'tags', 'days'].includes(f.type);
  let body;
  if (f.type === 'derived') {
    body = <div className="calc">{values[f.key] || '—'}{values[f.key] && f.unit ? <small> {f.unit}</small> : null}</div>;
  } else if (f.type === 'calc') {
    const r = evalFormula(f.formula, values);
    body = <div className="calc">{r ?? '—'}{r !== null && f.unit ? <small> {f.unit}</small> : null}</div>;
  } else if (f.type === 'sweep') {
    body = <SweepField field={f} value={values[f.key]} values={values} readOnly={readOnly} onChange={(x) => onChange(f.key, x)} />;
  } else if (f.type === 'table') {
    body = f.bySpeed
      ? <SpeedTables field={f} value={values[f.key]} values={values} readOnly={readOnly} onChange={(x) => onChange(f.key, x)} />
      : <TableField field={f} value={values[f.key]} readOnly={readOnly} data={data} onChange={(x) => onChange(f.key, x)} />;
  } else if (f.type === 'days') {
    body = <DaysField value={values[f.key]} values={values} readOnly={readOnly} data={data} recordId={recordId} onChange={(x) => onChange(f.key, x)} />;
  } else if (f.type === 'corners') {
    return <CornerGrid fields={[f]} {...{ values, onChange, data, form, readOnly, errors, calcCtx, changed }} />;
  } else if (readOnly) {
    body = <div className="ro">{display(f, values[f.key], data) || '—'}{values[f.key] && f.unit && f.type === 'number' ? <small> {f.unit}</small> : null}</div>;
  } else {
    body = <FieldInput field={f} value={values[f.key]} values={values} data={data} form={form} suggestions={suggestions[f.key]} onChange={(x) => onChange(f.key, x)} />;
  }
  const ch = changed?.[f.key];
  return (
    <div className={`field${wide ? ' span-all' : ''}${errors[f.key] ? ' has-error' : ''}${ch ? ' changed' : ''}`}>
      <FieldLabel f={f} form={form} readOnly={readOnly} calcCtx={calcCtx} onChange={onChange} />
      {body}
      {ch && <Was field={f} prev={ch.prev} data={data} />}
      {f.help && !readOnly ? <small className="help">{f.help}</small> : null}
      {errors[f.key] ? <small className="error-text">{errors[f.key]}</small> : null}
    </div>
  );
}
