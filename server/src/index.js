import express from 'express';
import compression from 'compression';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { q, tx, migrate } from './db.js';
import {
  requireAuth, requireMember, hashPassword, checkPassword, signToken, randomToken, HttpError,
} from './auth.js';
import { DEFAULT_ROLES, ALL_PERMISSIONS, RECORD_TYPES, GLOBAL_TYPES, canType, can, entitlements } from '../../shared/catalog.js';
import { mapImportedTrack } from '../../shared/tracks.js';
import { cleanPrefs } from '../../shared/themes.js';
import { TEAM_TYPES, cleanShop } from '../../shared/shop.js';
import { BASE_FORMS } from '../../shared/baseForms.js';
import { FORM_REPLACE, applyUpgrades } from '../../shared/baseForms2.js';
import { SEED_GEAR_LISTS } from '../../shared/gearLists.js';
import { licenceState } from '../../shared/platform.js';
import { loadSettings, settings, publicSettings, seatLimit, audit } from './settings.js';
import * as limiter from './ratelimit.js';
import { mountAdmin } from './admin.js';
import { mountAi } from './ai.js';
import { mountWeather } from './weather.js';
import { mountPublicShare, mountSharing, onRecordSaved } from './sharing.js';
import { fetchCalendar, mountCalendar, mountPublicCalendar } from './calendar.js';
import { mountCalendarPlus, mountPublicShared, startFeedChecks } from './calendarPlus.js';
import { mountJobs } from './jobs.js';
import { convertLegacySuggestions, mountCalendarRequests, pendingRequests } from './calendarRequests.js';
import { feedbackNotices, mountFeedback } from './feedback.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const WEB_DIR = process.env.WEB_DIR || path.join(__dirname, '..', '..', 'web', 'dist');
const PORT = Number(process.env.PORT || 8080);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
// Behind a reverse proxy (pfSense HAProxy, Nginx…) the client address comes from X-Forwarded-For.
// Trust it only from proxies on private networks unless TRUST_PROXY says otherwise.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');
app.use(compression());
// API answers are never cached by the browser or anything in between. The app keeps its own copy of the data,
// and a cached answer (a redirect especially) can leave one device stuck "Offline". Routes that are meant to be
// cached (public calendar feeds) set their own Cache-Control, which replaces this.
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(express.json({ limit: '10mb' }));

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const perm = (p) => (req, _res, next) => next(can(req.role, p) ? undefined : new HttpError(403, 'Not permitted'));
const cleanEmail = (e) => String(e || '').trim().toLowerCase();

/** Refuse while an account or address is locked out after too many wrong passwords. */
function guardSignIn(req, res, keys) {
  const b = limiter.blocked(keys);
  if (!b) return;
  res.setHeader('Retry-After', String(b.retryAfter));
  const mins = Math.ceil(b.retryAfter / 60);
  throw new HttpError(429, `Too many sign-in attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or ask your administrator to unlock it.`);
}
/** Count a wrong password; a lockout is written to the admin activity log. */
function signInFailed(req, keys) {
  limiter.fail(keys, (key, until) => {
    console.warn(`Sign-in lockout: ${key} until ${until.toISOString()} (from ${req.ip})`);
    audit(null, 'auth.lockout', key.slice(key.indexOf(':') + 1), { type: key.startsWith('ip:') ? 'address' : 'account', ip: req.ip, until: until.toISOString() }).catch(() => {});
  });
}

// ---------- helpers ----------
async function membershipsFor(userId) {
  const { rows } = await q(
    `SELECT t.id AS tenant_id, t.name AS tenant_name, t.racing_type, t.settings, t.plan, t.features,
            t.status, t.licence_expires, t.seats,
            (SELECT count(*)::int FROM calendar_requests cr WHERE cr.tenant_id=t.id AND NOT cr.seen) AS calendar_notices,
            (SELECT count(*)::int FROM team_notices n WHERE n.tenant_id=t.id AND NOT n.seen) AS calendar_updates,
            json_build_object('id', r.id, 'name', r.name, 'permissions', r.permissions, 'is_owner', r.is_owner) AS role
       FROM memberships m JOIN tenants t ON t.id=m.tenant_id JOIN roles r ON r.id=m.role_id
      WHERE m.user_id=$1 ORDER BY t.name`, [userId]);
  // plans are editable by the platform admin, so the server works out each team's features
  return rows.map((m) => ({ ...m, entitlements: [...entitlements(m, settings().plans)], licence: licenceState(m), seat_limit: seatLimit(m),
    plan_label: settings().plans[m.plan]?.label || m.plan }));
}

