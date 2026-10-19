// RaceOps calculators. Each calculator is data + a pure function, so the Calculators page,
// the calculator buttons beside form fields, and the tests all use the same maths.
//
// def = { id, cat, title, blurb, inputs: [{ k, l, u?, type?: 'number'|'select'|'text'|'list', options?, dflt?, show?(i) }],
//         outputs: [{ k, l, u?, dp? }], calc(i) → { [k]: number|string } | { error }, how, prefill?(ctx) }
// Inputs arrive as strings; calc() receives numbers (null when blank) for number inputs.
import { airData, cToF, fToC, inHgToHpa, hpaToInHg, mToFt } from './weather.js';

export const CATEGORIES = [
  { key: 'air', label: 'Air & weather', area: 'track' },
  { key: 'fuel', label: 'Fuel injection & tuning', area: 'track' },
  { key: 'chassis', label: 'Chassis, tyres & weights', area: 'track' },
  { key: 'gearing', label: 'Gearing, speed & laps', area: 'track' },
  { key: 'engine', label: 'Engine builder', area: 'engines' },
  { key: 'workshop', label: 'Workshop & conversions', area: 'workshop' },
];

const PI = Math.PI;
const CI_TO_CC = 16.387064;
const area = (d) => (PI / 4) * d * d;
const dia = (a) => Math.sqrt((4 * a) / PI);
const have = (...xs) => xs.every((x) => x !== null && x !== undefined && Number.isFinite(x));
const err = (error) => ({ error });
/** Pill / jet sizes are often written in thousandths (e.g. 110 = .110 in). */
export const jetIn = (x) => (x === null || x === undefined ? null : x >= 1 ? x / 1000 : x);
const num = (x) => { if (x === null || x === undefined || x === '') return null; const v = parseFloat(String(x).replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
const fuelDensity = { Methanol: 6.63, Gasoline: 6.1, E85: 6.57, Ethanol: 6.61, Water: 8.34 }; // lb/US gal at ~60 °F

// ---------------------------------------------------------------- air & weather
const airCalc = {
  id: 'air', cat: 'air', title: 'Air correction',
  blurb: 'ADR, density altitude, dyno correction factor, dew point, wet bulb and water grains from the weather.',
  inputs: [
    { k: 'temp', l: 'Temp', u: '°F' }, { k: 'rh', l: 'Humidity', u: '%' }, { k: 'baro', l: 'Barometer (uncorrected)', u: 'inHg' },
  ],
  outputs: [
    { k: 'adr', l: 'ADR', u: '%', dp: 1 }, { k: 'da', l: 'Density altitude', u: 'ft', dp: 0 },
    { k: 'cf', l: 'Correction factor (STD)', dp: 3 }, { k: 'sae', l: 'Correction factor (SAE J1349)', dp: 3 },
    { k: 'dry', l: 'Dry barometer', u: 'inHg', dp: 2 }, { k: 'dew', l: 'Dew point', u: '°F', dp: 1 }, { k: 'wb', l: 'Wet bulb', u: '°F', dp: 1 },
    { k: 'vp', l: 'Vapour pressure', u: 'inHg', dp: 3 }, { k: 'grains', l: 'Water grains', u: 'gr/lb', dp: 1 }, { k: 'pa', l: 'Pressure altitude', u: 'ft', dp: 0 },
  ],
  calc: ({ temp, rh, baro }) => {
    if (!have(temp, rh, baro)) return {};
    const a = airData({ tC: fToC(temp), rh, pHpa: inHgToHpa(baro) });
    if (!a) return err('Barometer should be in inHg (about 25–31).');
    const dry = baro - hpaToInHg(a.vpHpa);
    return {
      adr: a.adr, da: mToFt(a.densityAltM), dry,
      cf: (29.92 / dry) * Math.sqrt((temp + 460) / 520),
      sae: 1.18 * (990 / inHgToHpa(dry)) * Math.sqrt((fToC(temp) + 273.15) / 298) - 0.18,
      dew: cToF(a.dewC), wb: cToF(a.wetBulbC), vp: hpaToInHg(a.vpHpa), grains: a.grains,
      pa: (1 - (baro / 29.921) ** 0.190284) * 145366.45,
    };
  },
  how: 'Air density from dry-air and water-vapour partial pressures; ADR = density ÷ standard air (59 °F, 29.92 inHg, dry). Density altitude is the standard-atmosphere altitude with the same density. STD correction = (29.92 ÷ dry baro) × √((°F + 460) ÷ 520); SAE J1349 = 1.18 × (990 ÷ dry hPa) × √(K ÷ 298) − 0.18. Multiply observed dyno HP by the factor.',
  prefill: ({ values, units }) => (units === 'metric' ? {} : { temp: values.temp, rh: values.humidity, baro: values.baro }),
};

const daCalc = {
  id: 'da-convert', cat: 'air', title: 'Density altitude ↔ ADR',
  blurb: 'Convert a density altitude to air density ratio, or back.',
  inputs: [{ k: 'mode', l: 'Work out', type: 'select', options: ['ADR from density altitude', 'Density altitude from ADR'], dflt: 'ADR from density altitude' },
    { k: 'da', l: 'Density altitude', u: 'ft', show: (i) => i.mode !== 'Density altitude from ADR' },
    { k: 'adr', l: 'ADR', u: '%', show: (i) => i.mode === 'Density altitude from ADR' }],
  outputs: [{ k: 'adr_out', l: 'ADR', u: '%', dp: 1 }, { k: 'da_out', l: 'Density altitude', u: 'ft', dp: 0 }],
  calc: ({ mode, da, adr }) => {
    if (mode === 'Density altitude from ADR') return have(adr) ? { da_out: mToFt(44330.8 * (1 - (adr / 100) ** 0.234969)) } : {};
    return have(da) ? { adr_out: 100 * (1 - da / 3.28084 / 44330.8) ** (1 / 0.234969) } : {};
  },
  how: 'Standard atmosphere: density altitude (m) = 44,330.8 × (1 − ratio^0.235).',
};

const altimeterCalc = {
  id: 'altimeter', cat: 'air', title: 'Altimeter ↔ station pressure',
  blurb: 'Turn the sea-level barometer from a weather report (QNH) into the pressure at the track, or back.',
  inputs: [{ k: 'mode', l: 'Work out', type: 'select', options: ['Track pressure from report', 'Report pressure from track'], dflt: 'Track pressure from report' },
    { k: 'p', l: 'Pressure', u: 'inHg' }, { k: 'elev', l: 'Track elevation', u: 'ft' }],
  outputs: [{ k: 'out', l: 'Result', u: 'inHg', dp: 2 }, { k: 'hpa', l: 'Result', u: 'hPa', dp: 1 }],
  calc: ({ mode, p, elev }) => {
    if (!have(p, elev)) return {};
    const f = ((288 - 0.0065 * (elev / 3.28084)) / 288) ** 5.2561;
    const out = mode === 'Report pressure from track' ? p / f : p * f;
    return { out, hpa: inHgToHpa(out) };
  },
  how: 'Station pressure = altimeter × ((288 − 0.0065 × elevation m) ÷ 288)^5.2561 (standard lapse rate). Weather reports and airports give sea-level (altimeter / QNH) pressure; the engine sees station pressure.',
};

const stdLapCalc = {
  id: 'std-lap', cat: 'air', title: 'Standard-day lap time',
  blurb: 'Correct a lap time to standard air so sessions in different weather can be compared.',
  inputs: [{ k: 'lap', l: 'Lap time', u: 's' }, { k: 'adr', l: 'ADR for that session', u: '%' }],
  outputs: [{ k: 'std', l: 'Standard-day lap', u: 's', dp: 3 }, { k: 'diff', l: 'Difference', u: 's', dp: 3 }],
  calc: ({ lap, adr }) => (have(lap, adr) && adr > 0 ? (() => { const std = lap * (adr / 100) ** (1 / 3); return { std, diff: std - lap }; })() : {}),
  how: 'Power is proportional to air density, and on a power-limited lap speed varies with the cube root of power, so standard lap = lap × (ADR ÷ 100)^⅓. On a slick, grip-limited track air matters less — treat this as a guide.',
  prefill: ({ values }) => ({ adr: values.adr }),
};

// ---------------------------------------------------------------- fuel injection & tuning
const orificeArea = {
  id: 'orifice-area', cat: 'fuel', title: 'Orifice / nozzle area',
  blurb: 'Area of a jet, pill or nozzle, and the total for a set of nozzles.',
  inputs: [{ k: 'd', l: 'Diameter', u: 'in (or thou)' }, { k: 'count', l: 'How many', dflt: '1' }],
  outputs: [{ k: 'a', l: 'Area each', u: 'in²', dp: 5 }, { k: 'total', l: 'Total area', u: 'in²', dp: 5 }],
  calc: ({ d, count }) => (have(d) ? { a: area(jetIn(d)), total: area(jetIn(d)) * (count || 1) } : {}),
  how: 'Area = π ÷ 4 × diameter². Sizes over 1 are read as thousandths (110 = 0.110 in).',
};

const orificeChange = {
  id: 'orifice-change', cat: 'fuel', title: 'Orifice change',
  blurb: 'How much more or less a different jet flows, or the jet for a given % change.',
  inputs: [{ k: 'mode', l: 'Work out', type: 'select', options: ['% change between two sizes', 'New size for a % change'], dflt: '% change between two sizes' },
    { k: 'old', l: 'Current diameter', u: 'in (or thou)' },
    { k: 'new', l: 'New diameter', u: 'in (or thou)', show: (i) => i.mode !== 'New size for a % change' },
    { k: 'pct', l: 'Flow change wanted', u: '%', show: (i) => i.mode === 'New size for a % change' }],
  outputs: [{ k: 'change', l: 'Flow change', u: '%', dp: 2 }, { k: 'newd', l: 'New diameter', u: 'in', dp: 4 }],
  calc: ({ mode, old, new: nw, pct }) => {
    if (!have(old)) return {};
    const o = jetIn(old);
    if (mode === 'New size for a % change') return have(pct) ? { newd: o * Math.sqrt(1 + pct / 100) } : {};
    return have(nw) ? { change: ((jetIn(nw) / o) ** 2 - 1) * 100 } : {};
  },
  how: 'Flow at the same pressure is proportional to area, so % change = (new ÷ old)² − 1, and new diameter = old × √(1 + %).',
};

const parallelOrifices = {
  id: 'parallel-orifices', cat: 'fuel', title: 'Parallel orifices',
  blurb: 'Several jets flowing together — the single jet they equal, and each one’s share of the flow.',
  inputs: [1, 2, 3, 4].map((n) => ({ k: `d${n}`, l: `Jet #${n} diameter`, u: 'in (or thou)' })),
  outputs: [{ k: 'eq', l: 'Equivalent single jet', u: 'in', dp: 4 }, ...[1, 2, 3, 4].map((n) => ({ k: `p${n}`, l: `Jet #${n} share of flow`, u: '%', dp: 1 }))],
  calc: (i) => {
    const ds = [1, 2, 3, 4].map((n) => (have(i[`d${n}`]) ? jetIn(i[`d${n}`]) : null));
    const sum = ds.reduce((s, d) => s + (d ? d * d : 0), 0);
    if (!sum) return {};
    return { eq: Math.sqrt(sum), ...Object.fromEntries(ds.map((d, n) => [`p${n + 1}`, d ? (d * d / sum) * 100 : null])) };
  },
  how: 'Areas add: equivalent diameter = √(d₁² + d₂² + …); each jet’s share = its d² ÷ the total.',
};

const orificeFlow = {
  id: 'orifice-flow', cat: 'fuel', title: 'Orifice flow',
  blurb: 'Fuel flow through a jet or nozzle at a given pressure.',
  inputs: [{ k: 'd', l: 'Orifice diameter', u: 'in (or thou)' }, { k: 'p', l: 'Pressure drop', u: 'psi' },
    { k: 'sg', l: 'Fluid specific gravity', dflt: '0.796' }, { k: 'cd', l: 'Orifice (discharge) coefficient', dflt: '0.7' }],
  outputs: [{ k: 'gpm', l: 'Flow', u: 'US gal/min', dp: 4 }, { k: 'gph', l: 'Flow', u: 'US gal/hr', dp: 2 }, { k: 'lbhr', l: 'Flow', u: 'lb/hr', dp: 1 }],
  calc: ({ d, p, sg, cd }) => {
    if (!have(d, p, sg, cd) || sg <= 0) return {};
    const gpm = 29.84 * cd * jetIn(d) ** 2 * Math.sqrt(p / sg);
    return { gpm, gph: gpm * 60, lbhr: gpm * 60 * 8.34 * sg };
  },
  how: 'Q (gpm) = 29.84 × Cd × d² × √(ΔP ÷ SG). Methanol SG ≈ 0.796, gasoline ≈ 0.72–0.74. Cd ≈ 0.6–0.8 for sharp-edged jets.',
};

const hsBypass = {
  id: 'hs-bypass', cat: 'fuel', title: 'High-speed bypass',
  blurb: 'High-speed bypass as a % of nozzle area, or the bypass size for a target %.',
  inputs: [{ k: 'nozzles', l: 'Total nozzle area', u: 'in²' },
    { k: 'mode', l: 'Work out', type: 'select', options: ['Current bypass %', 'New bypass size'], dflt: 'Current bypass %' },
    { k: 'hs', l: 'High-speed bypass diameter', u: 'in (or thou)', show: (i) => i.mode !== 'New bypass size' },
    { k: 'pct', l: 'Target bypass', u: '%', show: (i) => i.mode === 'New bypass size' }],
  outputs: [{ k: 'bypass', l: 'Bypass', u: '% of nozzle area', dp: 1 }, { k: 'newd', l: 'New high-speed bypass', u: 'in', dp: 4 }],
  calc: ({ nozzles, mode, hs, pct }) => {
    if (!have(nozzles) || nozzles <= 0) return {};
    if (mode === 'New bypass size') return have(pct) ? { newd: dia((pct / 100) * nozzles) } : {};
    return have(hs) ? { bypass: (area(jetIn(hs)) / nozzles) * 100 } : {};
  },
  how: 'Bypass % = high-speed bypass area ÷ total nozzle area × 100. New diameter = √(4 × % × nozzle area ÷ π). Get the nozzle area from “Orifice / nozzle area”.',
};

const mainJet = {
  id: 'main-jet', cat: 'fuel', title: 'Main jet (pill) for new air',
  blurb: 'Mechanical fuel injection: the main bypass pill that keeps the mixture the same when the air changes.',
  inputs: [{ k: 'nozzles', l: 'Total nozzle area', u: 'in²' }, { k: 'base_main', l: 'Main pill that was right', u: 'in (or thou)' },
    { k: 'base_adr', l: 'ADR when it was right', u: '%' }, { k: 'new_adr', l: 'ADR now', u: '%' },
    { k: 'base_boost', l: 'Boost then', u: 'psi', dflt: '0' }, { k: 'new_boost', l: 'Boost now', u: 'psi', dflt: '0' },
    { k: 'adjust', l: 'Extra richer (+) / leaner (−)', u: '%', dflt: '0' }, { k: 'rail', l: 'Rail pressure then (optional)', u: 'psi' }],
  outputs: [{ k: 'main', l: 'New main pill', u: 'in', dp: 4 }, { k: 'main_thou', l: 'New main pill', u: 'thou', dp: 1 },
    { k: 'fuel', l: 'Fuel to nozzles', u: '% change', dp: 1 }, { k: 'bypass', l: 'Pump flow bypassed (then → now)', u: '%' },
    { k: 'rail_change', l: 'Rail pressure change', u: '%', dp: 1 }, { k: 'rail_new', l: 'Rail pressure now', u: 'psi', dp: 1 }],
  calc: ({ nozzles, base_main, base_adr, new_adr, base_boost, new_boost, adjust, rail }) => {
    if (!have(nozzles, base_main, base_adr, new_adr)) return {};
    const an = nozzles; const am0 = area(jetIn(base_main));
    const air = (new_adr / base_adr) * ((14.7 + (new_boost || 0)) / (14.7 + (base_boost || 0)));
    const r = air * (1 + (adjust || 0) / 100);
    const f0 = an / (an + am0);
    const f1 = f0 * r;
    if (f1 >= 1) return err('The nozzles can’t take that much more fuel with any main pill — the bypass would need to close completely. Use bigger nozzles or a richer barrel valve setting.');
    const am1 = an / f1 - an;
    const railChange = (((an + am0) / (an + am1)) ** 2 - 1) * 100;
    return { main: dia(am1), main_thou: dia(am1) * 1000, fuel: (r - 1) * 100, bypass: `${((am0 / (an + am0)) * 100).toFixed(1)} → ${((am1 / (an + am1)) * 100).toFixed(1)}`,
      rail_change: railChange, ...(have(rail) ? { rail_new: rail * (1 + railChange / 100) } : {}) };
  },
  how: 'The pump delivers a fixed flow at a given rpm, shared between the nozzles and the main bypass pill in proportion to their areas. Fuel needed changes with air density (ADR) and boost, so the nozzles’ share must change by the same ratio: new pill area = nozzle area ÷ (old share × ratio) − nozzle area. A bigger main pill bypasses more fuel = leaner. A simplified model — confirm on plugs, EGTs or the scale.',
  prefill: ({ values, prev }) => ({ new_adr: values.adr, base_adr: prev?.adr, base_main: prev?.main_jet ?? values.main_jet }),
};

const fuelPump = {
  id: 'fuel-pump', cat: 'fuel', title: 'Fuel flow needed',
  blurb: 'Fuel an engine uses at a given horsepower, and the pump flow to cover it.',
  inputs: [{ k: 'hp', l: 'Horsepower', u: 'hp' }, { k: 'fuel', l: 'Fuel', type: 'select', options: Object.keys(fuelDensity).filter((f) => f !== 'Water'), dflt: 'Methanol' },
    { k: 'bsfc', l: 'BSFC', u: 'lb/hp·hr', dflt: '' }, { k: 'margin', l: 'Pump margin', u: '%', dflt: '20' }],
  outputs: [{ k: 'lbhr', l: 'Fuel used', u: 'lb/hr', dp: 0 }, { k: 'gph', l: 'Fuel used', u: 'US gal/hr', dp: 1 }, { k: 'pump', l: 'Pump flow needed', u: 'US gal/hr', dp: 1 }, { k: 'gpm', l: 'Pump flow needed', u: 'gal/min', dp: 2 }],
  calc: ({ hp, fuel, bsfc, margin }) => {
    if (!have(hp)) return {};
    const b = have(bsfc) ? bsfc : { Methanol: 1.1, Ethanol: 0.8, E85: 0.7, Gasoline: 0.5 }[fuel] || 0.5;
    const lbhr = hp * b; const gph = lbhr / (fuelDensity[fuel] || 6.1);
    const pump = gph * (1 + (margin || 0) / 100);
    return { lbhr, gph, pump, gpm: pump / 60 };
  },
  how: 'Fuel (lb/hr) = HP × BSFC. Typical BSFC: methanol 1.0–1.2, gasoline 0.45–0.55 lb/hp·hr. Gallons = lb ÷ fuel weight (methanol 6.63, gasoline 6.1 lb/gal).',
};

const efiInjector = {
  id: 'efi-injectors', cat: 'fuel', title: 'EFI injector size',
  blurb: 'Injector size for a horsepower, and how flow changes with fuel pressure.',
  inputs: [{ k: 'hp', l: 'Horsepower', u: 'hp' }, { k: 'n', l: 'Number of injectors', dflt: '8' }, { k: 'bsfc', l: 'BSFC', u: 'lb/hp·hr', dflt: '0.5' },
    { k: 'duty', l: 'Max duty cycle', u: '%', dflt: '80' }, { k: 'rated', l: 'Rated at pressure (optional)', u: 'psi', dflt: '43.5' }, { k: 'run', l: 'Running pressure (optional)', u: 'psi' }],
  outputs: [{ k: 'size', l: 'Injector size needed', u: 'lb/hr', dp: 1 }, { k: 'cc', l: 'Injector size needed', u: 'cc/min', dp: 0 }, { k: 'at_rated', l: 'Size to buy at rated pressure', u: 'lb/hr', dp: 1 }],
  calc: ({ hp, n, bsfc, duty, rated, run }) => {
    if (!have(hp, n, bsfc, duty) || !n || !duty) return {};
    const size = (hp * bsfc) / (n * (duty / 100));
    return { size, cc: size * 10.5, ...(have(rated, run) && run > 0 ? { at_rated: size * Math.sqrt(rated / run) } : {}) };
  },
  how: 'Injector lb/hr = HP × BSFC ÷ (injectors × duty). Flow rises with √pressure, so at a higher running pressure a smaller rated injector will do. 1 lb/hr ≈ 10.5 cc/min (gasoline).',
};

const engineAirflow = {
  id: 'engine-airflow', cat: 'fuel', title: 'Engine airflow',
  blurb: 'Air an engine pulls at a given rpm and volumetric efficiency.',
  inputs: [{ k: 'cid', l: 'Displacement', u: 'cu in' }, { k: 'rpm', l: 'RPM' }, { k: 've', l: 'Volumetric efficiency', u: '%', dflt: '100' }],
  outputs: [{ k: 'cfm', l: 'Airflow', u: 'CFM', dp: 0 }],
  calc: ({ cid, rpm, ve }) => (have(cid, rpm, ve) ? { cfm: (cid * rpm * (ve / 100)) / 3456 } : {}),
  how: 'CFM = CID × RPM × VE ÷ 3456 (four-stroke).',
  prefill: ({ values }) => ({ rpm: values.peak_rpm }),
};

const methSg = {
  id: 'meth-sg', cat: 'fuel', title: 'Methanol hydrometer check',
  blurb: 'Correct a methanol hydrometer reading to 60 °F and estimate any water in it.',
  inputs: [{ k: 'sg', l: 'Hydrometer reading (SG)' }, { k: 't', l: 'Fuel temperature', u: '°F' }],
  outputs: [{ k: 'sg60', l: 'SG at 60 °F', dp: 4 }, { k: 'water', l: 'Water, approx.', u: '% by volume', dp: 1 }],
  calc: ({ sg, t }) => {
    if (!have(sg, t)) return {};
    const sg60 = sg + 0.00053 * (t - 60);
    return { sg60, water: Math.max(0, ((sg60 - 0.7963) / (0.999 - 0.7963)) * 100) };
  },
  how: 'Methanol is 0.7963 SG at 60 °F and gets lighter about 0.00053 per °F warmer. Water (SG 0.999) raises the reading; the water % is a straight-line estimate — a fresh drum should read 0.796–0.797 at 60 °F.',
};

// ---------------------------------------------------------------- chassis, tyres & weights
const CORNERS = ['LF', 'RF', 'LR', 'RR'];
export function cornerPercents(w) {
  const [lf, rf, lr, rr] = CORNERS.map((c) => num(w?.[c]));
  if (!have(lf, rf, lr, rr)) return null;
  const total = lf + rf + lr + rr;
  if (!total) return null;
  return { total, left: ((lf + lr) / total) * 100, rear: ((lr + rr) / total) * 100, cross: ((rf + lr) / total) * 100 };
}

const chassisCalc = {
  id: 'chassis', cat: 'chassis', title: 'Corner weights ↔ percentages',
  blurb: 'Left, rear and cross (diagonal) % from four scale readings — or the corner weights for target percentages.',
  inputs: [{ k: 'mode', l: 'Work out', type: 'select', options: ['Percentages from corner weights', 'Corner weights from percentages'], dflt: 'Percentages from corner weights' },
    ...CORNERS.map((c) => ({ k: c.toLowerCase(), l: `${c} weight`, u: 'lb', show: (i) => i.mode !== 'Corner weights from percentages' })),
    ...[['w', 'Total weight', 'lb'], ['left', 'Left', '%'], ['rear', 'Rear', '%'], ['cross', 'Cross (RF + LR)', '%']].map(([k, l, u]) => ({ k, l, u, show: (i) => i.mode === 'Corner weights from percentages' }))],
  outputs: [{ k: 'total', l: 'Total', u: 'lb', dp: 0 }, { k: 'left_pct', l: 'Left', u: '%', dp: 1 }, { k: 'rear_pct', l: 'Rear', u: '%', dp: 1 }, { k: 'cross_pct', l: 'Cross (RF + LR)', u: '%', dp: 1 },
    ...CORNERS.map((c) => ({ k: `w_${c.toLowerCase()}`, l: `${c}`, u: 'lb', dp: 0 }))],
  calc: (i) => {
    if (i.mode === 'Corner weights from percentages') {
      if (!have(i.w, i.left, i.rear, i.cross)) return {};
      const L = i.left / 100; const R = i.rear / 100; const X = i.cross / 100; const W = i.w;
      const lr = ((L + X + R - 1) * W) / 2;
      const out = { w_lf: L * W - lr, w_rf: X * W - lr, w_lr: lr, w_rr: R * W - lr };
      if (Object.values(out).some((x) => x < 0)) return err('Those percentages can’t all be true at once — one corner comes out negative.');
      return out;
    }
    const p = cornerPercents({ LF: i.lf, RF: i.rf, LR: i.lr, RR: i.rr });
    return p ? { total: p.total, left_pct: p.left, rear_pct: p.rear, cross_pct: p.cross } : {};
  },
  how: 'Left % = (LF + LR) ÷ total; rear % = (LR + RR) ÷ total; cross % = (RF + LR) ÷ total. Going back: LR = (left + rear + cross − 1) × total ÷ 2, then the others follow.',
  prefill: ({ values }) => { const w = values.corner_weights || {}; return { lf: w.LF, rf: w.RF, lr: w.LR, rr: w.RR, w: values.total_weight, left: values.left_pct, rear: values.rear_pct, cross: values.cross_pct }; },
};

const ballast = {
  id: 'ballast', cat: 'chassis', title: 'Ballast to hit a target %',
  blurb: 'How much lead to add — or move — to reach a target left or rear percentage.',
  inputs: [{ k: 'w', l: 'Total weight now', u: 'lb' }, { k: 'which', l: 'Percentage', type: 'select', options: ['Left', 'Rear'], dflt: 'Left' },
    { k: 'now', l: 'Now', u: '%' }, { k: 'target', l: 'Target', u: '%' }],
  outputs: [{ k: 'add', l: 'Add to that side', u: 'lb', dp: 1 }, { k: 'move', l: 'Or move across from the other side', u: 'lb', dp: 1 }, { k: 'remove', l: 'Or take off the other side', u: 'lb', dp: 1 }],
  calc: ({ w, now, target }) => {
    if (!have(w, now, target)) return {};
    const N = now / 100; const T = target / 100;
    if (T >= 1 || T <= 0) return err('Target must be between 0 and 100%.');
    if (T < N) return err('The target is lower than now — add weight to the other side instead (swap the side and use 100 − %).');
    return { add: ((T - N) * w) / (1 - T), move: (T - N) * w, remove: ((T - N) * w) / T };
  },
  how: 'Adding m to a side: (side + m) ÷ (W + m) = target → m = (target − now) × W ÷ (1 − target). Moving m across keeps W: m = (target − now) × W. Removing m from the other side: m = (target − now) × W ÷ target. (“Move” assumes the lead goes the full width or length — move it less far and you need proportionally more.)',
  prefill: ({ values }) => ({ w: values.total_weight, now: values.left_pct }),
};

const stagger = {
  id: 'stagger', cat: 'chassis', title: 'Tyre stagger for the turn',
  blurb: 'Inside (left rear) circumference — and the stagger — that suits a turn’s size.',
  inputs: [{ k: 'turn', l: 'Turn diameter (to the outside tyre)', u: 'ft' }, { k: 'outer', l: 'Outside (RR) circumference', u: 'in' }, { k: 'spacing', l: 'Rear tyre spacing (centre to centre)', u: 'in' }],
  outputs: [{ k: 'inner', l: 'Inside (LR) circumference', u: 'in', dp: 2 }, { k: 'stagger', l: 'Stagger', u: 'in', dp: 2 }],
  calc: ({ turn, outer, spacing }) => {
    if (!have(turn, outer, spacing)) return {};
    const ro = (turn * 12) / 2;
    if (spacing >= ro) return err('Tyre spacing is bigger than the turn radius — check the turn diameter is in feet.');
    const inner = outer * ((ro - spacing) / ro);
    return { inner, stagger: outer - inner };
  },
  how: 'Each tyre travels a circle; the inside one’s radius is shorter by the tyre spacing. Inside circumference = outside × (R − spacing) ÷ R. More stagger turns the car; less tightens it.',
};

const tyreGrowth = {
  id: 'tyre-growth', cat: 'chassis', title: 'Hot vs cold tyres',
  blurb: 'How much each tyre’s pressure built, and how stagger grew, during the session.',
  inputs: [...CORNERS.flatMap((c) => [{ k: `c_${c}`, l: `${c} cold`, u: 'psi' }, { k: `h_${c}`, l: `${c} hot`, u: 'psi' }]),
    { k: 'sc', l: 'Stagger cold', u: 'in' }, { k: 'sh', l: 'Stagger hot', u: 'in' }],
  outputs: [...CORNERS.map((c) => ({ k: `b_${c}`, l: `${c} built`, u: 'psi' })), { k: 'sg', l: 'Stagger grew', u: 'in', dp: 3 }],
  calc: (i) => {
    const out = {};
    for (const c of CORNERS) if (have(i[`c_${c}`], i[`h_${c}`])) { const b = i[`h_${c}`] - i[`c_${c}`]; out[`b_${c}`] = `${b >= 0 ? '+' : ''}${b.toFixed(1)} (${i[`c_${c}`] ? ((b / i[`c_${c}`]) * 100).toFixed(0) : '—'}%)`; }
    if (have(i.sc, i.sh)) out.sg = i.sh - i.sc;
    return out;
  },
  how: 'Built = hot − cold. A tyre that builds much more than the others is working harder — compare left to right and front to rear.',
  prefill: ({ values }) => ({ ...Object.fromEntries(CORNERS.flatMap((c) => [[`c_${c}`, values.pressure_cold?.[c]], [`h_${c}`, values.pressure_hot?.[c]]])), sc: values.stagger_cold, sh: values.stagger_hot }),
};

const tyreSize = {
  id: 'tyre-size', cat: 'chassis', title: 'Tyre size',
  blurb: 'Circumference ↔ diameter ↔ revolutions per mile.',
  inputs: [{ k: 'mode', l: 'I know the', type: 'select', options: ['Circumference', 'Diameter'], dflt: 'Circumference' }, { k: 'x', l: 'Value', u: 'in' }],
  outputs: [{ k: 'circ', l: 'Circumference', u: 'in', dp: 2 }, { k: 'diam', l: 'Diameter', u: 'in', dp: 2 }, { k: 'revs', l: 'Revolutions per mile', dp: 1 }],
  calc: ({ mode, x }) => {
    if (!have(x) || x <= 0) return {};
    const circ = mode === 'Diameter' ? x * PI : x;
    return { circ, diam: circ / PI, revs: 63360 / circ };
  },
  how: 'Circumference = π × diameter; revolutions per mile = 63,360 ÷ circumference.',
};

const wheelOffset = {
  id: 'wheel-offset', cat: 'chassis', title: 'Wheel offset ↔ backspacing',
  blurb: 'Convert between offset and backspacing for a wheel width.',
  inputs: [{ k: 'width', l: 'Wheel width (lip to lip)', u: 'in' }, { k: 'mode', l: 'I know the', type: 'select', options: ['Backspacing', 'Offset'], dflt: 'Backspacing' }, { k: 'x', l: 'Value', u: 'in' }],
  outputs: [{ k: 'bs', l: 'Backspacing', u: 'in', dp: 3 }, { k: 'off', l: 'Offset from centre (+ toward the car)', u: 'in', dp: 3 }],
  calc: ({ width, mode, x }) => {
    if (!have(width, x)) return {};
    return mode === 'Offset' ? { bs: width / 2 + x, off: x } : { bs: x, off: x - width / 2 };
  },
  how: 'Offset = backspacing − width ÷ 2. Measure width over the lips, backspacing from the mounting face to the inner lip.',
};

// ---------------------------------------------------------------- gearing, speed & laps
const gearRpm = {
  id: 'engine-rpm', cat: 'gearing', title: 'New RPM after a change',
  blurb: 'Where the engine will rev after a gear or tyre change.',
  inputs: [{ k: 'rpm', l: 'RPM now' }, { k: 'og', l: 'Final drive now' }, { k: 'oc', l: 'Tyre circumference now', u: 'in' },
    { k: 'ng', l: 'New final drive' }, { k: 'nc', l: 'New tyre circumference', u: 'in' }],
  outputs: [{ k: 'nr', l: 'New RPM', dp: 0 }, { k: 'diff', l: 'Change', dp: 0 }],
  calc: ({ rpm, og, oc, ng, nc }) => {
    if (!have(rpm, og, ng)) return {};
    const nr = rpm * (ng / og) * (have(oc, nc) && nc ? oc / nc : 1);
    return { nr, diff: nr - rpm };
  },
  how: 'Same road speed: new rpm = rpm × (new ratio ÷ old ratio) × (old circumference ÷ new circumference). Leave the tyre sizes blank if they don’t change.',
  prefill: ({ values }) => ({ rpm: values.tach_high, og: values.final_drive, ng: values.final_drive }),
};

const mph = {
  id: 'mph', cat: 'gearing', title: 'Speed ↔ RPM',
  blurb: 'Road speed at an rpm, or the rpm at a speed, for a final drive and tyre size.',
  inputs: [{ k: 'mode', l: 'Work out', type: 'select', options: ['Speed from RPM', 'RPM from speed'], dflt: 'Speed from RPM' },
    { k: 'rpm', l: 'RPM', show: (i) => i.mode !== 'RPM from speed' }, { k: 'mph', l: 'Speed', u: 'mph', show: (i) => i.mode === 'RPM from speed' },
    { k: 'ratio', l: 'Final drive' }, { k: 'circ', l: 'Driven tyre circumference', u: 'in' }, { k: 'slip', l: 'Tyre slip', u: '%', dflt: '0' }],
  outputs: [{ k: 'mph_out', l: 'Speed', u: 'mph', dp: 1 }, { k: 'kmh', l: 'Speed', u: 'km/h', dp: 1 }, { k: 'rpm_out', l: 'RPM', dp: 0 }],
  calc: ({ mode, rpm, mph: v, ratio, circ, slip }) => {
    if (!have(ratio, circ) || !ratio) return {};
    const s = 1 - (slip || 0) / 100;
    if (mode === 'RPM from speed') return have(v) ? { rpm_out: (v * ratio * 1056) / (circ * s) } : {};
    if (!have(rpm)) return {};
    const out = ((rpm * circ) / (ratio * 1056)) * s;
    return { mph_out: out, kmh: out * 1.609344 };
  },
  how: 'mph = rpm × circumference (in) ÷ (final drive × 1056). 1056 converts inches per minute to miles per hour. Slip lowers the actual speed for the rpm.',
  prefill: ({ values }) => ({ rpm: values.tach_high, ratio: values.final_drive }),
};

const qcFinal = {
  id: 'qc-final', cat: 'gearing', title: 'Quick-change final drive',
  blurb: 'Final drive from a gear set and ring & pinion — and the sets in your gear list closest to a target.',
  inputs: [{ k: 'small', l: 'Small gear teeth' }, { k: 'large', l: 'Large gear teeth' },
    { k: 'pos', l: 'Large gear on', type: 'select', options: ['Bottom (lower numerical — taller)', 'Top (higher numerical — shorter)'], dflt: 'Top (higher numerical — shorter)' },
    { k: 'rp', l: 'Ring & pinion ratio' }, { k: 'target', l: 'Target final drive (optional)' }],
  outputs: [{ k: 'set', l: 'Gear set ratio', dp: 3 }, { k: 'final', l: 'Final drive', dp: 3 }, { k: 'closest', l: 'Closest in your gear list' }],
  calc: ({ small, large, pos, rp, target }, ctx) => {
    const out = {};
    if (have(small, large) && small && large) {
      out.set = pos?.startsWith('Bottom') ? small / large : large / small;
      if (have(rp)) out.final = out.set * rp;
    }
    if (have(target, rp) && ctx?.gears?.length) {
      const opts = ctx.gears.flatMap((g) => [[g.small / g.large, 'large on bottom'], [g.large / g.small, 'large on top']].map(([r, how]) => ({ name: `${g.name} (${g.small}/${g.large}, ${how})`, r: r * rp })));
      opts.sort((a, b) => Math.abs(a.r - target) - Math.abs(b.r - target));
      out.closest = opts.slice(0, 3).map((o) => `${o.name} → ${o.r.toFixed(3)}`).join(' · ');
    }
    return out;
  },
  how: 'Set ratio = driven ÷ driving teeth (large on top = large ÷ small); final drive = set ratio × ring & pinion.',
  prefill: ({ car }) => ({ rp: car?.rp_ratio }),
};

const axleRatio = {
  id: 'axle-ratio', cat: 'gearing', title: 'Ratio for a target RPM',
  blurb: 'The final drive needed to hit a target rpm at a given speed, or the ratio from tooth counts.',
  inputs: [{ k: 'rpm', l: 'Target RPM' }, { k: 'mph', l: 'At speed', u: 'mph' }, { k: 'circ', l: 'Tyre circumference', u: 'in' },
    { k: 'ring', l: 'Ring gear teeth (optional)' }, { k: 'pinion', l: 'Pinion teeth (optional)' }],
  outputs: [{ k: 'need', l: 'Final drive needed', dp: 3 }, { k: 'rp', l: 'Ring & pinion ratio', dp: 3 }],
  calc: ({ rpm, mph: v, circ, ring, pinion }) => ({
    ...(have(rpm, v, circ) && v ? { need: (rpm * circ) / (v * 1056) } : {}),
    ...(have(ring, pinion) && pinion ? { rp: ring / pinion } : {}),
  }),
  how: 'Final drive = rpm × circumference ÷ (mph × 1056); ring & pinion = ring teeth ÷ pinion teeth.',
};

const lapSpeed = {
  id: 'lap-speed', cat: 'gearing', title: 'Lap time ↔ average speed',
  blurb: 'Average speed for a lap time, or the lap time for a speed.',
  inputs: [{ k: 'len', l: 'Track length', u: 'mi' }, { k: 'mode', l: 'Work out', type: 'select', options: ['Speed from lap time', 'Lap time from speed'], dflt: 'Speed from lap time' },
    { k: 'lap', l: 'Lap time', u: 's', show: (i) => i.mode !== 'Lap time from speed' }, { k: 'mph', l: 'Average speed', u: 'mph', show: (i) => i.mode === 'Lap time from speed' }],
  outputs: [{ k: 'mph_out', l: 'Average speed', u: 'mph', dp: 2 }, { k: 'kmh', l: 'Average speed', u: 'km/h', dp: 2 }, { k: 'lap_out', l: 'Lap time', u: 's', dp: 3 }],
  calc: ({ len, mode, lap, mph: v }) => {
    if (!have(len)) return {};
    if (mode === 'Lap time from speed') return have(v) && v ? { lap_out: (len / v) * 3600 } : {};
    return have(lap) && lap ? { mph_out: (len / lap) * 3600, kmh: (len / lap) * 3600 * 1.609344 } : {};
  },
  how: 'mph = miles ÷ seconds × 3600. 3/8 mile = 0.375; 400 m = 0.2485 mi.',
  prefill: ({ trackMiles }) => ({ len: trackMiles }),
};

const lapAnalysis = {
  id: 'lap-analysis', cat: 'gearing', title: 'Lap analysis',
  blurb: 'Paste a session’s lap times for the best, average, consistency and speed.',
  inputs: [{ k: 'laps', l: 'Lap times (one per line or separated by spaces)', type: 'list' }, { k: 'len', l: 'Track length (optional)', u: 'mi' }],
  outputs: [{ k: 'n', l: 'Laps', dp: 0 }, { k: 'best', l: 'Best', u: 's', dp: 3 }, { k: 'avg', l: 'Average', u: 's', dp: 3 }, { k: 'best5', l: 'Average of best 5', u: 's', dp: 3 },
    { k: 'sd', l: 'Consistency (std deviation)', u: 's', dp: 3 }, { k: 'mph', l: 'Best lap speed', u: 'mph', dp: 2 }],
  calc: ({ laps, len }) => {
    const xs = String(laps || '').split(/[\s,;]+/).map(lapSeconds).filter((x) => x !== null && x > 0);
    if (!xs.length) return {};
    const sorted = [...xs].sort((a, b) => a - b);
    const avg = xs.reduce((s, x) => s + x, 0) / xs.length;
    const top = sorted.slice(0, 5);
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - avg) ** 2, 0) / xs.length);
    return { n: xs.length, best: sorted[0], avg, best5: top.reduce((s, x) => s + x, 0) / top.length, sd, ...(have(len) ? { mph: (len / sorted[0]) * 3600 } : {}) };
  },
  how: 'Times can be seconds (14.512) or minutes:seconds (1:02.4). Consistency is the standard deviation — smaller is more consistent.',
  prefill: ({ trackMiles }) => ({ len: trackMiles }),
};
export function lapSeconds(s) {
  const m = String(s).trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  return m ? (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]) : null;
}

