import { useMemo, useState } from 'react';
import { assetRefId, display, evalFormula, LEVEL_INCLUDES, membersList, optionsOf, titleOf, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

function Opt({ o }) {
  const value = typeof o === 'object' ? o.value : o;
  const label = typeof o === 'object' ? o.label : o;
  return <option value={value}>{label}</option>;
}

function AssetPicker({ field, value, onChange, data, compact }) {
  const assets = useMemo(() => data.list('asset')
    .filter((a) => !field.category || v(a, 'category') === field.category)
    .filter((a) => v(a, 'status') !== 'Retired' || a.id === assetRefId(value))
    .sort((a, b) => titleOf(a).localeCompare(titleOf(b))), [data, field.category, value]);
  const id = assetRefId(value);
  const [textMode, setTextMode] = useState(!id && !!value);
  const sel = id || (textMode ? '__text' : '');
  return (
    <div className={`asset-picker${compact ? ' compact' : ''}`}>
      <select id={`f-${field.key}`} value={sel} onChange={(e) => {
        const x = e.target.value;
        if (x === '__text') { setTextMode(true); onChange(''); }
        else { setTextMode(false); onChange(x ? { asset: x } : ''); }
      }}>
        <option value="">—</option>
        {assets.map((a) => <option key={a.id} value={a.id}>{titleOf(a)}{v(a, 'spec') ? ` (${v(a, 'spec')})` : ''}</option>)}
        <option value="__text">Type a value…</option>
      </select>
      {sel === '__text' && (
        <input value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || 'Value'} autoFocus />
      )}
    </div>
  );
}

export function FieldInput({ field, value, onChange, data, form, suggestions, compact }) {
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
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <span>{value ? 'Yes' : 'No'}</span>
        </label>
      );
    case 'select':
      return (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {optionsOf(field, form, data).map((o) => <Opt key={typeof o === 'object' ? o.value : o} o={o} />)}
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
      const sel = Array.isArray(value) ? value : [];
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
    case 'ref': {
      const opts = data.list(field.ref).filter((r) => !field.category || v(r, 'category') === field.category || r.id === value).slice().sort((a, b) => titleOf(a, data).localeCompare(titleOf(b, data)));
      return (
        <select {...common} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{titleOf(r, data)}</option>)}
        </select>
      );
    }
    case 'asset':
      return <AssetPicker field={field} value={value} onChange={onChange} data={data} compact={compact} />;
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

function Corners({ field, value, onChange, data, form, readOnly }) {
  const corners = field.corners || ['LF', 'RF', 'LR', 'RR'];
  const sub = { ...field, type: field.input === 'asset' ? 'asset' : field.input || 'number', key: field.key };
  const val = value || {};
  return (
    <div className={`corners n${corners.length}`}>
      {corners.map((c) => (
        <div key={c} className="corner">
          <span className="corner-tag">{c}</span>
          {readOnly
            ? <span className="ro">{display(sub, val[c], data) || '—'}</span>
            : <FieldInput compact field={{ ...sub, key: `${field.key}-${c}` }} value={val[c]} data={data} form={form}
                onChange={(x) => onChange({ ...val, [c]: x })} />}
        </div>
      ))}
    </div>
  );
}

function TableField({ field, value, onChange, readOnly }) {
  const cols = field.columns || [];
  const rows = Array.isArray(value) && value.length ? value : (field.defaultRows || [{}]);
  const set = (i, k, x) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: x } : r)));
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}{c.unit ? <small> {c.unit}</small> : null}</th>)}{!readOnly && <th />}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.key}>
                  {readOnly ? (r[c.key] ?? '') : (
                    <input inputMode="decimal" className="num" aria-label={`${c.label} row ${i + 1}`} value={r[c.key] ?? ''}
                      onChange={(e) => set(i, c.key, e.target.value)} />
                  )}
                </td>
              ))}
              {!readOnly && <td><button type="button" className="icon-btn" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && <button type="button" className="btn small ghost" onClick={() => onChange([...rows, {}])}>+ Row</button>}
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

const visible = (field, values) => {
  if (!field.showIf) return true;
  const [k, want] = field.showIf.split('=');
  return String(values[k] ?? '') === want;
};

export default function FormRenderer({ form, values, onChange, data, readOnly, level, recordType, errors = {}, hideKeys = [] }) {
  useSession(); // re-render when the cached member list arrives
  const suggestions = useMemo(() => {
    const out = {};
    for (const s of form?.data.sections || []) for (const f of s.fields) {
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
                  : <Field key={f.key} f={f} {...{ values, onChange, data, form, readOnly, errors, suggestions }} />)}
            </section>
          );
        }
        return (
          <section key={sec.id} className="card form-section">
            <h3>{sec.title}</h3>
            <div className="field-grid">
              {shown.map((f, i) => f.type === 'heading'
                ? <h4 key={`h${i}`} className="subhead span-all">{f.label}</h4>
                : <Field key={f.key} f={f} {...{ values, onChange, data, form, readOnly, errors, suggestions }} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Field({ f, values, onChange, data, form, readOnly, errors, suggestions }) {
  const wide = ['textarea', 'corners', 'table', 'multiref'].includes(f.type);
  let body;
  if (f.type === 'calc') {
    const r = evalFormula(f.formula, values);
    body = <div className="calc">{r ?? '—'}{r !== null && f.unit ? <small> {f.unit}</small> : null}</div>;
  } else if (f.type === 'table') {
    body = <TableField field={f} value={values[f.key]} readOnly={readOnly} onChange={(x) => onChange(f.key, x)} />;
  } else if (f.type === 'corners') {
    body = <Corners field={f} value={values[f.key]} data={data} form={form} readOnly={readOnly} onChange={(x) => onChange(f.key, x)} />;
  } else if (readOnly) {
    body = <div className="ro">{display(f, values[f.key], data) || '—'}{values[f.key] && f.unit && f.type === 'number' ? <small> {f.unit}</small> : null}</div>;
  } else {
    body = <FieldInput field={f} value={values[f.key]} data={data} form={form} suggestions={suggestions[f.key]} onChange={(x) => onChange(f.key, x)} />;
  }
  return (
    <div className={`field${wide ? ' span-all' : ''}${errors[f.key] ? ' has-error' : ''}`}>
      <label htmlFor={`f-${f.key}`}>
        {f.label}{f.required && !readOnly ? <span className="req">*</span> : null}
        {f.unit && f.type !== 'calc' ? <span className="unit">{f.unit}</span> : null}
      </label>
      {body}
      {f.help && !readOnly ? <small className="help">{f.help}</small> : null}
      {errors[f.key] ? <small className="error-text">{errors[f.key]}</small> : null}
    </div>
  );
}
