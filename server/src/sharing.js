// Customer access for engine shops (Option 2):
//  - a no-login link per engine that shows the owner its build history, specs and jobs;
//  - a link between the shop's engine and the owner's RaceOps team: the team sees the build
//    history read-only, and only the engine's laps / session count flow back to the shop;
//  - ending a link leaves each side its own records, and the team keeps a frozen copy;
//  - changing the engine's owner turns off its share link and ends its team links.
// Free to use; the shop's plan can cap how many engines are shared at once (plan.share_limit).
import crypto from 'node:crypto';
import { q, tx } from './db.js';
import { HttpError } from './auth.js';
import { canType } from '../../shared/catalog.js';
import { isShop } from '../../shared/shop.js';
import { enginePack, lastServiceDate } from '../../shared/enginePack.js';
import { settings } from './settings.js';

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const DB = { query: (sql, params) => q(sql, params) };
const vals = (r) => r?.data?.values || {};
const token = (n = 24) => crypto.randomBytes(n).toString('base64url');
const inviteCode = () => Array.from(crypto.randomBytes(8), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('').replace(/(.{4})(.{4})/, '$1-$2');

async function tenant(db, id) {
  const { rows: [t] } = await db.query('SELECT id, name, plan, settings FROM tenants WHERE id=$1', [id]);
  return t;
}

/** The shop's engine and everything about it. */
async function shopEngine(db, tid, engineId) {
  const { rows } = await db.query(`SELECT id, type, data FROM records WHERE tenant_id=$1 AND NOT deleted AND type = ANY($2)`, [tid, ['asset', 'customer', 'engine_build', 'job']]);
  const engine = rows.find((r) => r.id === engineId && r.type === 'asset' && vals(r).category === 'Engine');
  if (!engine) return null;
  return {
    engine,
    customer: rows.find((r) => r.type === 'customer' && r.id === vals(engine).customer) || null,
    builds: rows.filter((r) => r.type === 'engine_build' && vals(r).engine === engineId),
    jobs: rows.filter((r) => r.type === 'job' && vals(r).engine === engineId),
  };
}

const assetId = (x) => (x && typeof x === 'object' ? x.asset : typeof x === 'string' ? x : null);

/** Laps and sessions the team has run on its engine since a date — the only team data that reaches the shop. */
async function teamUsage(db, link, since) {
  if (!link?.team_tenant_id || !link.team_asset_id) return null;
  const { rows } = await db.query(`SELECT id, type, data FROM records WHERE tenant_id=$1 AND NOT deleted AND type IN ('setup','event')`, [link.team_tenant_id]);
  const events = new Map(rows.filter((r) => r.type === 'event').map((r) => [r.id, vals(r)]));
  const from = since || (link.accepted_at ? new Date(link.accepted_at).toISOString().slice(0, 10) : null);
  let laps = 0; let sessions = 0; let last = null;
  for (const s of rows) {
    if (s.type !== 'setup' || assetId(vals(s).engine) !== link.team_asset_id) continue;
    const ev = events.get(vals(s).event);
    if (!ev?.date) continue;
    const d = new Date(`${ev.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + (Number(vals(s).day) || 1) - 1);
    const date = d.toISOString().slice(0, 10);
    if (from && date < from) continue;
    sessions += 1;
    laps += Number(vals(s).laps) || 0;
    if (!last || date > last) last = date;
  }
  const t = await tenant(db, link.team_tenant_id);
  return { laps, sessions, last, since: from, team: t?.name || '' };
}

async function packFor(db, shopTid, engineId, link = null) {
  const shop = await tenant(db, shopTid);
  const e = await shopEngine(db, shopTid, engineId);
  if (!shop || !e) return null;
  let usage = null;
  const active = link?.status === 'active' ? link
    : (await db.query(`SELECT * FROM engine_links WHERE shop_tenant_id=$1 AND engine_id=$2 AND status='active' ORDER BY accepted_at DESC LIMIT 1`, [shopTid, engineId])).rows[0];
  if (active) usage = await teamUsage(db, active, lastServiceDate(e.jobs));
  return enginePack({ shop: { name: shop.name, settings: shop.settings?.shop || {} }, ...e, usage });
}

/** Turn off share links and end team links for an engine (owner changed, engine deleted, or by hand). */
async function endSharing(db, shopTid, engineId, reason, { shares = true, links = true } = {}) {
  if (shares) await db.query(`UPDATE engine_shares SET revoked_at=now(), revoked_reason=$3 WHERE tenant_id=$1 AND engine_id=$2 AND revoked_at IS NULL`, [shopTid, engineId, reason]);
  if (!links) return;
  const { rows } = await db.query(`SELECT * FROM engine_links WHERE shop_tenant_id=$1 AND engine_id=$2 AND status IN ('pending','active')`, [shopTid, engineId]);
  for (const l of rows) await endLink(db, l, reason);
}

async function endLink(db, link, reason) {
  const snapshot = link.status === 'active' ? await packFor(db, link.shop_tenant_id, link.engine_id, link) : null;
  await db.query(`UPDATE engine_links SET status='ended', ended_at=now(), ended_reason=$2, snapshot=$3 WHERE id=$1`, [link.id, reason, snapshot ? JSON.stringify(snapshot) : null]);
}

/** Called after a record is saved through sync: an engine's owner changing ends its sharing. */
export async function onRecordSaved(c, tid, type, before, after) {
  if (type !== 'asset' || !before || !tid) return;
  const was = before.data?.values || {}; const now = after.data?.values || {};
  if (was.category !== 'Engine') return;
  if (after.deleted && !before.deleted) await endSharing(c, tid, after.id, 'Engine deleted');
  else if ((was.customer || null) !== (now.customer || null)) await endSharing(c, tid, after.id, 'Engine changed owner');
}

async function sharedCount(db, tid, exceptEngine) {
  const { rows: [n] } = await db.query(`SELECT count(DISTINCT engine_id)::int AS n FROM (
      SELECT engine_id FROM engine_shares WHERE tenant_id=$1 AND revoked_at IS NULL
      UNION SELECT engine_id FROM engine_links WHERE shop_tenant_id=$1 AND status IN ('pending','active')) x WHERE engine_id <> $2`, [tid, exceptEngine]);
  return n.n;
}
async function checkLimit(db, t, engineId) {
  const limit = settings().plans[t.plan]?.share_limit;
  if (limit === null || limit === undefined || limit === '') return;
  const n = await sharedCount(db, t.id, engineId);
  need(n < Number(limit), 409, `Your plan allows ${limit} shared engine${Number(limit) === 1 ? '' : 's'} at a time. Turn off sharing on another engine, or ask about a bigger plan.`);
}

const linkOut = (l) => ({ id: l.id, status: l.status, feed_lifecycle: !!l.feed_lifecycle, code: l.status === 'pending' ? l.code : undefined, team: l.team_name || null, created_at: l.created_at, accepted_at: l.accepted_at, ended_at: l.ended_at, ended_reason: l.ended_reason });

// ---------------------------------------------------------------- public (no login)
const hits = new Map();
export function mountPublicShare(app) {
  app.get('/api/share/:token', h(async (req, res) => {
    const ip = req.ip || 'x'; const now = Date.now();
    const list = (hits.get(ip) || []).filter((x) => now - x < 60_000); list.push(now); hits.set(ip, list);
    need(list.length <= 60, 429, 'Too many requests — try again in a minute.');
    const { rows: [s] } = await q('SELECT * FROM engine_shares WHERE token=$1', [String(req.params.token).slice(0, 80)]);
    need(s && !s.revoked_at, 404, 'This link has been turned off or doesn’t exist. Ask your engine builder for a new one.');
    const pack = await packFor(DB, s.tenant_id, s.engine_id);
    need(pack, 404, 'This engine is no longer available.');
    await q('UPDATE engine_shares SET views=views+1, last_viewed_at=now() WHERE id=$1', [s.id]);
    res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex').json(pack);
  }));
}

// ---------------------------------------------------------------- team & shop
export function mountSharing(T) {
  const shopGuard = async (req) => {
    const t = await tenant(DB, req.tid);
    need(isShop({ settings: t?.settings }), 400, 'Customer access is for teams set up as an engine shop.');
    need(canType(req.role, req.ent, 'job', 'edit'), 403, 'You need permission to edit jobs to share engines.');
    return t;
  };
  const engineGuard = async (req) => {
    const e = await shopEngine(DB, req.tid, req.params.eid);
    need(e, 404, 'Engine not found');
    return e;
  };

  // shop: sharing status for an engine
  T.get('/engines/:eid/sharing', h(async (req, res) => {
    need(canType(req.role, req.ent, 'job', 'view'), 403, 'Not permitted');
    const e = await engineGuard(req);
    const { rows: [share] } = await q('SELECT token, created_at, views, last_viewed_at FROM engine_shares WHERE tenant_id=$1 AND engine_id=$2 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1', [req.tid, req.params.eid]);
    const { rows: links } = await q(`SELECT l.*, t.name AS team_name FROM engine_links l LEFT JOIN tenants t ON t.id=l.team_tenant_id
      WHERE l.shop_tenant_id=$1 AND l.engine_id=$2 ORDER BY l.created_at DESC LIMIT 10`, [req.tid, req.params.eid]);
    const active = links.find((l) => l.status === 'active');
    const usage = active ? await teamUsage(DB, active, lastServiceDate(e.jobs)) : null;
    const t = await tenant(DB, req.tid);
    res.json({ share: share || null, links: links.map(linkOut), usage, limit: settings().plans[t.plan]?.share_limit ?? null, shared: await sharedCount(DB, req.tid, '00000000-0000-0000-0000-000000000000') });
  }));

  // shop: create (or replace) the engine's link
  T.post('/engines/:eid/share', h(async (req, res) => {
    const t = await shopGuard(req); const e = await engineGuard(req);
    const out = await tx(async (c) => {
      await checkLimit(c, t, req.params.eid);
      await c.query(`UPDATE engine_shares SET revoked_at=now(), revoked_reason='Replaced' WHERE tenant_id=$1 AND engine_id=$2 AND revoked_at IS NULL`, [req.tid, req.params.eid]);
      const { rows: [s] } = await c.query(`INSERT INTO engine_shares(tenant_id, engine_id, customer_id, token, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING token, created_at`,
        [req.tid, req.params.eid, e.customer?.id || null, token(), req.user.id]);
      return s;
    });
    res.json(out);
  }));

  T.delete('/engines/:eid/share', h(async (req, res) => {
    await shopGuard(req); await engineGuard(req);
    await endSharing(DB, req.tid, req.params.eid, 'Turned off', { links: false });
    res.json({ ok: true });
  }));

  // shop: invite the owner's RaceOps team to link the engine
  T.post('/engines/:eid/link', h(async (req, res) => {
    const t = await shopGuard(req); const e = await engineGuard(req);
    const out = await tx(async (c) => {
      const { rows: [act] } = await c.query(`SELECT 1 FROM engine_links WHERE shop_tenant_id=$1 AND engine_id=$2 AND status='active'`, [req.tid, req.params.eid]);
      need(!act, 409, 'This engine is already linked to a team. End that link first.');
      await checkLimit(c, t, req.params.eid);
      await c.query(`UPDATE engine_links SET status='ended', ended_at=now(), ended_reason='Replaced by a new invite' WHERE shop_tenant_id=$1 AND engine_id=$2 AND status='pending'`, [req.tid, req.params.eid]);
      const { rows: [l] } = await c.query(`INSERT INTO engine_links(shop_tenant_id, engine_id, customer_id, code, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.tid, req.params.eid, e.customer?.id || null, inviteCode(), req.user.id]);
      return l;
    });
    res.json(linkOut(out));
  }));

  T.post('/engine-links/:id/end', h(async (req, res) => {
    await shopGuard(req);
    const { rows: [l] } = await q(`SELECT * FROM engine_links WHERE id=$1 AND shop_tenant_id=$2`, [req.params.id, req.tid]);
    need(l, 404, 'Link not found');
    if (l.status !== 'ended') await endLink(DB, l, 'Ended by the engine shop');
    res.json({ ok: true });
  }));

  // team: preview an invite
  T.get('/engine-invites/:code', h(async (req, res) => {
    const code = String(req.params.code).toUpperCase().trim();
    const { rows: [l] } = await q(`SELECT * FROM engine_links WHERE code=$1`, [code]);
    need(l && l.status === 'pending', 404, 'That invite code isn’t valid any more. Ask your engine builder for a new one.');
    need(l.shop_tenant_id !== req.tid, 400, 'This is your own team’s invite — open it from the customer’s team instead.');
    const shop = await tenant(DB, l.shop_tenant_id);
    const e = await shopEngine(DB, l.shop_tenant_id, l.engine_id);
    need(e, 404, 'The engine is no longer available.');
    res.json({ shop: shop.name, engine: vals(e.engine).name, serial: vals(e.engine).serial_number || '', owner: e.customer ? vals(e.customer).name : '' });
  }));

  // team: accept an invite, choosing (or creating) the team's own engine asset
  T.post('/engine-invites/:code/accept', h(async (req, res) => {
    need(!req.readOnly, 403, 'This team is read-only.');
    need(canType(req.role, req.ent, 'asset', 'edit'), 403, 'You need permission to edit assets to link an engine.');
    const code = String(req.params.code).toUpperCase().trim();
    const b = req.body || {};
    const out = await tx(async (c) => {
      const { rows: [l] } = await c.query(`SELECT * FROM engine_links WHERE code=$1 FOR UPDATE`, [code]);
      need(l && l.status === 'pending', 404, 'That invite code isn’t valid any more.');
      need(l.shop_tenant_id !== req.tid, 400, 'You can’t link an engine to the team that built it.');
      let assetIdOut = b.asset_id;
      if (assetIdOut) {
        const { rows: [a] } = await c.query(`SELECT id, data FROM records WHERE id=$1 AND tenant_id=$2 AND type='asset' AND NOT deleted`, [assetIdOut, req.tid]);
        need(a && vals(a).category === 'Engine', 400, 'Pick one of your team’s engines.');
      } else {
        const name = String(b.new_engine_name || '').trim().slice(0, 120);
        need(name, 400, 'Pick one of your engines, or name a new one.');
        const { rows: [f] } = await c.query(`SELECT id FROM records WHERE tenant_id=$1 AND type='form' AND data->>'target'='asset' AND NOT deleted ORDER BY (data->>'base')::boolean DESC NULLS LAST LIMIT 1`, [req.tid]);
        const e = await shopEngine(c, l.shop_tenant_id, l.engine_id);
        assetIdOut = crypto.randomUUID();
        const data = { form_id: f?.id, values: { name, category: 'Engine', status: 'In Service', manufacturer: vals(e?.engine).manufacturer || '', model: vals(e?.engine).model || '', serial_number: vals(e?.engine).serial_number || '', life_unit: 'Laps' } };
        await c.query(`INSERT INTO records(id,tenant_id,type,data,created_by,updated_by,client_updated_at) VALUES ($1,$2,'asset',$3,$4,$4,now())`, [assetIdOut, req.tid, JSON.stringify(data), req.user.id]);
      }
      const { rows: [dup] } = await c.query(`SELECT 1 FROM engine_links WHERE team_tenant_id=$1 AND team_asset_id=$2 AND status='active'`, [req.tid, assetIdOut]);
      need(!dup, 409, 'That engine is already linked to an engine builder.');
      const { rows: [x] } = await c.query(`UPDATE engine_links SET status='active', team_tenant_id=$2, team_asset_id=$3, accepted_by=$4, accepted_at=now(), feed_lifecycle=$5 WHERE id=$1 RETURNING *`,
        [l.id, req.tid, assetIdOut, req.user.id, !!b.feed_lifecycle]);
      return x;
    });
    res.json({ id: out.id, asset_id: out.team_asset_id });
  }));

  // team: engines linked from builders (live while active, the frozen copy once ended)
  T.get('/linked-engines', h(async (req, res) => {
    need(canType(req.role, req.ent, 'engine_build', 'view') || canType(req.role, req.ent, 'asset', 'view'), 403, 'Not permitted');
    const { rows } = await q(`SELECT l.*, t.name AS shop_name FROM engine_links l JOIN tenants t ON t.id=l.shop_tenant_id
      WHERE l.team_tenant_id=$1 AND l.status IN ('active','ended') ORDER BY l.status, l.accepted_at DESC`, [req.tid]);
    const out = [];
    for (const l of rows) {
      const pack = l.status === 'active' ? await packFor(DB, l.shop_tenant_id, l.engine_id, l) : l.snapshot;
      out.push({ id: l.id, status: l.status, shop: l.shop_name, team_asset_id: l.team_asset_id, feed_lifecycle: !!l.feed_lifecycle, accepted_at: l.accepted_at, ended_at: l.ended_at, ended_reason: l.ended_reason, pack });
    }
    res.json(out);
  }));

  // team: choose whether this engine's laps count on the builder's service tracker
  T.patch('/linked-engines/:id', h(async (req, res) => {
    need(!req.readOnly, 403, 'This team is read-only.');
    need(canType(req.role, req.ent, 'asset', 'edit'), 403, 'Not permitted');
    need(typeof req.body?.feed_lifecycle === 'boolean', 400, 'feed_lifecycle must be true or false');
    const { rows: [l] } = await q(`UPDATE engine_links SET feed_lifecycle=$3 WHERE id=$1 AND team_tenant_id=$2 AND status='active' RETURNING id, feed_lifecycle`,
      [req.params.id, req.tid, req.body.feed_lifecycle]);
    need(l, 404, 'Active link not found');
    res.json(l);
  }));

  // shop: laps since last service for every engine whose team counts them on the shop's tracker
  T.get('/engine-usage', h(async (req, res) => {
    need(canType(req.role, req.ent, 'asset', 'view') || canType(req.role, req.ent, 'job', 'view'), 403, 'Not permitted');
    const { rows: links } = await q(`SELECT * FROM engine_links WHERE shop_tenant_id=$1 AND status='active' AND feed_lifecycle`, [req.tid]);
    const out = {};
    if (links.length) {
      const { rows } = await q(`SELECT id, type, data FROM records WHERE tenant_id=$1 AND NOT deleted AND type='job'`, [req.tid]);
      for (const l of links) {
        const jobs = rows.filter((r) => vals(r).engine === l.engine_id);
        const u = await teamUsage(DB, l, lastServiceDate(jobs));
        if (u) out[l.engine_id] = u;
      }
    }
    res.json(out);
  }));

  T.post('/linked-engines/:id/end', h(async (req, res) => {
    need(canType(req.role, req.ent, 'asset', 'edit'), 403, 'Not permitted');
    const { rows: [l] } = await q(`SELECT * FROM engine_links WHERE id=$1 AND team_tenant_id=$2`, [req.params.id, req.tid]);
    need(l, 404, 'Link not found');
    if (l.status === 'active') await endLink(DB, l, 'Ended by the team');
    res.json({ ok: true });
  }));
}
