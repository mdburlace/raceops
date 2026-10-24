// Calendars on the server: reading published calendars (iCal, web pages, PDFs, screenshots),
// publishing a team's calendar (no-login page data + iCal feed), and the platform admin's review
// of dates teams suggest for the shared series and track calendars.
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { q, tx } from './db.js';
import { HttpError } from './auth.js';
import { can, canType } from '../../shared/catalog.js';
import { addToSeries, removeFromSeries, eventDayList, roundLabel, seriesLinks, moveDays, normaliseDays, looksLikeICS, parseICS, toICS, seasonStart, seasonOf, seasonLabel } from '../../shared/calendar.js';
import { readCalendar } from './ai.js';
import { audit } from './settings.js';
import { BASE_FORMS } from '../../shared/baseForms.js';
import { applyUpgrades } from '../../shared/baseForms2.js';
import { backgroundable } from './jobs.js';
import { FIXTURE_KEYS as SHARED_FIXTURE_KEYS, pendingRequests, pickValues, syncEvents } from './calendarRequests.js';
import { notifyFollowers, sendAfter } from './calendarPlus.js';

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------- fetching a published calendar
const privateIp = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:127.') || x.startsWith('::ffff:10.') || x.startsWith('::ffff:192.168.');
};

export async function fetchCalendar(raw) {
  let url;
  try { url = new URL(String(raw).trim().replace(/^webcal:/i, 'https:')); } catch { throw new HttpError(400, 'That link isn’t a web address.'); }
  need(['http:', 'https:'].includes(url.protocol), 400, 'Use a web (http or https) link.');
  if (/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)instagram\.com$/i.test(url.hostname)) {
    throw new HttpError(422, 'Facebook and Instagram pages need a login, so they can’t be read from a link. Take a screenshot of the post (or copy its text) and add that instead.');
  }
  if (process.env.CALENDAR_FETCH_PRIVATE !== '1') {
    const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => []);
    need(addrs.length, 400, 'Couldn’t find that web site.');
    need(!addrs.some((a) => privateIp(a.address)), 400, 'That link points to a private network address.');
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  let res;
  try {
    res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'RaceOps calendar import', accept: 'text/calendar, text/html, application/pdf, */*' } });
  } catch (e) {
    throw new HttpError(502, e.name === 'AbortError' ? 'That site took too long to answer.' : 'Couldn’t open that link.');
  } finally { clearTimeout(timer); }
  need(res.ok, 502, `That site answered with an error (${res.status}).`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  need(buf.length <= 8_000_000, 400, 'That page is too large to read.');
  return { type, buf, url: url.toString() };
}

/** Readable text from a web page (scripts, styles and tags removed). */
function pageText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

// ---------------------------------------------------------------- publishing
const PUBLIC_OPTS = ['show_tentative', 'show_results', 'show_cars', 'show_sponsors'];
const cleanPublish = (p) => (p?.token ? { token: p.token, created_at: p.created_at, ...Object.fromEntries(PUBLIC_OPTS.map((k) => [k, !!p[k]])) } : null);

