import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FRACTIONS, angleList, asFraction, commonValues, keypad, quickAddFor, tiltOf, withFraction } from '@shared/setupQuickAdd.js';

/**
 * The quick add screen: a long press (or right-click) on a number box on a setup sheet opens a big keypad with
 * the team's common values for that box — plus sixteenths for measurements in inches, and Pick and the angle
 * finder for angles. FormRenderer provides it for the setup forms; elsewhere `useQuickAdd()` binds nothing.
 */
const Ctx = createContext(null);
const HOLD_MS = 500;

export function QuickAddProvider({ enabled, data, recordType, car, children }) {
  const [open, setOpen] = useState(null);
  const value = useMemo(() => (enabled ? { show: setOpen, data, recordType, car } : null), [enabled, data, recordType, car]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {open && <QuickAddScreen {...open} data={data} recordType={recordType} car={car} onClose={() => setOpen(null)} />}
    </Ctx.Provider>
  );
}

/**
 * Props for a number <input>: long-press it (or right-click) to open the quick add screen.
 * `field` is the form field (for a corner: the four-corner field, with `corner`).
 */
export function useQuickAdd(field, value, onChange) {
  const ctx = useContext(Ctx);
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  if (!ctx || !field) return {};
  const show = () => { fired.current = true; ctx.show({ field, value, onChange }); };
  const clear = () => { clearTimeout(timer.current); timer.current = null; };
  return {
    'data-quick': quickAddFor(field).kind,
    title: 'Long-press for the quick add screen',
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired.current = false; start.current = [e.clientX, e.clientY]; clear();
      const el = e.currentTarget;
      timer.current = setTimeout(() => { clear(); el.blur(); show(); }, HOLD_MS);
    },
    onPointerMove: (e) => {
      if (!timer.current || !start.current) return;
      if (Math.hypot(e.clientX - start.current[0], e.clientY - start.current[1]) > 10) clear();
    },
    onPointerUp: (e) => { clear(); if (fired.current) { e.preventDefault(); e.currentTarget.blur(); } },
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e) => { e.preventDefault(); clear(); if (!fired.current) show(); fired.current = false; },
  };
}

const fieldName = (f) => [f.corner, f.label].filter(Boolean).join(' ');

