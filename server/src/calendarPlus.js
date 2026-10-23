// Shared calendars, round two:
//   followers   teams follow a shared series or track and are told when its dates are added, moved,
//               cancelled or removed (Calendar → Updates, the sidebar badge, and email)
//   officials   a team looks after a shared series or track; its requests for it are approved
//               automatically (unless they clash)
//   questions   the admin asks the team about a request instead of rejecting it; the team answers
//   merge       the admin merges duplicate shared series or tracks, repointing every team's records
//   history     every shared record's past versions, with restore
//   feeds       a shared series or track's official iCal feed, checked regularly; new and changed
//               dates arrive as requests for the admin
//   public      a no-login page and subscribe link for each shared series and track
import { q, tx } from './db.js';
import { HttpError } from './auth.js';
import { canType } from '../../shared/catalog.js';
import { eventDayList, parseICS, toICS, matchTrack } from '../../shared/calendar.js';
import { audit } from './settings.js';
import { mailAdmins, mailTeam, mailConfigured, mailFrom, sendMail } from './mail.js';

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const lc = (s) => String(s ?? '').trim().toLowerCase();
const fmt = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
/** A shared date's days as text, to spot a change (a day added, moved, rained out). */
const dayDates = (v) => eventDayList(v).map((d) => `${d.date}${d.off ? '-' : ''}`).join(',');

// ---------------------------------------------------------------- followers
/**
 * A shared date was added, changed or removed: tell every team following its series or track.
 * Notices are written in the transaction; returns emails to send once it commits (sendAfter).
 */
export async function notifyFollowers(c, { after, before = null, removed = false }) {
  const v = after || before || {};
  const ids = [...new Set([v.series, v.venue, before?.series, before?.venue].filter(Boolean))];
  if (!ids.length) return [];
  let what = '';
  if (removed) what = `${v.name} (${fmt(v.date)}) was removed`;
  else if (!before) what = `${v.name} added — ${fmt(v.date)}`;
  else if (after.status === 'Cancelled' && before.status !== 'Cancelled') what = `${v.name} on ${fmt(v.date)} is cancelled`;
  else if (after.status === 'Postponed' && before.status !== 'Postponed') what = `${v.name} on ${fmt(before.date)} is postponed`;
  else if (before.date !== after.date || (before.end_date || '') !== (after.end_date || '')) what = `${v.name} moved from ${fmt(before.date)} to ${fmt(after.date)}`;
  else if (dayDates(before) !== dayDates(after)) what = `${v.name} (${fmt(v.date)}) changed its days`;
  else if (before.venue !== after.venue || (before.track || '') !== (after.track || '')) what = `${v.name} (${fmt(v.date)}) changed track`;
  else if (before.name !== after.name) what = `${before.name} (${fmt(v.date)}) is now ${after.name}`;
  else if (JSON.stringify(before.results || null) !== JSON.stringify(after.results || null) && after.results?.length) what = `Results are in for ${v.name} (${fmt(v.date)})`;
  else return [];
  const { rows: names } = await c.query(`SELECT id, type, data->'values'->>'name' AS name FROM records WHERE id = ANY($1::uuid[])`, [ids]);
  const nameOf = Object.fromEntries(names.map((n) => [n.id, n]));
  const { rows: follows } = await c.query(`SELECT DISTINCT tenant_id, data->'values'->>'entity' AS entity FROM records
      WHERE type='follow' AND NOT deleted AND data->'values'->>'entity' = ANY($1::text[])`, [ids]);
  const out = [];
  const done = new Set();
  for (const f of follows) {
    if (done.has(f.tenant_id)) continue;
    done.add(f.tenant_id);
    const n = nameOf[f.entity];
    const title = `${n?.name || 'Followed calendar'}: ${what}`;
    const link = `/calendar?tab=shared&show=${n?.type === 'series' ? 'series' : 'track'}:${f.entity}`;
    await c.query(`INSERT INTO team_notices(tenant_id,kind,title,link) VALUES ($1,'follow',$2,$3)`, [f.tenant_id, title, link]);
    out.push({ tid: f.tenant_id, subject: title, text: `${title}.\n\nYou follow ${n?.name || 'this calendar'} in RaceOps.`, path: link });
  }
  return out;
}
/** Send emails collected during a transaction, after it has committed. */
export function sendAfter(mails) {
  if (!mails?.length || !mailConfigured()) return;
  setImmediate(() => { for (const m of mails) mailTeam(m.tid, m.subject, m.text, m.path).catch(() => {}); });
}

