// Sponsor deliverables that collect their own evidence. Each promise on a sponsor deal (logo on the
// car, posts per event, hospitality passes) is counted from records that name the sponsor:
//  - Logo on car: paint schemes (livery) on a car that list the sponsor, current or in the deal's dates,
//    and media tagged with the sponsor;
//  - Posts per event: results posts marked Posted that tag the sponsor (per event when the promise is per event);
//  - Hospitality passes: guests of the sponsor who checked in (passes count).
// Other promises (suit, signage, website, PA announcement…) have a status: Planned, Designed, Approved by
// sponsor, Deployed — Deployed counts as done. Every row can carry a status and a proof photo.
// Runs on the device and on the server (the sponsor portal), so it only uses plain records.

const num = (x) => { const v = Number(String(x ?? '').replace(/,/g, '')); return Number.isFinite(v) ? v : 0; };
const vals = (r) => r?.data?.values || {};
const has = (list, id) => Array.isArray(list) && list.includes(id);

function inDeal(sponsor, date) {
  const v = vals(sponsor);
  return (!v.start || !date || date >= v.start) && (!v.end || !date || date <= v.end);
}

/** Events the deal covers that the team has raced (or is down to race) — for per-event promises. */
export function dealEvents(list, sponsor, today = '') {
  return list('event').filter((e) => inDeal(sponsor, vals(e).date) && (!today || (vals(e).date || '') <= today));
}

/** Progress on each deliverable row: { kind, detail, target, done, evidence: [{type,id,label,date}] }. */
export function deliverableProgress(list, sponsor, today = '') {
  const id = sponsor.id;
  const rows = Array.isArray(vals(sponsor).deliverables) ? vals(sponsor).deliverables.filter((r) => r.kind || r.detail) : [];
  const events = dealEvents(list, sponsor, today);
  const posts = list('social_post').filter((p) => vals(p).status === 'Posted' && has(vals(p).sponsors, id));
  const media = list('media').filter((m) => has(vals(m).sponsors, id));
  const liveries = list('livery').filter((l) => has(vals(l).sponsors, id) && (!vals(l).to || !vals(sponsor).start || vals(l).to >= vals(sponsor).start));
  const guests = list('guest').filter((g) => vals(g).sponsor === id && vals(g).checked_in);
  return rows.map((r) => {
    const qty = num(r.qty) || 1;
    if (r.kind === 'Posts per event') {
      const perEvent = r.per === 'Event';
      const target = perEvent ? qty * events.length : qty;
      const done = perEvent ? events.reduce((a, e) => a + Math.min(qty, posts.filter((p) => vals(p).event === e.id).length), 0) : posts.length;
      return { ...r, target, done, evidence: posts.map((p) => ({ type: 'social_post', id: p.id, label: String(vals(p).text || '').slice(0, 60), date: vals(p).posted_on || '' })) };
    }
    if (r.kind === 'Hospitality passes') {
      const used = guests.reduce((a, g) => a + (num(vals(g).passes) || 1), 0);
      const target = r.per === 'Event' ? qty * events.length : qty;
      return { ...r, target, done: used, evidence: guests.map((g) => ({ type: 'guest', id: g.id, label: vals(g).name || 'Guest', date: '' })) };
    }
    if (r.kind === 'Logo on car') {
      // a paint scheme counts while it's on the car during the deal; photos showing the logo are the proof
      const wanted = String(r.detail || '').toLowerCase();
      const onCar = liveries.filter((l) => !vals(l).to || !today || vals(l).to >= (vals(sponsor).start || ''));
      const photos = media.filter((m) => !wanted || !vals(m).logo_position || String(vals(m).logo_position).toLowerCase().includes(wanted) || wanted.includes(String(vals(m).logo_position).toLowerCase()));
      return { ...r, target: 1, done: onCar.length ? 1 : 0, photos: photos.length,
        evidence: [...onCar.map((l) => ({ type: 'livery', id: l.id, label: vals(l).name || 'Paint scheme', date: vals(l).from || '' })),
          ...photos.map((m) => ({ type: 'media', id: m.id, label: vals(m).caption || 'Photo', date: vals(m).date || '' }))] };
    }
    // promises the app can't count: their status says where they're up to (Deployed = done)
    return { ...r, target: qty, done: r.status === 'Deployed' ? qty : 0, evidence: [], manual: true };
  });
}

/** One line per sponsor: deliverables met / total, for lists. */
export function sponsorSummary(list, sponsor, today = '') {
  const p = deliverableProgress(list, sponsor, today).filter((r) => !r.manual || r.status);
  return { total: p.length, met: p.filter((r) => r.done >= r.target).length, rows: p };
}

/** Results for the events in a deal — for the sponsor report and proposal. */
export function dealResults(list, byId, sponsor, today = '') {
  const events = dealEvents(list, sponsor, today);
  const setups = list('setup');
  return events.map((e) => {
    const sheets = setups.filter((s) => vals(s).event === e.id);
    const feature = sheets.find((s) => /feature|a-main|main/i.test(vals(s).session || '')) || null;
    const best = sheets.map((s) => num(vals(s).finish)).filter(Boolean).sort((a, b) => a - b)[0] || null;
    return { id: e.id, name: vals(e).name || 'Event', date: vals(e).date || '', track: vals(byId[vals(e).venue]).name || vals(e).track || '',
      feature: feature ? num(vals(feature).finish) || null : null, best, laps: sheets.reduce((a, s) => a + num(vals(s).laps), 0) };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** A results post drafted from the event's results, with no AI (works offline). */
export function draftPost(list, byId, event, { team = '', sponsors = [] } = {}) {
  const v = vals(event);
  const sheets = list('setup').filter((s) => vals(s).event === event.id)
    .sort((a, b) => String(vals(a).session || '').localeCompare(String(vals(b).session || '')));
  const car = byId[v.car];
  const results = sheets.filter((s) => num(vals(s).finish)).map((s) => `${vals(s).session || 'Session'}: P${num(vals(s).finish)}${num(vals(s).start) ? ` from P${num(vals(s).start)}` : ''}`);
  const track = vals(byId[v.venue]).name || v.track || '';
  const tags = sponsors.map((s) => vals(s).name).filter(Boolean);
  return [
    `${v.name || 'Race night'}${track ? ` at ${track}` : ''}${car ? ` — #${vals(car).number || ''}` : ''}`,
    results.length ? results.join('\n') : 'Results to come.',
    v.outcome_notes ? String(v.outcome_notes) : '',
    tags.length ? `Thanks to ${tags.join(', ')} for the support.` : '',
    team ? `— ${team}` : '',
  ].filter(Boolean).join('\n\n');
}
