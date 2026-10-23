// Recently deleted: deleted records stay recoverable for a while, then are removed for good.
//
// Anyone can recover records they created or deleted (if their role can edit that kind of record). A role with
// "Recover anyone's deleted items" (trash.manage; owners always) can recover anything deleted in the team.
// Platform admins can recover anything, including shared directory records.
// How long deleted records are kept is a platform setting (general.deleted_retention_days, default 90, null =
// forever) with a per-team override set by platform admins (tenants.deleted_retention_days). A team asks for a
// different time with a request that a platform admin decides.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { q, tx, pool } from './db.js';
import { HttpError } from './auth.js';
import { settings, saveSetting, audit } from './settings.js';
import { mailAdmins, mailTeam } from './mail.js';
import { can, canType } from '../../shared/catalog.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MIN_DAYS = 7, MAX_DAYS = 3650;
/** Days, or null for "keep forever". */
export const cleanDays = (x) => (x === null || x === 'forever' ? null : Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(Number(x)) || 90)));
const platformDays = () => (settings().general.deleted_retention_days === undefined ? 90 : settings().general.deleted_retention_days);
// tenants.deleted_retention_days: NULL = the platform's default, 0 = keep forever, n = days
const daysFor = (t) => (t?.deleted_retention_days === null || t?.deleted_retention_days === undefined ? platformDays() : t.deleted_retention_days === 0 ? null : t.deleted_retention_days);
const EFFECTIVE = (p) => `CASE WHEN t.deleted_retention_days IS NULL THEN ${p} WHEN t.deleted_retention_days = 0 THEN NULL ELSE t.deleted_retention_days END`;

let UPLOAD_DIR = null;

const titleOf = (type, d) => {
  const v = d?.values || {};
  if (type === 'form') return d?.name || 'Form';
  if (type === 'car') return [v.number && `#${v.number}`, v.name].filter(Boolean).join(' ') || 'Car';
  return v.name || v.title || v.job_no || (type === 'setup' && v.session) || v.number || v.kind || v.description || type.replace(/_/g, ' ');
};
const ITEM_SQL = `SELECT r.id, r.type, r.data, r.tenant_id, r.deleted_at, r.created_at, r.created_by, r.deleted_by,
    cu.name AS created_by_name, du.name AS deleted_by_name, t.name AS team_name,
    $KEEP AS keep_days
  FROM records r LEFT JOIN users cu ON cu.id=r.created_by LEFT JOIN users du ON du.id=r.deleted_by LEFT JOIN tenants t ON t.id=r.tenant_id`;
const itemSql = () => ITEM_SQL.replace('$KEEP', EFFECTIVE(platformDays() === null ? 'NULL::int' : String(Number(platformDays()))));
const view = (r, extra = {}) => ({
  id: r.id, type: r.type, title: titleOf(r.type, r.data), team: r.team_name || null, tenant_id: r.tenant_id, deleted_at: r.deleted_at,
  deleted_by: r.deleted_by_name || null, created_by: r.created_by_name || null,
  removed_at: r.keep_days === null || !r.deleted_at ? null : new Date(new Date(r.deleted_at).getTime() + r.keep_days * 86400_000).toISOString(), ...extra,
});

async function recover(id, userId, where = '') {
  return tx(async (c) => {
    const { rows: [r] } = await c.query(`UPDATE records SET deleted=false, deleted_at=NULL, deleted_by=NULL, updated_by=$2, updated_at=now(),
        client_updated_at=now(), seq=nextval('record_seq') WHERE id=$1 AND deleted ${where} RETURNING *`, [id, userId]);
    need(r, 404, 'That item isn’t in Recently deleted any more.');
    await c.query(`INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,user_id,client_updated_at)
       VALUES ($1,$2,$3,'recover','applied',$4,$5,now())`, [r.id, r.tenant_id, r.type, JSON.stringify(r.data), userId]);
    return r;
  });
}

