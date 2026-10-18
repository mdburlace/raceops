// Weather tools at the top of a setup sheet's Weather section: pull track weather for the
// session time, or calculate ADR / density altitude / grains from readings typed in by hand.
// Values are always shown for review first and never overwrite anything without a tick.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_UNITS, UNITS, UNIT_FIELDS, airData, readingsFromSheet, sheetValues } from '@shared/weather.js';
import { api } from '../lib/api.js';
import { v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { useOnline } from './ui.jsx';

const LABEL = { temp: 'Temp', baro: 'Baro', corrected: 'Corrected baro', alt: 'Density altitude (ALT)', adr: 'ADR', wb: 'Wet bulb', humidity: 'Humidity',
  dew_point: 'Dew point', grains: 'Water grains', wind: 'Wind', weather_source: 'Weather from' };
const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The team's weather units (US by default — the units most MFI jetting charts use). */
export function useWeatherUnits() {
  const { membership } = useSession();
  return UNITS[membership?.settings?.weather_units] ? membership.settings.weather_units : DEFAULT_UNITS;
}

/** The setup form with weather units filled in from the team's choice. */
export function withWeatherUnits(form, units) {
  if (!form || form.data.target !== 'setup') return form;
  const u = UNITS[units];
  return { ...form, data: { ...form.data, sections: form.data.sections.map((s) => (s.id !== 'weather' ? s : {
    ...s, fields: s.fields.map((f) => (UNIT_FIELDS[f.key] ? { ...f, unit: u[UNIT_FIELDS[f.key]] } : f)),
  })) } };
}

function defaultTime(event, day) {
  const now = new Date();
  const date = v(event, 'date');
  if (!date) return localInput(now);
  const d = new Date(`${date}T19:00`);
  d.setDate(d.getDate() + (Number(day) || 1) - 1);
  return d.toDateString() === now.toDateString() ? localInput(now) : localInput(d);
}

function Review({ title, items, note, tickAll, onApply, onCancel }) {
  const [on, setOn] = useState(() => Object.fromEntries(items.map((it) => [it.key, tickAll || it.from === '' || it.key === 'weather_source' || it.calc])));
  return (
    <div className="wx-review" role="region" aria-label={title}>
      <b>{title}</b>
      {note && <div className="muted small">{note}</div>}
      {!items.length ? <p className="muted small">Nothing new — the sheet already has these values.</p> : (
        <div className="wx-items">
          {items.map((it) => (
            <label key={it.key} className="wx-item">
              <input type="checkbox" checked={!!on[it.key]} aria-label={`Use ${LABEL[it.key]}`} onChange={(e) => setOn({ ...on, [it.key]: e.target.checked })} />
              <span className="wx-name">{LABEL[it.key]}</span>
              <span className="wx-val">{it.from !== '' && <s className="muted">{it.from}</s>} <b>{it.to}</b> {it.unit && <small className="muted">{it.unit}</small>}</span>
            </label>
          ))}
        </div>
      )}
      <div className="inline-row">
        <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>
        {items.length > 0 && <button type="button" className="btn primary small" onClick={() => onApply(Object.fromEntries(items.filter((it) => on[it.key]).map((it) => [it.key, it.to])))}>Apply ticked</button>}
      </div>
      {!tickAll && <p className="muted small">Values already on the sheet start unticked, so typed-in readings aren’t replaced unless you choose.</p>}
    </div>
  );
}

export function WeatherTools({ data, values, setValues, readOnly }) {
  const { tid, platform, can, membership, refresh } = useSession();
  const online = useOnline();
  const units = useWeatherUnits();
  const event = data.byId[values.event];
  const track = data.byId[v(event, 'venue')];
  const lat = parseFloat(v(track, 'lat')); const lon = parseFloat(v(track, 'lon'));
  const hasPos = Number.isFinite(lat) && Number.isFinite(lon);
  const [at, setAt] = useState(() => defaultTime(event, values.day));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [review, setReview] = useState(null);
  if (readOnly) return null;
  const u = UNITS[units];
  const unitOf = (k) => (UNIT_FIELDS[k] ? u[UNIT_FIELDS[k]] : { adr: '%', humidity: '%', grains: 'gr' }[k] || '');

  const propose = (title, proposed, note, calcKeys = [], tickAll = false) => {
    const items = Object.entries(proposed)
      .filter(([k, to]) => to !== undefined && to !== null && String(values[k] ?? '') !== String(to))
      .map(([k, to]) => ({ key: k, from: values[k] === undefined || values[k] === null ? '' : String(values[k]), to: String(to), unit: unitOf(k), calc: calcKeys.includes(k) }));
    setReview({ title, items, note, tickAll });
  };

  const pull = async () => {
    setErr(''); setBusy(true); setReview(null);
    try {
      const w = await api(`/t/${tid}/weather?lat=${lat}&lon=${lon}&at=${encodeURIComponent(new Date(at).toISOString())}`);
      const when = new Date(`${w.time}Z`).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      propose(`Track weather — ${v(track, 'name')}, ${when}`, { ...sheetValues(w, units), weather_source: `${w.source} ${when}` },
        `${w.attribution}. Modelled for the track’s position${Number.isFinite(w.elevation) ? ` (${Math.round(w.elevation)} m elevation)` : ''} — your own weather station at the track is more accurate.`,
        [], !!values.weather_source); // readings from an earlier pull or station (e.g. carried from the last session) are refreshed
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const calc = () => {
    setErr(''); setReview(null);
    const r = readingsFromSheet(values, units);
    const missing = [r.tC === null && 'Temp', r.pHpa === null && 'Baro', r.rh === null && 'Humidity or Wet bulb'].filter(Boolean);
    if (missing.length) { setErr(`To calculate, first enter: ${missing.join(', ')}.`); return; }
    if (!airData(r)) { setErr(`Baro doesn’t look like ${u.pressure} — check the units setting.`); return; }
    const all = sheetValues(r, units);
    const keys = ['alt', 'adr', 'grains', 'dew_point', ...(r.fromWetBulb ? ['humidity'] : ['wb'])];
    propose('Calculated from your readings', Object.fromEntries(keys.map((k) => [k, all[k]])),
      r.fromWetBulb ? 'Humidity worked out from the dry and wet bulb temperatures.' : null, keys);
  };

  const setUnits = async (next) => {
    try { await api(`/t/${tid}`, { method: 'PATCH', body: { settings: { ...(membership.settings || {}), weather_units: next } } }); await refresh(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="wx-tools span-all">
      <div className="wx-row">
        {platform?.weather !== false && (
          <>
            <label className="wx-at"><span className="small muted">Reading for</span>
              <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Weather time" /></label>
            <button type="button" className="btn small" disabled={!hasPos || !online || busy} onClick={pull}>{busy ? 'Getting weather…' : 'Get track weather'}</button>
          </>
        )}
        <button type="button" className="btn small ghost" onClick={calc}>Calculate from readings</button>
        <a className="btn small ghost" href="https://airdensityonline.com/" target="_blank" rel="noopener noreferrer">Air Density Online ↗</a>
      </div>
      <div className="wx-row small muted">
        {platform?.weather !== false && !event && <span>Pick the event first to get its track weather.</span>}
        {platform?.weather !== false && event && !track && <span>The event’s track isn’t from the directory, so there’s no map position to get weather for.</span>}
        {platform?.weather !== false && track && !hasPos && <span><Link to={`/tracks/${track.id}`}>{v(track, 'name')}</Link> has no latitude/longitude yet — add them to get its weather.</span>}
        {platform?.weather !== false && hasPos && !online && <span>Offline — enter readings by hand and use “Calculate from readings”.</span>}
        <span className="grow" />
        {can('team.manage') ? (
          <label className="wx-units">Units
            <select value={units} onChange={(e) => setUnits(e.target.value)} aria-label="Weather units">
              {Object.entries(UNITS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
            </select></label>
        ) : <span>Units: {u.label}</span>}
      </div>
      {err && <div className="notice error small">{err}</div>}
      {review && (
        <Review {...review} onCancel={() => setReview(null)}
          onApply={(picked) => { setValues((s) => ({ ...s, ...picked })); setReview(null); }} />
      )}
    </div>
  );
}