const fuelMileage = {
  id: 'fuel-mileage', cat: 'gearing', title: 'Fuel for a race',
  blurb: 'Fuel per lap from a session, fuel to start the next one, and what it weighs. Works in US gallons or litres.',
  inputs: [{ k: 'units', l: 'Fuel measured in', type: 'select', options: ['US gallons', 'Litres'], dflt: 'US gallons' },
    { k: 'used', l: 'Fuel used' }, { k: 'laps', l: 'Laps run (incl. warm-up)' }, { k: 'next', l: 'Laps in the next race (incl. warm-up)' },
    { k: 'reserve', l: 'Reserve', u: '%', dflt: '15' }, { k: 'fuel', l: 'Fuel', type: 'select', options: Object.keys(fuelDensity).filter((f) => f !== 'Water'), dflt: 'Methanol' }],
  outputs: [{ k: 'per', l: 'Fuel per lap (your units)', dp: 3 }, { k: 'lpg', l: 'Laps per gallon / litre', dp: 2 }, { k: 'need', l: 'Fuel to start with (your units)', dp: 2 }, { k: 'weight', l: 'Weight of that fuel', u: 'lb', dp: 1 }],
  calc: ({ units, used, laps, next, reserve, fuel }) => {
    if (!have(used, laps) || !laps || !used) return {};
    const per = used / laps;
    const out = { per, lpg: laps / used };
    const gal = units === 'Litres' ? 1 / 3.785411784 : 1;
    if (have(next)) { out.need = per * next * (1 + (reserve || 0) / 100); out.weight = out.need * gal * (fuelDensity[fuel] || 6.6); }
    return out;
  },
  how: 'Fuel per lap = used ÷ laps; fuel needed = per lap × laps × (1 + reserve). Methanol weighs about 6.63 lb per US gallon (1 US gallon = 3.785 litres).',
  prefill: ({ values }) => ({ units: values.fuel_unit === 'L' ? 'Litres' : 'US gallons', used: values.fuel_start && values.fuel_finish ? num(values.fuel_start) - num(values.fuel_finish) : undefined, laps: values.laps }),
};

