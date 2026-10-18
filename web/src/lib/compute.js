import { allFields, assetRefId, formFor, num, v, today } from './data.js';

const eventDateOf = (setup, data) => v(data.byId[v(setup, 'event')], 'date') || setup.created_at?.slice(0, 10) || '';

/** Map assetId -> setups that reference it (via asset or asset-corner fields). */
export function setupsByAsset(data) {
  const out = {};
  for (const s of data.list('setup')) {
    const form = formFor(data, 'setup', s.data.form_id);
    const vals = s.data.values || {};
    const ids = new Set();
    for (const f of allFields(form)) {
      if (f.type === 'asset') { const id = assetRefId(vals[f.key]); if (id) ids.add(id); }
      if (f.type === 'corners' && f.input === 'asset') {
        for (const c of f.corners || []) { const id = assetRefId(vals[f.key]?.[c]); if (id) ids.add(id); }
      }
    }
    for (const id of ids) (out[id] ||= []).push(s);
  }
  return out;
}

function usageFrom(setups, data, sinceDate) {
  const list = setups.filter((s) => !sinceDate || eventDateOf(s, data) > sinceDate);
  return {
    laps: list.reduce((a, s) => a + (num(v(s, 'laps')) || 0), 0),
    races: new Set(list.map((s) => v(s, 'event')).filter(Boolean)).size,
    setups: list,
  };
}

/** Lifecycle status for an asset. */
export function assetLife(asset, data, byAsset = setupsByAsset(data)) {
  const unit = v(asset, 'life_unit') || 'Laps';
  const limit = num(v(asset, 'life_limit'));
  const offset = num(v(asset, 'usage_offset')) || 0;
  const u = usageFrom(byAsset[asset.id] || [], data);
  const used = unit === 'Laps' ? u.laps + offset : unit === 'Races' ? u.races + offset : offset;
  const pct = limit ? used / limit : null;
  const exp = v(asset, 'expiry_date');
  const daysToExpiry = exp ? Math.round((new Date(`${exp}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 864e5) : null;
  let level = 'ok';
  if ((pct !== null && pct >= 1) || (daysToExpiry !== null && daysToExpiry < 0)) level = 'over';
  else if ((pct !== null && pct >= 0.8) || (daysToExpiry !== null && daysToExpiry <= 60)) level = 'warn';
  if (v(asset, 'status') === 'Out for Service' && level === 'ok') level = 'warn';
  return { unit, limit, used, pct, daysToExpiry, level, laps: u.laps, races: u.races, setups: u.setups };
}

/** Due status for a maintenance schedule. */
export function scheduleStatus(sch, data, byAsset = setupsByAsset(data)) {
  const unit = v(sch, 'interval_unit') || 'Races';
  const interval = num(v(sch, 'interval')) || 0;
  const last = v(sch, 'last_done') || '';
  let used;
  if (unit === 'Days') {
    used = last ? Math.round((new Date(`${today()}T00:00:00`) - new Date(`${last}T00:00:00`)) / 864e5) : interval;
  } else {
    const setups = v(sch, 'applies_to') === 'Car'
      ? data.list('setup').filter((s) => v(s, 'car') === v(sch, 'car'))
      : byAsset[v(sch, 'asset')] || [];
    const u = usageFrom(setups, data, last);
    used = unit === 'Laps' ? u.laps : u.races;
  }
  const remaining = interval - used;
  const level = !interval ? 'ok' : remaining <= 0 ? 'over' : remaining <= Math.max(1, interval * 0.2) ? 'warn' : 'ok';
  return { unit, interval, used, remaining, level, last };
}
