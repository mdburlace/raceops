// Requests from teams to the shared (global) calendars, moderated by a platform admin.
//
//  share  — send the team's own series or track (with its events), or dates / major events, to the
//           shared calendars. On approval the shared records become the single source of truth: the
//           team's events point at the shared dates, series and track, and the team's own copies of
//           the series and track are retired (their private notes move to the team's local notes).
//  change — ask for a change to a shared series, track or date. On approval the shared record changes
//           and every team's events that came from that date follow it.
//
// Every request is checked for duplicates and conflicts against the shared calendars before the
// admin decides; the team sees the outcome, including anything refused and why.
import crypto from 'node:crypto';
import { q, tx } from './db.js';
import { HttpError } from './auth.js';
import { canType } from '../../shared/catalog.js';
import { keepUsedDays, moveDays, normaliseDays } from '../../shared/calendar.js';
import { audit } from './settings.js';
import { notifyFollowers, officialFor, sendAfter } from './calendarPlus.js';
import { mailAdmins, mailTeam } from './mail.js';

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const lc = (s) => String(s ?? '').trim().toLowerCase();
// results rows with no car number or driver are blank template rows
const tidy = (k, x) => (k === 'results' && Array.isArray(x) ? x.filter((r) => r && (String(r.number || '').trim() || String(r.driver || '').trim())) : x);
const pick = (v, keys) => Object.fromEntries(keys.map((k) => [k, tidy(k, v?.[k])]).filter(([, x]) => x !== undefined && x !== null && x !== '' && !(Array.isArray(x) && !x.length)));
export { pick as pickValues };
/** A shared date's values: the fields kept, with its days and date span in step (see normaliseDays). */
export const pickFixture = (v, keys = FIXTURE_KEYS) => normaliseDays(pick(v, keys));

export const FIXTURE_KEYS = ['name', 'date', 'end_date', 'multi_day', 'days', 'series', 'round', 'venue', 'track', 'classes', 'major', 'major_name', 'sanctioning', 'status', 'start_time', 'website', 'notes',
  'entries', 'results', 'results_note'];
export const SERIES_KEYS = ['name', 'season', 'class', 'sanctioning', 'start_date', 'end_date', 'website', 'points'];
export const TRACK_KEYS = ['name', 'address', 'city', 'region', 'country', 'status', 'length', 'surface', 'dirt_type', 'radius', 'banking', 'cushion',
  'typical', 'lat', 'lon', 'website', 'phone', 'classes'];
const KEYS = { series: SERIES_KEYS, track: TRACK_KEYS, fixture: FIXTURE_KEYS };
// fields a team event takes from the shared date it came from
const SYNC_KEYS = ['name', 'date', 'end_date', 'multi_day', 'days', 'venue', 'track', 'series', 'round', 'sanctioning', 'major', 'major_name'];

// ---------------------------------------------------------------- record helpers
export async function insertGlobal(c, type, data, userId) {
  const id = crypto.randomUUID();
  await c.query(`INSERT INTO records(id,tenant_id,type,data,created_by,updated_by,client_updated_at) VALUES ($1,NULL,$2,$3,$4,$4,now())`, [id, type, JSON.stringify(data), userId]);
  await c.query(`INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,user_id,client_updated_at) VALUES ($1,NULL,$2,'create','applied',$3,$4,now())`,
    [id, type, JSON.stringify(data), userId]);
  return id;
}
async function insertTeam(c, tid, type, data, userId) {
  const id = crypto.randomUUID();
  await c.query(`INSERT INTO records(id,tenant_id,type,data,created_by,updated_by,client_updated_at) VALUES ($1,$2,$3,$4,$5,$5,now())`, [id, tid, type, JSON.stringify(data), userId]);
  await c.query(`INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,user_id,client_updated_at) VALUES ($1,$2,$3,'create','applied',$4,$5,now())`,
    [id, tid, type, JSON.stringify(data), userId]);
  return id;
}
export async function updateRecord(c, id, type, tenantId, data, userId, deleted = false) {
  await c.query(`UPDATE records SET data=$2, deleted=$3, updated_by=$4, client_updated_at=now(), updated_at=now(), seq=nextval('record_seq') WHERE id=$1`,
    [id, JSON.stringify(data), deleted, userId]);
  await c.query(`INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,user_id,client_updated_at) VALUES ($1,$2,$3,$4,'applied',$5,$6,now())`,
    [id, tenantId, type, deleted ? 'delete' : 'update', JSON.stringify({ ...data, _deleted: deleted }), userId]);
}

/**
 * A shared date changed: every team event that came from it takes the new name, dates, track,
 * series, round, sanctioning body and major event (the team's car, plan, result and notes stay).
 */