// ---------------------------------------------------------------- engine builder
const displacement = {
  id: 'displacement', cat: 'engine', title: 'Displacement, bore & stroke',
  blurb: 'Cubic inches from bore and stroke — or the bore or stroke for a target size.',
  inputs: [{ k: 'mode', l: 'Work out', type: 'select', options: ['Displacement', 'Bore for a displacement', 'Stroke for a displacement'], dflt: 'Displacement' },
    { k: 'bore', l: 'Bore', u: 'in', show: (i) => i.mode !== 'Bore for a displacement' }, { k: 'stroke', l: 'Stroke', u: 'in', show: (i) => i.mode !== 'Stroke for a displacement' },
    { k: 'cid', l: 'Displacement', u: 'cu in', show: (i) => i.mode && i.mode !== 'Displacement' }, { k: 'cyl', l: 'Cylinders', dflt: '8' }],
  outputs: [{ k: 'cid_out', l: 'Displacement', u: 'cu in', dp: 1 }, { k: 'litres', l: 'Displacement', u: 'L', dp: 3 }, { k: 'bore_out', l: 'Bore', u: 'in', dp: 4 }, { k: 'stroke_out', l: 'Stroke', u: 'in', dp: 4 }],
  calc: ({ mode, bore, stroke, cid, cyl }) => {
    if (!have(cyl) || !cyl) return {};
    if (mode === 'Bore for a displacement') return have(cid, stroke) && stroke ? { bore_out: Math.sqrt(cid / (stroke * cyl * 0.7854)) } : {};
    if (mode === 'Stroke for a displacement') return have(cid, bore) && bore ? { stroke_out: cid / (bore * bore * 0.7854 * cyl) } : {};
    if (!have(bore, stroke)) return {};
    const c = bore * bore * 0.7854 * stroke * cyl;
    return { cid_out: c, litres: (c * CI_TO_CC) / 1000 };
  },
  how: 'CID = bore² × 0.7854 × stroke × cylinders.',
  prefill: ({ values }) => ({ stroke: values.stroke, cyl: values.cylinders }),
};

