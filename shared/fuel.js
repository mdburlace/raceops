// Fuel planning for a setup sheet: fuel per lap from earlier sessions, then the fuel to start
// with = planned laps × rate + the car's minimum (so the pickup never uncovers).
const n = (x) => {
  if (x === null || x === undefined || x === '') return null;
  const y = typeof x === 'number' ? x : parseFloat(String(x).replace(/,/g, ''));
  return Number.isFinite(y) ? y : null;
};
const assetId = (x) => (x && typeof x === 'object' ? x.asset : null);

/** A session's fuel use, or null if it can't be worked out. */
export function sessionFuel(vals) {
  const s = n(vals?.fuel_start), f = n(vals?.fuel_finish), laps = n(vals?.laps);
  if (s === null || f === null || !laps || laps <= 0 || s - f <= 0) return null;
  return { used: s - f, laps };
}

/** Same-track key for an event: its track record if set, else the track name. */
export const trackKey = (ev) => (ev?.venue ? `id:${ev.venue}` : ev?.track ? `name:${String(ev.track).trim().toLowerCase()}` : null);

/**
 * sheets: [{ id, values }] all setup sheets; events: { [id]: values }.
 * Returns { rate, laps, used, sources: [{ label, sessions, laps, used }], basis } or null rate.
 */
export function fuelRate({ id, values, sheets, events }) {
  const ev = events[values.event];
  const tk = trackKey(ev);
  const engine = assetId(values.engine);
  const car = values.car;
  const others = sheets.filter((s) => s.id !== id && sessionFuel(s.values));
  const pools = [];
  const thisEvent = others.filter((s) => values.event && s.values.event === values.event && (!car || s.values.car === car));
  const atTrack = (s) => tk && s.values.event !== values.event && trackKey(events[s.values.event]) === tk;
  const trackEngine = engine ? others.filter((s) => atTrack(s) && assetId(s.values.engine) === engine) : [];
  pools.push({ label: 'This event', rows: thisEvent });
  pools.push({ label: 'This track, this engine', rows: trackEngine });
  let basis = 'event + track/engine';
  if (!thisEvent.length && !trackEngine.length) {
    const trackCar = others.filter((s) => atTrack(s) && car && s.values.car === car);
    if (trackCar.length) { pools.push({ label: 'This track, this car', rows: trackCar }); basis = 'track + car'; }
    else {
      const carAll = others.filter((s) => car && s.values.car === car);
      pools.push({ label: 'This car, any track', rows: carAll });
      basis = 'car';
    }
  }
  const sources = pools.filter((p) => p.rows.length).map((p) => {
    const t = p.rows.map((s) => sessionFuel(s.values)).reduce((a, b) => ({ used: a.used + b.used, laps: a.laps + b.laps }), { used: 0, laps: 0 });
    return { label: p.label, sessions: p.rows.length, ...t };
  });
  const used = sources.reduce((a, s) => a + s.used, 0);
  const laps = sources.reduce((a, s) => a + s.laps, 0);
  return { rate: laps ? used / laps : null, used, laps, sources, basis };
}

/** Predicted start fuel for the planned laps, with the minimum on top. */
export function fuelPlan({ rate, plannedLaps, minimum }) {
  const lapsN = n(plannedLaps), min = n(minimum) || 0;
  if (!rate || !lapsN) return null;
  const burn = rate * lapsN;
  return { burn, minimum: min, start: burn + min };
}

/** Warnings for what's entered on the sheet against the plan and the minimum. */
export function fuelWarnings({ values, plan, minimum }) {
  const out = [];
  const s = n(values.fuel_start), f = n(values.fuel_finish), min = n(minimum);
  if (plan && s !== null && s < plan.start - 0.05) out.push(`Fuel started (${s}) is below the predicted ${plan.start.toFixed(1)} — the tank could drop under the minimum.`);
  if (min !== null && f !== null && f < min) out.push(`Fuel finished (${f}) was below the minimum of ${min} — the pickup may have uncovered.`);
  return out;
}
