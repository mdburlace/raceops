// Fuel planner at the top of a setup sheet's Race section: predicts the fuel to start with from
// the planned laps, fuel per lap from earlier sessions, and the car's minimum (pickup) level.
import { useMemo } from 'react';
import { fuelPlan, fuelRate, fuelWarnings } from '@shared/fuel.js';
import { v } from '../lib/data.js';

const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const f3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);

export function FuelPlanner({ id, data, values, readOnly, setValues }) {
  const car = data.byId[values.car];
  const minimum = v(car, 'fuel_min');
  const r = useMemo(() => {
    const sheets = data.list('setup').map((s) => ({ id: s.id, values: s.data?.values || {} }));
    const events = Object.fromEntries(data.list('event').map((e) => [e.id, e.data?.values || {}]));
    return fuelRate({ id, values, sheets, events });
  }, [data, id, values.event, values.car, values.engine]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = fuelPlan({ rate: r.rate, plannedLaps: values.planned_laps, minimum });
  const warnings = fuelWarnings({ values, plan, minimum });
  const use = () => setValues((x) => ({ ...x, fuel_start: Number(f1(plan.start)) }));

  return (
    <div className="fuel-planner" data-testid="fuel-planner">
      <div className="fuel-head">
        <b>Fuel plan</b>
        {r.rate
          ? <span className="muted small">{f3(r.rate)} gal/lap from {r.sources.map((s) => `${s.label.toLowerCase()} (${s.sessions} session${s.sessions === 1 ? '' : 's'}, ${s.laps} laps)`).join(' + ')}</span>
          : <span className="muted small">No earlier sessions with laps and fuel started/finished yet — fill those in and the rate appears.</span>}
      </div>
      {plan ? (
        <div className="fuel-row">
          <span>{values.planned_laps} laps × {f3(r.rate)} = <b>{f1(plan.burn)}</b> + minimum {f1(plan.minimum)} = </span>
          <b className="fuel-start" data-testid="fuel-predicted">{f1(plan.start)} gal</b>
          {!readOnly && <button type="button" className="btn small" onClick={use}>Use as fuel started</button>}
        </div>
      ) : r.rate ? <div className="muted small">Enter planned laps to get a start fuel.</div> : null}
      {minimum === undefined || minimum === null || minimum === ''
        ? <div className="muted small">No minimum fuel set on {car ? 'this car' : 'the car'} — set “Minimum fuel (pickup)” on the car so the plan keeps the pickup covered.</div>
        : <div className="muted small">Minimum kept in the tank: {minimum} gal.</div>}
      {warnings.map((w) => <div key={w} className="notice small">{w}</div>)}
    </div>
  );
}