// ---------------------------------------------------------------- removing for good
/** Remove records deleted longer ago than their team's retention (and their files and history). */
export async function purge() {
  const client = await pool.connect();
  try {
    const { rows: [{ ok }] } = await client.query('SELECT pg_try_advisory_lock(73515) AS ok');
    if (!ok) return 0;
    try {
      const pd = platformDays();
      const { rows } = await client.query(`SELECT r.id FROM records r LEFT JOIN tenants t ON t.id=r.tenant_id
         WHERE r.deleted AND r.deleted_at IS NOT NULL AND (${EFFECTIVE('$1::int')}) IS NOT NULL
           AND r.deleted_at < now() - make_interval(days => (${EFFECTIVE('$1::int')})) LIMIT 5000`, [pd]);
      if (!rows.length) return 0;
      const ids = rows.map((r) => r.id);
      const { rows: files } = await client.query('DELETE FROM attachments WHERE record_id = ANY($1) RETURNING storage_path', [ids]);
      await client.query('DELETE FROM record_history WHERE record_id = ANY($1)', [ids]);
      await client.query('DELETE FROM records WHERE id = ANY($1)', [ids]);
      if (UPLOAD_DIR) for (const f of files) fs.rmSync(path.join(UPLOAD_DIR, f.storage_path), { force: true });
      return ids.length;
    } finally { await client.query('SELECT pg_advisory_unlock(73515)'); }
  } finally { client.release(); }
}
export function startPurge(opts) {
  UPLOAD_DIR = opts.UPLOAD_DIR;
  const run = () => purge().then((n) => n && console.log(`Recently deleted: removed ${n} records past their retention`)).catch((e) => console.error('Purge:', e.message));
  setTimeout(run, 60_000).unref();
  setInterval(run, 3600_000).unref();
}

// ---------------------------------------------------------------- team routes: /api/t/:tid/deleted
export function mountRecycle(T) {
  const R = express.Router({ mergeParams: true });
  T.use('/deleted', R);
  const manager = (req) => can(req.role, 'trash.manage') || req.user.is_platform_admin;

  R.get('/', h(async (req, res) => {
    const all = manager(req) && req.query.mine !== '1';
    const { rows } = await q(`${itemSql()} WHERE r.tenant_id=$1 AND r.deleted AND NOT (r.data ? 'merged_into') ${all ? '' : 'AND (r.created_by=$2 OR r.deleted_by=$2)'}
       ORDER BY r.deleted_at DESC NULLS LAST LIMIT 500`, all ? [req.tid] : [req.tid, req.user.id]);
    const { rows: [t] } = await q('SELECT deleted_retention_days, retention_request FROM tenants WHERE id=$1', [req.tid]);
    res.json({
      items: rows.filter((r) => canType(req.role, req.ent, r.type, 'view')).map((r) => view(r, { can_recover: manager(req) || canType(req.role, req.ent, r.type, 'edit') })),
      all, manager: manager(req), keep_days: daysFor(t), platform_days: platformDays(), team_override: t.deleted_retention_days !== null,
      request: manager(req) ? t.retention_request : null,
    });
  }));

  R.post('/recover', h(async (req, res) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((x) => UUID.test(x)).slice(0, 500);
    need(ids.length, 400, 'Choose what to recover.');
    need(!req.readOnly, 403, 'The team licence has expired, so the data is read-only.');
    const out = { recovered: 0, refused: 0 };
    for (const id of ids) {
      const { rows: [r] } = await q('SELECT type, created_by, deleted_by FROM records WHERE id=$1 AND tenant_id=$2 AND deleted', [id, req.tid]);
      const mine = r && (r.created_by === req.user.id || r.deleted_by === req.user.id);
      if (!r || !(manager(req) || (mine && canType(req.role, req.ent, r.type, 'edit')))) { out.refused++; continue; }
      await recover(id, req.user.id, 'AND tenant_id IS NOT NULL');
      out.recovered++;
    }
    res.json(out);
  }));

  // a team manager asks a platform admin to keep deleted items for a different time
  R.post('/retention-request', h(async (req, res) => {
    need(manager(req), 403, 'Not permitted');
    const days = cleanDays(req.body?.days);
    const note = String(req.body?.note || '').trim().slice(0, 500);
    const { rows: [t] } = await q(`UPDATE tenants SET retention_request=$2 WHERE id=$1 RETURNING name`,
      [req.tid, JSON.stringify({ days, note, by: req.user.id, by_name: req.user.name, at: new Date().toISOString() })]);
    mailAdmins(`${t.name} asks to keep deleted items ${days === null ? 'forever' : `for ${days} days`}`,
      `${req.user.name} (${t.name}) asked to keep deleted items ${days === null ? 'forever' : `for ${days} days`}.${note ? `\n\n${note}` : ''}\n\nDecide under Platform admin → Recently deleted.`, '/admin/deleted').catch(() => {});
    res.json({ ok: true });
  }));
}

