// Fuel planner at the top of a setup sheet's Race section: predicts the fuel to start with from
// the planned laps, fuel per lap from earlier sessions, and the car's minimum (pickup) level.
// Fuel is recorded in US gallons or litres (per sheet); "Show in" converts what's on screen.
import { useMemo, useState } from 'react';
import { FUEL_UNITS, fromGal, fuelPlan, fuelRate, fuelUnit, fuelWarnings, toGal } from '@shared/fuel.js';
import { api } from '../lib/api.js';
import { num, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const f3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);

/** The team's default fuel unit for new sheets and cars ('gal' unless set). */
export function useFuelUnits() {
  const { membership } = useSession();
  return fuelUnit(membership?.settings?.fuel_units);
}

/**
 * values: the sheet as shown (already converted when showing another unit). unit: shown unit;
 * recorded: the unit the sheet is recorded in. setView(u): show in u. setRecorded(u): change the
 * sheet's recorded unit (converts the amounts).
 */
export function FuelPlanner({ id, data, values, readOnly, setValues, unit, recorded, setView, setRecorded }) {
  const { membership, can, refresh, tid } = useSession();
  const teamUnit = fuelUnit(membership?.settings?.fuel_units);
  const [saving, setSaving] = useState(false);
  const car = data.byId[values.car];
  const minGal = toGal(num(v(car, 'fuel_min')), v(car, 'fuel_min_unit'));
  const minimum = minGal === null ? null : +fromGal(minGal, unit).toFixed(2);
  const r = useMemo(() => {
    const sheets = data.list('setup').map((s) => ({ id: s.id, values: s.data?.values || {} }));
    const events = Object.fromEntries(data.list('event').map((e) => [e.id, e.data?.values || {}]));
    return fuelRate({ id, values, sheets, events });
  }, [data, id, values.event, values.car, values.engine]); // eslint-disable-line react-hooks/exhaustive-deps
  const rate = r.rate ? fromGal(r.rate, unit) : null; // per lap, in the unit shown
  const plan = fuelPlan({ rate, plannedLaps: values.planned_laps, minimum });
  const warnings = fuelWarnings({ values, plan, minimum });
  const u = FUEL_UNITS[unit].short;
  const editable = !readOnly && unit === recorded;
  const use = () => setValues((x) => ({ ...x, fuel_start: Number(f1(plan.start)) }));
  const makeDefault = async () => {
    setSaving(true);
    try { await api(`/t/${tid}`, { method: 'PATCH', body: { settings: { ...(membership.settings || {}), fuel_units: recorded } } }); await refresh(); } finally { setSaving(false); }
  };

  return (
    <div className="fuel-planner" data-testid="fuel-planner">
      <div className="fuel-units">
        <span className="muted small">Fuel recorded in</span>
        {readOnly ? <b className="small">{FUEL_UNITS[recorded].long}</b> : (
          <select aria-label="Fuel recorded in" value={recorded} onChange={(e) => setRecorded(e.target.value)}>
            <option value="gal">US gallons</option><option value="L">Litres</option>
          </select>
        )}
        <span className="muted small fu-show">Show in</span>
        <div className="seg" role="group" aria-label="Show fuel in">
          {['gal', 'L'].map((k) => <button key={k} type="button" className={unit === k ? 'on' : ''} aria-pressed={unit === k} onClick={() => setView(k)}>{FUEL_UNITS[k].label}</button>)}
        </div>
        {!readOnly && recorded !== teamUnit && can('team.manage') && (
          <button type="button" className="link small" disabled={saving} onClick={makeDefault}>Make {FUEL_UNITS[recorded].long} the team default</button>
        )}
      </div>
      {unit !== recorded && <div className="notice info small">Showing {FUEL_UNITS[recorded].long} converted to {FUEL_UNITS[unit].long}. Switch <b>Show in</b> back to {FUEL_UNITS[recorded].label} to edit.</div>}
      <div className="fuel-head">
        <b>Fuel plan</b>
        {r.rate
          ? <span className="muted small">{f3(rate)} {u}/lap from {r.sources.map((s) => `${s.label.toLowerCase()} (${s.sessions} session${s.sessions === 1 ? '' : 's'}, ${s.laps} laps)`).join(' + ')}</span>
          : <span className="muted small">No earlier sessions with laps and fuel started/finished yet — fill those in and the rate appears.</span>}
      </div>
      {plan ? (
        <div className="fuel-row">
          <span>{values.planned_laps} laps × {f3(rate)} = <b>{f1(plan.burn)}</b> + minimum {f1(plan.minimum)} = </span>
          <b className="fuel-start" data-testid="fuel-predicted">{f1(plan.start)} {u}</b>
          {editable && <button type="button" className="btn small" onClick={use}>Use as fuel started</button>}
        </div>
      ) : r.rate ? <div className="muted small">Enter planned laps to get a start fuel.</div> : null}
      {minimum === null
        ? <div className="muted small">No minimum fuel set on {car ? 'this car' : 'the car'} — set “Minimum fuel (pickup)” on the car so the plan keeps the pickup covered.</div>
        : <div className="muted small">Minimum kept in the tank: {f1(minimum)} {u}.</div>}
      {warnings.map((w) => <div key={w} className="notice small">{w}</div>)}
    </div>
  );
}