function QuickAddScreen({ field, value, onChange, data, recordType, car, onClose }) {
  const q = quickAddFor(field);
  const [text, setText] = useState(String(value ?? ''));
  const [tab, setTab] = useState(q.kind === 'angle' ? 'pick' : 'keys');
  const common = useMemo(() => {
    const recs = (data?.list?.(recordType) || []).slice()
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    const mine = car ? recs.filter((r) => r.data?.values?.car === car) : [];
    return commonValues(mine.length ? [...mine, ...recs.filter((r) => !mine.includes(r))] : recs, field.key, field.corner);
  }, [data, recordType, car, field.key, field.corner]);
  const done = (t = text) => { onChange(String(t).trim().replace(/\.$/, '')); onClose(); };
  const press = (k) => setText((s) => keypad(s, k));

  // the keyboard works too
  useEffect(() => {
    const onKey = (e) => {
      if (tab === 'finder') { if (e.key === 'Escape') onClose(); return; }
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === '.' || e.key === ',') press('.');
      else if (e.key === '-') press('sign');
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') done();
      else if (e.key === 'Escape') onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const frac = q.kind === 'fraction' ? asFraction(text) : '';
  return (
    <div className="qa-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`qa-sheet${tab === 'finder' ? ' qa-dark' : ''}`} role="dialog" aria-modal="true" aria-label={`Enter ${fieldName(field)}`} data-testid="quick-add">
        <h3 className="qa-title">Enter {fieldName(field)}{field.unit ? <small> ({field.unit})</small> : null}</h3>
        {q.kind === 'angle' && (
          <div className="seg qa-tabs" role="group" aria-label="How to enter it">
            {[['pick', 'Pick'], ['keys', 'Keypad'], ['finder', 'Angle finder']].map(([k, l]) => (
              <button key={k} type="button" className={tab === k ? 'active' : ''} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        )}
        {tab === 'finder' ? <AngleFinder onDone={(v) => done(v)} onCancel={onClose} /> : (
          <>
            <div className="qa-display" data-testid="qa-display" aria-live="polite">
              <span className="qa-text">{text || <span className="muted">—</span>}</span>
              {frac && <span className="qa-frac" data-testid="qa-frac">= {frac}{field.unit === 'in' ? '"' : ''}</span>}
            </div>
            {common.length > 0 && (
              <div className="qa-common" data-testid="qa-common">
                <span className="muted small">Common values</span>
                <div className="qa-chips">{common.map((c) => <button key={c} type="button" className="chip" onClick={() => setText(c)}>{c}</button>)}</div>
              </div>
            )}
            {tab === 'pick' ? (
              <div className="qa-pick" data-testid="qa-pick">
                {angleList(q).map((a) => (
                  <button key={a} type="button" className={`qa-angle${Number(text) === a && text !== '' ? ' active' : ''}`} onClick={() => setText(String(a))}>{a}°</button>
                ))}
              </div>
            ) : (
              <div className={`qa-keys${q.kind === 'fraction' ? ' with-frac' : ''}`}>
                <div className="qa-pad">
                  {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((k) => <button key={k} type="button" className="qa-key" onClick={() => press(k)}>{k}</button>)}
                  <button type="button" className="qa-key small" aria-label="Backspace" onClick={() => press('back')}>BkSp</button>
                  <button type="button" className="qa-key" onClick={() => press('0')}>0</button>
                  <div className="qa-split">
                    <button type="button" className="qa-key small" aria-label="Decimal point" onClick={() => press('.')}>.</button>
                    <button type="button" className="qa-key small" aria-label="Plus or minus" onClick={() => press('sign')}>+/−</button>
                  </div>
                </div>
                {q.kind === 'fraction' && (
                  <div className="qa-fracs" role="group" aria-label="Fractions">
                    {FRACTIONS.map((f) => (
                      <button key={f.label} type="button" className={`qa-fbtn${f.bold ? ' bold' : ''}`} aria-label={`plus ${f.label}`} onClick={() => setText((s) => withFraction(s, f.value))}>+ {f.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="qa-foot">
              <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="btn ghost" onClick={() => setText('')}>Clear</button>
              <button type="button" className="btn primary" onClick={() => done()}>OK</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// the zero point is kept while the app is open, so you can zero on the pad once and measure several things
let zeroAt = 0;
let flipped = false;

/**
 * Angle finder: lay the phone along the surface (top of the phone towards the front of the car) and read the
 * angle. Zero sets the current reading as level, for a car that isn't sitting level. Uses the tilt sensor
 * (deviceorientation); iPhones ask for permission first.
 */
function AngleFinder({ onDone, onCancel }) {
  const [raw, setRaw] = useState(null);
  const [state, setState] = useState('starting'); // starting | ask | on | none | denied
  const [zero, setZero] = useState(zeroAt);
  const [flip, setFlip] = useState(flipped);
  const smooth = useRef(null);

  const listen = () => {
    const on = (e) => {
      const t = tiltOf(e);
      if (t == null) return;
      smooth.current = smooth.current == null ? t : smooth.current + 0.25 * (t - smooth.current);
      setRaw(smooth.current); setState('on');
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  };
  // listen straight away; where the browser asks first (iPhone), offer the button until readings arrive
  useEffect(() => {
    const D = window.DeviceOrientationEvent;
    if (!D) { setState('none'); return undefined; }
    const stop = listen();
    const asks = typeof D.requestPermission === 'function';
    const t = setTimeout(() => setState((s) => (s === 'starting' ? (asks ? 'ask' : 'none') : s)), asks ? 300 : 1500);
    return () => { stop(); clearTimeout(t); };
  }, []);
  const ask = async () => {
    try {
      const r = await window.DeviceOrientationEvent.requestPermission();
      setState((s) => (r !== 'granted' ? 'denied' : s === 'on' ? s : 'starting'));
    } catch { setState('denied'); }
  };

  const shown = raw == null ? null : Math.round(((raw - zero) * (flip ? -1 : 1)) * 10) / 10;
  return (
    <div className="qa-finder" data-testid="angle-finder">
      <p className="qa-finder-hint">Find the angle: lay the phone along the surface, top of the phone towards the front of the car.</p>
      <div className="qa-finder-read" data-testid="angle-reading">{shown == null ? '—' : `${shown.toFixed(1)}°`}</div>
      {state === 'ask' && <button type="button" className="btn primary" onClick={ask}>Use the tilt sensor</button>}
      {state === 'none' && <p className="qa-finder-hint">No tilt sensor on this device. Use <b>Pick</b> or the <b>Keypad</b>.</p>}
      {state === 'denied' && <p className="qa-finder-hint">The tilt sensor wasn’t allowed. Allow motion and orientation for this site in your browser settings, or use <b>Pick</b>.</p>}
      <div className="qa-finder-tools">
        <button type="button" className="btn ghost" disabled={raw == null} onClick={() => { zeroAt = raw; setZero(raw); }}>Zero</button>
        <button type="button" className="btn ghost" disabled={raw == null} onClick={() => { flipped = !flip; setFlip(!flip); }}>Flip +/−</button>
        {zero !== 0 && <button type="button" className="btn ghost" onClick={() => { zeroAt = 0; setZero(0); }}>Reset zero</button>}
      </div>
      <div className="qa-finder-foot">
        <button type="button" className="qa-round no" aria-label="Cancel" onClick={onCancel}>✕</button>
        <button type="button" className="qa-round yes" aria-label="Use this angle" disabled={shown == null} onClick={() => onDone(String(shown))}>✓</button>
      </div>
    </div>
  );
}