const compression = {
  id: 'compression', cat: 'engine', title: 'Compression ratio',
  blurb: 'Static compression ratio from the measured volumes.',
  inputs: [{ k: 'bore', l: 'Bore', u: 'in' }, { k: 'stroke', l: 'Stroke', u: 'in' }, { k: 'chamber', l: 'Chamber volume', u: 'cc' },
    { k: 'piston', l: 'Piston dish (+) / dome (−)', u: 'cc' }, { k: 'deck', l: 'Deck clearance (+ below deck)', u: 'in' },
    { k: 'gbore', l: 'Head gasket bore', u: 'in' }, { k: 'gthick', l: 'Head gasket thickness (compressed)', u: 'in' }],
  outputs: [{ k: 'cr', l: 'Compression ratio', u: ':1', dp: 2 }, { k: 'swept', l: 'Swept volume per cylinder', u: 'cc', dp: 1 }, { k: 'clear', l: 'Total clearance volume', u: 'cc', dp: 2 }],
  calc: ({ bore, stroke, chamber, piston, deck, gbore, gthick }) => {
    if (!have(bore, stroke, chamber)) return {};
    const swept = area(bore) * stroke * CI_TO_CC;
    const clear = chamber + (piston || 0) + area(bore) * (deck || 0) * CI_TO_CC + area(gbore || bore) * (gthick || 0) * CI_TO_CC;
    if (clear <= 0) return err('Clearance volume must be more than zero — check the dome is entered as negative.');
    return { cr: (swept + clear) / clear, swept, clear };
  },
  how: 'CR = (swept + clearance) ÷ clearance. Clearance = chamber + dish (− dome) + deck volume + gasket volume, all in cc (1 cu in = 16.387 cc).',
  prefill: ({ values }) => ({ stroke: values.stroke, gbore: values.gasket_bore, gthick: values.gasket_thickness }),
};