export async function syncEvents(c, fixtureId, fv, userId) {
  const { rows } = await c.query(`SELECT id, tenant_id, data FROM records WHERE type='event' AND NOT deleted AND data->'values'->>'fixture'=$1`, [fixtureId]);
  let n = 0;
  for (const e of rows) {
    const v = { ...(e.data.values || {}) };
    const before = JSON.stringify(v);
    for (const k of SYNC_KEYS) {
      if (k === 'series') {
        if (!fv.series) { delete v.series; continue; }
        // a team that kept its own copy of a shared series (older shares) keeps pointing at it
        if (v.series && v.series !== fv.series) {
          const { rows: [own] } = await c.query(`SELECT data FROM records WHERE id=$1 AND tenant_id=$2`, [v.series, e.tenant_id]);
          if (own?.data?.values?.shared_as === fv.series) continue;
        }
        v.series = fv.series; continue;
      }
      if (fv[k] === undefined || fv[k] === '' || fv[k] === null || fv[k] === false) { if (k !== 'name') delete v[k]; } else v[k] = fv[k];
    }
    if (fv.venue) delete v.track; else delete v.venue;
    // a day of the team's own that has setup sheets (a practice day it added) stays on its event
    const { rows: used } = await c.query(`SELECT DISTINCT COALESCE(NULLIF(data->'values'->>'day',''),'1') AS day FROM records
      WHERE tenant_id=$1 AND type IN ('setup','track_check') AND NOT deleted AND data->'values'->>'event'=$2`, [e.tenant_id, e.id]);
    Object.assign(v, keepUsedDays(e.data.values || {}, v, new Set(used.map((u) => Number(u.day) || 1))));
    if (JSON.stringify(v) !== before) { await updateRecord(c, e.id, 'event', e.tenant_id, { ...e.data, values: v }, userId); n++; }
  }
  return n;
}

/** The team's own series/track has been replaced by a shared one: point everything at the shared one. */
async function relinkTeam(c, tid, fromId, toId, userId) {
  const { rows } = await c.query(`SELECT id, type, data FROM records WHERE tenant_id=$1 AND NOT deleted
      AND type IN ('event','season_plan','team_track','contact_link','local_note') AND data::text LIKE $2`, [tid, `%${fromId}%`]);
  for (const r of rows) {
    const v = { ...(r.data.values || {}) };
    let changed = false;
    for (const k of ['series', 'venue', 'track', 'entity']) if (v[k] === fromId) { v[k] = toId; changed = true; }
    if (changed) await updateRecord(c, r.id, r.type, tid, { ...r.data, values: v }, userId);
  }
  // one team-track link per track
  const { rows: links } = await c.query(`SELECT id, data FROM records WHERE tenant_id=$1 AND type='team_track' AND NOT deleted AND data->'values'->>'track'=$2 ORDER BY created_at`, [tid, toId]);
  if (links.length > 1) {
    const [keep, ...rest] = links;
    const kv = { ...keep.data.values };
    for (const x of rest) {
      if (x.data.values?.home) kv.home = true;
      if (x.data.values?.link === 'Linked') kv.link = 'Linked';
      if (x.data.values?.notes) kv.notes = [kv.notes, x.data.values.notes].filter(Boolean).join('\n\n');
      await updateRecord(c, x.id, 'team_track', tid, x.data, userId, true);
    }
    await updateRecord(c, keep.id, 'team_track', tid, { ...keep.data, values: kv }, userId);
  }
}

/** Keep a team's private notes about a shared series/track/date (moved off its own copy). */
async function addLocalNote(c, tid, entityType, entity, text, userId) {
  if (!String(text || '').trim()) return;
  const { rows: [cur] } = await c.query(`SELECT id, data FROM records WHERE tenant_id=$1 AND type='local_note' AND NOT deleted
      AND data->'values'->>'entity'=$2`, [tid, entity]);
  if (cur) {
    const v = cur.data.values || {};
    await updateRecord(c, cur.id, 'local_note', tid, { ...cur.data, values: { ...v, notes: [v.notes, text].filter(Boolean).join('\n\n') } }, userId);
  } else {
    await insertTeam(c, tid, 'local_note', { values: { entity_type: entityType, entity, notes: String(text) } }, userId);
  }
}

// ---------------------------------------------------------------- duplicate and conflict checks
const words = (s) => lc(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2
  && !['speedway', 'raceway', 'motorplex', 'park', 'the', 'and', 'international', 'series', 'championship', 'club', 'round'].includes(w));
function likeness(a, b) {
  if (lc(a) === lc(b)) return 1;
  const A = new Set(words(a)); const B = words(b);
  if (!A.size || !B.length) return 0;
  const hit = B.filter((w) => A.has(w)).length;
  return hit / Math.max(A.size, B.length);
}