async function createTenant(c, name, ownerId, opts = {}) {
  const g = settings().general;
  const plan = settings().plans[opts.plan] ? opts.plan : (settings().plans[g.default_plan] ? g.default_plan : 'pro');
  const { rows: [t] } = await c.query(
    'INSERT INTO tenants(name,plan,status,seats,licence_expires) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [name, plan, opts.status || 'active', opts.seats ?? g.default_seats ?? null, opts.licence_expires || null]);
  let ownerRole;
  for (const r of DEFAULT_ROLES) {
    const { rows: [role] } = await c.query(
      'INSERT INTO roles(tenant_id,name,description,permissions,is_owner) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [t.id, r.name, r.description, JSON.stringify(r.permissions), !!r.is_owner]);
    if (r.is_owner) ownerRole = role;
  }
  if (TEAM_TYPES[opts.team_type]) {
    await c.query("UPDATE tenants SET settings = COALESCE(settings,'{}'::jsonb) || $2::jsonb WHERE id=$1", [t.id, JSON.stringify({ team_type: opts.team_type })]);
    t.settings = { ...(t.settings || {}), team_type: opts.team_type };
  }
  if (ownerId) await c.query('INSERT INTO memberships(user_id,tenant_id,role_id) VALUES ($1,$2,$3)', [ownerId, t.id, ownerRole.id]);
  await ensureTeamBase(c, t.id);
  return { ...t, owner_role_id: ownerRole.id };
}

const baseKey = (f) => `${f.target}:${f.dyno_kind || 'default'}`;

/** Bring one team's base forms and seed data up to date (new forms, field upgrades, gear lists). */
async function ensureTeamBase(db, tid) {
  const { rows: forms } = await db.query("SELECT id, data FROM records WHERE tenant_id=$1 AND type='form' AND NOT deleted", [tid]);
  const keyOf = (d) => d.base_key || (d.base ? `${d.target}:default` : null);
  const have = new Map(forms.map((f) => [keyOf(f.data), f]).filter(([k]) => k));
  const fieldKeys = (d) => new Set(d.sections.flatMap((s) => s.fields.map((x) => x.key)));
  const save = (id, d) => db.query(`UPDATE records SET data=$2, updated_at=now(), client_updated_at=now(), seq=nextval('record_seq') WHERE id=$1`, [id, JSON.stringify(d)]);
  const formIds = {};

  for (const base of BASE_FORMS) {
    const key = baseKey(base);
    const def = structuredClone(base);
    applyUpgrades(def);
    const existing = have.get(key);
    if (!existing) {
      const id = crypto.randomUUID();
      const data = { ...def, base: true, base_key: key };
      await db.query(`INSERT INTO records(id,tenant_id,type,data) VALUES ($1,$2,'form',$3)`, [id, tid, JSON.stringify(data)]);
      await db.query(`INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,client_updated_at)
               VALUES ($1,$2,'form','create','applied',$3,now())`, [id, tid, JSON.stringify(data)]);
      formIds[key] = id;
      continue;
    }
    formIds[key] = existing.id;
    const d = existing.data;
    let changed = false;
    // structure changed in a release: take the shipped sections, keep any sections the team added
    const marker = FORM_REPLACE[key];
    if (marker && !fieldKeys(d).has(marker)) {
      const shippedIds = new Set(def.sections.map((x) => x.id));
      d.sections = [...def.sections, ...d.sections.filter((x) => !shippedIds.has(x.id))];
      changed = true;
    }
    // Phase 1 setup sheet: gear links to the gear list; add Crew Chief
    if (d.target === 'setup') {
      for (const sec of d.sections) for (const fld of sec.fields) {
        if (fld.key === 'gear' && fld.type === 'asset') { fld.type = 'ref'; fld.ref = 'gear'; delete fld.category; changed = true; }
      }
      const session = d.sections.find((x) => x.id === 'session');
      if (session && !fieldKeys(d).has('crew_chief')) {
        session.fields.push({ key: 'crew_chief', label: 'Crew Chief', type: 'member', core: true, defaultSelf: true });
        changed = true;
      }
    }
    if (applyUpgrades(d)) changed = true;
    if (changed) { await save(existing.id, d); console.log(`Upgraded form "${d.name}" in team ${tid}`); }
  }

  // standard gear lists
  const { rows: lists } = await db.query("SELECT data FROM records WHERE tenant_id=$1 AND type='gear_list'", [tid]);
  for (const seed of SEED_GEAR_LISTS) {
    if (lists.some((l) => l.data.seed_key === seed.seed_key)) continue;
    const data = { form_id: formIds['gear_list:default'], seed_key: seed.seed_key, values: seed.values };
    await db.query(`INSERT INTO records(id,tenant_id,type,data) VALUES ($1,$2,'gear_list',$3)`, [crypto.randomUUID(), tid, JSON.stringify(data)]);
    console.log(`Added gear list "${seed.values.name}" to team ${tid}`);
  }
}

async function importTracks(tracks, mode, userId = null) {
  return tx(async (c) => {
    const { rows } = await c.query(`SELECT id, data FROM records WHERE tenant_id IS NULL AND type='track' AND NOT deleted`);
    const byExt = new Map(rows.filter((r) => r.data.values?.ext_id).map((r) => [r.data.values.ext_id, r]));
    let added = 0, updated = 0, skipped = 0;
    for (const v of tracks) {
      const cur = v.ext_id && byExt.get(v.ext_id);
      if (!cur) {
        const id = crypto.randomUUID();
        const data = { scope: 'global', values: v };
        await c.query(`INSERT INTO records(id,tenant_id,type,data,created_by,updated_by) VALUES ($1,NULL,'track',$2,$3,$3)`, [id, JSON.stringify(data), userId]);
        await c.query(`INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,user_id,client_updated_at) VALUES ($1,NULL,'track','create','applied',$2,$3,now())`, [id, JSON.stringify(data), userId]);
        added++;
        continue;
      }
      if (mode === 'add') { skipped++; continue; }
      const old = cur.data.values || {};
      const merged = { ...old };
      for (const [k, val] of Object.entries(v)) {
        // a lone "Sprintcars" is the directory's default class, so richer class lists may replace it
        const empty = (x) => x === undefined || x === null || x === '' || (Array.isArray(x) && (!x.length || (k === 'classes' && x.length === 1 && x[0] === 'Sprintcars' && val.length > 1)));
        if (mode === 'overwrite' ? !empty(val) : empty(old[k]) && !empty(val)) merged[k] = val;
      }
      if (JSON.stringify(merged) === JSON.stringify(old)) { skipped++; continue; }
      const data = { ...cur.data, values: merged };
      await c.query(`UPDATE records SET data=$2, updated_at=now(), client_updated_at=now(), updated_by=$3, seq=nextval('record_seq') WHERE id=$1`, [cur.id, JSON.stringify(data), userId]);
      await c.query(`INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,user_id,client_updated_at) VALUES ($1,NULL,'track','update','applied',$2,$3,now())`, [cur.id, JSON.stringify(data), userId]);
      updated++;
    }
    return { added, updated, skipped };
  });
}

/** Seed the global track directory on first start (and add any new seed tracks later). */
async function ensureGlobalTracks(force = false) {
  const file = path.join(__dirname, '..', '..', 'shared', 'seed', 'tracks.json');
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, 'utf8');
  const seed = JSON.parse(raw).tracks || [];
  // Each new version of the seed file adds new tracks and fills blank fields once; later admin edits are kept.
  const marker = `seed:tracks:${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12)}`;
  const { rows } = await q('SELECT 1 FROM schema_migrations WHERE name=$1', [marker]);
  if (rows.length && !force) return null;
  const r = await importTracks(seed.map(mapImportedTrack).filter(Boolean), 'fill');
  r.corrected = await applyTrackUpdates();
  await q('INSERT INTO schema_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING', [marker]);
  console.log(`Track directory: ${r.added} added, ${r.updated} filled in, ${r.corrected} corrected`);
  return r;
}

/**
 * Corrections to existing directory tracks shipped in shared/seed/track_updates.json
 * (e.g. a renamed or closed venue). A field is only changed while it still holds the old
 * shipped value, so anything a platform admin has edited since is left alone.
 */
async function applyTrackUpdates() {
  const file = path.join(__dirname, '..', '..', 'shared', 'seed', 'track_updates.json');
  if (!fs.existsSync(file)) return 0;
  const { updates = [] } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
  let n = 0;
  await tx(async (c) => {
    for (const u of updates) {
      const { rows: [cur] } = await c.query(
        `SELECT id, data FROM records WHERE tenant_id IS NULL AND type='track' AND NOT deleted AND data->'values'->>'ext_id'=$1`, [u.ext_id]);
      if (!cur) continue;
      const vals = { ...(cur.data.values || {}) };
      let changed = false;
      for (const [k, v] of Object.entries(u.set || {})) {
        if (!same(vals[k], v) && same(vals[k], u.was?.[k])) { vals[k] = v; changed = true; }
      }
      if (!changed) continue;
      const data = { ...cur.data, values: vals };
      await c.query(`UPDATE records SET data=$2, updated_at=now(), client_updated_at=now(), seq=nextval('record_seq') WHERE id=$1`, [cur.id, JSON.stringify(data)]);
      await c.query(`INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,client_updated_at) VALUES ($1,NULL,'track','update','applied',$2,now())`, [cur.id, JSON.stringify(data)]);
      n++;
    }
  });
  return n;
}

/** Shared tuning guides for the setup advisor; added once each, later edits by admins are kept. */
async function ensureGlobalGuides() {
  const file = path.join(__dirname, '..', '..', 'shared', 'seed', 'guides.json');
  if (!fs.existsSync(file)) return;
  const { guides = [] } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { rows } = await q(`SELECT data->'values'->>'seed_key' AS k FROM records WHERE tenant_id IS NULL AND type='tuning_guide'`);
  const have = new Set(rows.map((r) => r.k));
  for (const g of guides) {
    if (have.has(g.seed_key)) continue;
    const data = { scope: 'global', values: g };
    const id = crypto.randomUUID();
    await q(`INSERT INTO records(id,tenant_id,type,data) VALUES ($1,NULL,'tuning_guide',$2)`, [id, JSON.stringify(data)]);
    await q(`INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,client_updated_at) VALUES ($1,NULL,'tuning_guide','create','applied',$2,now())`, [id, JSON.stringify(data)]);
    console.log(`Added tuning guide "${g.name}"`);
  }
}

async function ensureBaseForms() {
  const { rows: tenants } = await q('SELECT id FROM tenants');
  for (const { id } of tenants) await tx((c) => ensureTeamBase(c, id));
}

const authPayload = async (user) => ({
  token: signToken(user),
  user: { id: user.id, email: user.email, name: user.name, is_platform_admin: user.is_platform_admin, prefs: user.prefs || {} },
  memberships: await membershipsFor(user.id),
  platform: publicSettings(),
});

// ---------- public ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Repair this device (Profile & device → Sync): tells the browser to empty its HTTP cache for this site, which
// clears anything stale it is replaying (such as a cached redirect) — something page code can't do itself.
// Only affects the browser that asks; no sign-in needed, nothing on the server changes.
app.post('/api/device/clear-cache', (_req, res) => {
  res.setHeader('Clear-Site-Data', '"cache"');
  res.json({ ok: true });
});

app.get('/api/status', h(async (_req, res) => {
  const { rows } = await q('SELECT count(*)::int AS n FROM users');
  res.json({ needsSetup: rows[0].n === 0 });
}));

app.post('/api/setup', h(async (req, res) => {
  const { email, name, password, team_name } = req.body || {};
  need(email && name && password && team_name, 400, 'All fields are required');
  need(String(password).length >= 8, 400, 'Password must be at least 8 characters');
  const user = await tx(async (c) => {
    await c.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const { rows } = await c.query('SELECT count(*)::int AS n FROM users');
    need(rows[0].n === 0, 409, 'Setup has already been completed');
    const { rows: [u] } = await c.query(
      'INSERT INTO users(email,name,password_hash,is_platform_admin) VALUES ($1,$2,$3,true) RETURNING *',
      [cleanEmail(email), name, await hashPassword(password)]);
    await createTenant(c, team_name, u.id);
    return u;
  });
  res.json(await authPayload(user));
}));

app.post('/api/auth/login', h(async (req, res) => {
  const { email, password } = req.body || {};
  const keys = limiter.keysFor(req, cleanEmail(email));
  guardSignIn(req, res, keys);
  const { rows: [u] } = await q('SELECT * FROM users WHERE email=$1', [cleanEmail(email)]);
  if (!(u && (await checkPassword(password || '', u.password_hash)))) {
    signInFailed(req, keys);
    throw new HttpError(401, 'Email or password is incorrect');
  }
  limiter.succeed(keys);
  need(!u.disabled, 403, 'This account has been disabled');
  await q('UPDATE users SET last_login_at=now() WHERE id=$1', [u.id]);
  res.json(await authPayload(u));
}));

app.get('/api/invites/:token', h(async (req, res) => {
  const { rows: [i] } = await q(
    `SELECT i.email, i.expires_at, i.accepted_at, t.name AS tenant_name, r.name AS role_name,
            EXISTS(SELECT 1 FROM users u WHERE u.email=i.email) AS has_account
       FROM invites i JOIN tenants t ON t.id=i.tenant_id JOIN roles r ON r.id=i.role_id WHERE i.token=$1`,
    [req.params.token]);
  need(i, 404, 'Invite not found');
  need(!i.accepted_at, 410, 'This invite has already been used');
  need(new Date(i.expires_at) > new Date(), 410, 'This invite has expired');
  res.json(i);
}));

// Accept: new users supply name+password; existing users supply password (or a bearer token).
app.post('/api/invites/:token/accept', h(async (req, res) => {
  const { name, password } = req.body || {};
  const { rows: [inv] } = await q('SELECT email FROM invites WHERE token=$1', [req.params.token]);
  const keys = limiter.keysFor(req, inv?.email || 'invite');
  guardSignIn(req, res, keys);
  let wrongPassword = false;
  const user = await tx(async (c) => {
    const { rows: [i] } = await c.query('SELECT * FROM invites WHERE token=$1 FOR UPDATE', [req.params.token]);
    need(i && !i.accepted_at && new Date(i.expires_at) > new Date(), 410, 'Invite is no longer valid');
    let { rows: [u] } = await c.query('SELECT * FROM users WHERE email=$1', [i.email]);
    const { rows: [t] } = await c.query('SELECT * FROM tenants WHERE id=$1', [i.tenant_id]);
    const limit = seatLimit(t);
    if (limit !== null) {
      const { rows: [n] } = await c.query('SELECT count(*)::int AS n FROM memberships WHERE tenant_id=$1 AND user_id <> ALL(SELECT id FROM users WHERE email=$2)', [t.id, i.email]);
      need(n.n < limit, 409, `${t.name} has used all ${limit} of its licensed seats. Ask the team owner to free a seat.`);
    }
    if (u) {
      need(!u.disabled, 403, 'This account has been disabled');
      if (!(await checkPassword(password || '', u.password_hash))) {
        wrongPassword = true;
        throw new HttpError(400, 'Password is incorrect for this existing account');
      }
    } else {
      need(name && password && String(password).length >= 8, 400, 'Name and an 8+ character password are required');
      ({ rows: [u] } = await c.query(
        'INSERT INTO users(email,name,password_hash) VALUES ($1,$2,$3) RETURNING *',
        [i.email, name, await hashPassword(password)]));
    }
    await c.query(
      `INSERT INTO memberships(user_id,tenant_id,role_id) VALUES ($1,$2,$3)
       ON CONFLICT (user_id,tenant_id) DO UPDATE SET role_id=EXCLUDED.role_id`, [u.id, i.tenant_id, i.role_id]);
    await c.query('UPDATE invites SET accepted_at=now() WHERE id=$1', [i.id]);
    return u;
  }).catch((e) => { if (wrongPassword) signInFailed(req, keys); throw e; });
  limiter.succeed(keys);
  res.json(await authPayload(user));
}));

// ---------- signed in ----------
mountPublicShare(app); // no-login engine pages for engine shop customers
mountPublicCalendar(app); // no-login published team calendars and their iCal feeds
mountPublicShared(app); // no-login pages and iCal feeds for each shared series and track
app.use('/api', requireAuth);

app.get('/api/me', h(async (req, res) => {
  // platform admins: how many shared-calendar requests are waiting for them
  const notices = { ...(req.user.is_platform_admin ? { calendar_requests: await pendingRequests() } : {}), ...(await feedbackNotices(req.user)) };
  res.json({ user: req.user, memberships: await membershipsFor(req.user.id), platform: publicSettings(), notices });
}));

app.patch('/api/me', h(async (req, res) => {
  const { name, current_password, new_password, prefs } = req.body || {};
  if (name) await q('UPDATE users SET name=$1 WHERE id=$2', [name, req.user.id]);
  let saved;
  if (prefs && typeof prefs === 'object') {
    const clean = cleanPrefs(prefs);
    need(JSON.stringify(clean).length < 20000, 400, 'Preferences are too large');
    ({ rows: [saved] } = await q('UPDATE users SET prefs = prefs || $1::jsonb WHERE id=$2 RETURNING prefs', [JSON.stringify(clean), req.user.id]));
  }
  if (new_password) {
    const keys = limiter.keysFor(req, req.user.email);
    guardSignIn(req, res, keys);
    const { rows: [u] } = await q('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!(await checkPassword(current_password || '', u.password_hash))) {
      signInFailed(req, keys);
      throw new HttpError(400, 'Current password is incorrect');
    }
    limiter.succeed(keys);
    need(String(new_password).length >= 8, 400, 'Password must be at least 8 characters');
    await q('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(new_password), req.user.id]);
  }
  res.json({ ok: true, ...(saved ? { prefs: saved.prefs } : {}) });
}));

mountAdmin(app, { createTenant, importTracks, ensureBaseForms, ensureGlobalTracks, UPLOAD_DIR, WEB_DIR });
mountFeedback(app, { UPLOAD_DIR }); // bug reports, requests, roadmap and votes (any signed-in user)

// ---------- tenant scoped ----------
const T = express.Router({ mergeParams: true });
app.use('/api/t/:tid', requireMember, T);
T.use((req, _res, next) => next(req.readOnly && req.method !== 'GET'
  ? new HttpError(403, 'The team licence has expired, so the data is read-only. Contact the platform administrator to renew.') : undefined));

T.patch('/', perm('team.manage'), h(async (req, res) => {
  const { name } = req.body || {};
  let { settings } = req.body || {};
  if (settings && typeof settings === 'object') {
    settings = { ...settings };
    if ('team_type' in settings && !TEAM_TYPES[settings.team_type]) delete settings.team_type;
    if (settings.shop) settings.shop = cleanShop(settings.shop);
    // the public calendar link is only changed through /calendar/publish
    const { rows: [cur] } = await q('SELECT settings FROM tenants WHERE id=$1', [req.tid]);
    if (cur?.settings?.calendar_publish) settings.calendar_publish = cur.settings.calendar_publish; else delete settings.calendar_publish;
  } else settings = null;
  const { rows: [t] } = await q(
    `UPDATE tenants SET name=COALESCE($2,name), settings=COALESCE($3,settings) WHERE id=$1 RETURNING *`,
    [req.tid, name || null, settings ? JSON.stringify(settings) : null]);
  res.json(t);
}));

mountAi(T);
mountWeather(T);
mountSharing(T);
mountCalendar(T);
mountCalendarRequests(T);
mountCalendarPlus(T);
mountJobs(T);

// --- Sync: pull ---
T.get('/sync', h(async (req, res) => {
  const since = Number(req.query.since || 0);
  const types = RECORD_TYPES.filter((t) => canType(req.role, req.ent, t, 'view'));
  const limit = 2000;
  const { rows } = await q(
    `SELECT id, type, data, deleted, client_updated_at, updated_at, created_at, created_by, updated_by, seq::text AS seq,
            (tenant_id IS NULL) AS global
       FROM records WHERE (tenant_id=$1 OR tenant_id IS NULL) AND seq > $2 AND type = ANY($3) ORDER BY records.seq LIMIT ${limit}`,
    [req.tid, since, types]);
  const last = rows.length ? Number(rows[rows.length - 1].seq) : since;
  res.json({ records: rows.map((r) => ({ ...r, seq: Number(r.seq) })), since: last, more: rows.length === limit });
}));

// --- Sync: push (last save wins by client timestamp; every attempt is kept in history) ---
T.post('/sync', h(async (req, res) => {
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
  need(changes.length <= 500, 400, 'Too many changes in one batch');
  const results = [];
  for (const ch of changes) {
    results.push(await tx(async (c) => applyChange(c, req, ch)));
  }
  res.json({ results });
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function applyChange(c, req, ch) {
  const { id, type, data = {}, deleted = false } = ch || {};
  if (!UUID.test(id || '') || !RECORD_TYPES.includes(type)) return { id, status: 'invalid' };
  const ts = new Date(ch.client_updated_at || Date.now());
  const clientTs = isNaN(ts) ? new Date() : ts;
  const { rows: [cur] } = await c.query('SELECT * FROM records WHERE id=$1 FOR UPDATE', [id]);
  const current = (r) => r && { ...r, seq: Number(r.seq), global: r.tenant_id === null };
  const isGlobal = cur ? cur.tenant_id === null : data?.scope === 'global';

  if (cur && cur.type !== type) return { id, status: 'denied' };
  if (cur && !isGlobal && cur.tenant_id !== req.tid) return { id, status: 'denied' };
  const op = !cur ? 'create' : deleted && !cur.deleted ? 'delete' : 'update';
  const action = op === 'delete' ? 'delete' : 'edit';
  const viewable = canType(req.role, req.ent, type, 'view');
  if (isGlobal ? !(GLOBAL_TYPES.includes(type) && req.user.is_platform_admin && viewable) : !canType(req.role, req.ent, type, action)) {
    return { id, status: 'denied', record: viewable ? current(cur) : null };
  }
  const owner = isGlobal ? null : req.tid;

  const history = (outcome) => c.query(
    `INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,user_id,client_updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, owner, type, op, outcome, JSON.stringify({ ...data, _deleted: !!deleted }), req.user.id, clientTs]);

  if (cur && new Date(cur.client_updated_at) > clientTs) {
    await history('superseded');
    return { id, status: 'superseded', record: current(cur) };
  }
  let row;
  if (!cur) {
    ({ rows: [row] } = await c.query(
      `INSERT INTO records(id,tenant_id,type,data,deleted,created_by,updated_by,client_updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7) RETURNING *`,
      [id, owner, type, JSON.stringify(data), !!deleted, req.user.id, clientTs]));
  } else {
    ({ rows: [row] } = await c.query(
      `UPDATE records SET data=$2, deleted=$3, updated_by=$4, client_updated_at=$5, updated_at=now(),
              seq=nextval('record_seq') WHERE id=$1 RETURNING *`,
      [id, JSON.stringify(data), !!deleted, req.user.id, clientTs]));
  }
  await history('applied');
  await onRecordSaved(c, owner, type, cur, row);
  return { id, status: 'applied', record: current(row) };
}

T.get('/records/:id/history', h(async (req, res) => {
  const { rows: [r] } = await q('SELECT type FROM records WHERE id=$1 AND (tenant_id=$2 OR tenant_id IS NULL)', [req.params.id, req.tid]);
  need(r && canType(req.role, req.ent, r.type, 'view'), 404, 'Not found');
  const { rows } = await q(
    `SELECT h.id, h.op, h.outcome, h.data, h.client_updated_at, h.created_at, u.name AS user_name
       FROM record_history h LEFT JOIN users u ON u.id=h.user_id
      WHERE h.record_id=$1 AND (h.tenant_id=$2 OR h.tenant_id IS NULL) ORDER BY h.id DESC LIMIT 200`, [req.params.id, req.tid]);
  res.json(rows);
}));

// --- Members ---
T.get('/members', h(async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.name, u.email, m.role_id, r.name AS role_name, m.created_at
       FROM memberships m JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id
      WHERE m.tenant_id=$1 ORDER BY u.name`, [req.tid]);
  res.json(rows);
}));

async function ownerCount(tid, excludeUser) {
  const { rows } = await q(
    `SELECT count(*)::int AS n FROM memberships m JOIN roles r ON r.id=m.role_id
      WHERE m.tenant_id=$1 AND r.is_owner AND m.user_id<>$2`, [tid, excludeUser]);
  return rows[0].n;
}

T.patch('/members/:uid', perm('members.manage'), h(async (req, res) => {
  const { rows: [role] } = await q('SELECT * FROM roles WHERE id=$1 AND tenant_id=$2', [req.body?.role_id, req.tid]);
  need(role, 400, 'Unknown role');
  if (role.is_owner || (await isOwner(req.tid, req.params.uid))) need(req.role.is_owner, 403, 'Only owners can change owners');
  if (!role.is_owner) need((await ownerCount(req.tid, req.params.uid)) > 0, 400, 'A team needs at least one owner');
  await q('UPDATE memberships SET role_id=$1 WHERE tenant_id=$2 AND user_id=$3', [role.id, req.tid, req.params.uid]);
  res.json({ ok: true });
}));

async function isOwner(tid, uid) {
  const { rows } = await q(
    'SELECT r.is_owner FROM memberships m JOIN roles r ON r.id=m.role_id WHERE m.tenant_id=$1 AND m.user_id=$2', [tid, uid]);
  return !!rows[0]?.is_owner;
}

T.delete('/members/:uid', h(async (req, res) => {
  const self = req.params.uid === req.user.id;
  need(self || can(req.role, 'members.manage'), 403, 'Not permitted');
  if (await isOwner(req.tid, req.params.uid)) {
    need(self || req.role.is_owner, 403, 'Only owners can remove owners');
    need((await ownerCount(req.tid, req.params.uid)) > 0, 400, 'A team needs at least one owner');
  }
  await q('DELETE FROM memberships WHERE tenant_id=$1 AND user_id=$2', [req.tid, req.params.uid]);
  res.json({ ok: true });
}));

// --- Invites ---
T.get('/invites', perm('members.manage'), h(async (req, res) => {
  const { rows } = await q(
    `SELECT i.id, i.email, i.token, i.expires_at, i.accepted_at, r.name AS role_name
       FROM invites i JOIN roles r ON r.id=i.role_id WHERE i.tenant_id=$1 AND i.accepted_at IS NULL
      ORDER BY i.created_at DESC`, [req.tid]);
  res.json(rows);
}));

T.post('/invites', perm('members.manage'), h(async (req, res) => {
  const email = cleanEmail(req.body?.email);
  need(/^\S+@\S+\.\S+$/.test(email), 400, 'Valid email required');
  const { rows: [role] } = await q('SELECT * FROM roles WHERE id=$1 AND tenant_id=$2', [req.body?.role_id, req.tid]);
  need(role, 400, 'Unknown role');
  if (role.is_owner) need(req.role.is_owner, 403, 'Only owners can invite owners');
  const { rows: [t] } = await q(`SELECT t.*, (SELECT count(*)::int FROM memberships m WHERE m.tenant_id=t.id) AS members,
      (SELECT count(*)::int FROM invites i WHERE i.tenant_id=t.id AND i.accepted_at IS NULL AND i.expires_at > now()) AS pending
      FROM tenants t WHERE id=$1`, [req.tid]);
  const limit = seatLimit(t);
  need(limit === null || t.members + t.pending < limit, 409,
    `All ${limit} licensed seats are used (${t.members} members, ${t.pending} pending invites). Remove a member or invite, or ask for more seats.`);
  const days = Math.max(1, Number(settings().general.invite_days) || 14);
  const { rows: [i] } = await q(
    `INSERT INTO invites(tenant_id,email,role_id,token,created_by,expires_at)
     VALUES ($1,$2,$3,$4,$5, now() + make_interval(days => $6)) RETURNING id, email, token, expires_at`,
    [req.tid, email, role.id, randomToken(), req.user.id, days]);
  res.json(i);
}));

T.delete('/invites/:id', perm('members.manage'), h(async (req, res) => {
  await q('DELETE FROM invites WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tid]);
  res.json({ ok: true });
}));

// --- Roles ---
T.get('/roles', h(async (req, res) => {
  const { rows } = await q(
    `SELECT r.*, (SELECT count(*)::int FROM memberships m WHERE m.role_id=r.id) AS members
       FROM roles r WHERE tenant_id=$1 ORDER BY is_owner DESC, name`, [req.tid]);
  res.json(rows);
}));

const cleanPerms = (p) => [...new Set((Array.isArray(p) ? p : []).filter((x) => ALL_PERMISSIONS.includes(x)))];

T.post('/roles', perm('roles.manage'), h(async (req, res) => {
  need(req.body?.name, 400, 'Role name is required');
  const { rows: [r] } = await q(
    'INSERT INTO roles(tenant_id,name,description,permissions) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.tid, req.body.name, req.body.description || '', JSON.stringify(cleanPerms(req.body.permissions))]);
  res.json(r);
}));

T.patch('/roles/:id', perm('roles.manage'), h(async (req, res) => {
  const { rows: [r] } = await q('SELECT * FROM roles WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tid]);
  need(r, 404, 'Role not found');
  need(!r.is_owner, 400, 'The Owner role always has full access');
  const { rows: [u] } = await q(
    `UPDATE roles SET name=COALESCE($2,name), description=COALESCE($3,description), permissions=COALESCE($4,permissions)
      WHERE id=$1 RETURNING *`,
    [r.id, req.body.name || null, req.body.description ?? null,
     req.body.permissions ? JSON.stringify(cleanPerms(req.body.permissions)) : null]);
  res.json(u);
}));

T.delete('/roles/:id', perm('roles.manage'), h(async (req, res) => {
  const { rows: [r] } = await q(
    `SELECT r.*, (SELECT count(*)::int FROM memberships m WHERE m.role_id=r.id) AS members
       FROM roles r WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tid]);
  need(r, 404, 'Role not found');
  need(!r.is_owner, 400, 'The Owner role cannot be deleted');
  need(r.members === 0, 400, 'Move members to another role first');
  await q('DELETE FROM roles WHERE id=$1', [r.id]);
  res.json({ ok: true });
}));

// --- Attachments (online only) ---
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => {
      const dir = path.join(UPLOAD_DIR, req.tid);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, _f, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

async function recordForAttachment(req, recordId, action) {
  const { rows: [r] } = await q('SELECT type, tenant_id FROM records WHERE id=$1 AND (tenant_id=$2 OR tenant_id IS NULL)', [recordId, req.tid]);
  need(r, 404, 'Save the record (and let it sync) before adding attachments');
  need(canType(req.role, req.ent, r.type, action), 403, 'Not permitted');
  return r;
}

T.get('/attachments', h(async (req, res) => {
  await recordForAttachment(req, req.query.record_id, 'view');
  const { rows } = await q(
    `SELECT a.id, a.filename, a.mime, a.size, a.caption, a.created_at, u.name AS uploaded_by
       FROM attachments a LEFT JOIN users u ON u.id=a.uploaded_by
      WHERE a.tenant_id=$1 AND a.record_id=$2 ORDER BY a.created_at DESC`, [req.tid, req.query.record_id]);
  res.json(rows);
}));

T.post('/attachments', upload.single('file'), h(async (req, res) => {
  try {
    need(req.file, 400, 'No file uploaded');
    await recordForAttachment(req, req.body.record_id, 'edit');
  } catch (e) {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    throw e;
  }
  const { rows: [a] } = await q(
    `INSERT INTO attachments(tenant_id,record_id,filename,mime,size,storage_path,caption,uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, filename, mime, size, caption, created_at`,
    [req.tid, req.body.record_id, req.file.originalname, req.file.mimetype, req.file.size,
     path.relative(UPLOAD_DIR, req.file.path), req.body.caption || '', req.user.id]);
  res.json(a);
}));

T.get('/attachments/:id/file', h(async (req, res) => {
  const { rows: [a] } = await q('SELECT * FROM attachments WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tid]);
  need(a, 404, 'Not found');
  await recordForAttachment(req, a.record_id, 'view');
  const inline = /^image\/|^application\/pdf$/.test(a.mime) && req.query.download === undefined;
  res.setHeader('Content-Type', a.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  res.sendFile(path.join(UPLOAD_DIR, a.storage_path));
}));

T.delete('/attachments/:id', h(async (req, res) => {
  const { rows: [a] } = await q('SELECT * FROM attachments WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tid]);
  need(a, 404, 'Not found');
  await recordForAttachment(req, a.record_id, 'edit');
  await q('DELETE FROM attachments WHERE id=$1', [a.id]);
  fs.rmSync(path.join(UPLOAD_DIR, a.storage_path), { force: true });
  res.json({ ok: true });
}));

// ---------- errors & static web app ----------
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (!(err instanceof HttpError)) console.error(err);
  // our own errors (e.g. "The AI service took too long") say what went wrong; anything else stays generic
  res.status(status).json({ error: err instanceof HttpError || status < 500 ? err.message : 'Server error' });
});

if (fs.existsSync(WEB_DIR)) {
  app.use(express.static(WEB_DIR, {
    setHeaders: (res, p) => {
      if (p.endsWith('sw.js') || p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));
}

await migrate();
await convertLegacySuggestions().catch((e) => console.error('Calendar suggestions not moved:', e.message));
startFeedChecks(fetchCalendar);
await loadSettings();
await ensureBaseForms();
await ensureGlobalTracks();
await ensureGlobalGuides();
app.listen(PORT, () => console.log(`RaceOps listening on :${PORT}`));
