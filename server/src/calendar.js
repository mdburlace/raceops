// Calendars on the server: reading published calendars (iCal, web pages, PDFs, screenshots),
// publishing a team's calendar (no-login page data + iCal feed), and the platform admin's review
// of dates teams suggest for the shared series and track calendars.
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { q, tx } from './db.js';
import { HttpError } from './auth.js';
import { can, canType } from '../../shared/catalog.js';
import { looksLikeICS, parseICS, toICS, seasonStart, seasonOf, seasonLabel } from '../../shared/calendar.js';
import { readCalendar } from './ai.js';
import { audit } from './settings.js';
import { BASE_FORMS } from '../../shared/baseForms.js';
import { applyUpgrades } from '../../shared/baseForms2.js';
import { backgroundable } from './jobs.js';

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

async function fetchCalendar(raw) {
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
const PUBLIC_OPTS = ['show_tentative', 'show_results', 'show_cars'];
const cleanPublish = (p) => (p?.token ? { token: p.token, created_at: p.created_at, ...Object.fromEntries(PUBLIC_OPTS.map((k) => [k, !!p[k]])) } : null);

async function publicCalendar(token) {
  const { rows: [t] } = await q(`SELECT id, name, settings FROM tenants WHERE settings->'calendar_publish'->>'token' = $1`, [String(token).slice(0, 80)]);
  need(t, 404, 'This calendar link has been turned off or doesn’t exist.');
  const opts = cleanPublish(t.settings.calendar_publish);
  const { rows } = await q(`SELECT id, type, data FROM records WHERE (tenant_id=$1 OR tenant_id IS NULL) AND NOT deleted
      AND type IN ('event','track','series','car','fixture')`, [t.id]);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.data?.values || {}]));
  const sm = seasonStart(t.settings);
  const items = [];
  for (const r of rows) {
    if (r.type !== 'event') continue;
    const v = r.data?.values || {};
    if (!v.date || v.intent === 'Not going' || (v.intent === 'Tentative' && !opts.show_tentative)) continue;
    const venue = byId[v.venue];
    const series = byId[v.series];
    const car = byId[v.car];
    const fx = byId[v.fixture];
    const cancelled = fx?.status === 'Cancelled' || v.outcome === 'Event cancelled';
    items.push({
      id: r.id, name: v.name || 'Event', date: v.date, end_date: v.end_date || '',
      track: venue?.name || v.track || '', location: [venue?.city || v.location, venue?.region].filter(Boolean).join(', '),
      series: series?.name || '', round: v.round || '', tentative: v.intent === 'Tentative', cancelled,
      car: opts.show_cars && car ? [car.number && `#${car.number}`, car.name].filter(Boolean).join(' ') : '',
      result: opts.show_results && v.outcome && !cancelled ? (v.outcome === 'Withdrew during the event' ? 'Withdrew' : v.outcome) : '',
      note: v.public_note || '', season: seasonOf(v.date, sm),
      major: v.major || fx?.major ? (v.major ? v.major_name : fx.major_name) || 'Major event' : '', sanctioning: v.sanctioning || fx?.sanctioning || series?.sanctioning || '',
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const seasons = [...new Set(items.map((i) => i.season))].sort().map((y) => ({ year: y, label: seasonLabel(y, sm) }));
  return { team: t.name, season_start: sm, seasons, items, options: { show_results: opts.show_results, show_cars: opts.show_cars } };
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
        uid: `${i.id}@raceops`, date: i.date, end_date: i.end_date,
        summary: `${i.tentative ? '(Tentative) ' : ''}${i.cancelled ? 'CANCELLED: ' : ''}${i.name}${i.track && !i.name.includes(i.track) ? ` — ${i.track}` : ''}`,
        location: [i.track, i.location].filter(Boolean).join(', '),
        description: [i.major, i.series && `${i.series}${i.round ? ` round ${i.round}` : ''}`, i.sanctioning && `Sanctioned by ${i.sanctioning}`, i.car && `Car: ${i.car}`, i.result && `Result: ${i.result}`, i.note].filter(Boolean).join('\n'),
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
const FIXTURE_KEYS = ['name', 'date', 'end_date', 'series', 'round', 'venue', 'track', 'classes', 'major', 'major_name', 'sanctioning', 'status', 'start_time', 'website', 'notes'];

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
    const { rows: [p] } = await q(`SELECT count(*)::int AS n FROM records WHERE type='fixture' AND tenant_id IS NOT NULL AND NOT deleted AND data->'values'->>'review'='pending'`);
    res.json({ records: [...recs, baseForm('fixture'), baseForm('series')], pending: p.n });
  }));

  // Add or change a shared date (id "new" adds one).
  A.put('/calendar/fixtures/:id', h(async (req, res) => {
    const v = pick(req.body?.values, FIXTURE_KEYS);
    need(v.name && /^\d{4}-\d{2}-\d{2}$/.test(v.date || ''), 400, 'A shared date needs a name and a date.');
    need(v.venue || v.track, 400, 'Pick a track or type its name.');
    if (req.body?.values?.source) v.source = String(req.body.values.source).slice(0, 300);
    const id = await tx(async (c) => {
      if (req.params.id === 'new') return insertGlobal(c, 'fixture', { form_id: 'base-fixture', values: v }, req.user.id);
      const { rows: [g] } = await c.query(`SELECT * FROM records WHERE id=$1 AND type='fixture' AND tenant_id IS NULL AND NOT deleted FOR UPDATE`, [req.params.id]);
      need(g, 404, 'That shared date no longer exists.');
      await updateRecord(c, g.id, 'fixture', null, { ...g.data, values: { ...v, ...(g.data.values?.source && !v.source ? { source: g.data.values.source } : {}) } }, req.user.id);
      return g.id;
    });
    await audit(req.user.id, req.params.id === 'new' ? 'calendar.add' : 'calendar.edit', id, { name: v.name, date: v.date }).catch(() => {});
    res.json({ id });
  }));

  A.delete('/calendar/fixtures/:id', h(async (req, res) => {
    await tx(async (c) => {
      const { rows: [g] } = await c.query(`SELECT * FROM records WHERE id=$1 AND type='fixture' AND tenant_id IS NULL AND NOT deleted FOR UPDATE`, [req.params.id]);
      need(g, 404, 'That shared date no longer exists.');
      await updateRecord(c, g.id, 'fixture', null, g.data, req.user.id, true);
    });
    await audit(req.user.id, 'calendar.delete', req.params.id).catch(() => {});
    res.json({ ok: true });
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


  A.get('/calendar/suggestions', h(async (_req, res) => {
    const { rows } = await q(`SELECT r.id, r.tenant_id, r.data, r.updated_at, t.name AS team, u.name AS by_name
        FROM records r JOIN tenants t ON t.id=r.tenant_id LEFT JOIN users u ON u.id=r.updated_by
       WHERE r.type='fixture' AND r.tenant_id IS NOT NULL AND NOT r.deleted AND r.data->'values'->>'review'='pending' ORDER BY r.updated_at`);
    // names for the series and tracks they point to, and the shared date an edit would change
    const ids = [...new Set(rows.flatMap((r) => [r.data.values?.series, r.data.values?.venue, r.data.values?.replaces]).filter(Boolean))];
    const { rows: refs } = ids.length ? await q(`SELECT ${RECORD_COLS} FROM records WHERE id = ANY($1::uuid[])`, [ids]) : { rows: [] };
    const byId = Object.fromEntries(refs.map((r) => [r.id, { id: r.id, type: r.type, global: r.tenant_id === null, values: r.data?.values || {} }]));
    res.json({ suggestions: rows.map((r) => ({ id: r.id, team: r.team, by: r.by_name, at: r.updated_at, values: r.data.values })), refs: byId });
  }));

  // Approve (publish to every team, optionally with corrections) or reject with a note back to the team.
  A.post('/calendar/suggestions/:id', h(async (req, res) => {
    const { action, note = '', values: edits = {} } = req.body || {};
    need(['approve', 'reject'].includes(action), 400, 'Approve or reject');
    const out = await tx(async (c) => {
      const { rows: [s] } = await c.query(`SELECT * FROM records WHERE id=$1 AND type='fixture' AND tenant_id IS NOT NULL FOR UPDATE`, [req.params.id]);
      need(s && s.data?.values?.review === 'pending', 404, 'That suggestion has already been dealt with.');
      const sv = { ...s.data.values };
      if (action === 'reject') {
        await updateRecord(c, s.id, 'fixture', s.tenant_id, { ...s.data, values: { ...sv, review: 'rejected', review_note: String(note).slice(0, 500) } }, req.user.id);
        return { status: 'rejected' };
      }
      const v = Object.fromEntries(FIXTURE_KEYS.map((k) => [k, k in edits ? edits[k] : sv[k]]).filter(([, x]) => x !== undefined && x !== ''));
      // the series has to be shared too: match one already shared by name and season, else share the team's copy
      if (v.series) {
        const { rows: [ser] } = await c.query('SELECT * FROM records WHERE id=$1', [v.series]);
        if (ser && ser.tenant_id !== null) {
          const sval = ser.data?.values || {};
          const { rows: globals } = await c.query(`SELECT id, data FROM records WHERE type='series' AND tenant_id IS NULL AND NOT deleted`);
          const match = globals.find((g) => lc(g.data?.values?.name) === lc(sval.name) && lc(g.data?.values?.season) === lc(sval.season));
          const gid = match?.id || await insertGlobal(c, 'series', { form_id: ser.data.form_id, values: Object.fromEntries(Object.entries(sval).filter(([k]) => !['shared_as', 'notes'].includes(k))) }, req.user.id);
          await updateRecord(c, ser.id, 'series', ser.tenant_id, { ...ser.data, values: { ...sval, shared_as: gid } }, req.user.id);
          v.series = gid;
        } else if (!ser) delete v.series;
      }
      // a team-only track becomes a plain track name on the shared date
      if (v.venue) {
        const { rows: [tr] } = await c.query('SELECT tenant_id, data FROM records WHERE id=$1', [v.venue]);
        if (!tr || tr.tenant_id !== null) { v.track = v.track || tr?.data?.values?.name || ''; delete v.venue; }
      }
      let gid = sv.replaces;
      if (gid) {
        const { rows: [g] } = await c.query(`SELECT * FROM records WHERE id=$1 AND type='fixture' AND tenant_id IS NULL FOR UPDATE`, [gid]);
        need(g, 404, 'The shared date this changes no longer exists.');
        await updateRecord(c, g.id, 'fixture', null, { ...g.data, values: v }, req.user.id);
      } else {
        gid = await insertGlobal(c, 'fixture', { form_id: s.data.form_id, values: { ...v, source: sv.source || '' } }, req.user.id);
      }
      // entries the team already pulled from its own suggestion now point at the shared date
      const { rows: evs } = await c.query(`SELECT id, data FROM records WHERE tenant_id=$1 AND type='event' AND NOT deleted AND data->'values'->>'fixture'=$2`, [s.tenant_id, s.id]);
      for (const e of evs) await updateRecord(c, e.id, 'event', s.tenant_id, { ...e.data, values: { ...e.data.values, fixture: gid } }, req.user.id);
      // the suggestion has done its job
      await updateRecord(c, s.id, 'fixture', s.tenant_id, { ...s.data, values: { ...sv, review: 'approved', approved_as: gid } }, req.user.id, true);
      return { status: 'approved', id: gid };
    });
    await audit(req.user.id, `calendar.${out.status}`, req.params.id, out.id ? { fixture: out.id } : {}).catch(() => {});
    res.json(out);
  }));
}