async function loadGlobals() {
  const { rows } = await q(`SELECT id, type, data FROM records WHERE tenant_id IS NULL AND NOT deleted AND type IN ('series','track','fixture')`);
  const by = { series: [], track: [], fixture: [] };
  for (const r of rows) by[r.type].push({ id: r.id, values: r.data?.values || {} });
  by.byId = Object.fromEntries(rows.map((r) => [r.id, { id: r.id, type: r.type, values: r.data?.values || {} }]));
  return by;
}

function seriesMatches(values, g) {
  return g.series.map((s) => ({ id: s.id, name: s.values.name, season: s.values.season,
    score: likeness(values.name, s.values.name) * (lc(s.values.season) === lc(values.season) ? 1 : 0.6) }))
    .filter((x) => x.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 4)
    .map((x) => ({ ...x, match: x.score >= 0.99 ? 'same' : 'similar' }));
}
function trackMatches(values, g) {
  return g.track.map((t) => ({ id: t.id, name: t.values.name, place: [t.values.city, t.values.region].filter(Boolean).join(', '),
    score: likeness(values.name, t.values.name) * (values.region && t.values.region && lc(values.region) !== lc(t.values.region) ? 0.7 : 1) }))
    .filter((x) => x.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 4)
    .map((x) => ({ ...x, match: x.score >= 0.99 ? 'same' : 'similar' }));
}
/** Same date at the same place = duplicate; the same series round on another date = conflict. */
function dateChecks(v, venueId, seriesId, g, exceptId = null) {
  const out = [];
  const name = (f) => `${f.values.name} (${f.values.date})`;
  for (const f of g.fixture) {
    if (f.id === exceptId) continue;
    const fv = f.values;
    const samePlace = venueId ? fv.venue === venueId : !!(fv.track || fv.name) && (lc(fv.track) === lc(v.track) && !!v.track);
    const overlap = fv.date && v.date && fv.date <= (v.end_date || v.date) && (fv.end_date || fv.date) >= v.date;
    if (overlap && (samePlace || (seriesId && fv.series === seriesId && String(fv.round || '') === String(v.round || '') && v.round))) {
      out.push({ type: 'duplicate', id: f.id, text: `Already listed: ${name(f)}` });
    } else if (seriesId && fv.series === seriesId && v.round && String(fv.round || '') === String(v.round) && fv.date !== v.date) {
      out.push({ type: 'conflict', id: f.id, text: `Round ${v.round} is already listed on ${fv.date}: ${fv.name}` });
    } else if (overlap && venueId && fv.venue === venueId) {
      out.push({ type: 'conflict', id: f.id, text: `Same track, same date: ${name(f)}` });
    }
  }
  return out;
}

/** Checks for one request against the shared calendars. */
function checksFor(r, g) {
  const p = r.payload || {};
  if (r.kind === 'change') {
    const out = { change: [] };
    if (r.subject_type === 'series') out.change = seriesMatches(p.values, g).filter((x) => x.id !== r.subject_id).map((x) => ({ type: 'duplicate', id: x.id, text: `Looks like ${x.name} ${x.season || ''}` }));
    if (r.subject_type === 'track') out.change = trackMatches(p.values, g).filter((x) => x.id !== r.subject_id).map((x) => ({ type: 'duplicate', id: x.id, text: `Looks like ${x.name}${x.place ? ` (${x.place})` : ''}` }));
    if (r.subject_type === 'fixture') out.change = dateChecks(p.values, p.values.venue && g.byId[p.values.venue] ? p.values.venue : null, p.values.series && g.byId[p.values.series] ? p.values.series : null, g, r.subject_id);
    if (!g.byId[r.subject_id]) out.change.unshift({ type: 'conflict', text: 'The shared record this changes no longer exists.' });
    return out;
  }
  const series = p.series ? seriesMatches(p.series.values, g) : [];
  const track = p.track ? trackMatches(p.track.values, g) : [];
  const sameSeries = series.find((x) => x.match === 'same')?.id || null;
  const sameTrack = track.find((x) => x.match === 'same')?.id || null;
  const items = {};
  for (const it of p.items || []) {
    const v = it.values || {};
    const venue = p.track && v.venue === p.track.id ? sameTrack : g.byId[v.venue] ? v.venue : null;
    const ser = p.series && v.series === p.series.id ? sameSeries : g.byId[v.series] ? v.series : null;
    items[it.key] = dateChecks({ ...v, track: v.track || v.track_name || '' }, venue, ser, g);
  }
  return { series, track, items };
}

// ---------------------------------------------------------------- building a request from team records
const TITLE = { series: 'Series', track: 'Track', dates: 'Dates', fixture: 'Date' };

