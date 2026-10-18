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
import { DEFAULT_ROLES, ALL_PERMISSIONS, RECORD_TYPES, PLANS, FEATURES, canType, can } from '../../shared/catalog.js';
import { BASE_FORMS } from '../../shared/baseForms.js';
import { FORM_REPLACE, applyUpgrades } from '../../shared/baseForms2.js';
import { SEED_GEAR_LISTS } from '../../shared/gearLists.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const WEB_DIR = process.env.WEB_DIR || path.join(__dirname, '..', '..', 'web', 'dist');
const PORT = Number(process.env.PORT || 8080);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '10mb' }));

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const perm = (p) => (req, _res, next) => next(can(req.role, p) ? undefined : new HttpError(403, 'Not permitted'));
const cleanEmail = (e) => String(e || '').trim().toLowerCase();

// ---------- helpers ----------
async function membershipsFor(userId) {
  const { rows } = await q(
    `SELECT t.id AS tenant_id, t.name AS tenant_name, t.racing_type, t.settings, t.plan, t.features,
            json_build_object('id', r.id, 'name', r.name, 'permissions', r.permissions, 'is_owner', r.is_owner) AS role
       FROM memberships m JOIN tenants t ON t.id=m.tenant_id JOIN roles r ON r.id=m.role_id
      WHERE m.user_id=$1 ORDER BY t.name`, [userId]);
  return rows;
}

async function createTenant(c, name, ownerId) {
  const { rows: [t] } = await c.query('INSERT INTO tenants(name) VALUES ($1) RETURNING *', [name]);
  let ownerRole;
  for (const r of DEFAULT_ROLES) {
    const { rows: [role] } = await c.query(
      'INSERT INTO roles(tenant_id,name,description,permissions,is_owner) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [t.id, r.name, r.description, JSON.stringify(r.permissions), !!r.is_owner]);
    if (r.is_owner) ownerRole = role;
  }
  await c.query('INSERT INTO memberships(user_id,tenant_id,role_id) VALUES ($1,$2,$3)', [ownerId, t.id, ownerRole.id]);
  await ensureTeamBase(c, t.id);
  return t;
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

async function ensureBaseForms() {
  const { rows: tenants } = await q('SELECT id FROM tenants');
  for (const { id } of tenants) await tx((c) => ensureTeamBase(c, id));
}

const authPayload = async (user) => ({
  token: signToken(user),
  user: { id: user.id, email: user.email, name: user.name, is_platform_admin: user.is_platform_admin },
  memberships: await membershipsFor(user.id),
});

// ---------- public ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

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
  const { rows: [u] } = await q('SELECT * FROM users WHERE email=$1', [cleanEmail(email)]);
  need(u && (await checkPassword(password || '', u.password_hash)), 401, 'Email or password is incorrect');
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
  const user = await tx(async (c) => {
    const { rows: [i] } = await c.query('SELECT * FROM invites WHERE token=$1 FOR UPDATE', [req.params.token]);
    need(i && !i.accepted_at && new Date(i.expires_at) > new Date(), 410, 'Invite is no longer valid');
    let { rows: [u] } = await c.query('SELECT * FROM users WHERE email=$1', [i.email]);
    if (u) {
      need(await checkPassword(password || '', u.password_hash), 401, 'Password is incorrect for this existing account');
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
  });
  res.json(await authPayload(user));
}));

// ---------- signed in ----------
app.use('/api', requireAuth);

app.get('/api/me', h(async (req, res) => {
  res.json({ user: req.user, memberships: await membershipsFor(req.user.id) });
}));