const pourDome = {
  id: 'pour-dome', cat: 'engine', title: 'Piston dish / dome by burette',
  blurb: 'Dish or dome volume from cc’ing the piston down the bore.',
  inputs: [{ k: 'bore', l: 'Bore', u: 'in' }, { k: 'depth', l: 'Piston down from deck', u: 'in', dflt: '0.500' }, { k: 'poured', l: 'Fluid poured to fill', u: 'cc' }],
  outputs: [{ k: 'vol', l: 'Dish (+) / dome (−)', u: 'cc', dp: 2 }, { k: 'cyl', l: 'Cylinder volume to that depth', u: 'cc', dp: 2 }],
  calc: ({ bore, depth, poured }) => {
    if (!have(bore, depth, poured)) return {};
    const cyl = area(bore) * depth * CI_TO_CC;
    return { vol: poured - cyl, cyl };
  },
  how: 'Bring the piston down a known depth, seal it, fill with a burette. Dish/dome = poured − bore area × depth. Positive = dish and valve reliefs; negative = dome. Use the same value in “Compression ratio”.',
};

const pourChamber = {
  id: 'pour-chamber', cat: 'engine', title: 'Chamber volume by burette',
  blurb: 'Combustion chamber cc from burette readings.',
  inputs: [{ k: 'start', l: 'Burette start', u: 'cc' }, { k: 'end', l: 'Burette end', u: 'cc' }, { k: 'plate', l: 'Plate hole / plug allowance', u: 'cc', dflt: '0' }],
  outputs: [{ k: 'cc', l: 'Chamber volume', u: 'cc', dp: 2 }],
  calc: ({ start, end, plate }) => (have(start, end) ? { cc: Math.abs(start - end) - (plate || 0) } : {}),
  how: 'Chamber cc = fluid used − any allowance for the fill hole in the plate or the spark plug if it isn’t fitted.',
};

