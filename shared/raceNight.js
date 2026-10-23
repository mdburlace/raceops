// Race night: the event's crew list decides what each person sees on Home, and the load list for an
// event starts from the event plan. Plain functions over records, used on the device.

const vals = (r) => r?.data?.values || {};

/**
 * Events on now: from the day before (race nights run past midnight, and the debrief is often next
 * morning) to `ahead` days away, soonest first.
 */
export function currentEvents(data, today, ahead = 1) {
  const shift = (n) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const until = shift(ahead); const since = shift(-1);
  return data.list('event').filter((e) => {
    const v = vals(e); const from = v.date || ''; const to = v.end_date || from;
    return from && from <= until && to >= since;
  }).sort((a, b) => String(vals(a).date).localeCompare(String(vals(b).date)));
}

/** This person's place on an event's crew list: { role, note } or null. */
export function crewSpot(event, userId) {
  const row = (Array.isArray(vals(event).crew) ? vals(event).crew : []).find((r) => r.member === userId);
  return row ? { role: row.role || '', note: row.note || '' } : null;
}

/**
 * Race-night jobs for a crew role: which screens to open. The job comes from the role written on the
 * crew list (e.g. "Tyres", "Car chief", "Hauler") or, failing that, the person's team role names.
 */
export function jobsFor(roleText, roleNames = []) {
  const t = (String(roleText || '').trim() || roleNames.join(' ')).toLowerCase();
  const jobs = [];
  const hauling = /hauler|truck|transport/.test(t);
  if (/\bdriver\b/.test(t) && !hauling) jobs.push('debrief');
  if (/car chief|mechanic|spanner/.test(t)) jobs.push('changes');
  if (/tyre|tire/.test(t)) jobs.push('tyres');
  if (/crew chief/.test(t)) jobs.push('setup', 'changes');
  if (hauling) jobs.push('load', 'trip');
  if (/partner|sponsor|hospitality/.test(t)) jobs.push('guests');
  if (/marketing|media|social/.test(t)) jobs.push('post', 'media');
  if (!jobs.length) jobs.push('setup');
  return [...new Set(jobs)];
}

/** Starting items for an event's load list: the event's car, its engines and spare engines, then a template's items. */
export function loadItemsFor(data, event, template = null) {
  const v = vals(event);
  const items = [];
  const car = data.byId[v.car];
  if (car) items.push({ item: `Car #${vals(car).number || ''} ${vals(car).name || ''}`.trim(), qty: '1' });
  // the team's own engines (not an engine shop's customer engines): the car's, and spares with no car
  const engines = data.list('asset').filter((a) => vals(a).category === 'Engine' && vals(a).status !== 'Retired' && !vals(a).customer && (!v.car || vals(a).car === v.car || !vals(a).car));
  for (const e of engines) items.push({ item: `Engine: ${vals(e).name || 'Engine'}${vals(e).car === v.car ? '' : ' (spare)'}`, qty: '1', asset: e.id });
  for (const row of Array.isArray(vals(template).items) ? vals(template).items : []) {
    if (row.item && !items.some((x) => x.item === row.item)) items.push({ item: row.item, qty: row.qty || '', where: row.where || '' });
  }
  return items;
}
