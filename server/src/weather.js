// Track weather from Open-Meteo for a track's coordinates, current or for a past/future hour.
// The server makes the call so results can be cached (several crews at one track share it)
// and a paid Open-Meteo key never reaches a phone. Raw readings are returned in metric;
// the app derives ADR, density altitude, grains etc. with shared/weather.js.
import { HttpError } from './auth.js';
import { canType } from '../../shared/catalog.js';

export const WEATHER_PROVIDER = (process.env.WEATHER_PROVIDER || 'open-meteo').toLowerCase(); // open-meteo | off | mock (tests)
const KEY = process.env.OPEN_METEO_API_KEY || '';
const BASE = KEY ? 'https://customer-api.open-meteo.com/v1/forecast' : 'https://api.open-meteo.com/v1/forecast';
const VARS = 'temperature_2m,relative_humidity_2m,dew_point_2m,surface_pressure,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,precipitation,weather_code';
const ATTRIBUTION = 'Weather data by Open-Meteo.com (CC BY 4.0)';

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const weatherEnabled = () => WEATHER_PROVIDER !== 'off';

const cache = new Map(); // key → { at, data }
const TTL = 10 * 60 * 1000;
const hits = new Map(); // per-team rate limit
function limit(tid) {
  const now = Date.now();
  const list = (hits.get(tid) || []).filter((t) => now - t < 60_000);
  need(list.length < 20, 429, 'Too many weather requests — try again in a minute.');
  list.push(now); hits.set(tid, list);
}

function pick(src, i) {
  const at = (k) => (Array.isArray(src[k]) ? src[k][i] : src[k]);
  return {
    time: at('time'), tC: at('temperature_2m'), rh: at('relative_humidity_2m'), dewC: at('dew_point_2m'),
    pHpa: at('surface_pressure'), mslHpa: at('pressure_msl'), windKmh: at('wind_speed_10m'), windDir: at('wind_direction_10m'),
    gustKmh: at('wind_gusts_10m'), cloud: at('cloud_cover'), precipMm: at('precipitation'), code: at('weather_code'),
  };
}

function mock(lat, lon, when) {
  // deterministic test data: warm, humid evening at the track
  const hour = when ? new Date(when).getUTCHours() : 9;
  return { time: (when || new Date().toISOString()).slice(0, 16), tC: 27.5 - (hour % 5) * 0.5, rh: 62, dewC: 19.6, pHpa: 1008.2, mslHpa: 1012.4,
    windKmh: 14, windDir: 135, gustKmh: 26, cloud: 40, precipMm: 0, code: 2, elevation: 34, lat, lon };
}

async function fetchWeather(lat, lon, when) {
  const now = Date.now();
  const t = when ? new Date(when).getTime() : now;
  const current = Math.abs(t - now) < 45 * 60 * 1000;
  const hourKey = current ? `now:${Math.floor(now / TTL)}` : new Date(t).toISOString().slice(0, 13);
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${hourKey}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < (current ? TTL : 6 * 3600 * 1000)) return hit.data;
  if (WEATHER_PROVIDER === 'mock') { const d = mock(lat, lon, current ? null : when); cache.set(key, { at: now, data: d }); return d; }

  const days = Math.ceil((now - t) / 86400000);
  need(days <= 92, 400, 'Weather history only goes back 92 days.');
  need((t - now) / 86400000 <= 15, 400, 'Forecasts only go 15 days ahead.');
  const params = new URLSearchParams({ latitude: String(lat), longitude: String(lon), timezone: 'GMT' });
  if (current) params.set('current', VARS);
  else {
    params.set('hourly', VARS);
    if (t < now) { params.set('past_days', String(Math.max(1, days))); params.set('forecast_days', '1'); }
    else params.set('forecast_days', String(Math.min(16, Math.ceil((t - now) / 86400000) + 1)));
  }
  if (KEY) params.set('apikey', KEY);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  let res;
  try { res = await fetch(`${BASE}?${params}`, { signal: ctl.signal }); } catch (e) {
    throw new HttpError(502, e.name === 'AbortError' ? 'The weather service took too long to answer.' : 'Could not reach the weather service.');
  } finally { clearTimeout(timer); }
  const json = await res.json().catch(() => ({}));
  need(res.ok, res.status === 429 ? 503 : 502, `Weather service error: ${json.reason || res.status}`);
  let data;
  if (current) data = pick(json.current || {}, 0);
  else {
    const times = json.hourly?.time || [];
    need(times.length, 502, 'The weather service returned no data.');
    let best = 0;
    times.forEach((x, i) => { if (Math.abs(Date.parse(`${x}Z`) - t) < Math.abs(Date.parse(`${times[best]}Z`) - t)) best = i; });
    data = pick(json.hourly, best);
  }
  data.elevation = json.elevation; data.lat = lat; data.lon = lon;
  need(Number.isFinite(data.tC) && Number.isFinite(data.pHpa), 502, 'The weather service returned incomplete data.');
  cache.set(key, { at: now, data });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return data;
}

export function mountWeather(T) {
  T.get('/weather', h(async (req, res) => {
    need(weatherEnabled(), 503, 'Weather lookups are turned off on this server.');
    need(canType(req.role, req.ent, 'setup', 'view') || canType(req.role, req.ent, 'event', 'view'), 403, 'You can’t view track weather.');
    const lat = Number(req.query.lat); const lon = Number(req.query.lon);
    need(Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180, 400, 'This track has no map position — add its latitude and longitude in the track directory.');
    const when = req.query.at ? new Date(String(req.query.at)) : null;
    need(!when || !Number.isNaN(when.getTime()), 400, 'Invalid time');
    limit(req.tid);
    const data = await fetchWeather(lat, lon, when ? when.toISOString() : null);
    res.json({ ...data, source: WEATHER_PROVIDER === 'mock' ? 'Test weather (mock)' : 'Open-Meteo', attribution: ATTRIBUTION });
  }));
}