const gasketVol = {
  id: 'gasket-volume', cat: 'engine', title: 'Head gasket volume',
  blurb: 'Volume of the head gasket for the compression ratio.',
  inputs: [{ k: 'bore', l: 'Gasket bore', u: 'in' }, { k: 't', l: 'Compressed thickness', u: 'in' }],
  outputs: [{ k: 'cc', l: 'Gasket volume', u: 'cc', dp: 2 }],
  calc: ({ bore, t }) => (have(bore, t) ? { cc: area(bore) * t * CI_TO_CC } : {}),
  how: 'cc = π ÷ 4 × gasket bore² × thickness × 16.387.',
  prefill: ({ values }) => ({ bore: values.gasket_bore, t: values.gasket_thickness }),
};

const camSpecs = {
  id: 'cam-specs', cat: 'engine', title: 'Cam specs from events',
  blurb: 'Duration, centrelines, lobe separation and overlap from the opening and closing points.',
  inputs: [{ k: 'io', l: 'Intake opens', u: '° BTDC' }, { k: 'ic', l: 'Intake closes', u: '° ABDC' }, { k: 'eo', l: 'Exhaust opens', u: '° BBDC' }, { k: 'ec', l: 'Exhaust closes', u: '° ATDC' }],
  outputs: [{ k: 'idur', l: 'Intake duration', u: '°', dp: 1 }, { k: 'edur', l: 'Exhaust duration', u: '°', dp: 1 }, { k: 'icl', l: 'Intake centreline', u: '° ATDC', dp: 1 },
    { k: 'ecl', l: 'Exhaust centreline', u: '° BTDC', dp: 1 }, { k: 'lsa', l: 'Lobe separation', u: '°', dp: 1 }, { k: 'overlap', l: 'Overlap', u: '°', dp: 1 }, { k: 'adv', l: 'Advance (+) / retard (−)', u: '°', dp: 1 }],
  calc: ({ io, ic, eo, ec }) => {
    if (!have(io, ic, eo, ec)) return {};
    const idur = io + ic + 180; const edur = eo + ec + 180;
    const icl = idur / 2 - io; const ecl = edur / 2 - ec;
    const lsa = (icl + ecl) / 2;
    return { idur, edur, icl, ecl, lsa, overlap: io + ec, adv: lsa - icl };
  },
  how: 'Duration = opens + closes + 180. Intake centreline = duration ÷ 2 − opening; exhaust likewise. LSA = (ICL + ECL) ÷ 2; overlap = intake opens + exhaust closes; advance = LSA − ICL.',
  prefill: ({ values }) => ({ io: values.int_open, ic: values.int_close, eo: values.exh_open, ec: values.exh_close }),
};

const valveEvents = {
  id: 'valve-events', cat: 'engine', title: 'Valve events from cam card',
  blurb: 'Opening and closing points from duration, centreline and lobe separation.',
  inputs: [{ k: 'idur', l: 'Intake duration', u: '°' }, { k: 'edur', l: 'Exhaust duration', u: '°' }, { k: 'icl', l: 'Intake centreline (installed)', u: '° ATDC' }, { k: 'lsa', l: 'Lobe separation', u: '°' }],
  outputs: [{ k: 'io', l: 'Intake opens', u: '° BTDC', dp: 1 }, { k: 'ic', l: 'Intake closes', u: '° ABDC', dp: 1 }, { k: 'eo', l: 'Exhaust opens', u: '° BBDC', dp: 1 }, { k: 'ec', l: 'Exhaust closes', u: '° ATDC', dp: 1 }],
  calc: ({ idur, edur, icl, lsa }) => {
    if (!have(idur, edur, icl, lsa)) return {};
    const ecl = 2 * lsa - icl;
    return { io: idur / 2 - icl, ic: idur / 2 + icl - 180, eo: edur / 2 + ecl - 180, ec: edur / 2 - ecl };
  },
  how: 'Intake opens = duration ÷ 2 − ICL; closes = duration ÷ 2 + ICL − 180. Exhaust centreline = 2 × LSA − ICL, then the same for exhaust.',
};

const valveLift = {
  id: 'valve-lift', cat: 'engine', title: 'Valve lift',
  blurb: 'Lift at the valve from lobe lift, rocker ratio and lash.',
  inputs: [{ k: 'lobe', l: 'Lobe lift', u: 'in' }, { k: 'ratio', l: 'Rocker ratio', dflt: '1.7' }, { k: 'lash', l: 'Lash', u: 'in', dflt: '0' }],
  outputs: [{ k: 'lift', l: 'Valve lift', u: 'in', dp: 4 }],
  calc: ({ lobe, ratio, lash }) => (have(lobe, ratio) ? { lift: lobe * ratio - (lash || 0) } : {}),
  how: 'Valve lift = lobe lift × rocker ratio − lash (solid lifters).',
};

const pistonSpeed = {
  id: 'piston-speed', cat: 'engine', title: 'Piston speed & rod ratio',
  blurb: 'Average and peak piston speed, and rod ratio.',
  inputs: [{ k: 'stroke', l: 'Stroke', u: 'in' }, { k: 'rpm', l: 'RPM' }, { k: 'rod', l: 'Rod length (centre to centre)', u: 'in' }],
  outputs: [{ k: 'mean', l: 'Average piston speed', u: 'ft/min', dp: 0 }, { k: 'max', l: 'Peak piston speed', u: 'ft/min', dp: 0 }, { k: 'ratio', l: 'Rod ratio', dp: 3 }, { k: 'deg', l: 'Peak speed at', u: '° ATDC', dp: 1 }],
  calc: ({ stroke, rpm, rod }) => {
    if (!have(stroke, rpm)) return {};
    const out = { mean: (2 * stroke * rpm) / 12 };
    if (have(rod) && rod > stroke / 2) {
      const r = stroke / 2; const w = (rpm * 2 * PI) / 60;
      let best = 0; let at = 0;
      for (let d = 0; d <= 180; d += 0.25) {
        const t = (d * PI) / 180;
        const vel = w * r * (Math.sin(t) + (r * Math.sin(2 * t)) / (2 * Math.sqrt(rod * rod - r * r * Math.sin(t) ** 2)));
        if (vel > best) { best = vel; at = d; }
      }
      Object.assign(out, { max: (best * 60) / 12, ratio: rod / stroke, deg: at });
    }
    return out;
  },
  how: 'Average = 2 × stroke × rpm ÷ 12 ft/min. Peak comes from the slider-crank motion (worked out every ¼°). Many builders keep average under ~4,500 ft/min for endurance.',
  prefill: ({ values }) => ({ stroke: values.stroke, rpm: values.peak_rpm, rod: values.rod_length }),
};