/** A team event as a shared date. */
function itemFromEvent(e, car, names) {
  const v = e.data.values || {};
  const values = pickFixture(v, ['name', 'date', 'end_date', 'multi_day', 'days', 'venue', 'track', 'series', 'round', 'sanctioning', 'major', 'major_name']);
  if (values.major !== true) { delete values.major; delete values.major_name; }
  if (car?.class) values.classes = [car.class];
  values.status = 'Scheduled';
  if (values.venue && names[values.venue]) values.track_name = names[values.venue];
  if (values.series && names[values.series]) values.series_name = names[values.series];
  return { key: e.id, event: e.id, values };
}

async function buildRequest(req, body) {
  const kind = body.kind === 'change' ? 'change' : 'share';
  const note = String(body.note || '').slice(0, 1000);
  if (kind === 'change') {
    need(['series', 'track', 'fixture'].includes(body.subject_type), 400, 'Pick a shared series, track or date to change.');
    const { rows: [g] } = await q(`SELECT id, data FROM records WHERE id=$1 AND type=$2 AND tenant_id IS NULL AND NOT deleted`, [body.subject_id, body.subject_type]);
    need(g, 404, 'That shared record no longer exists.');
    const values = pick(body.values, KEYS[body.subject_type]);
    need(values.name, 400, 'A name is needed.');
    if (body.subject_type === 'fixture') need(/^\d{4}-\d{2}-\d{2}$/.test(values.date || ''), 400, 'A date is needed.');
    const current = pick(g.data.values, KEYS[body.subject_type]);
    need(JSON.stringify(current) !== JSON.stringify(values), 400, 'Nothing has changed.');
    return { kind, subject_type: body.subject_type, subject_id: g.id, title: `Change: ${current.name || values.name}`, payload: { values, current }, note };
  }
  const st = ['series', 'track', 'dates'].includes(body.subject_type) ? body.subject_type : 'dates';
  const payload = { series: null, track: null, items: [] };
  // the team's own records, by id
  const { rows: recs } = await q(`SELECT id, type, data, deleted FROM records WHERE tenant_id=$1 AND type IN ('series','track','event','car','fixture')`, [req.tid]);
  const byId = Object.fromEntries(recs.map((r) => [r.id, r]));
  const { rows: globals } = await q(`SELECT id, type, data FROM records WHERE tenant_id IS NULL AND type IN ('series','track') AND NOT deleted`);
  const names = Object.fromEntries([...recs, ...globals].filter((r) => ['series', 'track'].includes(r.type)).map((r) => [r.id, r.data.values?.name || '']));
  let subject = null;
  if (st === 'series' || st === 'track') {
    subject = byId[body.subject_id];
    need(subject && subject.type === st && !subject.deleted, 404, `That ${st} isn’t one of your team’s own.`);
    payload[st] = { id: subject.id, values: pick(subject.data.values, st === 'series' ? SERIES_KEYS : TRACK_KEYS), notes: subject.data.values?.notes || '' };
  }
  for (const id of Array.isArray(body.events) ? body.events.slice(0, 200) : []) {
    const e = byId[id];
    need(e && e.type === 'event' && !e.deleted, 404, 'One of those events no longer exists.');
    const fx = e.data.values?.fixture;
    const { rows: [shared] } = fx ? await q(`SELECT 1 FROM records WHERE id=$1 AND tenant_id IS NULL AND NOT deleted`, [fx]) : { rows: [] };
    if (shared) continue; // already on the shared calendars
    payload.items.push(itemFromEvent(e, byId[e.data.values?.car]?.data?.values, names));
  }
  for (const [i, d] of (Array.isArray(body.dates) ? body.dates.slice(0, 300) : []).entries()) {
    const values = pickFixture(d, [...FIXTURE_KEYS, 'source']);
    if (!values.name || !/^\d{4}-\d{2}-\d{2}$/.test(values.date || '')) continue;
    if (values.venue && names[values.venue]) values.track_name = names[values.venue];
    if (values.series && names[values.series]) values.series_name = names[values.series];
    payload.items.push({ key: `d${i}`, event: null, values });
  }
  need(payload.series || payload.track || payload.items.length, 400, 'Nothing to send — pick a series, a track or some dates.');
  const n = payload.items.length;
  const title = body.title ? String(body.title).slice(0, 160)
    : subject ? `${TITLE[st]}: ${subject.data.values?.name}${st === 'series' && subject.data.values?.season ? ` ${subject.data.values.season}` : ''}${n ? ` (${n} date${n === 1 ? '' : 's'})` : ''}`
      : n === 1 ? `${payload.items[0].values.major ? 'Major event' : 'Date'}: ${payload.items[0].values.name}` : `${n} dates`;
  return { kind, subject_type: st, subject_id: subject?.id || null, title, payload, note };
}

