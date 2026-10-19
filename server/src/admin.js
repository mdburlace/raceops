// Global (platform) administration: licences, plans, users, shared directory, pick-lists and system settings.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { q, tx } from './db.js';
import { HttpError, hashPassword, randomToken } from './auth.js';
import { FEATURES } from '../../shared/catalog.js';
import { LISTS, DEFAULT_GENERAL, ANNOUNCE_LEVELS, TEAM_STATUS, licenceState, mergePlans } from '../../shared/platform.js';
import { settings, saveSetting, audit, seatLimit } from './settings.js';
import * as limiter from './ratelimit.js';
import { mountAiAdmin } from './ai.js';
import { TEAM_TYPES } from '../../shared/shop.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const cleanEmail = (e) => String(e || '').trim().toLowerCase();
const VERSION = (() => { try { return createRequire(import.meta.url)('../package.json').version; } catch { return 'dev'; } })();
const started = new Date();

const dirSize = (dir) => {
  let bytes = 0, files = 0;
  if (!fs.existsSync(dir)) return { bytes, files };
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const s = dirSize(p); bytes += s.bytes; files += s.files; } else { bytes += fs.statSync(p).size; files++; }
  }
  return { bytes, files };
};

const intOrNull = (x) => (x === null || x === undefined || x === '' ? null : Math.max(0, Math.round(Number(x))));
const dateOrNull = (x) => (x ? String(x).slice(0, 10) : null);