const deckHeight = {
  id: 'piston-height', cat: 'engine', title: 'Piston compression height',
  blurb: 'Compression height a piston needs for a deck height, rod and stroke.',
  inputs: [{ k: 'deck', l: 'Block deck height', u: 'in' }, { k: 'stroke', l: 'Stroke', u: 'in' }, { k: 'rod', l: 'Rod length', u: 'in' }, { k: 'clear', l: 'Wanted deck clearance (+ below deck)', u: 'in', dflt: '0' }],
  outputs: [{ k: 'ch', l: 'Compression height', u: 'in', dp: 4 }],
  calc: ({ deck, stroke, rod, clear }) => (have(deck, stroke, rod) ? { ch: deck - stroke / 2 - rod - (clear || 0) } : {}),
  how: 'Compression height = deck height − stroke ÷ 2 − rod length − deck clearance.',
  prefill: ({ values }) => ({ deck: values.deck_height, stroke: values.stroke, rod: values.rod_length }),
};

const dcr = {
  id: 'dynamic-cr', cat: 'engine', title: 'Dynamic compression ratio',
  blurb: 'Effective compression after the intake valve closes.',
  inputs: [{ k: 'bore', l: 'Bore', u: 'in' }, { k: 'stroke', l: 'Stroke', u: 'in' }, { k: 'rod', l: 'Rod length', u: 'in' }, { k: 'cr', l: 'Static compression ratio', u: ':1' },
    { k: 'ivc', l: 'Intake closes (seat timing)', u: '° ABDC' }],
  outputs: [{ k: 'dcr', l: 'Dynamic compression ratio', u: ':1', dp: 2 }, { k: 'eff', l: 'Effective stroke', u: 'in', dp: 3 }],
  calc: ({ bore, stroke, rod, cr, ivc }) => {
    if (!have(bore, stroke, rod, cr, ivc) || cr <= 1) return {};
    const r = stroke / 2; const t = ((180 - ivc) * PI) / 180; // crank angle after TDC where the valve closes
    // distance the piston still has to travel to TDC when the valve closes = effective stroke
    const eff = r + rod - (r * Math.cos(t) + Math.sqrt(rod * rod - (r * Math.sin(t)) ** 2));
    const swept = area(bore) * stroke; const clear = swept / (cr - 1);
    return { dcr: (area(bore) * eff + clear) / clear, eff };
  },
  how: 'Find piston position when the intake closes (slider-crank), take the remaining stroke as the effective stroke, then (effective swept + clearance) ÷ clearance. Use seat-to-seat closing (about .050 closing + 15–20°), not the .050 figure.',
  prefill: ({ values }) => ({ stroke: values.stroke, rod: values.rod_length }),
};

const dynoCorrection = {
  id: 'dyno-correction', cat: 'engine', title: 'Dyno correction',
  blurb: 'Correct observed dyno power and torque to standard conditions.',
  inputs: [{ k: 'hp', l: 'Observed HP' }, { k: 'tq', l: 'Observed torque', u: 'lb-ft' }, { k: 'temp', l: 'Air temp', u: '°F' }, { k: 'baro', l: 'Barometer (uncorrected)', u: 'inHg' }, { k: 'rh', l: 'Humidity', u: '%' }],
  outputs: [{ k: 'cf', l: 'STD (J607) factor', dp: 3 }, { k: 'hp_std', l: 'HP (STD)', dp: 1 }, { k: 'tq_std', l: 'Torque (STD)', u: 'lb-ft', dp: 1 },
    { k: 'sae', l: 'SAE J1349 factor', dp: 3 }, { k: 'hp_sae', l: 'HP (SAE)', dp: 1 }, { k: 'tq_sae', l: 'Torque (SAE)', u: 'lb-ft', dp: 1 }],
  calc: (i) => {
    const a = airCalc.calc({ temp: i.temp, rh: i.rh ?? 0, baro: i.baro });
    if (!a.cf) return a.error ? a : {};
    return { cf: a.cf, sae: a.sae, ...(have(i.hp) ? { hp_std: i.hp * a.cf, hp_sae: i.hp * a.sae } : {}), ...(have(i.tq) ? { tq_std: i.tq * a.cf, tq_sae: i.tq * a.sae } : {}) };
  },
  how: 'Same factors as “Air correction”. STD (60 °F, 29.92 inHg dry) reads about 4% higher than SAE J1349 (77 °F, 29.23 inHg dry) — always say which one a number is.',
  prefill: ({ values }) => ({ hp: values.hp, tq: values.torque }),
};

const hpPredict = {
  id: 'hp-predict', cat: 'engine', title: 'Horsepower estimate',
  blurb: 'Rough power potential from cylinder-head flow, or HP from torque and rpm.',
  inputs: [{ k: 'cfm', l: 'Intake port flow (at 28 in H₂O)', u: 'CFM' }, { k: 'cyl', l: 'Cylinders', dflt: '8' },
    { k: 'factor', l: 'HP per CFM per cylinder', dflt: '0.257' }, { k: 'tq', l: 'Torque (optional)', u: 'lb-ft' }, { k: 'rpm', l: 'At RPM (optional)' }],
  outputs: [{ k: 'hp_flow', l: 'Power potential from flow', u: 'hp', dp: 0 }, { k: 'hp_tq', l: 'HP from torque', u: 'hp', dp: 1 }],
  calc: ({ cfm, cyl, factor, tq, rpm }) => ({
    ...(have(cfm, cyl, factor) ? { hp_flow: cfm * cyl * factor } : {}),
    ...(have(tq, rpm) ? { hp_tq: (tq * rpm) / 5252 } : {}),
  }),
  how: 'Rule of thumb: about 0.25–0.27 hp per CFM per cylinder for a good naturally aspirated engine on gasoline (methanol a little more). HP = torque × rpm ÷ 5252.',
  prefill: ({ values }) => ({ tq: values.torque, rpm: values.peak_rpm }),
};

const airflowCompare = {
  id: 'airflow-compare', cat: 'engine', title: 'Flow at another test pressure',
  blurb: 'Convert flow-bench numbers between test pressures (e.g. 10″ to 28″).',
  inputs: [{ k: 'cfm', l: 'Flow measured', u: 'CFM' }, { k: 'p1', l: 'At test pressure', u: 'in H₂O' }, { k: 'p2', l: 'Convert to', u: 'in H₂O', dflt: '28' }],
  outputs: [{ k: 'out', l: 'Flow', u: 'CFM', dp: 1 }],
  calc: ({ cfm, p1, p2 }) => (have(cfm, p1, p2) && p1 > 0 ? { out: cfm * Math.sqrt(p2 / p1) } : {}),
  how: 'Flow rises with the square root of the test pressure: CFM₂ = CFM₁ × √(P₂ ÷ P₁).',
};

const bobweight = {
  id: 'bobweight', cat: 'engine', title: 'Balance bobweight (V8)',
  blurb: 'Bobweight for balancing a 90° V8 crank.',
  inputs: [{ k: 'big', l: 'Rod big end', u: 'g' }, { k: 'brg', l: 'Rod bearing (pair of shells)', u: 'g' }, { k: 'oil', l: 'Oil allowance', u: 'g', dflt: '4' },
    { k: 'small', l: 'Rod small end', u: 'g' }, { k: 'piston', l: 'Piston', u: 'g' }, { k: 'pin', l: 'Pin', u: 'g' }, { k: 'rings', l: 'Ring set (one piston)', u: 'g' }, { k: 'locks', l: 'Pin locks (pair)', u: 'g', dflt: '0' },
    { k: 'pct', l: 'Balance factor', u: '%', dflt: '50' }],
  outputs: [{ k: 'rot', l: 'Rotating (per journal)', u: 'g', dp: 1 }, { k: 'recip', l: 'Reciprocating (per journal)', u: 'g', dp: 1 }, { k: 'bob', l: 'Bobweight', u: 'g', dp: 1 }],
  calc: (i) => {
    if (!have(i.big, i.small, i.piston)) return {};
    const rot = 2 * (i.big + (i.brg || 0) + (i.oil || 0));
    const recip = 2 * (i.small + i.piston + (i.pin || 0) + (i.rings || 0) + (i.locks || 0));
    return { rot, recip, bob: rot + recip * ((i.pct ?? 50) / 100) };
  },
  how: 'Each crankpin carries two rods: bobweight = 100% of rotating weight (2 × big end + bearings + oil) + the balance factor (usually 50%) of reciprocating weight (2 × piston, pin, rings, locks and small end).',
  prefill: ({ values }) => ({ big: values.rod_wt_big, small: values.rod_wt_small, piston: values.piston_weight }),
};

const ringGap = {
  id: 'ring-gap', cat: 'engine', title: 'Ring end gap',
  blurb: 'Ring gap from a gap-per-inch-of-bore figure, or check a measured gap.',
  inputs: [{ k: 'bore', l: 'Bore', u: 'in' }, { k: 'f1', l: 'Top ring factor', u: 'in per in of bore', dflt: '0.0045' }, { k: 'f2', l: 'Second ring factor', u: 'in per in of bore', dflt: '0.0050' },
    { k: 'measured', l: 'Measured top gap (optional)', u: 'in' }],
  outputs: [{ k: 'g1', l: 'Top ring gap', u: 'in', dp: 4 }, { k: 'g2', l: 'Second ring gap', u: 'in', dp: 4 }, { k: 'per', l: 'Measured gap per inch of bore', u: 'in', dp: 5 }],
  calc: ({ bore, f1, f2, measured }) => (have(bore) ? { ...(have(f1) ? { g1: bore * f1 } : {}), ...(have(f2) ? { g2: bore * f2 } : {}), ...(have(measured) && bore ? { per: measured / bore } : {}) } : {}),
  how: 'Gap = bore × factor. Use your ring maker’s factors — they depend on fuel, power adder and ring material.',
};