async function publicCalendar(token) {
  const { rows: [t] } = await q(`SELECT id, name, settings FROM tenants WHERE settings->'calendar_publish'->>'token' = $1`, [String(token).slice(0, 80)]);
  need(t, 404, 'This calendar link has been turned off or doesn’t exist.');
  const opts = cleanPublish(t.settings.calendar_publish);
  const { rows } = await q(`SELECT id, type, data FROM records WHERE (tenant_id=$1 OR tenant_id IS NULL) AND NOT deleted
      AND type IN ('event','track','series','car','fixture','sponsor')`, [t.id]);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.data?.values || {}]));
  const sm = seasonStart(t.settings);
  const items = [];
  for (const r of rows) {
    if (r.type !== 'event') continue;
    const v = r.data?.values || {};
    if (!v.date || v.intent === 'Not going' || (v.intent === 'Tentative' && !opts.show_tentative)) continue;
    const venue = byId[v.venue];
    const links = seriesLinks(v);
    const series = byId[links[0]?.series];
    const car = byId[v.car];
    const fx = byId[v.fixture];
    const cancelled = fx?.status === 'Cancelled' || v.outcome === 'Event cancelled';
    items.push({
      id: r.id, name: v.name || 'Event', date: v.date, end_date: v.end_date || '',
      // each day's result only with "Show results"; withdraw reasons and notes never
      days: eventDayList(v).length > 1 ? eventDayList(v).map(({ outcome, result, withdraw_reason, notes, ...d }) => ({ ...d, ...(opts.show_results && !d.off && (outcome || result) // eslint-disable-line no-unused-vars
        ? { outcome: outcome === 'Withdrew' ? 'Withdrew' : outcome || '', result: result || '' } : {}) })) : undefined,
      track: venue?.name || v.track || '', location: [venue?.city || v.location, venue?.region].filter(Boolean).join(', '),
      // every series the meeting counts towards; the main series' round with its prefix (Round 3, Night 2, Prelude)
      series: links.map((l, i) => (i === 0 ? byId[l.series]?.name : [byId[l.series]?.name, roundLabel(l.prefix, l.round)].filter(Boolean).join(' '))).filter(Boolean).join(' · '),
      round: links[0] ? roundLabel(links[0].prefix, links[0].round) : roundLabel(v.round_prefix, v.round), tentative: v.intent === 'Tentative', cancelled,
      car: opts.show_cars && car ? [car.number && `#${car.number}`, car.name].filter(Boolean).join(' ') : '',
      result: opts.show_results && v.outcome && !cancelled ? (v.outcome === 'Withdrew during the event' ? 'Withdrew' : v.outcome) : '',
      note: v.public_note || '', season: seasonOf(v.date, sm),
      major: v.major || fx?.major ? (v.major ? v.major_name : fx.major_name) || 'Major event' : '', sanctioning: v.sanctioning || fx?.sanctioning || series?.sanctioning || '',
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const seasons = [...new Set(items.map((i) => i.season))].sort().map((y) => ({ year: y, label: seasonLabel(y, sm) }));
  // the team's public page also lists the signed sponsors marked "Show on our public page"
  const sponsors = opts.show_sponsors ? rows.filter((r) => r.type === 'sponsor' && r.data?.values?.public && ['Signed', 'Renewal due'].includes(r.data.values.stage))
    .map((r) => ({ name: r.data.values.name || '', level: r.data.values.level || '' })).filter((x) => x.name).sort((a, b) => a.name.localeCompare(b.name)) : [];
  return { team: t.name, season_start: sm, seasons, items, sponsors, options: { show_results: opts.show_results, show_cars: opts.show_cars, show_sponsors: opts.show_sponsors } };
}

const pubHits = new Map();
function pubLimit(req) {
  const ip = req.ip || 'x'; const now = Date.now();
  const list = (pubHits.get(ip) || []).filter((x) => now - x < 60_000); list.push(now); pubHits.set(ip, list);
  need(list.length <= 60, 429, 'Too many requests — try again in a minute.');
}

/** No-login routes: the published calendar's data (for the /c/:token page) and its iCal feed. */
export function mountPublicCalendar(app) {
  app.get('/api/public/calendar/:token.ics', h(async (req, res) => {
    pubLimit(req);
    const cal = await publicCalendar(req.params.token);
    const ics = toICS({
      name: `${cal.team} — race calendar`,
      items: cal.items.map((i) => ({
        uid: `${i.id}@raceops`, date: i.date, end_date: i.end_date, days: i.days,
        summary: `${i.tentative ? '(Tentative) ' : ''}${i.cancelled ? 'CANCELLED: ' : ''}${i.name}${i.track && !i.name.includes(i.track) ? ` — ${i.track}` : ''}`,
        location: [i.track, i.location].filter(Boolean).join(', '),
        description: [i.major, i.series && `${i.series}${i.round ? ` — ${i.round}` : ''}`, i.sanctioning && `Sanctioned by ${i.sanctioning}`, i.car && `Car: ${i.car}`, i.result && `Result: ${i.result}`, i.note].filter(Boolean).join('\n'),
        status: i.cancelled ? 'CANCELLED' : i.tentative ? 'TENTATIVE' : 'CONFIRMED',
      })),
    });
    res.set('Content-Type', 'text/calendar; charset=utf-8').set('Cache-Control', 'public, max-age=900')
      .set('Content-Disposition', 'inline; filename="race-calendar.ics"').send(ics);
  }));
  app.get('/api/public/calendar/:token', h(async (req, res) => {
    pubLimit(req);
    res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex').json(await publicCalendar(req.params.token));
  }));
}

// ---------------------------------------------------------------- team routes
export function mountCalendar(T) {
  // Read dates from a published calendar: a web or iCal link, uploaded files (PDF, photo, screenshot, .ics) or pasted text.
  T.post('/calendar/import', backgroundable(h(async (req, res) => {
    need(canType(req.role, req.ent, 'fixture', 'edit') || req.user.is_platform_admin, 403, 'You can’t add calendar dates.');
    const { url, text, files = [], year } = req.body || {};
    need(Array.isArray(files), 400, 'Bad files');
    // iCal needs no AI: a linked feed, an .ics file, or pasted iCal text
    const icsFile = files.find((f) => /calendar/.test(f.media_type || '') || /\.ics$/i.test(f.name || ''));
    if (icsFile) return res.json({ items: parseICS(icsFile.text ?? Buffer.from(icsFile.data || '', 'base64').toString('utf8')), source: 'ical' });
    if (text && looksLikeICS(text)) return res.json({ items: parseICS(text), source: 'ical' });
    if (url) {
      const got = await fetchCalendar(url);
      const body = got.buf.toString('utf8');
      if (got.type.includes('calendar') || looksLikeICS(body)) return res.json({ items: parseICS(body), source: 'ical' });
      let out;
      if (got.type === 'application/pdf') out = await readCalendar(req, { files: [{ media_type: 'application/pdf', data: got.buf.toString('base64') }], source: got.url, year });
      else if (got.type.startsWith('image/')) out = await readCalendar(req, { files: [{ media_type: got.type, data: got.buf.toString('base64') }], source: got.url, year });
      else {
        const pt = pageText(body);
        need(pt.length > 20, 422, 'That page has no readable text — it may need a login or load its dates with scripts. Try a screenshot instead.');
        out = await readCalendar(req, { text: pt, source: got.url, year });
      }
      return res.json({ items: out.items || [], calendar_of: out.calendar_of || '', unclear: out._unclear || '', source: 'ai' });
    }
    const out = await readCalendar(req, { files, text, year });
    res.json({ items: out.items || [], calendar_of: out.calendar_of || '', unclear: out._unclear || '', source: 'ai' });
  })));

  // Turn the public calendar on (new link), change what it shows, or turn it off.
  T.put('/calendar/publish', h(async (req, res) => {
    need(can(req.role, 'team.manage'), 403, 'Only people who can edit team settings can publish the calendar.');
    const b = req.body || {};
    const { rows: [t] } = await q('SELECT settings FROM tenants WHERE id=$1', [req.tid]);
    const cur = t.settings?.calendar_publish || {};
    let next = null;
    if (b.on !== false) {
      next = { ...cur, token: !cur.token || b.new_link ? crypto.randomBytes(18).toString('base64url') : cur.token, created_at: cur.created_at || new Date().toISOString() };
      for (const k of PUBLIC_OPTS) if (k in b) next[k] = !!b[k];
      next = cleanPublish(next);
    }
    await q(`UPDATE tenants SET settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{calendar_publish}', $2::jsonb) WHERE id=$1`, [req.tid, JSON.stringify(next)]);
    res.json({ calendar_publish: next });
  }));
}

// ---------------------------------------------------------------- platform admin: suggestions
const RECORD_COLS = 'id, tenant_id, type, data, deleted, seq::text AS seq';

async function insertGlobal(c, type, data, userId) {
  const id = crypto.randomUUID();
  await c.query(`INSERT INTO records(id,tenant_id,type,data,created_by,updated_by,client_updated_at) VALUES ($1,NULL,$2,$3,$4,$4,now())`, [id, type, JSON.stringify(data), userId]);
  await c.query(`INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,user_id,client_updated_at) VALUES ($1,NULL,$2,'create','applied',$3,$4,now())`,
    [id, type, JSON.stringify(data), userId]);
  return id;
}
async function updateRecord(c, id, type, tenantId, data, userId, deleted = false) {
  await c.query(`UPDATE records SET data=$2, deleted=$3, updated_by=$4, client_updated_at=now(), updated_at=now(), seq=nextval('record_seq') WHERE id=$1`,
    [id, JSON.stringify(data), deleted, userId]);
  await c.query(`INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,user_id,client_updated_at) VALUES ($1,$2,$3,$4,'applied',$5,$6,now())`,
    [id, tenantId, type, deleted ? 'delete' : 'update', JSON.stringify({ ...data, _deleted: deleted }), userId]);
}

const lc = (s) => String(s ?? '').trim().toLowerCase();

/** The standard form for a record type, upgraded — for admin pages that edit shared records outside a team. */
function baseForm(target) {
  const f = structuredClone(BASE_FORMS.find((x) => x.target === target));
  applyUpgrades(f);
  return { id: `base-${target}`, type: 'form', global: true, data: { ...f, base: true } };
}
const SERIES_KEYS = ['name', 'season', 'class', 'sanctioning', 'start_date', 'end_date', 'website', 'points', 'notes'];
const pick = (v, keys) => Object.fromEntries(keys.map((k) => [k, v?.[k]]).filter(([, x]) => x !== undefined && x !== null && x !== '' && !(Array.isArray(x) && !x.length)));

export function mountCalendarAdmin(A) {
  // Everything the shared-calendar admin page needs: shared dates, series, the track directory and the forms.
  A.get('/calendar/data', h(async (_req, res) => {
    const { rows } = await q(`SELECT id, type, data, updated_at FROM records WHERE tenant_id IS NULL AND NOT deleted AND type IN ('fixture','series','track')`);
    const recs = rows.map((r) => ({ id: r.id, type: r.type, global: true, updated_at: r.updated_at,
      data: { values: r.type === 'track' ? pick(r.data?.values, ['name', 'city', 'region', 'country', 'status', 'classes']) : r.data?.values || {} } }));
    res.json({ records: [...recs, baseForm('fixture'), baseForm('series'), baseForm('track')], pending: await pendingRequests() });
  }));

  // Add or change a shared date (id "new" adds one).
  A.put('/calendar/fixtures/:id', h(async (req, res) => {
    const raw = pickValues(req.body?.values, SHARED_FIXTURE_KEYS);
    let v = normaliseDays(raw);
    need(v.name && /^\d{4}-\d{2}-\d{2}$/.test(v.date || ''), 400, 'A shared date needs a name and a date.');
    need(v.venue || v.track, 400, 'Pick a track or type its name.');
    if (req.body?.values?.source) v.source = String(req.body.values.source).slice(0, 300);
    let mails = [];
    const id = await tx(async (c) => {
      if (req.params.id === 'new') {
        const nid = await insertGlobal(c, 'fixture', { form_id: 'base-fixture', values: v }, req.user.id);
        mails = await notifyFollowers(c, { after: v });
        return nid;
      }
      const { rows: [g] } = await c.query(`SELECT * FROM records WHERE id=$1 AND type='fixture' AND tenant_id IS NULL AND NOT deleted FOR UPDATE`, [req.params.id]);
      need(g, 404, 'That shared date no longer exists.');
      const keep = Object.fromEntries(['source', 'feed_uid'].filter((k) => g.data.values?.[k] && !v[k]).map((k) => [k, g.data.values[k]]));
      v = normaliseDays(moveDays(g.data.values, raw)); // a new date span with the old days: the days move with it
      await updateRecord(c, g.id, 'fixture', null, { ...g.data, values: { ...v, ...keep } }, req.user.id);
      await syncEvents(c, g.id, v, req.user.id); // teams' entries follow the shared date
      mails = await notifyFollowers(c, { after: v, before: g.data.values || {} });
      return g.id;
    });
    sendAfter(mails);
    await audit(req.user.id, req.params.id === 'new' ? 'calendar.add' : 'calendar.edit', id, { name: v.name, date: v.date }).catch(() => {});
    res.json({ id });
  }));

  A.delete('/calendar/fixtures/:id', h(async (req, res) => {
    const mails = await tx(async (c) => {
      const { rows: [g] } = await c.query(`SELECT * FROM records WHERE id=$1 AND type='fixture' AND tenant_id IS NULL AND NOT deleted FOR UPDATE`, [req.params.id]);
      need(g, 404, 'That shared date no longer exists.');
      await updateRecord(c, g.id, 'fixture', null, g.data, req.user.id, true);
      return notifyFollowers(c, { before: g.data.values || {}, removed: true });
    });
    sendAfter(mails);
    await audit(req.user.id, 'calendar.delete', req.params.id).catch(() => {});
    res.json({ ok: true });
  }));

  // Add shared dates to a shared series (or take them out), from the series' edit screen. A date with no
  // series gets it as its main series; a date already in another series gets it as one more (more_series).
  // Teams' entries follow, as for any change to a shared date.
  A.post('/calendar/series/:id/dates', h(async (req, res) => {
    const add = Array.isArray(req.body?.add) ? req.body.add.slice(0, 200) : [];
    const remove = Array.isArray(req.body?.remove) ? req.body.remove.slice(0, 200) : [];
    const n = await tx(async (c) => {
      const { rows: [sr] } = await c.query(`SELECT id FROM records WHERE id=$1 AND type='series' AND tenant_id IS NULL AND NOT deleted`, [req.params.id]);
      need(sr, 404, 'That series no longer exists.');
      let count = 0;
      const change = async (fid, fn) => {
        const { rows: [g] } = await c.query(`SELECT * FROM records WHERE id=$1 AND type='fixture' AND tenant_id IS NULL AND NOT deleted FOR UPDATE`, [fid]);
        if (!g) return;
        const before = g.data.values || {};
        const v = fn(before);
        if (JSON.stringify(v) === JSON.stringify(before)) return;
        await updateRecord(c, g.id, 'fixture', null, { ...g.data, values: v }, req.user.id);
        await syncEvents(c, g.id, v, req.user.id);
        count++;
      };
      for (const a of add) {
        const round = a?.round === undefined || a?.round === null ? '' : String(a.round).slice(0, 10);
        await change(a?.fixture, (v) => addToSeries(v, sr.id, { round, prefix: String(a?.prefix || '').slice(0, 30) }));
      }
      for (const fid of remove) await change(fid, (v) => removeFromSeries(v, sr.id));
      return count;
    });
    await audit(req.user.id, 'calendar.series_dates', req.params.id, { added: add.length, removed: remove.length }).catch(() => {});
    res.json({ changed: n });
  }));

  // Add or change a shared series.
  A.put('/calendar/series/:id', h(async (req, res) => {
    const v = pick(req.body?.values, SERIES_KEYS);
    need(v.name && v.season, 400, 'A series needs a name and a season.');
    const id = await tx(async (c) => {
      if (req.params.id === 'new') {
        const { rows } = await c.query(`SELECT id, data FROM records WHERE type='series' AND tenant_id IS NULL AND NOT deleted`);
        need(!rows.some((r) => lc(r.data?.values?.name) === lc(v.name) && lc(r.data?.values?.season) === lc(v.season)), 400, 'That series and season is already shared.');
        return insertGlobal(c, 'series', { form_id: 'base-series', values: v }, req.user.id);
      }
      const { rows: [g] } = await c.query(`SELECT * FROM records WHERE id=$1 AND type='series' AND tenant_id IS NULL AND NOT deleted FOR UPDATE`, [req.params.id]);
      need(g, 404, 'That series no longer exists.');
      await updateRecord(c, g.id, 'series', null, { ...g.data, values: { ...g.data.values, ...v } }, req.user.id);
      return g.id;
    });
    res.json({ id });
  }));
}