export function mountAdmin(app, { createTenant, importTracks, ensureBaseForms, ensureGlobalTracks, UPLOAD_DIR }) {
  const A = express.Router();
  app.use('/api/admin', A);
  A.use((req, _res, next) => next(req.user?.is_platform_admin ? undefined : new HttpError(403, 'Platform admin only')));

  // ---------- teams & licences ----------
  const TEAMS_SQL = `
    SELECT t.*,
      (SELECT count(*)::int FROM memberships m WHERE m.tenant_id=t.id) AS members,
      (SELECT count(*)::int FROM invites i WHERE i.tenant_id=t.id AND i.accepted_at IS NULL AND i.expires_at > now()) AS pending_invites,
      (SELECT count(*)::int FROM records r WHERE r.tenant_id=t.id AND NOT r.deleted AND r.type <> 'form') AS records,
      (SELECT max(r.updated_at) FROM records r WHERE r.tenant_id=t.id AND r.type <> 'form') AS last_activity,
      (SELECT coalesce(json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email) ORDER BY u.name), '[]'::json)
         FROM memberships m JOIN roles r ON r.id=m.role_id JOIN users u ON u.id=m.user_id WHERE m.tenant_id=t.id AND r.is_owner) AS owners,
      EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id=t.id AND m.user_id=$1) AS is_member
    FROM tenants t`;
  const decorate = (t) => ({ ...t, seat_limit: seatLimit(t), licence: licenceState(t), plan_label: settings().plans[t.plan]?.label || t.plan });

  A.get('/tenants', h(async (req, res) => {
    const { rows } = await q(`${TEAMS_SQL} ORDER BY t.name`, [req.user.id]);
    res.json(rows.map(decorate));
  }));

  A.post('/tenants', h(async (req, res) => {
    const b = req.body || {};
    need(String(b.name || '').trim(), 400, 'Team name is required');
    const owner = cleanEmail(b.owner_email);
    need(!owner || /^\S+@\S+\.\S+$/.test(owner), 400, 'Owner email is not valid');
    need(!b.plan || settings().plans[b.plan], 400, 'Unknown plan');
    const join = b.join !== false || !owner;
    const out = await tx(async (c) => {
      const t = await createTenant(c, String(b.name).trim(), join ? req.user.id : null, {
        plan: b.plan, seats: intOrNull(b.seats), licence_expires: dateOrNull(b.licence_expires), status: TEAM_STATUS[b.status] ? b.status : 'active',
        team_type: b.team_type,
      });
      let invite = null;
      if (owner) {
        const days = Math.max(1, Number(settings().general.invite_days) || 14);
        ({ rows: [invite] } = await c.query(
          `INSERT INTO invites(tenant_id,email,role_id,token,created_by,expires_at)
           VALUES ($1,$2,$3,$4,$5, now() + make_interval(days => $6)) RETURNING id, email, token, expires_at`,
          [t.id, owner, t.owner_role_id, randomToken(), req.user.id, days]));
      }
      return { ...t, invite };
    });
    await audit(req.user.id, 'team.create', out.name, { id: out.id, plan: out.plan, owner_email: owner || null });
    res.json(out);
  }));

  A.patch('/tenants/:id', h(async (req, res) => {
    const b = req.body || {};
    const { rows: [cur] } = await q('SELECT * FROM tenants WHERE id=$1', [req.params.id]);
    need(cur, 404, 'Team not found');
    need(!b.plan || settings().plans[b.plan], 400, 'Unknown plan');
    need(!b.status || TEAM_STATUS[b.status], 400, 'Unknown status');
    const features = b.features && Object.fromEntries(Object.entries(b.features)
      .filter(([k, v]) => FEATURES.some((f) => f.key === k) && typeof v === 'boolean'));
    const next = {
      name: b.name !== undefined ? String(b.name).trim() || cur.name : cur.name,
      plan: b.plan || cur.plan,
      features: features || cur.features,
      status: b.status || cur.status,
      seats: 'seats' in b ? intOrNull(b.seats) : cur.seats,
      licence_expires: 'licence_expires' in b ? dateOrNull(b.licence_expires) : cur.licence_expires,
      admin_notes: b.admin_notes !== undefined ? String(b.admin_notes) : cur.admin_notes,
      ai_budget_usd: 'ai_budget_usd' in b ? (b.ai_budget_usd === null || b.ai_budget_usd === '' ? null : Math.max(0, Number(b.ai_budget_usd) || 0)) : (cur.ai_budget_usd === null ? null : Number(cur.ai_budget_usd)),
    };
    if (b.team_type !== undefined) need(TEAM_TYPES[b.team_type], 400, 'Unknown team type');
    next.team_type = b.team_type || cur.settings?.team_type || 'race';
    const { rows: [t] } = await q(
      `UPDATE tenants SET name=$2, plan=$3, features=$4, status=$5, seats=$6, licence_expires=$7, admin_notes=$8, ai_budget_usd=$9,
              settings = COALESCE(settings,'{}'::jsonb) || jsonb_build_object('team_type', $10::text) WHERE id=$1 RETURNING *`,
      [cur.id, next.name, next.plan, JSON.stringify(next.features), next.status, next.seats, next.licence_expires, next.admin_notes, next.ai_budget_usd, next.team_type]);
    cur.team_type = cur.settings?.team_type || 'race';
    const changed = Object.fromEntries(Object.keys(next).filter((k) => JSON.stringify(cur[k] instanceof Date ? cur[k].toISOString().slice(0, 10) : cur[k]) !== JSON.stringify(next[k]))
      .map((k) => [k, next[k]]));
    if (Object.keys(changed).length) await audit(req.user.id, 'team.update', t.name, { id: t.id, ...changed });
    res.json(decorate(t));
  }));

  // Add yourself to a team as an owner (support access); removable from the team's member list.
  A.post('/tenants/:id/join', h(async (req, res) => {
    const { rows: [role] } = await q('SELECT id FROM roles WHERE tenant_id=$1 AND is_owner LIMIT 1', [req.params.id]);
    need(role, 404, 'Team not found');
    await q(`INSERT INTO memberships(user_id,tenant_id,role_id) VALUES ($1,$2,$3) ON CONFLICT (user_id,tenant_id) DO NOTHING`, [req.user.id, req.params.id, role.id]);
    const { rows: [t] } = await q('SELECT name FROM tenants WHERE id=$1', [req.params.id]);
    await audit(req.user.id, 'team.join', t.name, { id: req.params.id });
    res.json({ ok: true });
  }));

  A.delete('/tenants/:id', h(async (req, res) => {
    const { rows: [t] } = await q('SELECT * FROM tenants WHERE id=$1', [req.params.id]);
    need(t, 404, 'Team not found');
    need(String(req.body?.confirm || '').trim() === t.name, 400, 'Type the team name exactly to confirm');
    await tx(async (c) => {
      await c.query('DELETE FROM attachments WHERE tenant_id=$1', [t.id]);
      await c.query('DELETE FROM records WHERE tenant_id=$1', [t.id]);
      await c.query('DELETE FROM record_history WHERE tenant_id=$1', [t.id]);
      await c.query('DELETE FROM invites WHERE tenant_id=$1', [t.id]);
      await c.query('DELETE FROM memberships WHERE tenant_id=$1', [t.id]);
      await c.query('DELETE FROM roles WHERE tenant_id=$1', [t.id]);
      await c.query('DELETE FROM tenants WHERE id=$1', [t.id]);
    });
    fs.rmSync(path.join(UPLOAD_DIR, t.id), { recursive: true, force: true });
    await audit(req.user.id, 'team.delete', t.name, { id: t.id });
    res.json({ ok: true });
  }));

  // ---------- plans (licence allocation) ----------
  async function planUsage() {
    const { rows } = await q(`SELECT t.plan, t.seats, t.status, t.licence_expires,
        (SELECT count(*)::int FROM memberships m WHERE m.tenant_id=t.id) AS members FROM tenants t`);
    const out = {};
    for (const [k] of Object.entries(settings().plans)) out[k] = { teams: 0, active: 0, members: 0, seats: 0, unlimited: 0 };
    for (const t of rows) {
      const u = out[t.plan] || (out[t.plan] = { teams: 0, active: 0, members: 0, seats: 0, unlimited: 0, unknown: true });
      u.teams++; u.members += t.members;
      if (['active', 'trial'].includes(licenceState(t))) u.active++;
      const lim = seatLimit(t);
      if (lim === null) u.unlimited++; else u.seats += lim;
    }
    return out;
  }

  A.get('/plans', h(async (_req, res) => {
    res.json({ plans: settings().plans, usage: await planUsage(), features: FEATURES });
  }));

  A.put('/plans/:key', h(async (req, res) => {
    const key = String(req.params.key).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
    need(key, 400, 'Plan key is required');
    const b = req.body || {};
    need(String(b.label || '').trim(), 400, 'Plan name is required');
    const plan = {
      label: String(b.label).trim(),
      features: [...new Set((b.features || []).filter((f) => FEATURES.some((x) => x.key === f)))],
      seats: intOrNull(b.seats), pool: intOrNull(b.pool), price: String(b.price || '').slice(0, 120),
      share_limit: intOrNull(b.share_limit),
    };
    const stored = { ...settings().storedPlans, [key]: plan };
    await saveSetting('plans', stored, req.user.id);
    await audit(req.user.id, settings().storedPlans[key] || settings().plans[key]?.builtin ? 'plan.update' : 'plan.create', plan.label, { key, ...plan });
    res.json({ plans: settings().plans, usage: await planUsage() });
  }));

  A.delete('/plans/:key', h(async (req, res) => {
    const key = req.params.key;
    const p = settings().plans[key];
    need(p, 404, 'Plan not found');
    const { rows: [n] } = await q('SELECT count(*)::int AS n FROM tenants WHERE plan=$1', [key]);
    need(n.n === 0, 400, `${n.n} team(s) are on this plan. Move them to another plan first.`);
    need(settings().general.default_plan !== key, 400, 'This is the default plan for new teams. Choose another default first.');
    const stored = { ...settings().storedPlans };
    if (p.builtin) stored[key] = { ...p, deleted: true }; else delete stored[key];
    await saveSetting('plans', stored, req.user.id);
    await audit(req.user.id, 'plan.delete', p.label, { key });
    res.json({ plans: settings().plans, usage: await planUsage() });
  }));

  // Restore a built-in plan's shipped definition.
  A.post('/plans/:key/reset', h(async (req, res) => {
    const stored = { ...settings().storedPlans };
    delete stored[req.params.key];
    need(mergePlans({})[req.params.key], 404, 'Not a built-in plan');
    await saveSetting('plans', stored, req.user.id);
    await audit(req.user.id, 'plan.reset', req.params.key);
    res.json({ plans: settings().plans, usage: await planUsage() });
  }));

  // ---------- users ----------
  A.get('/users', h(async (_req, res) => {
    const { rows } = await q(`
      SELECT u.id, u.email, u.name, u.is_platform_admin, u.disabled, u.created_at, u.last_login_at,
        coalesce((SELECT json_agg(json_build_object('tenant_id', t.id, 'tenant_name', t.name, 'role', r.name, 'is_owner', r.is_owner) ORDER BY t.name)
          FROM memberships m JOIN tenants t ON t.id=m.tenant_id JOIN roles r ON r.id=m.role_id WHERE m.user_id=u.id), '[]'::json) AS teams
      FROM users u ORDER BY u.name`);
    const locks = new Map(limiter.list().filter((l) => l.type === 'account').map((l) => [l.value, l]));
    res.json(rows.map((u) => ({ ...u, signin: locks.get(u.email) || null })));
  }));

  A.patch('/users/:id', h(async (req, res) => {
    const b = req.body || {};
    const { rows: [u] } = await q('SELECT * FROM users WHERE id=$1', [req.params.id]);
    need(u, 404, 'User not found');
    const self = u.id === req.user.id;
    if ('is_platform_admin' in b || 'disabled' in b) need(!self, 400, 'You can’t change your own admin access or disable yourself');
    if (b.is_platform_admin === false || b.disabled === true) {
      const { rows: [n] } = await q('SELECT count(*)::int AS n FROM users WHERE is_platform_admin AND NOT disabled AND id<>$1', [u.id]);
      need(!u.is_platform_admin || n.n > 0, 400, 'At least one active platform admin is required');
    }
    const email = b.email !== undefined ? cleanEmail(b.email) : u.email;
    need(/^\S+@\S+\.\S+$/.test(email), 400, 'Valid email required');
    if (email !== u.email) {
      const { rows: clash } = await q('SELECT 1 FROM users WHERE email=$1 AND id<>$2', [email, u.id]);
      need(!clash.length, 409, 'Another account already uses that email');
    }
    const { rows: [r] } = await q(
      `UPDATE users SET name=$2, email=$3, is_platform_admin=$4, disabled=$5 WHERE id=$1
       RETURNING id, email, name, is_platform_admin, disabled, created_at, last_login_at`,
      [u.id, b.name !== undefined ? String(b.name).trim() || u.name : u.name, email,
        typeof b.is_platform_admin === 'boolean' ? b.is_platform_admin : u.is_platform_admin,
        typeof b.disabled === 'boolean' ? b.disabled : u.disabled]);
    if (u.disabled && !r.disabled) limiter.clear(`acct:${r.email}`); // re-enabled: start with a clean slate
    const changed = ['name', 'email', 'is_platform_admin', 'disabled'].filter((k) => u[k] !== r[k]);
    if (changed.length) await audit(req.user.id, 'user.update', r.email, Object.fromEntries(changed.map((k) => [k, r[k]])));
    res.json(r);
  }));

  // Sets a temporary password, shown once to the admin to pass on.
  A.post('/users/:id/reset-password', h(async (req, res) => {
    const { rows: [u] } = await q('SELECT id, email FROM users WHERE id=$1', [req.params.id]);
    need(u, 404, 'User not found');
    const temp = crypto.randomBytes(9).toString('base64url');
    await q('UPDATE users SET password_hash=$2 WHERE id=$1', [u.id, await hashPassword(temp)]);
    limiter.clear(`acct:${u.email}`);
    await audit(req.user.id, 'user.reset_password', u.email);
    res.json({ password: temp });
  }));

  A.delete('/users/:id/memberships/:tid', h(async (req, res) => {
    const { rows: [m] } = await q(`SELECT r.is_owner, t.name FROM memberships m JOIN roles r ON r.id=m.role_id JOIN tenants t ON t.id=m.tenant_id
                                   WHERE m.user_id=$1 AND m.tenant_id=$2`, [req.params.id, req.params.tid]);
    need(m, 404, 'Not a member');
    if (m.is_owner) {
      const { rows: [n] } = await q(`SELECT count(*)::int AS n FROM memberships m JOIN roles r ON r.id=m.role_id
                                     WHERE m.tenant_id=$1 AND r.is_owner AND m.user_id<>$2`, [req.params.tid, req.params.id]);
      need(n.n > 0, 400, 'This is the team’s only owner');
    }
    await q('DELETE FROM memberships WHERE user_id=$1 AND tenant_id=$2', [req.params.id, req.params.tid]);
    const { rows: [u] } = await q('SELECT email FROM users WHERE id=$1', [req.params.id]);
    await audit(req.user.id, 'user.remove_from_team', u?.email, { team: m.name });
    res.json({ ok: true });
  }));

  mountAiAdmin(A);

  // ---------- sign-in lockouts ----------
  A.get('/lockouts', h(async (_req, res) => {
    res.json({ limits: { ...limiter.LIMITS, windowMinutes: limiter.LIMITS.windowMs / 60000, lockMinutes: limiter.LIMITS.lockMs / 60000 }, entries: limiter.list() });
  }));

  A.delete('/lockouts', h(async (req, res) => {
    const key = String(req.body?.key || '');
    need(/^(acct|ip):/.test(key), 400, 'Unknown lockout');
    limiter.clear(key);
    await audit(req.user.id, 'auth.unlock', key.slice(key.indexOf(':') + 1), { type: key.startsWith('ip:') ? 'address' : 'account' });
    res.json({ entries: limiter.list() });
  }));

  // ---------- shared directory ----------
  A.get('/directory', h(async (_req, res) => {
    const { rows: counts } = await q(`SELECT type, count(*)::int AS n FROM records WHERE tenant_id IS NULL AND NOT deleted GROUP BY type`);
    const { rows: countries } = await q(`SELECT coalesce(nullif(data->'values'->>'country',''),'(none)') AS country,
        coalesce(nullif(data->'values'->>'status',''),'Active') AS status, count(*)::int AS n
      FROM records WHERE tenant_id IS NULL AND type='track' AND NOT deleted GROUP BY 1,2 ORDER BY 1,2`);
    const { rows: [gaps] } = await q(`SELECT
        count(*) FILTER (WHERE coalesce(data->'values'->>'lat','')='')::int AS no_location,
        count(*) FILTER (WHERE jsonb_array_length(coalesce(data->'values'->'classes','[]'::jsonb))=0)::int AS no_classes,
        count(*) FILTER (WHERE coalesce(data->'values'->>'length','')='')::int AS no_size,
        count(*) FILTER (WHERE coalesce(data->'values'->>'surface','')='')::int AS no_surface
      FROM records WHERE tenant_id IS NULL AND type='track' AND NOT deleted`);
    const { rows: [linked] } = await q(`SELECT count(DISTINCT data->'values'->>'track')::int AS n FROM records WHERE type='team_track' AND NOT deleted`);
    res.json({ counts: Object.fromEntries(counts.map((c) => [c.type, c.n])), countries, gaps, linked_tracks: linked.n });
  }));

  A.get('/tracks/export', h(async (_req, res) => {
    const { rows } = await q(`SELECT data->'values' AS v FROM records WHERE tenant_id IS NULL AND type='track' AND NOT deleted ORDER BY data->'values'->>'country', data->'values'->>'name'`);
    res.setHeader('Content-Disposition', `attachment; filename="raceops-tracks-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ exported: new Date().toISOString(), tracks: rows.map((r) => r.v) });
  }));

  A.post('/tracks/import', h(async (req, res) => {
    const list = Array.isArray(req.body?.tracks) ? req.body.tracks : [];
    const mode = ['add', 'fill', 'overwrite'].includes(req.body?.mode) ? req.body.mode : 'fill';
    need(list.length && list.length <= 5000, 400, 'No tracks found in the file');
    const { mapImportedTrack } = await import('../../shared/tracks.js');
    const result = await importTracks(list.map(mapImportedTrack).filter(Boolean), mode, req.user.id);
    await audit(req.user.id, 'tracks.import', `${list.length} tracks`, { mode, ...result });
    res.json(result);
  }));

  A.post('/tracks/reseed', h(async (req, res) => {
    const r = await ensureGlobalTracks(true);
    await audit(req.user.id, 'tracks.reseed', 'bundled list', r || {});
    res.json(r || { added: 0, updated: 0, skipped: 0 });
  }));

  // ---------- global settings & pick-lists ----------
  A.get('/settings', h(async (_req, res) => {
    const s = settings();
    res.json({ general: s.general, lists: s.lists, custom_lists: Object.keys(s.customLists), list_defs: LISTS.map(({ key, label, help, fields, default: d }) => ({ key, label, help, fields, default: d })) });
  }));

  A.put('/settings/general', h(async (req, res) => {
    const b = req.body || {};
    const cur = settings().general;
    need(!b.default_plan || settings().plans[b.default_plan], 400, 'Unknown plan');
    const a = b.announcement || cur.announcement;
    const general = {
      app_name: String(b.app_name ?? cur.app_name).trim().slice(0, 40) || DEFAULT_GENERAL.app_name,
      default_plan: b.default_plan || cur.default_plan,
      default_seats: 'default_seats' in b ? intOrNull(b.default_seats) : cur.default_seats,
      invite_days: Math.min(90, Math.max(1, Number(b.invite_days ?? cur.invite_days) || 14)),
      support_email: String(b.support_email ?? cur.support_email).trim().slice(0, 120),
      announcement: { text: String(a.text || '').slice(0, 500), level: ANNOUNCE_LEVELS[a.level] ? a.level : 'info', until: dateOrNull(a.until) },
    };
    await saveSetting('general', general, req.user.id);
    await audit(req.user.id, 'settings.general', null, general);
    res.json(settings().general);
  }));

  A.put('/settings/lists/:key', h(async (req, res) => {
    const def = LISTS.find((l) => l.key === req.params.key);
    need(def, 404, 'Unknown list');
    const lists = { ...settings().customLists };
    if (req.body?.reset) delete lists[def.key];
    else {
      const items = [...new Set((req.body?.items || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 300);
      need(items.length, 400, 'A list needs at least one item');
      lists[def.key] = items;
    }
    await saveSetting('lists', lists, req.user.id);
    await audit(req.user.id, req.body?.reset ? 'list.reset' : 'list.update', def.label, { count: settings().lists[def.key].length });
    res.json({ key: def.key, items: settings().lists[def.key], custom: def.key in lists });
  }));

  // ---------- overview, activity and system ----------
  A.get('/overview', h(async (req, res) => {
    const { rows: teams } = await q(`${TEAMS_SQL} ORDER BY t.created_at DESC`, [req.user.id]);
    const { rows: [users] } = await q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE is_platform_admin)::int AS admins,
        count(*) FILTER (WHERE disabled)::int AS disabled, count(*) FILTER (WHERE last_login_at > now() - interval '30 days')::int AS active_30d FROM users`);
    const { rows: [dir] } = await q(`SELECT count(*) FILTER (WHERE type='track')::int AS tracks, count(*) FILTER (WHERE type='contact')::int AS contacts,
        count(*) FILTER (WHERE type='supplier')::int AS suppliers FROM records WHERE tenant_id IS NULL AND NOT deleted`);
    const { rows: activity } = await q(`SELECT a.*, u.name AS user_name FROM admin_audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.at DESC LIMIT 12`);
    const dec = teams.map(decorate);
    const soon = new Date(Date.now() + 30 * 864e5);
    res.json({
      teams: { total: dec.length, by_state: dec.reduce((m, t) => ({ ...m, [t.licence]: (m[t.licence] || 0) + 1 }), {}) },
      users, directory: dir, plans: settings().plans, usage: await planUsage(),
      attention: dec.filter((t) => t.licence === 'expired' || t.licence === 'suspended'
        || (t.licence_expires && new Date(t.licence_expires) <= soon) || (t.seat_limit !== null && t.members >= t.seat_limit))
        .map((t) => ({ id: t.id, name: t.name, licence: t.licence, licence_expires: t.licence_expires, members: t.members, seat_limit: t.seat_limit })),
      recent_teams: dec.slice(0, 5).map((t) => ({ id: t.id, name: t.name, plan_label: t.plan_label, created_at: t.created_at, members: t.members })),
      activity,
      announcement: settings().general.announcement,
    });
  }));

  A.get('/audit', h(async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const { rows } = await q(`SELECT a.*, u.name AS user_name FROM admin_audit a LEFT JOIN users u ON u.id=a.user_id
      WHERE ($1::text IS NULL OR a.action LIKE $1 || '%') ORDER BY a.at DESC LIMIT $2`, [req.query.action || null, limit]);
    res.json(rows);
  }));

  A.get('/system', h(async (_req, res) => {
    const { rows: [db] } = await q('SELECT pg_size_pretty(pg_database_size(current_database())) AS size, version() AS version');
    const { rows: migrations } = await q(`SELECT name, applied_at FROM schema_migrations WHERE name LIKE '%.sql' ORDER BY name`);
    const { rows: types } = await q(`SELECT type, count(*) FILTER (WHERE tenant_id IS NULL)::int AS global, count(*) FILTER (WHERE tenant_id IS NOT NULL)::int AS team
      FROM records WHERE NOT deleted GROUP BY type ORDER BY type`);
    const { rows: [att] } = await q('SELECT count(*)::int AS n, coalesce(sum(size),0)::bigint AS bytes FROM attachments');
    res.json({
      version: VERSION, node: process.version, started, uptime_s: Math.round(process.uptime()),
      database: { size: db.size, version: db.version.split(' ').slice(0, 2).join(' ') },
      migrations, record_types: types,
      uploads: { ...dirSize(UPLOAD_DIR), attachments: att.n, attachment_bytes: Number(att.bytes) },
      env: { max_upload_mb: Number(process.env.MAX_UPLOAD_MB || 25), jwt_ttl: process.env.JWT_TTL || '60d', node_env: process.env.NODE_ENV || 'development' },
    });
  }));

  A.post('/system/upgrade-forms', h(async (req, res) => {
    await ensureBaseForms();
    await audit(req.user.id, 'system.upgrade_forms', null);
    res.json({ ok: true });
  }));
}