// ---------------------------------------------------------------- applying a decision
async function decide(c, r, body, userId) {
  const p = r.payload || {};
  const reason = String(body.reason || '').slice(0, 1000);
  if (body.action === 'reject') return { status: 'rejected', decision: { reason } };
  need(body.action === 'approve', 400, 'Approve or reject');

  if (r.kind === 'change') {
    const type = r.subject_type;
    const { rows: [g] } = await c.query(`SELECT * FROM records WHERE id=$1 AND tenant_id IS NULL AND NOT deleted FOR UPDATE`, [r.subject_id]);
    need(g, 404, 'The shared record this changes no longer exists.');
    const values = pick({ ...p.values, ...(body.change?.values || {}) }, KEYS[type]);
    // keep fields the change form doesn't carry (e.g. a track's notes and directory id)
    let merged = { ...g.data.values, ...values };
    for (const k of KEYS[type]) if (!(k in values)) delete merged[k];
    if (type === 'fixture') merged = normaliseDays(moveDays(g.data.values, merged));
    await updateRecord(c, g.id, type, null, { ...g.data, values: merged }, userId);
    const synced = type === 'fixture' ? await syncEvents(c, g.id, merged, userId) : 0;
    const mails = type === 'fixture' ? await notifyFollowers(c, { after: merged, before: g.data.values || {} }) : [];
    return { status: 'approved', decision: { reason, change: { id: g.id, synced } }, mails };
  }

  const dec = { reason, items: [] };
  const mails = [];
  // the series / track itself: share it as new, or link to the one already shared
  const root = async (kind) => {
    const part = p[kind];
    if (!part) return null;
    const choice = body[kind] || {};
    let gid;
    if (choice.action === 'link') {
      const { rows: [g] } = await c.query(`SELECT id FROM records WHERE id=$1 AND type=$2 AND tenant_id IS NULL AND NOT deleted`, [choice.id, kind]);
      need(g, 400, `Pick the shared ${kind} to link to.`);
      gid = g.id;
    } else {
      const values = pick({ ...part.values, ...(choice.values || {}) }, kind === 'series' ? SERIES_KEYS : TRACK_KEYS);
      need(values.name, 400, `The ${kind} needs a name.`);
      gid = await insertGlobal(c, kind, { form_id: `base-${kind}`, values }, userId);
    }
    dec[kind] = { action: choice.action === 'link' ? 'link' : 'create', id: gid };
    return gid;
  };
  const gSeries = await root('series');
  const gTrack = await root('track');

  let added = 0; let refused = 0;
  for (const it of p.items || []) {
    const choice = body.items?.[it.key] || { action: 'add' };
    if (choice.action === 'refuse') {
      refused++;
      dec.items.push({ key: it.key, action: 'refuse', reason: String(choice.reason || '').slice(0, 500), name: it.values.name, date: it.values.date });
      continue;
    }
    let gid;
    if (choice.action === 'link') {
      const { rows: [g] } = await c.query(`SELECT id, data FROM records WHERE id=$1 AND type='fixture' AND tenant_id IS NULL AND NOT deleted`, [choice.id]);
      need(g, 400, `Pick the shared date to link “${it.values.name}” to.`);
      gid = g.id;
    } else {
      const v = pickFixture({ ...it.values, ...(choice.values || {}) }, [...FIXTURE_KEYS, 'source', 'feed_uid']);
      // the series and track on the shared date must be shared ones
      if (v.series) {
        if (p.series && v.series === p.series.id) v.series = gSeries;
        else {
          const { rows: [s] } = await c.query(`SELECT tenant_id FROM records WHERE id=$1 AND type='series' AND NOT deleted`, [v.series]);
          if (!s || s.tenant_id !== null) { delete v.series; delete v.round; }
        }
      }
      if (v.venue) {
        if (p.track && v.venue === p.track.id) v.venue = gTrack;
        else {
          const { rows: [t] } = await c.query(`SELECT tenant_id, data FROM records WHERE id=$1 AND type='track'`, [v.venue]);
          if (!t || t.tenant_id !== null) { v.track = v.track || it.values.track_name || t?.data?.values?.name || ''; delete v.venue; }
        }
      }
      if (!v.status) v.status = 'Scheduled';
      v.source = v.source || `Sent by a team (${r.team || 'team'})`;
      gid = await insertGlobal(c, 'fixture', { form_id: 'base-fixture', values: v }, userId);
      mails.push(...await notifyFollowers(c, { after: v }));
    }
    added++;
    dec.items.push({ key: it.key, action: choice.action === 'link' ? 'link' : 'add', id: gid, name: it.values.name, date: it.values.date });
    // the team's event now comes from the shared date
    if (it.event) {
      const { rows: [e] } = await c.query(`SELECT id, data FROM records WHERE id=$1 AND tenant_id=$2 AND type='event' AND NOT deleted`, [it.event, r.tenant_id]);
      if (e) await updateRecord(c, e.id, 'event', r.tenant_id, { ...e.data, values: { ...e.data.values, fixture: gid } }, userId);
    }
  }
  // the shared series / track replace the team's own copies everywhere in the team
  for (const [kind, gid] of [['series', gSeries], ['track', gTrack]]) {
    if (!gid) continue;
    const own = p[kind];
    await relinkTeam(c, r.tenant_id, own.id, gid, userId);
    const { rows: [mine] } = await c.query(`SELECT * FROM records WHERE id=$1 AND tenant_id=$2 AND NOT deleted`, [own.id, r.tenant_id]);
    if (mine) {
      await addLocalNote(c, r.tenant_id, kind, gid, mine.data.values?.notes, userId);
      await updateRecord(c, mine.id, kind, r.tenant_id, { ...mine.data, values: { ...mine.data.values, shared_as: gid } }, userId, true);
    }
  }
  // shared dates that only had this track's name (sent before the track was shared) now point at it
  if (gTrack) {
    const name = lc(p.track.values?.name);
    const { rows: loose } = await c.query(`SELECT id, data FROM records WHERE type='fixture' AND tenant_id IS NULL AND NOT deleted
        AND coalesce(data->'values'->>'venue','')='' AND lower(trim(data->'values'->>'track'))=$1`, [name]);
    for (const f of loose) {
      const fv = { ...f.data.values, venue: gTrack }; delete fv.track;
      await updateRecord(c, f.id, 'fixture', null, { ...f.data, values: fv }, userId);
      mails.push(...await notifyFollowers(c, { after: fv }));
      await syncEvents(c, f.id, fv, userId);
    }
  }
  // dates added or linked: each team event follows its shared date from now on
  for (const d of dec.items) if (d.action !== 'refuse') {
    const { rows: [g] } = await c.query(`SELECT data FROM records WHERE id=$1`, [d.id]);
    if (g) await syncEvents(c, d.id, g.data.values || {}, userId);
  }
  const total = (p.items || []).length;
  const status = total && !added && !gSeries && !gTrack ? 'rejected' : refused ? 'partly_approved' : 'approved';
  return { status, decision: dec, mails };
}