app.patch('/api/me', h(async (req, res) => {
  const { name, current_password, new_password } = req.body || {};
  if (name) await q('UPDATE users SET name=$1 WHERE id=$2', [name, req.user.id]);
  if (new_password) {
    const { rows: [u] } = await q('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    need(await checkPassword(current_password || '', u.password_hash), 400, 'Current password is incorrect');
    need(String(new_password).length >= 8, 400, 'Password must be at least 8 characters');
    await q('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(new_password), req.user.id]);
  }
  res.json({ ok: true });
}));

// Platform admin: create and list teams (invite-only onboarding for now).
app.get('/api/admin/tenants', h(async (req, res) => {
  need(req.user.is_platform_admin, 403, 'Platform admin only');
  const { rows } = await q(`SELECT t.*, (SELECT count(*)::int FROM memberships m WHERE m.tenant_id=t.id) AS members
                              FROM tenants t ORDER BY t.created_at`);
  res.json(rows);
}));

app.patch('/api/admin/tenants/:id', h(async (req, res) => {
  need(req.user.is_platform_admin, 403, 'Platform admin only');
  const { plan, features } = req.body || {};
  need(!plan || PLANS[plan], 400, 'Unknown plan');
  const clean = features && Object.fromEntries(Object.entries(features)
    .filter(([k, v]) => FEATURES.some((f) => f.key === k) && typeof v === 'boolean'));
  const { rows: [t] } = await q(
    'UPDATE tenants SET plan=COALESCE($2,plan), features=COALESCE($3,features) WHERE id=$1 RETURNING *',
    [req.params.id, plan || null, clean ? JSON.stringify(clean) : null]);
  need(t, 404, 'Team not found');
  res.json(t);
}));

app.post('/api/admin/tenants', h(async (req, res) => {
  need(req.user.is_platform_admin, 403, 'Platform admin only');
  need(req.body?.name, 400, 'Team name is required');
  const t = await tx((c) => createTenant(c, req.body.name, req.user.id));
  res.json(t);
}));

// ---------- tenant scoped ----------
const T = express.Router({ mergeParams: true });
app.use('/api/t/:tid', requireMember, T);

T.patch('/', perm('team.manage'), h(async (req, res) => {
  const { name, settings } = req.body || {};
  const { rows: [t] } = await q(
    `UPDATE tenants SET name=COALESCE($2,name), settings=COALESCE($3,settings) WHERE id=$1 RETURNING *`,
    [req.tid, name || null, settings ? JSON.stringify(settings) : null]);
  res.json(t);
}));

// --- Sync: pull ---
T.get('/sync', h(async (req, res) => {
  const since = Number(req.query.since || 0);
  const types = RECORD_TYPES.filter((t) => canType(req.role, req.ent, t, 'view'));
  const limit = 2000;
  const { rows } = await q(
    `SELECT id, type, data, deleted, client_updated_at, updated_at, created_at, created_by, updated_by, seq::text AS seq
       FROM records WHERE tenant_id=$1 AND seq > $2 AND type = ANY($3) ORDER BY seq LIMIT ${limit}`,
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
  const current = (r) => r && { ...r, seq: Number(r.seq) };

  if (cur && (cur.tenant_id !== req.tid || cur.type !== type)) return { id, status: 'denied' };
  const op = !cur ? 'create' : deleted && !cur.deleted ? 'delete' : 'update';
  const action = op === 'delete' ? 'delete' : 'edit';
  if (!canType(req.role, req.ent, type, action)) return { id, status: 'denied', record: canType(req.role, req.ent, type, 'view') ? current(cur) : null };

  const history = (outcome) => c.query(
    `INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,user_id,client_updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, req.tid, type, op, outcome, JSON.stringify({ ...data, _deleted: !!deleted }), req.user.id, clientTs]);

  if (cur && new Date(cur.client_updated_at) > clientTs) {
    await history('superseded');
    return { id, status: 'superseded', record: current(cur) };
  }
  let row;
  if (!cur) {
    ({ rows: [row] } = await c.query(
      `INSERT INTO records(id,tenant_id,type,data,deleted,created_by,updated_by,client_updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7) RETURNING *`,
      [id, req.tid, type, JSON.stringify(data), !!deleted, req.user.id, clientTs]));
  } else {
    ({ rows: [row] } = await c.query(
      `UPDATE records SET data=$2, deleted=$3, updated_by=$4, client_updated_at=$5, updated_at=now(),
              seq=nextval('record_seq') WHERE id=$1 RETURNING *`,
      [id, JSON.stringify(data), !!deleted, req.user.id, clientTs]));
  }
  await history('applied');
  return { id, status: 'applied', record: current(row) };
}

T.get('/records/:id/history', h(async (req, res) => {
  const { rows: [r] } = await q('SELECT type FROM records WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tid]);
  need(r && canType(req.role, req.ent, r.type, 'view'), 404, 'Not found');
  const { rows } = await q(
    `SELECT h.id, h.op, h.outcome, h.data, h.client_updated_at, h.created_at, u.name AS user_name
       FROM record_history h LEFT JOIN users u ON u.id=h.user_id
      WHERE h.record_id=$1 AND h.tenant_id=$2 ORDER BY h.id DESC LIMIT 200`, [req.params.id, req.tid]);
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
  const { rows: [i] } = await q(
    `INSERT INTO invites(tenant_id,email,role_id,token,created_by,expires_at)
     VALUES ($1,$2,$3,$4,$5, now() + interval '14 days') RETURNING id, email, token, expires_at`,
    [req.tid, email, role.id, randomToken(), req.user.id]);
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
  const { rows: [r] } = await q('SELECT type FROM records WHERE id=$1 AND tenant_id=$2', [recordId, req.tid]);
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
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
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
await ensureBaseForms();
app.listen(PORT, () => console.log(`RaceOps listening on :${PORT}`));