// ---------------------------------------------------------------- officials
/** Shared series/tracks this team is the official for (auto-approved). */
export async function officialFor(tid) {
  if (!tid) return new Map();
  const { rows } = await q(`SELECT entity_id, entity_type, auto_approve FROM calendar_officials WHERE tenant_id=$1`, [tid]);
  return new Map(rows.map((r) => [r.entity_id, r]));
}

// ---------------------------------------------------------------- feeds
const fixturesFor = async (c, id) => (await c.query(`SELECT id, data FROM records WHERE type='fixture' AND tenant_id IS NULL AND NOT deleted
    AND (data->'values'->>'series'=$1 OR data->'values'->>'venue'=$1)`, [id])).rows.map((r) => ({ id: r.id, values: r.data?.values || {} }));

/** Read a shared series' or track's official feed; new and changed dates become requests for the admin. */
export async function checkFeed(entityId, fetchCalendar) {
  const { rows: [feed] } = await q(`SELECT * FROM calendar_feeds WHERE entity_id=$1`, [entityId]);
  if (!feed) return { error: 'No feed set' };
  let status = ''; let added = 0; let changed = 0;
  try {
    const got = await fetchCalendar(feed.url);
    const items = parseICS(got.buf.toString('utf8'));
    need(items.length, 422, 'The feed has no dates in it.');
    const { rows: [ent] } = await q(`SELECT id, type, data FROM records WHERE id=$1 AND tenant_id IS NULL AND NOT deleted`, [entityId]);
    need(ent, 404, 'The shared series or track no longer exists.');
    const name = ent.data.values?.name || '';
    const existing = await fixturesFor({ query: q }, entityId);
    const { rows: tracks } = ent.type === 'series' ? await q(`SELECT id, data FROM records WHERE type='track' AND tenant_id IS NULL AND NOT deleted`) : { rows: [] };
    const trackList = tracks.map((t) => ({ id: t.id, values: t.data?.values || {} }));
    // what's already waiting, so a check doesn't propose it twice
    const { rows: waiting } = await q(`SELECT kind, subject_id, payload FROM calendar_requests WHERE source='feed' AND status IN ('pending','question')`);
    const waitingUids = new Set(waiting.flatMap((r) => (r.payload?.items || []).map((it) => it.values?.feed_uid)).filter(Boolean));
    const waitingChanges = new Set(waiting.filter((r) => r.kind === 'change').map((r) => r.subject_id));
    const today = new Date().toISOString().slice(0, 10);
    const newItems = [];
    for (const [i, it] of items.entries()) {
      if ((it.end_date || it.date) < today) continue;
      const uid = it.uid || `${it.date}|${lc(it.name)}`;
      const match = existing.find((f) => f.values.feed_uid === uid)
        || existing.find((f) => f.values.date === it.date && (lc(f.values.name) === lc(it.name) || ent.type === 'track'));
      if (match) {
        const fv = match.values;
        const nv = { ...fv, feed_uid: uid, date: it.date, end_date: it.end_date || '', name: it.name || fv.name, status: it.status === 'Cancelled' ? 'Cancelled' : fv.status };
        const diff = ['date', 'end_date', 'name', 'status'].some((k) => (fv[k] || '') !== (nv[k] || ''));
        // the feed moved the dates: its date-to-end-date run replaces the days set here
        if (nv.date !== fv.date || (nv.end_date || '') !== (fv.end_date || '')) { delete nv.days; delete nv.multi_day; }
        if (diff && !waitingChanges.has(match.id)) {
          const current = Object.fromEntries(Object.entries(fv).filter(([k]) => k !== 'feed_uid'));
          await q(`INSERT INTO calendar_requests(tenant_id,user_id,kind,subject_type,subject_id,title,payload,note,source) VALUES (NULL,NULL,'change','fixture',$1,$2,$3,$4,'feed')`,
            [match.id, `Feed: ${name} — ${fv.name} changed`, JSON.stringify({ values: nv, current }), `From the official feed (${feed.url})`]);
          changed++;
        }
        continue;
      }
      if (waitingUids.has(uid)) continue;
      const values = { name: it.name, date: it.date, status: it.status === 'Cancelled' ? 'Cancelled' : 'Scheduled', feed_uid: uid, source: `Feed: ${feed.url}` };
      if (it.end_date) values.end_date = it.end_date;
      if (it.website) values.website = it.website;
      if (ent.type === 'series') {
        values.series = ent.id;
        const tr = matchTrack(it.location || it.name, trackList);
        if (tr) { values.venue = tr.id; values.track_name = tr.values.name; } else if (it.location) values.track = it.location.split(',')[0];
        if (ent.data.values?.class) values.classes = [ent.data.values.class];
      } else { values.venue = ent.id; values.track_name = name; }
      newItems.push({ key: `f${i}`, event: null, values });
    }
    if (newItems.length) {
      await q(`INSERT INTO calendar_requests(tenant_id,user_id,kind,subject_type,subject_id,title,payload,note,source) VALUES (NULL,NULL,'share','dates',NULL,$1,$2,$3,'feed')`,
        [`Feed: ${name} — ${newItems.length} new date${newItems.length === 1 ? '' : 's'}`, JSON.stringify({ series: null, track: null, items: newItems }), `From the official feed (${feed.url})`]);
      added = newItems.length;
    }
    status = added || changed ? `${added} new, ${changed} changed — sent for review` : 'Up to date';
    if (added || changed) mailAdmins(`Feed update for ${name}`, `${status}.`, '/admin/calendar?tab=requests').catch(() => {});
  } catch (e) {
    status = `Couldn’t read the feed: ${e.message}`;
  }
  await q(`UPDATE calendar_feeds SET last_checked=now(), last_status=$2 WHERE entity_id=$1`, [entityId, status.slice(0, 300)]);
  return { status, added, changed };
}