// ---------------------------------------------------------------- routes
const COLS = `cr.id, cr.tenant_id, cr.kind, cr.subject_type, cr.subject_id, cr.title, cr.payload, cr.note, cr.status, cr.decision, cr.source,
  cr.decided_at, cr.seen, cr.created_at, cr.updated_at, coalesce(t.name, 'Official feed') AS team, u.name AS by_name, d.name AS decided_by_name,
  (SELECT coalesce(json_agg(json_build_object('from_admin', m.from_admin, 'body', m.body, 'at', m.created_at, 'by', mu.name) ORDER BY m.created_at), '[]'::json)
     FROM calendar_request_messages m LEFT JOIN users mu ON mu.id=m.user_id WHERE m.request_id=cr.id) AS messages`;
const FROM = `FROM calendar_requests cr LEFT JOIN tenants t ON t.id=cr.tenant_id LEFT JOIN users u ON u.id=cr.user_id LEFT JOIN users d ON d.id=cr.decided_by`;

/**
 * A team that looks after a shared series or track (an "official", with auto-approve on) has its
 * requests for it approved at once — duplicates are linked, and anything that clashes waits for the admin.
 */
async function autoApprove(id, tid, userId) {
  const off = await officialFor(tid);
  const ours = [...off.values()].filter((o) => o.auto_approve).map((o) => o.entity_id);
  if (!ours.length) return null;
  const { rows: [r] } = await q(`SELECT * FROM calendar_requests WHERE id=$1`, [id]);
  const p = r.payload || {};
  let covered = false;
  if (r.kind === 'change') {
    if (['series', 'track'].includes(r.subject_type)) covered = ours.includes(r.subject_id);
    else {
      const { rows: [f] } = await q(`SELECT data FROM records WHERE id=$1`, [r.subject_id]);
      const cur = f?.data?.values || {};
      const touches = [cur.series, cur.venue, p.values?.series, p.values?.venue].filter(Boolean);
      covered = touches.some((x) => ours.includes(x)) && [p.values?.series, p.values?.venue].filter(Boolean).every((x) => ours.includes(x) || x === cur.series || x === cur.venue);
    }
  } else if (r.subject_type === 'dates' && (p.items || []).length) {
    covered = p.items.every((it) => ours.includes(it.values?.series) || ours.includes(it.values?.venue));
  }
  if (!covered) return null;
  const checks = checksFor(r, await loadGlobals());
  const all = r.kind === 'change' ? checks.change || [] : Object.values(checks.items || {}).flat();
  if (all.some((x) => x.type === 'conflict') || (r.kind === 'change' && all.length)) return null;
  const items = Object.fromEntries((p.items || []).map((it) => {
    const dup = (checks.items?.[it.key] || []).find((x) => x.type === 'duplicate');
    return [it.key, dup ? { action: 'link', id: dup.id } : { action: 'add' }];
  }));
  const out = await tx(async (c) => {
    const { rows: [row] } = await c.query(`SELECT cr.*, t.name AS team FROM calendar_requests cr LEFT JOIN tenants t ON t.id=cr.tenant_id WHERE cr.id=$1 FOR UPDATE OF cr`, [id]);
    const d = await decide(c, row, { action: 'approve', items, reason: 'Approved automatically — your team looks after this on the shared calendars.' }, userId);
    await c.query(`UPDATE calendar_requests SET status=$2, decision=$3, decided_by=$4, decided_at=now(), updated_at=now(), source='official' WHERE id=$1`,
      [id, d.status, JSON.stringify(d.decision), userId]);
    return d;
  });
  sendAfter(out.mails);
  return out;
}