// ---------------------------------------------------------------- platform admin: /api/admin/deleted
export function mountRecycleAdmin(A) {
  const R = express.Router();
  A.use('/deleted', R);

  R.get('/', h(async (req, res) => {
    const team = String(req.query.team || 'all');
    const where = team === 'all' ? '' : team === 'shared' ? 'AND r.tenant_id IS NULL' : 'AND r.tenant_id=$1';
    need(team === 'all' || team === 'shared' || UUID.test(team), 400, 'Unknown team');
    const { rows } = await q(`${itemSql()} WHERE r.deleted AND NOT (r.data ? 'merged_into') ${where} ORDER BY r.deleted_at DESC NULLS LAST LIMIT 500`, where.includes('$1') ? [team] : []);
    const { rows: teams } = await q(`SELECT id, name, deleted_retention_days, retention_request,
        (SELECT count(*)::int FROM records r WHERE r.tenant_id=t.id AND r.deleted) AS deleted FROM tenants t ORDER BY name`);
    res.json({ items: rows.map((r) => view(r, { can_recover: true })), platform_days: platformDays(), teams });
  }));

  R.post('/recover', h(async (req, res) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((x) => UUID.test(x)).slice(0, 500);
    need(ids.length, 400, 'Choose what to recover.');
    let recovered = 0;
    for (const id of ids) { await recover(id, req.user.id).then(() => recovered++).catch(() => {}); }
    await audit(req.user.id, 'deleted.recover', `${recovered} item${recovered === 1 ? '' : 's'}`, { ids });
    res.json({ recovered, refused: ids.length - recovered });
  }));

  // how long deleted items are kept: the platform default…
  R.put('/retention', h(async (req, res) => {
    const days = cleanDays(req.body?.days);
    await saveSetting('general', { ...settings().general, deleted_retention_days: days }, req.user.id);
    await audit(req.user.id, 'deleted.retention', 'platform', { days });
    res.json({ platform_days: days });
  }));
  // …and a team's own (null = the platform default). Deciding a request clears it and tells the team.
  R.put('/retention/:tid', h(async (req, res) => {
    need(UUID.test(req.params.tid), 404, 'Not found');
    const b = req.body || {};
    const stored = b.days === 'default' || b.days === undefined ? null : b.days === 'forever' || b.days === null ? 0 : cleanDays(b.days);
    const { rows: [t] } = await q(`UPDATE tenants SET deleted_retention_days=$2, retention_request=NULL WHERE id=$1 RETURNING id, name`, [req.params.tid, stored]);
    need(t, 404, 'Team not found');
    const text = stored === null ? 'the platform default' : stored === 0 ? 'forever' : `${stored} days`;
    mailTeam(t.id, 'How long deleted items are kept', `A platform admin set how long ${t.name}'s deleted items are kept: ${text}.`, '/deleted').catch(() => {});
    await audit(req.user.id, 'deleted.retention', t.name, { days: text });
    res.json({ ok: true });
  }));
  R.post('/retention/:tid/decline', h(async (req, res) => {
    const { rows: [t] } = await q(`UPDATE tenants SET retention_request=NULL WHERE id=$1 RETURNING name`, [req.params.tid]);
    need(t, 404, 'Team not found');
    mailTeam(req.params.tid, 'Your request about deleted items', `A platform admin didn't change how long ${t.name}'s deleted items are kept.${req.body?.note ? `\n\n${String(req.body.note).slice(0, 500)}` : ''}`, '/deleted').catch(() => {});
    await audit(req.user.id, 'deleted.retention.decline', t.name, {});
    res.json({ ok: true });
  }));
}