export function startFeedChecks(fetchCalendar) {
  const hours = Number(process.env.CALENDAR_FEED_HOURS ?? 12);
  if (!(hours > 0)) return;
  const run = async () => {
    const { rows } = await q(`SELECT entity_id FROM calendar_feeds`).catch(() => ({ rows: [] }));
    for (const f of rows) await checkFeed(f.entity_id, fetchCalendar).catch(() => {});
  };
  setTimeout(run, 120_000).unref();
  setInterval(run, hours * 3_600_000).unref();
}

// ---------------------------------------------------------------- public pages for shared series / tracks
async function sharedCalendar(type, id) {
  need(['series', 'track'].includes(type) && /^[0-9a-f-]{36}$/i.test(id), 404, 'Not found');
  const { rows: [ent] } = await q(`SELECT id, data FROM records WHERE id=$1 AND type=$2 AND tenant_id IS NULL AND NOT deleted`, [id, type]);
  need(ent, 404, 'This calendar isn’t available.');
  const ev = ent.data.values || {};
  const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const fx = (await fixturesFor({ query: q }, id)).filter((f) => (f.values.end_date || f.values.date || '') >= since);
  const refIds = [...new Set(fx.flatMap((f) => [f.values.venue, f.values.series]).filter(Boolean))];
  const { rows: refs } = refIds.length ? await q(`SELECT id, data FROM records WHERE id = ANY($1::uuid[])`, [refIds]) : { rows: [] };
  const byId = Object.fromEntries(refs.map((r) => [r.id, r.data?.values || {}]));
  const items = fx.map((f) => {
    const v = f.values; const t = byId[v.venue]; const s = byId[v.series];
    const win = Array.isArray(v.results) ? v.results.find((r) => String(r.pos) === '1') : null;
    return { id: f.id, name: v.name, date: v.date, end_date: v.end_date || '', days: v.multi_day ? eventDayList(v) : undefined, track: t?.name || v.track || '', location: [t?.city, t?.region].filter(Boolean).join(', '),
      series: s?.name || '', round: v.round || '', cancelled: v.status === 'Cancelled', tentative: v.status === 'Postponed', major: v.major ? v.major_name || 'Major event' : '',
      sanctioning: v.sanctioning || s?.sanctioning || '', note: v.start_time || '', car: '', result: win ? `Won by ${[win.number && `#${win.number}`, win.driver].filter(Boolean).join(' ')}` : '' };
  }).sort((a, b) => a.date.localeCompare(b.date));
  return { type, name: ev.name, sub: type === 'series' ? [ev.season, ev.class, ev.sanctioning].filter(Boolean).join(' · ') : [ev.city, ev.region, ev.country].filter(Boolean).join(', '), items };
}

const hits = new Map();
function limit(req) {
  const ip = req.ip || 'x'; const now = Date.now();
  const list = (hits.get(ip) || []).filter((x) => now - x < 60_000); list.push(now); hits.set(ip, list);
  need(list.length <= 60, 429, 'Too many requests — try again in a minute.');
}

export function mountPublicShared(app) {
  app.get('/api/public/shared/:type/:id.ics', h(async (req, res) => {
    limit(req);
    const cal = await sharedCalendar(req.params.type, req.params.id);
    res.set('Content-Type', 'text/calendar; charset=utf-8').set('Cache-Control', 'public, max-age=1800').send(toICS({
      name: `${cal.name} — race calendar`,
      items: cal.items.map((i) => ({ uid: `${i.id}@raceops-shared`, date: i.date, end_date: i.end_date, days: i.days, summary: `${i.cancelled ? 'CANCELLED: ' : ''}${i.name}${i.track && cal.type === 'series' ? ` — ${i.track}` : ''}`,
        location: [i.track, i.location].filter(Boolean).join(', '), description: [i.major, i.series && `${i.series}${i.round ? ` round ${i.round}` : ''}`, i.note, i.result].filter(Boolean).join('\n'),
        status: i.cancelled ? 'CANCELLED' : 'CONFIRMED' })),
    }));
  }));
  app.get('/api/public/shared/:type/:id', h(async (req, res) => {
    limit(req);
    res.set('Cache-Control', 'no-store').json(await sharedCalendar(req.params.type, req.params.id));
  }));
}

// ---------------------------------------------------------------- team routes
export function mountCalendarPlus(T) {
  // Updates: followed series/tracks changing
  T.get('/notices', h(async (req, res) => {
    const { rows } = await q(`SELECT id, kind, title, body, link, seen, created_at FROM team_notices WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`, [req.tid]);
    res.json({ notices: rows });
  }));
  T.post('/notices/seen', h(async (req, res) => {
    await q(`UPDATE team_notices SET seen=true WHERE tenant_id=$1 AND NOT seen`, [req.tid]);
    res.json({ ok: true });
  }));
  // what this team is the official for
  T.get('/calendar/officials', h(async (req, res) => {
    const { rows } = await q(`SELECT entity_id, entity_type, auto_approve FROM calendar_officials WHERE tenant_id=$1`, [req.tid]);
    res.json({ officials: rows });
  }));
  // answer the admin's question about a request
  T.post('/calendar/requests/:id/reply', h(async (req, res) => {
    need(canType(req.role, req.ent, 'fixture', 'edit') || req.user.is_platform_admin, 403, 'Your role can’t answer requests.');
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    need(body, 400, 'Type an answer.');
    const { rows: [r] } = await q(`SELECT id, title FROM calendar_requests WHERE id=$1 AND tenant_id=$2 AND status IN ('question','pending')`, [req.params.id, req.tid]);
    need(r, 404, 'That request is no longer open.');
    await tx(async (c) => {
      await c.query(`INSERT INTO calendar_request_messages(request_id,user_id,from_admin,body) VALUES ($1,$2,false,$3)`, [r.id, req.user.id, body]);
      await c.query(`UPDATE calendar_requests SET status='pending', updated_at=now() WHERE id=$1`, [r.id]);
    });
    mailAdmins(`Reply on “${r.title}”`, `${req.user.name || 'The team'} answered:\n\n${body}`, '/admin/calendar?tab=requests').catch(() => {});
    res.json({ ok: true });
  }));
}

// ---------------------------------------------------------------- admin routes
const MERGE_TYPES = ['event', 'season_plan', 'team_track', 'contact_link', 'local_note', 'follow', 'fixture'];

/** Similar shared series (same season) or tracks: candidate duplicates to merge. */
function similarPairs(list, type) {
  const words = (s) => lc(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2
    && !['speedway', 'raceway', 'motorplex', 'park', 'the', 'and', 'international', 'series', 'championship', 'club', 'round'].includes(w));
  const index = new Map();
  for (const x of list) for (const w of new Set(words(x.values.name))) (index.get(w) || index.set(w, []).get(w)).push(x);
  const seen = new Set(); const out = [];
  for (const group of index.values()) {
    if (group.length > 60) continue; // a word too common to mean anything
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i]; const b = group[j];
      const key = [a.id, b.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      if (type === 'series' && lc(a.values.season) !== lc(b.values.season)) continue;
      const A = new Set(words(a.values.name)); const B = words(b.values.name);
      const score = lc(a.values.name) === lc(b.values.name) ? 1 : B.filter((w) => A.has(w)).length / Math.max(A.size, B.length, 1);
      if (score >= 0.6) out.push({ a: { id: a.id, name: a.values.name, extra: type === 'series' ? a.values.season : [a.values.city, a.values.region].filter(Boolean).join(', ') },
        b: { id: b.id, name: b.values.name, extra: type === 'series' ? b.values.season : [b.values.city, b.values.region].filter(Boolean).join(', ') }, score });
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 60);
}

export function mountCalendarPlusAdmin(A, { fetchCalendar, syncEvents, updateRecord }) {
  // ---- officials
  A.get('/calendar/officials', h(async (req, res) => {
    const { rows } = await q(`SELECT o.id, o.tenant_id, o.entity_type, o.entity_id, o.auto_approve, t.name AS team FROM calendar_officials o
        JOIN tenants t ON t.id=o.tenant_id ${req.query.entity ? 'WHERE o.entity_id=$1' : ''} ORDER BY t.name`, req.query.entity ? [req.query.entity] : []);
    res.json({ officials: rows });
  }));
  A.post('/calendar/officials', h(async (req, res) => {
    const { tenant_id: tid, entity_id: id, auto_approve: auto = true } = req.body || {};
    const { rows: [ent] } = await q(`SELECT type FROM records WHERE id=$1 AND tenant_id IS NULL AND type IN ('series','track') AND NOT deleted`, [id]);
    need(ent, 400, 'Pick a shared series or track.');
    const { rows: [t] } = await q(`SELECT id, name FROM tenants WHERE id=$1`, [tid]);
    need(t, 400, 'Pick a team.');
    await q(`INSERT INTO calendar_officials(tenant_id,entity_type,entity_id,auto_approve,created_by) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (tenant_id, entity_id) DO UPDATE SET auto_approve=EXCLUDED.auto_approve`, [tid, ent.type, id, !!auto, req.user.id]);
    const { rows: [n] } = await q(`SELECT data->'values'->>'name' AS name FROM records WHERE id=$1`, [id]);
    await q(`INSERT INTO team_notices(tenant_id,kind,title,link) VALUES ($1,'official',$2,$3)`,
      [tid, `Your team now looks after ${n?.name} on the shared calendars${auto ? ' — your changes to it are approved automatically' : ''}`, `/calendar?tab=shared&show=${ent.type}:${id}`]);
    await audit(req.user.id, 'calendar.official', id, { team: t.name, auto: !!auto }).catch(() => {});
    res.json({ ok: true });
  }));
  A.delete('/calendar/officials/:id', h(async (req, res) => {
    await q(`DELETE FROM calendar_officials WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  }));

  // ---- questions
  A.post('/calendar/requests/:id/ask', h(async (req, res) => {
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    need(body, 400, 'Type your question.');
    const { rows: [r] } = await q(`SELECT id, tenant_id, user_id, title FROM calendar_requests WHERE id=$1 AND status IN ('pending','question')`, [req.params.id]);
    need(r, 404, 'That request is no longer open.');
    need(r.tenant_id, 400, 'Feed updates have no team to ask.');
    await tx(async (c) => {
      await c.query(`INSERT INTO calendar_request_messages(request_id,user_id,from_admin,body) VALUES ($1,$2,true,$3)`, [r.id, req.user.id, body]);
      await c.query(`UPDATE calendar_requests SET status='question', seen=false, updated_at=now() WHERE id=$1`, [r.id]);
    });
    mailTeam(r.tenant_id, `Question about “${r.title}”`, `The RaceOps admin asked:\n\n${body}\n\nAnswer it under Calendar → Requests.`, '/calendar?tab=requests', [r.user_id]).catch(() => {});
    res.json({ ok: true });
  }));

  // ---- merge duplicates
  A.get('/calendar/duplicates', h(async (req, res) => {
    const type = req.query.type === 'track' ? 'track' : 'series';
    const { rows } = await q(`SELECT id, data FROM records WHERE type=$1 AND tenant_id IS NULL AND NOT deleted`, [type]);
    res.json({ pairs: similarPairs(rows.map((r) => ({ id: r.id, values: r.data?.values || {} })), type) });
  }));
  A.post('/calendar/merge', h(async (req, res) => {
    const { type, from, into } = req.body || {};
    need(['series', 'track'].includes(type) && from && into && from !== into, 400, 'Pick two different shared records to merge.');
    const out = await tx(async (c) => {
      const { rows: both } = await c.query(`SELECT id, data FROM records WHERE id = ANY($1::uuid[]) AND type=$2 AND tenant_id IS NULL AND NOT deleted FOR UPDATE`, [[from, into], type]);
      need(both.length === 2, 404, 'One of those records no longer exists.');
      const { rows } = await c.query(`SELECT id, tenant_id, type, data FROM records WHERE NOT deleted AND type = ANY($1::text[]) AND data::text LIKE $2`, [MERGE_TYPES, `%${from}%`]);
      let n = 0; const tenants = new Set();
      for (const r of rows) {
        const v = { ...(r.data.values || {}) };
        let changed = false;
        for (const k of ['series', 'venue', 'track', 'entity']) if (v[k] === from) { v[k] = into; changed = true; }
        if (changed) { await updateRecord(c, r.id, r.type, r.tenant_id, { ...r.data, values: v }, req.user.id); n++; if (r.tenant_id) tenants.add(r.tenant_id); }
      }
      // one track link, one note and one follow per team and record
      for (const tid of tenants) {
        for (const [ty, key] of [['team_track', 'track'], ['local_note', 'entity'], ['follow', 'entity']]) {
          const { rows: dup } = await c.query(`SELECT id, data FROM records WHERE tenant_id=$1 AND type=$2 AND NOT deleted AND data->'values'->>$3=$4 ORDER BY created_at`, [tid, ty, key, into]);
          if (dup.length < 2) continue;
          const [keep, ...rest] = dup;
          const kv = { ...keep.data.values };
          for (const x of rest) {
            if (ty !== 'follow' && x.data.values?.notes) kv.notes = [kv.notes, x.data.values.notes].filter(Boolean).join('\n\n');
            if (ty === 'team_track') { if (x.data.values?.home) kv.home = true; if (x.data.values?.link === 'Linked') kv.link = 'Linked'; }
            await updateRecord(c, x.id, ty, tid, x.data, req.user.id, true);
          }
          await updateRecord(c, keep.id, ty, tid, { ...keep.data, values: kv }, req.user.id);
        }
      }
      await c.query(`DELETE FROM calendar_officials o WHERE entity_id=$1 AND EXISTS (SELECT 1 FROM calendar_officials p WHERE p.entity_id=$2 AND p.tenant_id=o.tenant_id)`, [from, into]);
      await c.query(`UPDATE calendar_officials SET entity_id=$2 WHERE entity_id=$1`, [from, into]);
      await c.query(`DELETE FROM calendar_feeds WHERE entity_id=$1 AND EXISTS (SELECT 1 FROM calendar_feeds WHERE entity_id=$2)`, [from, into]);
      await c.query(`UPDATE calendar_feeds SET entity_id=$2 WHERE entity_id=$1`, [from, into]);
      await c.query(`UPDATE calendar_requests SET subject_id=$2 WHERE subject_id=$1`, [from, into]);
      const gone = both.find((x) => x.id === from);
      await updateRecord(c, gone.id, type, null, { ...gone.data, values: { ...gone.data.values, merged_into: into } }, req.user.id, true);
      return { updated: n, teams: tenants.size };
    });
    await audit(req.user.id, `calendar.merge.${type}`, from, { into, ...out }).catch(() => {});
    res.json(out);
  }));

  // ---- history and restore
  A.get('/calendar/history/:id', h(async (req, res) => {
    const { rows: [rec] } = await q(`SELECT id, type FROM records WHERE id=$1 AND tenant_id IS NULL`, [req.params.id]);
    need(rec, 404, 'Not a shared record.');
    const { rows } = await q(`SELECT h.id, h.op, h.outcome, h.data, h.created_at, u.name AS user_name FROM record_history h LEFT JOIN users u ON u.id=h.user_id
        WHERE h.record_id=$1 AND h.outcome='applied' ORDER BY h.id DESC LIMIT 100`, [rec.id]);
    res.json({ type: rec.type, history: rows });
  }));
  A.post('/calendar/history/:id/restore', h(async (req, res) => {
    const mails = await tx(async (c) => {
      const { rows: [rec] } = await c.query(`SELECT * FROM records WHERE id=$1 AND tenant_id IS NULL FOR UPDATE`, [req.params.id]);
      need(rec, 404, 'Not a shared record.');
      const { rows: [hrow] } = await c.query(`SELECT data FROM record_history WHERE id=$1 AND record_id=$2 AND outcome='applied'`, [req.body?.history_id, rec.id]);
      need(hrow, 404, 'That version isn’t in the history.');
      const { _deleted: wasDeleted, ...data } = hrow.data || {};
      need(!wasDeleted, 400, 'That version is the deletion — pick an earlier one.');
      await updateRecord(c, rec.id, rec.type, null, data, req.user.id, false);
      if (rec.type !== 'fixture') return [];
      await syncEvents(c, rec.id, data.values || {}, req.user.id);
      return notifyFollowers(c, { after: data.values || {}, before: rec.deleted ? null : rec.data?.values || {} });
    });
    sendAfter(mails);
    await audit(req.user.id, 'calendar.restore', req.params.id, { history: req.body?.history_id }).catch(() => {});
    res.json({ ok: true });
  }));

  // ---- official feeds
  A.get('/calendar/feeds', h(async (_req, res) => {
    const { rows } = await q(`SELECT f.*, r.data->'values'->>'name' AS name FROM calendar_feeds f LEFT JOIN records r ON r.id=f.entity_id ORDER BY name`);
    res.json({ feeds: rows });
  }));
  A.put('/calendar/feeds/:id', h(async (req, res) => {
    const url = String(req.body?.url || '').trim();
    need(/^(https?|webcal):\/\//i.test(url), 400, 'Use an iCal link starting with https:// or webcal://');
    const { rows: [ent] } = await q(`SELECT type FROM records WHERE id=$1 AND tenant_id IS NULL AND type IN ('series','track') AND NOT deleted`, [req.params.id]);
    need(ent, 404, 'Not a shared series or track.');
    await q(`INSERT INTO calendar_feeds(entity_id,entity_type,url,created_by) VALUES ($1,$2,$3,$4) ON CONFLICT (entity_id) DO UPDATE SET url=EXCLUDED.url, last_status=NULL`,
      [req.params.id, ent.type, url, req.user.id]);
    res.json(await checkFeed(req.params.id, fetchCalendar));
  }));
  A.delete('/calendar/feeds/:id', h(async (req, res) => {
    await q(`DELETE FROM calendar_feeds WHERE entity_id=$1`, [req.params.id]);
    res.json({ ok: true });
  }));
  A.post('/calendar/feeds/:id/check', h(async (req, res) => res.json(await checkFeed(req.params.id, fetchCalendar))));

  // ---- email status
  A.get('/mail', h(async (_req, res) => res.json({ configured: mailConfigured(), from: mailConfigured() ? mailFrom() : '', app_url: process.env.APP_URL || '' })));
  A.post('/mail/test', h(async (req, res) => {
    need(mailConfigured(), 400, 'Email isn’t set up on this server (SMTP_HOST is missing).');
    const ok = await sendMail({ to: [req.user.email], subject: 'Test email', text: 'Email from RaceOps is working.' });
    need(ok, 502, 'The email couldn’t be sent — check the SMTP settings and the server log.');
    res.json({ ok: true, to: req.user.email });
  }));
}
