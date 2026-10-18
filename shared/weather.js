// Track weather maths shared by the server and the app: air density, ADR, density (corrected)
// altitude, water grains, dew point and wet bulb from temperature, station pressure and humidity.
// Internally metric (°C, hPa); converted to the team's units for display and storage.

const RD = 287.058; // J/(kg·K) dry air
const RV = 461.495; // J/(kg·K) water vapour
export const RHO_STD = 1.225; // kg/m³ — ISA sea level, 15 °C, 1013.25 hPa, dry

export const UNITS = {
  imperial: { label: 'US (°F, inHg, ft, mph)', temp: '°F', pressure: 'inHg', alt: 'ft', wind: 'mph' },
  metric: { label: 'Metric (°C, hPa, m, km/h)', temp: '°C', pressure: 'hPa', alt: 'm', wind: 'km/h' },
};
export const DEFAULT_UNITS = 'imperial';

export const cToF = (c) => (c * 9) / 5 + 32;
export const fToC = (f) => ((f - 32) * 5) / 9;
export const hpaToInHg = (h) => h / 33.8639;
export const inHgToHpa = (i) => i * 33.8639;
export const mToFt = (m) => m * 3.28084;
export const kmhToMph = (k) => k / 1.609344;

/** Saturation vapour pressure over water, hPa (Tetens / Murray). */
export const satVp = (tC) => 6.1078 * 10 ** ((7.5 * tC) / (tC + 237.3));

/** Dew point °C from temperature °C and relative humidity % (Magnus, Alduchov & Eskridge constants). */
export function dewPoint(tC, rh) {
  if (!(rh > 0)) return null;
  const g = Math.log(rh / 100) + (17.625 * tC) / (243.04 + tC);
  return (243.04 * g) / (17.625 - g);
}

/** Relative humidity % from dry and wet bulb (°C) and station pressure (hPa) — psychrometer equation. */
export function rhFromWetBulb(tC, twC, pHpa) {
  const e = satVp(twC) - 0.00066 * (1 + 0.00115 * twC) * pHpa * (tC - twC);
  return Math.max(0, Math.min(100, (e / satVp(tC)) * 100));
}

/** Wet bulb °C from temperature °C and RH % at ~sea-level pressure (Stull 2011; ±0.3 °C for 5–99 % RH). */
export function wetBulb(tC, rh) {
  return tC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(tC + rh) - Math.atan(rh - 1.676331)
    + 0.00391838 * rh ** 1.5 * Math.atan(0.023101 * rh) - 4.686035;
}

/**
 * Everything derived from a reading. Inputs metric: tC, rh (%), pHpa = station (uncorrected) pressure.
 * Returns density (kg/m³), adr (% of standard air), densityAltM, grains (per lb dry air), dewC, wetBulbC, vpHpa.
 */
export function airData({ tC, rh, pHpa }) {
  if (![tC, rh, pHpa].every(Number.isFinite) || pHpa < 500 || pHpa > 1100) return null;
  const e = (rh / 100) * satVp(tC);
  const tK = tC + 273.15;
  const density = ((pHpa - e) * 100) / (RD * tK) + (e * 100) / (RV * tK);
  const ratio = density / RHO_STD;
  const densityAltM = 44330.8 * (1 - ratio ** 0.234969);
  const grains = 7000 * ((0.62198 * e) / (pHpa - e));
  return { density, adr: ratio * 100, densityAltM, grains, dewC: dewPoint(tC, rh), wetBulbC: wetBulb(tC, rh), vpHpa: e };
}

const r = (x, d) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/**
 * Setup-sheet weather values (strings, like typed input) in the team's units.
 * raw: { tC, rh, pHpa (station), mslHpa?, windKmh?, windDir?, gustKmh? }
 */
export function sheetValues(raw, units = DEFAULT_UNITS) {
  const a = airData(raw);
  if (!a) return {};
  const imp = units !== 'metric';
  const t = (c) => (c === null ? null : imp ? r(cToF(c), 1) : r(c, 1));
  const p = (h) => (h === null || h === undefined ? null : imp ? r(hpaToInHg(h), 2) : r(h, 1));
  const out = {
    temp: t(raw.tC),
    baro: p(raw.pHpa),
    corrected: p(raw.mslHpa ?? null),
    alt: imp ? r(mToFt(a.densityAltM), 0) : r(a.densityAltM, 0),
    adr: r(a.adr, 1),
    wb: t(a.wetBulbC),
    humidity: r(raw.rh, 0),
    dew_point: t(a.dewC),
    grains: r(a.grains, 1),
  };
  if (Number.isFinite(raw.windKmh)) {
    const sp = imp ? r(kmhToMph(raw.windKmh), 0) : r(raw.windKmh, 0);
    const gust = Number.isFinite(raw.gustKmh) ? (imp ? r(kmhToMph(raw.gustKmh), 0) : r(raw.gustKmh, 0)) : null;
    out.wind = `${sp} ${imp ? 'mph' : 'km/h'}${Number.isFinite(raw.windDir) ? ` ${compass(raw.windDir)}` : ''}${gust ? `, gusts ${gust}` : ''}`;
  }
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== null).map(([k, x]) => [k, String(x)]));
}

/** Read the manual readings back to metric so derived values can be calculated. */
export function readingsFromSheet(values, units = DEFAULT_UNITS) {
  const n = (x) => { const v = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
  const imp = units !== 'metric';
  const temp = n(values.temp); const baro = n(values.baro); const wb = n(values.wb); const rh = n(values.humidity);
  const tC = temp === null ? null : imp ? fToC(temp) : temp;
  const pHpa = baro === null ? null : imp ? inHgToHpa(baro) : baro;
  let humidity = rh;
  if (humidity === null && wb !== null && tC !== null && pHpa !== null) humidity = rhFromWetBulb(tC, imp ? fToC(wb) : wb, pHpa);
  return { tC, pHpa, rh: humidity, fromWetBulb: rh === null && humidity !== null, mslHpa: (() => { const c = n(values.corrected); return c === null ? null : imp ? inHgToHpa(c) : c; })() };
}

export const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

/** Weather fields whose unit depends on the team's unit choice. */
export const UNIT_FIELDS = { temp: 'temp', baro: 'pressure', corrected: 'pressure', alt: 'alt', wb: 'temp', dew_point: 'temp' };