// ---------------------------------------------------------------- workshop
const torsionBar = {
  id: 'torsion-bar', cat: 'workshop', title: 'Torsion bar rate',
  blurb: 'Rate at the arm from a bar’s diameter and active length — or the diameter for a rate.',
  inputs: [{ k: 'mode', l: 'Work out', type: 'select', options: ['Rate from diameter', 'Diameter for a rate'], dflt: 'Rate from diameter' },
    { k: 'd', l: 'Bar diameter', u: 'in', show: (i) => i.mode !== 'Diameter for a rate' }, { k: 'rate', l: 'Target rate', u: 'lb/in', show: (i) => i.mode === 'Diameter for a rate' },
    { k: 'len', l: 'Active length', u: 'in' }, { k: 'arm', l: 'Arm length (bar centre to load point)', u: 'in' }, { k: 'g', l: 'Shear modulus', u: 'psi', dflt: '11500000' }],
  outputs: [{ k: 'rate_out', l: 'Rate at the arm', u: 'lb/in', dp: 0 }, { k: 'd_out', l: 'Bar diameter', u: 'in', dp: 4 }, { k: 'tq', l: 'Torsional rate', u: 'in-lb/°', dp: 1 }],
  calc: ({ mode, d, rate, len, arm, g }) => {
    if (!have(len, arm, g) || !len || !arm) return {};
    if (mode === 'Diameter for a rate') return have(rate) ? { d_out: ((rate * 32 * len * arm * arm) / (g * PI)) ** 0.25 } : {};
    if (!have(d)) return {};
    const kt = (g * PI * d ** 4) / (32 * len); // in-lb per radian
    return { rate_out: kt / (arm * arm), tq: kt * (PI / 180) };
  },
  how: 'Torsional stiffness = G × π × d⁴ ÷ (32 × L); rate at the arm = that ÷ arm². G ≈ 11.5 million psi for alloy steel. Measured rates vary — record real ones with a bar rate test.',
};

const wheelRate = {
  id: 'wheel-rate', cat: 'workshop', title: 'Wheel rate (motion ratio)',
  blurb: 'Rate at the wheel from the spring or bar rate and its motion ratio.',
  inputs: [{ k: 'rate', l: 'Spring / bar rate', u: 'lb/in' }, { k: 'mode', l: 'Motion ratio from', type: 'select', options: ['Lever lengths', 'Ratio'], dflt: 'Lever lengths' },
    { k: 'a', l: 'Pivot to spring/arm point', u: 'in', show: (i) => i.mode !== 'Ratio' }, { k: 'b', l: 'Pivot to wheel centre', u: 'in', show: (i) => i.mode !== 'Ratio' },
    { k: 'mr', l: 'Motion ratio (spring travel ÷ wheel travel)', show: (i) => i.mode === 'Ratio' }, { k: 'angle', l: 'Spring angle from vertical', u: '°', dflt: '0' }],
  outputs: [{ k: 'mr_out', l: 'Motion ratio', dp: 3 }, { k: 'wr', l: 'Wheel rate', u: 'lb/in', dp: 1 }],
  calc: ({ rate, mode, a, b, mr, angle }) => {
    const m = mode === 'Ratio' ? mr : have(a, b) && b ? a / b : null;
    if (!have(rate, m)) return {};
    const c = Math.cos(((angle || 0) * PI) / 180);
    return { mr_out: m, wr: rate * (m * c) ** 2 };
  },
  how: 'Wheel rate = spring rate × (motion ratio × cos angle)². The ratio is squared because it changes both the force and the travel.',
};

const torqueExt = {
  id: 'torque-extension', cat: 'workshop', title: 'Torque wrench with an extension',
  blurb: 'What to set the wrench to when using a crowsfoot or extension in line with the handle.',
  inputs: [{ k: 't', l: 'Torque wanted at the fastener', u: 'ft-lb' }, { k: 'l', l: 'Wrench length (square drive to handle grip mark)', u: 'in' }, { k: 'e', l: 'Extension length (added in line)', u: 'in' }],
  outputs: [{ k: 'set', l: 'Set the wrench to', u: 'ft-lb', dp: 1 }],
  calc: ({ t, l, e }) => (have(t, l, e) && l + e ? { set: (t * l) / (l + e) } : {}),
  how: 'Setting = wanted × L ÷ (L + E). An extension at 90° to the handle needs no correction.',
};

const UNITS_CONV = {
  Length: { in: 1, mm: 1 / 25.4, cm: 1 / 2.54, ft: 12, m: 39.3701, mi: 63360, km: 39370.1 },
  Weight: { lb: 1, kg: 2.20462, g: 0.00220462, oz: 1 / 16 },
  Pressure: { psi: 1, kPa: 0.145038, bar: 14.5038, inHg: 0.491154, hPa: 0.0145038, 'in H₂O': 0.0361273 },
  Torque: { 'ft-lb': 1, 'in-lb': 1 / 12, Nm: 0.737562 },
  Volume: { 'US gal': 1, L: 0.264172, 'imp gal': 1.20095, 'cu in': 1 / 231, cc: 0.000264172, 'fl oz': 1 / 128 },
  Speed: { mph: 1, 'km/h': 0.621371, 'ft/s': 0.681818, 'm/s': 2.23694 },
  'Spring rate': { 'lb/in': 1, 'N/mm': 5.71015, 'kg/mm': 55.9974 },
  Temperature: { '°F': 'F', '°C': 'C' },
};
const converter = {
  id: 'converter', cat: 'workshop', title: 'Unit converter',
  blurb: 'Length, weight, pressure, torque, volume, speed, spring rate and temperature.',
  inputs: [{ k: 'kind', l: 'Convert', type: 'select', options: Object.keys(UNITS_CONV), dflt: 'Length' }, { k: 'x', l: 'Value' },
    { k: 'from', l: 'From', type: 'select', options: (i) => Object.keys(UNITS_CONV[i.kind || 'Length']) }],
  outputs: [{ k: 'all', l: 'Equals', type: 'list' }],
  calc: ({ kind, x, from }) => {
    const table = UNITS_CONV[kind || 'Length'];
    if (!have(x) || !table) return {};
    const f = table[from] !== undefined ? from : Object.keys(table)[0];
    if (kind === 'Temperature') return { all: f === '°F' ? `${(((x - 32) * 5) / 9).toFixed(2)} °C` : `${((x * 9) / 5 + 32).toFixed(2)} °F` };
    const base = x * table[f];
    return { all: Object.entries(table).filter(([u]) => u !== f).map(([u, k]) => `${fmt(base / k, 4)} ${u}`).join(' · ') };
  },
  how: 'Exact conversion factors (1 in = 25.4 mm, 1 lb = 0.4536 kg, 1 psi = 6.895 kPa, 1 ft-lb = 1.3558 Nm, 1 US gal = 3.785 L).',
};

export const CALCS = [
  airCalc, daCalc, altimeterCalc, stdLapCalc,
  mainJet, hsBypass, orificeArea, orificeChange, parallelOrifices, orificeFlow, fuelPump, efiInjector, engineAirflow, methSg,
  chassisCalc, ballast, stagger, tyreGrowth, tyreSize, wheelOffset,
  qcFinal, gearRpm, mph, axleRatio, lapSpeed, lapAnalysis, fuelMileage,
  displacement, compression, dcr, camSpecs, valveEvents, valveLift, pistonSpeed, deckHeight, pourChamber, pourDome, gasketVol, dynoCorrection, hpPredict, airflowCompare, bobweight, ringGap,
  torsionBar, wheelRate, torqueExt, converter,
];
export const CALC = Object.fromEntries(CALCS.map((c) => [c.id, c]));

/** Calculator buttons beside form fields: [calc id, output key that fills the field]. */
export const FIELD_CALCS = {
  setup: {
    main_jet: ['main-jet', 'main_thou'], hs_bypass: ['hs-bypass', 'newd'], stagger_cold: ['stagger', 'stagger'],
    left_pct: ['ballast', null], final_drive: ['qc-final', null], tach_high: ['engine-rpm', 'nr'], fuel_start: ['fuel-mileage', 'need'],
    pressure_hot: ['tyre-growth', null], adr: ['air', 'adr'], alt: ['air', 'da'],
  },
  engine_build: {
    hp: ['dyno-correction', 'hp_std'], cam_installed_cl: ['cam-specs', 'icl'], piston_volume: ['pour-dome', null], chamber_cc: ['pour-chamber', null],
    peak_rpm: ['piston-speed', null], ring1_gap: ['ring-gap', null], deck_clearance: ['piston-height', null],
  },
  dyno_run: { nominal: ['torsion-bar', 'rate_out'] },
  tire: { circumference: ['tyre-size', 'circ'] },
};

/** Run a calculator with raw (string) inputs. */
export function runCalc(def, raw, ctx) {
  const i = {};
  for (const inp of def.inputs) {
    const val = raw[inp.k] ?? inp.dflt ?? '';
    i[inp.k] = ['select', 'text', 'list'].includes(inp.type) ? val : num(val);
  }
  try { return def.calc(i, ctx) || {}; } catch (e) { return { error: e.message }; }
}

export function fmt(x, dp = 3) {
  if (typeof x === 'string') return x;
  if (!Number.isFinite(x)) return '';
  const r = Math.round(x * 10 ** dp) / 10 ** dp;
  return r.toLocaleString('en-US', { maximumFractionDigits: dp, useGrouping: Math.abs(r) >= 10000 });
}
