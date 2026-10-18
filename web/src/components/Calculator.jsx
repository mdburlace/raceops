// One calculator: inputs → live results, how it's worked out, and (when opened from a form
// field) a button that puts the answer into the field. Used on the Calculators page and in the
// pop-up beside fields.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CALC, FIELD_CALCS, fmt, runCalc } from '@shared/calcs.js';
import { v } from '../lib/data.js';
import { I, Icon } from './Layout.jsx';

const store = (id) => `raceops.calc.${id}`;
const load = (id) => { try { return JSON.parse(localStorage.getItem(store(id)) || '{}'); } catch { return {}; } };
const save = (id, x) => { try { localStorage.setItem(store(id), JSON.stringify(x)); } catch { /* private mode */ } };
const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, x]) => x !== undefined && x !== null && x !== '' && typeof x !== 'object').map(([k, x]) => [k, String(x)]));

/** "3/8 mi", "0.375", "420 m", "1/2 mile" → miles. */
export function trackMiles(text) {
  const s = String(text || '').toLowerCase();
  const frac = s.match(/(\d+)\s*\/\s*(\d+)/);
  const n = frac ? Number(frac[1]) / Number(frac[2]) : parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (/\bkm\b/.test(s)) return n / 1.609344;
  if (/\bm\b|metre|meter/.test(s) || n > 20) return n / 1609.344;
  return n;
}

/** Context a calculator can pre-fill from: the record's values, previous session, car, gears, track. */
export function calcContext(data, values, extra = {}) {
  const car = data?.byId[values?.car];
  const event = data?.byId[values?.event];
  const track = data?.byId[v(event, 'venue')];
  // the car's gear chart (or the team's first one): the sets the closest-gear search picks from
  const list = data?.byId[v(car, 'gear_list')] || data?.list('gear_list')[0];
  const gears = (v(list, 'sets') || [])
    .map((g) => ({ name: `Set ${g.set || '?'}`, small: Number(g.small), large: Number(g.large) }))
    .filter((g) => g.small > 0 && g.large > 0);
  return { values: values || {}, car: car?.data?.values, gears, trackMiles: trackMiles(v(event, 'track_length') || v(track, 'length')), ...extra };
}

export function CalcPanel({ id, ctx, onUse, useKey, compact }) {
  const def = CALC[id];
  const pre = useMemo(() => clean(def.prefill?.(ctx || { values: {} }) || {}), [def, ctx]);
  const [raw, setRaw] = useState(() => ({ ...(onUse ? {} : load(id)), ...pre }));
  const [copied, setCopied] = useState(false);
  const first = useRef(null);
  useEffect(() => { if (!onUse) save(id, raw); }, [id, raw, onUse]);
  useEffect(() => { first.current?.focus?.(); }, []);
  const vals = Object.fromEntries(def.inputs.map((i) => [i.k, raw[i.k] ?? i.dflt ?? '']));
  const res = runCalc(def, vals, ctx);
  const shown = def.inputs.filter((i) => !i.show || i.show(vals));
  const outs = def.outputs.filter((o) => res[o.k] !== undefined && res[o.k] !== null && res[o.k] !== '');
  const useVal = useKey && res[useKey] !== undefined ? fmt(res[useKey], def.outputs.find((o) => o.k === useKey)?.dp ?? 3).replace(/,/g, '') : null;
  const set = (k, x) => setRaw((r) => ({ ...r, [k]: x }));
  const copy = async () => {
    const text = `${def.title}\n${shown.map((i) => `${i.l}: ${vals[i.k]}${i.u ? ` ${i.u}` : ''}`).join('\n')}\n—\n${outs.map((o) => `${o.l}: ${fmt(res[o.k], o.dp)}${o.u ? ` ${o.u}` : ''}`).join('\n')}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* not allowed */ }
  };
  let firstSet = false;
  return (
    <div className={`calc-panel${compact ? ' compact' : ''}`} role="region" aria-label={def.title}>
      {!compact && <p className="muted calc-blurb">{def.blurb}</p>}
      <div className="calc-inputs">
        {shown.map((i) => {
          const opts = typeof i.options === 'function' ? i.options(vals) : i.options;
          const ref = !firstSet && i.type !== 'select' ? (firstSet = true, first) : undefined;
          const idf = `calc-${id}-${i.k}`;
          return (
            <div key={i.k} className={`field${i.type === 'list' ? ' span-all' : ''}`}>
              <label htmlFor={idf}>{i.l}{i.u && <span className="unit">{i.u}</span>}</label>
              {i.type === 'select' ? (
                <select id={idf} value={opts.includes(vals[i.k]) ? vals[i.k] : opts[0]} onChange={(e) => set(i.k, e.target.value)}>
                  {opts.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : i.type === 'list' ? (
                <textarea id={idf} ref={ref} rows={4} value={vals[i.k]} onChange={(e) => set(i.k, e.target.value)} />
              ) : (
                <input id={idf} ref={ref} inputMode="decimal" className="num" value={vals[i.k]} placeholder={i.dflt || ''} onChange={(e) => set(i.k, e.target.value)} />
              )}
            </div>
          );
        })}
      </div>
      {res.error && <div className="notice error small" role="alert">{res.error}</div>}
      <div className="calc-results" aria-live="polite">
        {!outs.length && !res.error ? <p className="muted small">Fill in the values above — results appear as you type.</p> : (
          <dl>
            {outs.map((o) => (
              <div key={o.k} className={`calc-out${o.k === useKey ? ' key' : ''}`}>
                <dt>{o.l}</dt><dd><b>{fmt(res[o.k], o.dp)}</b>{o.u && <small> {o.u}</small>}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="inline-row wrap calc-actions">
        {onUse && useVal !== null && <button type="button" className="btn primary small" onClick={() => onUse(useVal)}>Use {useVal}</button>}
        {outs.length > 0 && <button type="button" className="btn ghost small" onClick={copy}>{copied ? 'Copied' : 'Copy results'}</button>}
        {!onUse && <button type="button" className="btn ghost small" onClick={() => setRaw({})}>Clear</button>}
      </div>
      <details className="calc-how"><summary>How it’s worked out</summary><p className="small">{def.how}</p></details>
    </div>
  );
}

/** Calculator button beside a form field. */
export function FieldCalc({ target, field, ctx, onUse }) {
  const [open, setOpen] = useState(false);
  const spec = FIELD_CALCS[target]?.[field.key];
  if (!spec) return null;
  const [id, out] = spec;
  const def = CALC[id];
  return (
    <>
      <button type="button" className="calc-btn" aria-label={`${def.title} calculator`} title={`${def.title} calculator`} onClick={() => setOpen(true)}>
        <Icon d={I.calc} size={14} />
      </button>
      {open && (
        <div className="calc-modal" role="dialog" aria-modal="true" aria-label={def.title} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
          <div className="calc-scrim" onClick={() => setOpen(false)} />
          <div className="calc-sheet card">
            <div className="card-head"><h3>{def.title}</h3><button type="button" className="icon-btn" aria-label="Close calculator" onClick={() => setOpen(false)}>✕</button></div>
            <p className="muted small">{def.blurb}{out ? ` Use the result to fill “${field.label}”.` : ''}</p>
            <CalcPanel id={id} ctx={ctx} useKey={out} compact onUse={out ? (x) => { onUse(x); setOpen(false); } : null} />
          </div>
        </div>
      )}
    </>
  );
}