export function mountCalendarRequests(T) {
  const canSend = (req) => canType(req.role, req.ent, 'fixture', 'edit') || req.user.is_platform_admin;

  T.get('/calendar/requests', h(async (req, res) => {
    const { rows } = await q(`SELECT ${COLS} ${FROM} WHERE cr.tenant_id=$1 ORDER BY cr.created_at DESC LIMIT 200`, [req.tid]);
    res.json({ requests: rows });
  }));

  T.post('/calendar/requests', h(async (req, res) => {
    need(canSend(req), 403, 'Your role can’t send to the shared calendars.');
    // practice teams train on demo data, which must never reach every team's shared calendars
    const { rows: [tm] } = await q('SELECT settings FROM tenants WHERE id=$1', [req.tid]);
    need(!tm?.settings?.practice, 400, 'This is a practice team, so it can’t send to the shared calendars. Everything else works as normal.');
    const r = await buildRequest(req, req.body || {});
    const { rows: [row] } = await q(`INSERT INTO calendar_requests(tenant_id,user_id,kind,subject_type,subject_id,title,payload,note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [req.tid, req.user.id, r.kind, r.subject_type, r.subject_id, r.title, JSON.stringify(r.payload), r.note]);
    // the team looks after this series/track: approve it straight away (unless something clashes)
    const auto = await autoApprove(row.id, req.tid, req.user.id).catch((e) => { console.error('Auto-approve failed:', e.message); return null; });
    if (!auto) mailAdmins(`New request: ${r.title}`, `${req.user.name || 'A team member'} sent “${r.title}” to the shared calendars.${r.note ? `\n\nNote: ${r.note}` : ''}`, '/admin/calendar?tab=requests').catch(() => {});
    res.json({ id: row.id, title: r.title, items: r.payload.items?.length || 0, auto: auto?.status || null });
  }));

  T.post('/calendar/requests/:id/withdraw', h(async (req, res) => {
    need(canSend(req), 403, 'Your role can’t change requests.');
    const { rowCount } = await q(`UPDATE calendar_requests SET status='withdrawn', updated_at=now() WHERE id=$1 AND tenant_id=$2 AND status IN ('pending','question')`, [req.params.id, req.tid]);
    need(rowCount, 400, 'Only a request that’s still waiting can be withdrawn.');
    res.json({ ok: true });
  }));

  // The team has seen its decisions (clears the badge on Calendar).
  T.post('/calendar/requests/seen', h(async (req, res) => {
    await q(`UPDATE calendar_requests SET seen=true WHERE tenant_id=$1 AND NOT seen`, [req.tid]);
    res.json({ ok: true });
  }));
}

export function mountCalendarRequestsAdmin(A) {
  A.get('/calendar/requests', h(async (req, res) => {
    const st = ['pending', 'question'].includes(req.query.status) ? req.query.status : req.query.status === 'all' ? 'all' : 'pending';
    const { rows } = await q(`SELECT ${COLS} ${FROM} ${st !== 'all' ? `WHERE cr.status='${st}'` : ''} ORDER BY ${st !== 'all' ? 'cr.created_at' : 'cr.updated_at DESC'} LIMIT 300`);
    const { rows: [counts] } = await q(`SELECT count(*) FILTER (WHERE status='pending')::int AS pending, count(*) FILTER (WHERE status='question')::int AS question FROM calendar_requests`);
    const g = await loadGlobals();
    // names for every record a request points at
    const ids = new Set();
    for (const r of rows) {
      if (r.subject_id) ids.add(r.subject_id);
      for (const it of r.payload?.items || []) { if (it.values?.venue) ids.add(it.values.venue); if (it.values?.series) ids.add(it.values.series); }
      for (const k of ['venue', 'series']) if (r.payload?.values?.[k]) ids.add(r.payload.values[k]);
    }
    const { rows: refs } = ids.size ? await q(`SELECT id, type, tenant_id, data FROM records WHERE id = ANY($1::uuid[])`, [[...ids]]) : { rows: [] };
    res.json({
      counts,
      requests: rows.map((r) => ({ ...r, checks: ['pending', 'question'].includes(r.status) ? checksFor(r, g) : null })),
      refs: Object.fromEntries(refs.map((r) => [r.id, { id: r.id, type: r.type, global: r.tenant_id === null, name: r.data?.values?.name || '', season: r.data?.values?.season || '', date: r.data?.values?.date || '' }])),
    });
  }));

  A.post('/calendar/requests/:id/decide', h(async (req, res) => {
    const out = await tx(async (c) => {
      const { rows: [r] } = await c.query(`SELECT cr.*, t.name AS team FROM calendar_requests cr LEFT JOIN tenants t ON t.id=cr.tenant_id WHERE cr.id=$1 FOR UPDATE OF cr`, [req.params.id]);
      need(r && ['pending', 'question'].includes(r.status), 404, 'That request has already been dealt with.');
      const d = await decide(c, r, req.body || {}, req.user.id);
      await c.query(`UPDATE calendar_requests SET status=$2, decision=$3, decided_by=$4, decided_at=now(), updated_at=now(), seen=false WHERE id=$1`,
        [r.id, d.status, JSON.stringify(d.decision), req.user.id]);
      return { ...d, request: r };
    });
    sendAfter(out.mails);
    const r = out.request;
    if (r.tenant_id) {
      const words = { approved: 'approved', partly_approved: 'partly approved', rejected: 'not approved' };
      mailTeam(r.tenant_id, `“${r.title}” was ${words[out.status] || out.status}`,
        `Your request “${r.title}” to the shared calendars was ${words[out.status] || out.status}.${out.decision?.reason ? `\n\nAdmin: ${out.decision.reason}` : ''}${(out.decision?.items || []).filter((i) => i.action === 'refuse').map((i) => `\n• Refused: ${i.name}${i.reason ? ` — ${i.reason}` : ''}`).join('')}`,
        '/calendar?tab=requests', [r.user_id]).catch(() => {});
    }
    await audit(req.user.id, `calendar.request.${out.status}`, req.params.id).catch(() => {});
    res.json({ status: out.status, decision: out.decision });
  }));
}

/** How many requests are waiting for a platform admin. */
export async function pendingRequests() {
  const { rows: [r] } = await q(`SELECT count(*)::int AS n FROM calendar_requests WHERE status='pending'`);
  return r.n;
}

/**
 * Suggestions made before requests existed were team calendar dates marked for review: turn the
 * waiting ones into requests (once, at start-up) and retire the old records.
 */
export async function convertLegacySuggestions() {
  const { rows } = await q(`SELECT id, tenant_id, data, created_by FROM records WHERE type='fixture' AND tenant_id IS NOT NULL AND NOT deleted
      AND data->'values'->>'review' IN ('pending','rejected')`);
  if (!rows.length) return;
  await tx(async (c) => {
    for (const s of rows) {
      const v = { ...(s.data.values || {}) };
      if (v.review === 'pending') {
        const values = pick(v, [...FIXTURE_KEYS, 'source']);
        let req;
        if (v.replaces) req = { kind: 'change', st: 'fixture', sid: v.replaces, title: `Change: ${v.name}`, payload: { values: pick(v, FIXTURE_KEYS), current: {} } };
        else {
          const { rows: [ev] } = await c.query(`SELECT id FROM records WHERE tenant_id=$1 AND type='event' AND NOT deleted AND data->'values'->>'fixture'=$2`, [s.tenant_id, s.id]);
          req = { kind: 'share', st: 'dates', sid: null, title: `Date: ${v.name}`, payload: { series: null, track: null, items: [{ key: s.id, event: ev?.id || null, values }] } };
        }
        await c.query(`INSERT INTO calendar_requests(tenant_id,user_id,kind,subject_type,subject_id,title,payload,note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [s.tenant_id, s.created_by, req.kind, req.st, req.sid, req.title, JSON.stringify(req.payload), v.suggest_note || '']);
      }
      await updateRecord(c, s.id, 'fixture', s.tenant_id, s.data, s.created_by, true);
    }
  });
  console.log(`Moved ${rows.length} calendar suggestion(s) into requests`);
}
