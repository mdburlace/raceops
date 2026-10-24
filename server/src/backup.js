// Backups and restores.
//
// Full backup (platform admins): every table and every uploaded file, read in one consistent snapshot, so the
// whole platform can be restored or moved to new infrastructure. A single team can also be put back as it was
// in any full backup (a point-in-time team restore).
// Team backup (a team's owner, or a role with "Back up, restore & export team data"): that team's records, files,
// forms, roles and settings. Restoring replaces the team's data, after a safety backup of how it is now.
//
// Long jobs run in the background (ops below); the page polls /ops/:id. A full restore puts the server into
// maintenance (every other request answers 503) until it finishes. After any restore the team's data_epoch
// changes, so every device drops its copy and downloads the team again.
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { q, tx, pool } from './db.js';
import { HttpError } from './auth.js';
import { audit, loadSettings } from './settings.js';
import { mailAdmins, mailTeam } from './mail.js';
import { can } from '../../shared/catalog.js';
import { createWriter, read, verify, tempFile, encryptionOn, seal } from './backupFile.js';
import { writeExport, FORMATS } from './exportData.js';
import { KINDS, available, cleanConfig, cleanSecret, driverFor, authorizeUrl, exchangeCode, BACKUP_DIR, WORK_DIR } from './backupTargets.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = (() => { try { return createRequire(import.meta.url)('../package.json').version; } catch { return 'dev'; } })();
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; // server local time
const slug = (s) => String(s || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'team';
const DOWNLOADS = path.join(WORK_DIR, 'downloads');
const UPLOADS = path.join(WORK_DIR, 'uploads');
const SAFETY = 'safety';                                // folder under BACKUP_DIR for safety backups before a restore
const MAX_RESTORE_MB = Number(process.env.BACKUP_UPLOAD_MB || 2048);

let UPLOAD_DIR = null;
let afterFullRestore = async () => {};
export function configure(opts) { UPLOAD_DIR = opts.UPLOAD_DIR; if (opts.afterFullRestore) afterFullRestore = opts.afterFullRestore; fs.mkdirSync(WORK_DIR, { recursive: true }); }

// ---------------------------------------------------------------- in-memory state
/** Background jobs: id → { scope, tid, user, status: running|ok|failed, step, error, result, at }. */
const ops = new Map();
/** Work in progress: 'full' or a team id. A full backup or restore excludes everything else. */
const busy = new Set();
/** Set while a full restore runs: every other request gets 503. */
let maintenance = null;
/** OAuth sign-ins in progress: state → { target, user, back, at } (10 minutes). */
const pendingOAuth = new Map();
setInterval(() => {
  const old = Date.now() - 6 * 3600_000;
  for (const [id, o] of ops) if (o.at < old && o.status !== 'running') ops.delete(id);
  for (const [s, p] of pendingOAuth) if (p.at < Date.now() - 600_000) pendingOAuth.delete(s);
}, 600_000).unref();

/** Express middleware: while a full restore runs, only health checks and the restore's own progress answer. */
export function maintenanceGuard(req, res, next) {
  if (!maintenance || !req.path.startsWith('/api/') || req.path === '/api/health' || req.path.startsWith('/api/backup/ops/') || req.path === '/api/status') return next();
  res.status(503).json({ error: 'RaceOps is being restored from a backup. Try again in a few minutes.', maintenance: true });
}

function startOp(kind, { tid = null, user, lock }, fn) {
  if (busy.has('full') || (lock === 'full' && busy.size) || busy.has(lock)) {
    throw new HttpError(409, lock === 'full' || busy.has('full') ? 'A full backup or restore is already running. Wait for it to finish.' : 'A backup or restore for this team is already running. Wait for it to finish.');
  }
  const id = crypto.randomUUID();
  const op = { id, kind, tid, user, status: 'running', step: 'Starting', at: Date.now() };
  ops.set(id, op);
  busy.add(lock);
  Promise.resolve().then(() => fn((step) => { op.step = step; }))
    .then((result) => Object.assign(op, { status: 'ok', step: 'Done', result }))
    .catch((e) => { if (!(e instanceof HttpError)) console.error(e); Object.assign(op, { status: 'failed', error: e instanceof HttpError ? e.message : `Something went wrong: ${e.message}` }); })
    .finally(() => busy.delete(lock));
  return op;
}
const opView = (o) => o && { id: o.id, kind: o.kind, status: o.status, step: o.step, error: o.error || null, result: o.result || null };

// ---------------------------------------------------------------- schema
async function schema(c) {
  const { rows: tabs } = await c.query(`SELECT table_name AS t FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'schema_migrations'`);
  const { rows: fks } = await c.query(`SELECT conrelid::regclass::text AS t, confrelid::regclass::text AS ref,
       (SELECT array_agg(a.attname::text) FROM pg_attribute a WHERE a.attrelid=k.conrelid AND a.attnum = ANY(k.conkey)) AS cols
     FROM pg_constraint k WHERE contype='f' AND connamespace='public'::regnamespace`);
  const { rows: cols } = await c.query(`SELECT table_name AS t, column_name AS c, column_default AS d
     FROM information_schema.columns WHERE table_schema='public'`);
  const names = tabs.map((x) => x.t).sort();
  const deps = Object.fromEntries(names.map((n) => [n, new Set()]));
  const selfCols = {}, userCols = {};
  for (const f of fks) {
    if (!deps[f.t]) continue;
    if (f.ref === f.t) (selfCols[f.t] ||= []).push(...f.cols);
    else if (deps[f.ref]) deps[f.t].add(f.ref);
    if (f.ref === 'users') (userCols[f.t] ||= []).push(...f.cols);
  }
  const order = [], done = new Set();
  const visit = (n, stack = new Set()) => {
    if (done.has(n)) return;
    if (stack.has(n)) throw new Error(`Circular foreign keys at ${n}`);
    stack.add(n);
    for (const d of deps[n]) visit(d, stack);
    done.add(n); order.push(n);
  };
  names.forEach((n) => visit(n));
  const columns = {}, sequences = [];
  for (const r of cols) {
    (columns[r.t] ||= new Set()).add(r.c);
    const m = /^nextval\('([^']+)'::regclass\)/.exec(r.d || '');
    if (m && deps[r.t]) sequences.push({ t: r.t, c: r.c, seq: m[1].replace(/"/g, '') });
  }
  return { order, columns, selfCols, userCols, sequences };
}
const lastMigration = async (c) => (await c.query("SELECT max(name) AS m FROM schema_migrations WHERE name LIKE '%.sql'")).rows[0].m;

/** Insert rows (as row_to_json gave them) with Postgres doing the type conversion. */
async function insertRows(c, table, rows, { columns, omit = [] }) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]).filter((k) => columns[table]?.has(k) && !omit.includes(k));
  const list = cols.map(ident).join(',');
  for (let i = 0; i < rows.length; i += 500) {
    await c.query(`INSERT INTO ${ident(table)} (${list}) SELECT ${list} FROM json_populate_recordset(null::${ident(table)}, $1::json)`, [JSON.stringify(rows.slice(i, i + 500))]);
  }
}

function* walk(dir, base = dir) {
  if (!dir || !fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.restore-')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, base); else if (e.isFile()) yield path.relative(base, p).split(path.sep).join('/');
  }
}
const underUploads = (rel) => {
  const p = path.resolve(UPLOAD_DIR, rel);
  if (!p.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) throw new HttpError(400, 'The backup contains a file path that isn’t allowed.');
  return p;
};

async function streamRows(client, sql, params, w) {
  const cur = `c${crypto.randomBytes(5).toString('hex')}`;
  await client.query(`DECLARE ${cur} NO SCROLL CURSOR FOR ${sql}`, params);
  let n = 0;
  for (;;) {
    const { rows } = await client.query(`FETCH 1000 FROM ${cur}`);
    if (!rows.length) break;
    for (const r of rows) { await w.line({ r: r.r }); n++; }
  }
  await client.query(`CLOSE ${cur}`);
  return n;
}

// ---------------------------------------------------------------- writing backups
/** What a team backup holds: table → the SQL that picks the team's rows (and the same rule for rows read back). */
const TEAM_TABLES = [
  ['tenants', 'id = $1', (r, t) => r.id === t],
  ['roles', 'tenant_id = $1'],
  ['memberships', 'tenant_id = $1'],
  ['records', 'tenant_id = $1'],
  ['record_history', 'tenant_id = $1'],
  ['attachments', 'tenant_id = $1'],
  ['engine_shares', 'tenant_id = $1'],
  ['sponsor_portals', 'tenant_id = $1'],
  ['engine_links', 'shop_tenant_id = $1', (r, t) => r.shop_tenant_id === t],
  ['calendar_officials', 'tenant_id = $1'],
  ['calendar_requests', 'tenant_id = $1'],
  ['calendar_request_messages', 'request_id IN (SELECT id FROM calendar_requests WHERE tenant_id = $1)', (r, _t, ctx) => ctx.requests.has(r.request_id)],
  ['team_notices', 'tenant_id = $1'],
];
const TEAM_PICK = Object.fromEntries(TEAM_TABLES.map(([t, , f]) => [t, f || ((r, tid) => r.tenant_id === tid)]));

/** Write a full backup to `file`. */
export async function writeFull(file, step = () => {}, meta = {}) {
  need(UPLOAD_DIR, 500, 'Backups aren’t configured');
  const w = createWriter(file);
  const client = await pool.connect();
  const counts = {};
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const s = await schema(client);
    await w.line({ type: 'header', format: 1, scope: 'full', created_at: new Date().toISOString(), app_version: VERSION, migration: await lastMigration(client), encrypted: w.encrypted, tables: s.order, ...meta });
    for (const t of s.order) {
      step(`Saving ${t.replace(/_/g, ' ')}`);
      await w.line({ type: 'table', name: t });
      counts[t] = await streamRows(client, `SELECT row_to_json(x) AS r FROM ${ident(t)} x`, [], w);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
  step('Saving uploaded files');
  let files = 0;
  for (const rel of walk(UPLOAD_DIR)) if (await w.addFile(rel, path.join(UPLOAD_DIR, rel))) files++;
  counts.files = files;
  await w.line({ type: 'end', counts });
  return { ...(await w.close()), counts };
}

/** Write one team's backup to `file`. */
export async function writeTeam(file, tid, step = () => {}, meta = {}) {
  const w = createWriter(file);
  const client = await pool.connect();
  const counts = {};
  let paths = [];
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: [t] } = await client.query('SELECT id, name FROM tenants WHERE id=$1', [tid]);
    need(t, 404, 'Team not found');
    await w.line({ type: 'header', format: 1, scope: 'team', created_at: new Date().toISOString(), app_version: VERSION, migration: await lastMigration(client), encrypted: w.encrypted, tenant: { id: t.id, name: t.name }, ...meta });
    // the people the team's data mentions, so a restore elsewhere can match them by email
    await w.line({ type: 'table', name: '_users' });
    counts._users = await streamRows(client, `SELECT row_to_json(x) AS r FROM (SELECT id, email, name FROM users WHERE id IN (
        SELECT user_id FROM memberships WHERE tenant_id=$1 UNION SELECT created_by FROM records WHERE tenant_id=$1
        UNION SELECT updated_by FROM records WHERE tenant_id=$1 UNION SELECT user_id FROM record_history WHERE tenant_id=$1
        UNION SELECT uploaded_by FROM attachments WHERE tenant_id=$1)) x`, [tid], w);
    for (const [table, where] of TEAM_TABLES) {
      step(`Saving ${table.replace(/_/g, ' ')}`);
      await w.line({ type: 'table', name: table });
      counts[table] = await streamRows(client, `SELECT row_to_json(x) AS r FROM ${ident(table)} x WHERE ${where}`, [tid], w);
    }
    paths = (await client.query('SELECT storage_path FROM attachments WHERE tenant_id=$1', [tid])).rows.map((r) => r.storage_path);
    // the team photo (Team → Team profile) comes back with the team's settings
    const { rows: [tp] } = await client.query("SELECT settings->'photo'->>'path' AS p FROM tenants WHERE id=$1", [tid]);
    if (tp?.p) paths.push(tp.p);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
  step('Saving attached files');
  let files = 0;
  for (const rel of paths) if (await w.addFile(rel, path.join(UPLOAD_DIR, rel))) files++;
  counts.files = files;
  await w.line({ type: 'end', counts });
  return { ...(await w.close()), counts };
}

// ---------------------------------------------------------------- reading a team out of a backup
/** Gather one team's rows and files from a full or team backup file. */
export async function extractTeam(file, tid) {
  const out = { users: new Map(), tables: {}, files: new Map(), header: null };
  const ctx = { requests: new Set() };
  let wanted = new Set();
  await read(file, {
    onHeader: (hd) => { out.header = hd; },
    onRow: (table, r) => {
      if (table === 'users' || table === '_users') { out.users.set(r.id, { email: r.email, name: r.name }); return; }
      const pick = TEAM_PICK[table];
      if (!pick || !pick(r, tid, ctx)) return;
      if (table === 'calendar_requests') ctx.requests.add(r.id);
      if (table === 'attachments') wanted.add(r.storage_path);
      if (table === 'tenants' && r.settings?.photo?.path) wanted.add(r.settings.photo.path);
      (out.tables[table] ||= []).push(r);
    },
    onFile: (rel, chunks) => { if (wanted.has(rel)) out.files.set(rel, Buffer.concat(chunks)); },
  });
  need(out.tables.tenants?.length, 400, 'That team isn’t in this backup.');
  wanted = null;
  return out;
}

/** The teams in a backup (for choosing one to restore). */
export async function teamsIn(file) {
  const teams = [];
  await read(file, { onRow: (t, r) => { if (t === 'tenants') teams.push({ id: r.id, name: r.name }); } });
  return teams;
}

// ---------------------------------------------------------------- restoring
async function checkVersion(header) {
  const mine = await lastMigration(pool);
  need(!header.migration || !mine || header.migration <= mine, 400,
    `This backup was made by a newer version of RaceOps (${header.migration}). Update this server first, then restore it.`);
}

/** Put one team back as it is in `data` (from extractTeam). The team's current data is replaced. */
export async function restoreTeam(tid, data, { by } = {}) {
  const writtenFiles = [];
  let oldPaths = [];
  const result = await tx(async (c) => {
    const s = await schema(c);
    const bt = data.tables.tenants[0];
    const { rows: [cur] } = await c.query('SELECT * FROM tenants WHERE id=$1 FOR UPDATE', [tid]);
    const isNew = !cur;
    const { rows: us } = await c.query('SELECT id, lower(email) AS email FROM users');
    const byId = new Set(us.map((u) => u.id)), byEmail = new Map(us.map((u) => [u.email, u.id]));
    const mapUser = (id) => {
      if (!id) return null;
      if (byId.has(id)) return id;
      const e = data.users.get(id)?.email;
      return (e && byEmail.get(e.toLowerCase())) || null;
    };
    const fixUsers = (table, rows) => rows.map((r) => {
      const x = { ...r };
      for (const col of s.userCols[table] || []) if (col in x) x[col] = mapUser(x[col]);
      return x;
    });
    const epoch = crypto.randomUUID();
    const settingsOf = (st) => ({ ...(st || {}), data_epoch: epoch, ...(cur?.settings?.practice ? { practice: true } : {}) });

    // the team itself: name and settings come back; licence and plan stay as the platform admin set them
    if (isNew) {
      await insertRows(c, 'tenants', [{ ...bt, settings: settingsOf(bt.settings) }], { columns: s.columns });
    } else {
      await c.query('UPDATE tenants SET name=$2, racing_type=$3, settings=$4 WHERE id=$1', [tid, bt.name, bt.racing_type, JSON.stringify(settingsOf(bt.settings))]);
    }

    // roles: the backup's come back; roles people hold now stay too, so nobody loses access
    const backupRoles = data.tables.roles || [];
    const { rows: inUse } = await c.query(`SELECT role_id FROM memberships WHERE tenant_id=$1 UNION SELECT unnest(extra_role_ids) FROM memberships WHERE tenant_id=$1
      UNION SELECT role_id FROM invites WHERE tenant_id=$1`, [tid]);
    const keep = new Set([...inUse.map((r) => r.role_id), ...backupRoles.map((r) => r.id)]);
    const { rows: curRoles } = await c.query('SELECT id, name FROM roles WHERE tenant_id=$1', [tid]);
    for (const r of curRoles) if (!keep.has(r.id)) await c.query('DELETE FROM roles WHERE id=$1', [r.id]);
    const remaining = curRoles.filter((r) => keep.has(r.id));
    for (const r of backupRoles) {
      if (remaining.some((x) => x.id === r.id)) {
        await c.query('UPDATE roles SET name=$2, description=$3, permissions=$4, is_owner=$5 WHERE id=$1', [r.id, r.name, r.description, JSON.stringify(r.permissions || []), !!r.is_owner]);
      } else {
        const clash = remaining.some((x) => x.name === r.name);
        await insertRows(c, 'roles', [{ ...r, tenant_id: tid, name: clash ? `${r.name} (restored)` : r.name }], { columns: s.columns });
      }
    }
    // members: kept as they are now; a team brought back on a new server gets the people it can match by email
    if (isNew) {
      const ms = fixUsers('memberships', data.tables.memberships || []).filter((m) => m.user_id);
      await insertRows(c, 'memberships', ms, { columns: s.columns });
      if (by && !ms.some((m) => m.user_id === by)) {
        const owner = backupRoles.find((r) => r.is_owner);
        if (owner) await c.query('INSERT INTO memberships(user_id,tenant_id,role_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [by, tid, owner.id]);
      }
    }

    // the team's data: replaced
    oldPaths = (await c.query('SELECT storage_path FROM attachments WHERE tenant_id=$1', [tid])).rows.map((r) => r.storage_path);
    await c.query('DELETE FROM calendar_requests WHERE tenant_id=$1', [tid]); // messages go with them
    for (const t of ['team_notices', 'calendar_officials', 'engine_shares', 'sponsor_portals', 'attachments', 'records']) await c.query(`DELETE FROM ${t} WHERE tenant_id=$1`, [tid]);
    await c.query('DELETE FROM engine_links WHERE shop_tenant_id=$1', [tid]);

    const serialCols = (table) => s.sequences.filter((x) => x.t === table).map((x) => x.c);
    const counts = {};
    for (const table of ['records', 'attachments', 'engine_shares', 'sponsor_portals', 'engine_links', 'calendar_officials', 'calendar_requests', 'calendar_request_messages', 'team_notices']) {
      let rows = fixUsers(table, data.tables[table] || []);
      if (table === 'engine_links') {
        const { rows: ts } = await c.query('SELECT id FROM tenants');
        const have = new Set(ts.map((x) => x.id));
        rows = rows.map((r) => (r.team_tenant_id && !have.has(r.team_tenant_id) ? { ...r, team_tenant_id: null, team_asset_id: null } : r));
      }
      // a fresh sync position for every record; serial ids only kept when the team was already here
      await insertRows(c, table, rows, { columns: s.columns, omit: table === 'records' ? ['seq'] : isNew ? serialCols(table) : [] });
      counts[table] = rows.length;
    }
    if (isNew) await insertRows(c, 'record_history', fixUsers('record_history', data.tables.record_history || []), { columns: s.columns, omit: serialCols('record_history') });

    // files: written before the commit (new names never clash), old ones removed after it
    for (const [rel, buf] of data.files) {
      const p = underUploads(rel);
      if (fs.existsSync(p)) continue;
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, buf);
      writtenFiles.push(p);
    }
    counts.files = data.files.size;
    return { counts, isNew, name: bt.name };
  }).catch((e) => { for (const p of writtenFiles) fs.rmSync(p, { force: true }); throw e; });
  const keepPaths = new Set(data.files.keys());
  for (const rel of oldPaths) if (!keepPaths.has(rel)) fs.rmSync(path.join(UPLOAD_DIR, rel), { force: true });
  await audit(by || null, 'backup.restore.team', result.name, { tenant: tid, counts: result.counts, new_team: result.isNew });
  return result;
}

/** Replace everything with a full backup. Call only through runFullRestore (maintenance mode). */
async function restoreFullFile(file, step, header = {}) {
  const stage = path.join(UPLOAD_DIR, `.restore-${Date.now()}`);
  let counts = {};
  try {
    await tx(async (c) => {
      const s = await schema(c);
      const { rows: [{ last_value: lastSeq }] } = await c.query('SELECT last_value FROM record_seq');
      step('Clearing the current data');
      await c.query(`TRUNCATE ${s.order.map(ident).join(',')} RESTART IDENTITY CASCADE`);
      let table = null, batch = [], deferred = [];
      const flush = async () => {
        if (!table || !batch.length) return;
        await insertRows(c, table, batch, { columns: s.columns });
        counts[table] = (counts[table] || 0) + batch.length;
        batch = [];
      };
      const finishTable = async () => {
        await flush();
        for (const d of deferred) await c.query(`UPDATE ${ident(table)} SET ${ident(d.col)}=$2 WHERE id=$1`, [d.id, d.val]);
        deferred = [];
      };
      await read(file, {
        onTable: async (name) => { await finishTable(); table = s.columns[name] ? name : null; if (table) step(`Restoring ${name.replace(/_/g, ' ')}`); },
        onRow: async (_t, r) => {
          if (!table) return;
          for (const col of s.selfCols[table] || []) if (r[col]) { deferred.push({ id: r.id, col, val: r[col] }); r[col] = null; }
          batch.push(r);
          if (batch.length >= 500) await flush();
        },
        onFile: async (rel, chunks) => {
          await finishTable(); table = null;
          const p = path.resolve(stage, rel);
          if (!p.startsWith(path.resolve(stage) + path.sep)) throw new HttpError(400, 'The backup contains a file path that isn’t allowed.');
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, Buffer.concat(chunks));
          counts.files = (counts.files || 0) + 1;
        },
        onEnd: async () => { await finishTable(); },
      });
      step('Finishing');
      for (const x of s.sequences) {
        if (x.seq === 'record_seq') continue;
        await c.query(`SELECT setval($1, GREATEST((SELECT COALESCE(max(${ident(x.c)}), 0) FROM ${ident(x.t)}), 1))`, [x.seq]);
      }
      await c.query(`SELECT setval('record_seq', GREATEST($1::bigint, (SELECT COALESCE(max(seq), 1) FROM records)))`, [lastSeq]);
      await c.query(`UPDATE tenants SET settings = COALESCE(settings,'{}'::jsonb) || jsonb_build_object('data_epoch', gen_random_uuid()::text)`);
      // the backup that made this file was still running when it was read; everything else running then didn't finish
      if (header.run_id) await c.query(`UPDATE backup_runs SET status='ok', finished_at=COALESCE(finished_at, now()) WHERE id=$1 AND status='running'`, [header.run_id]);
      await c.query(`UPDATE backup_runs SET status='failed', error='Still running when the restored backup was made', finished_at=now() WHERE status='running'`);
    });
  } catch (e) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw e;
  }
  // swap the uploaded files for the backup's
  step('Restoring uploaded files');
  for (const e of fs.readdirSync(UPLOAD_DIR)) if (path.join(UPLOAD_DIR, e) !== stage) fs.rmSync(path.join(UPLOAD_DIR, e), { recursive: true, force: true });
  if (fs.existsSync(stage)) {
    for (const e of fs.readdirSync(stage)) fs.renameSync(path.join(stage, e), path.join(UPLOAD_DIR, e));
    fs.rmSync(stage, { recursive: true, force: true });
  }
  return counts;
}

/**
 * The whole full-restore job: check the file, safety backup, maintenance on, restore, settings reloaded.
 * Used by the admin page, first-run setup and the command line.
 */
export async function runFullRestore(file, { by = null, safety = true, step = () => {} } = {}) {
  step('Checking the backup');
  const header = await verify(file);
  need(header.scope === 'full', 400, 'That’s a team backup. Restore it from the team’s Backups page, or choose a full backup.');
  await checkVersion(header);
  let safetyRun = null;
  if (safety) {
    step('Taking a safety backup of the current data');
    safetyRun = await localSafety('full', null, by);
  }
  maintenance = { since: Date.now() };
  let counts;
  try { counts = await restoreFullFile(file, step, header); } finally { maintenance = null; }
  step('Reloading settings');
  await loadSettings();
  await afterFullRestore();
  if (safetyRun) await insertRun(safetyRun).catch(() => {});
  await audit(by && (await q('SELECT 1 FROM users WHERE id=$1', [by])).rows.length ? by : null, 'backup.restore.full', header.created_at, { counts, safety: safetyRun?.file_name || null });
  return { counts, created_at: header.created_at, safety: safetyRun?.file_name || null };
}

// ---------------------------------------------------------------- runs
const runCols = ['id', 'scope', 'kind', 'trigger', 'tenant_id', 'tenant_name', 'target_id', 'target_name', 'status', 'file_name', 'remote_ref', 'size', 'encrypted', 'format', 'counts', 'error', 'created_by', 'started_at', 'finished_at'];
async function insertRun(r) {
  await q(`INSERT INTO backup_runs(${runCols.join(',')}) VALUES (${runCols.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT (id) DO NOTHING`,
    runCols.map((k) => (k === 'counts' && r[k] ? JSON.stringify(r[k]) : k === 'encrypted' ? !!r[k] : r[k] ?? null)));
}

const PLATFORM_TARGET = { id: null, kind: 'local', name: 'Server folder (safety backups)', config: { folder: SAFETY } };

/** A safety backup before a restore, always to the server's own backup folder. Returns its run (not yet saved for full). */
async function localSafety(scope, tid, by) {
  const tmp = tempFile(WORK_DIR);
  try {
    const t = tid ? (await q('SELECT name FROM tenants WHERE id=$1', [tid])).rows[0] : null;
    const out = scope === 'full' ? await writeFull(tmp) : await writeTeam(tmp, tid);
    const name = scope === 'full' ? `raceops-full-before-restore-${stamp()}.raceops` : `raceops-team-${slug(t?.name)}-before-restore-${stamp()}.raceops`;
    await driverFor(PLATFORM_TARGET).put(tmp, name);
    const run = { id: crypto.randomUUID(), scope, kind: 'backup', trigger: 'pre-restore', tenant_id: tid, tenant_name: t?.name || null, target_id: null, target_name: PLATFORM_TARGET.name,
      status: 'ok', file_name: name, remote_ref: `${SAFETY}/${name}`, size: out.size, encrypted: out.encrypted, format: 'raceops', counts: out.counts, created_by: by, started_at: new Date(), finished_at: new Date() };
    if (scope === 'team') await insertRun(run);
    return run;
  } finally { fs.rmSync(tmp, { force: true }); }
}

async function targetRow(id) {
  const { rows: [t] } = await q('SELECT * FROM backup_targets WHERE id=$1', [id]);
  need(t, 404, 'That backup destination doesn’t exist any more.');
  return t;
}
const hooksFor = (t) => ({
  onSecret: (sec) => q('UPDATE backup_targets SET secret=$2, updated_at=now() WHERE id=$1', [t.id, seal(sec)]),
  onConfig: (cfg) => q('UPDATE backup_targets SET config=$2, updated_at=now() WHERE id=$1', [t.id, JSON.stringify(cfg)]),
});
const driver = (t) => driverFor(t, hooksFor(t));

/** Make a backup: to a target, or (target null) as a download kept for a day. */
export async function runBackup({ scope, tid = null, target = null, trigger = 'manual', by = null, step = () => {} }) {
  const t = tid ? (await q('SELECT name FROM tenants WHERE id=$1', [tid])).rows[0] : null;
  need(scope === 'full' || t, 404, 'Team not found');
  const name = scope === 'full' ? `raceops-full-${stamp()}.raceops` : `raceops-team-${slug(t.name)}-${stamp()}.raceops`;
  const run = { id: crypto.randomUUID(), scope, kind: 'backup', trigger: target ? trigger : 'download', tenant_id: tid, tenant_name: t?.name || null,
    target_id: target?.id || null, target_name: target?.name || 'Download', status: 'running', file_name: name, format: 'raceops', created_by: by, started_at: new Date() };
  await insertRun(run);
  const tmp = tempFile(WORK_DIR);
  try {
    const out = scope === 'full' ? await writeFull(tmp, step, { run_id: run.id, file_name: name }) : await writeTeam(tmp, tid, step, { run_id: run.id, file_name: name });
    let ref;
    if (target) {
      step(`Sending to ${target.name}`);
      ({ ref } = await driver(target).put(tmp, name));
      await q('UPDATE backup_targets SET last_ok_at=now(), last_error=NULL WHERE id=$1', [target.id]);
    } else {
      fs.mkdirSync(DOWNLOADS, { recursive: true });
      fs.renameSync(tmp, path.join(DOWNLOADS, `${run.id}.raceops`));
      ref = `${run.id}.raceops`;
    }
    await q(`UPDATE backup_runs SET status='ok', remote_ref=$2, size=$3, encrypted=$4, counts=$5, finished_at=now() WHERE id=$1`,
      [run.id, ref, out.size, out.encrypted, JSON.stringify(out.counts)]);
    return { run: run.id, file_name: name, size: out.size, encrypted: out.encrypted, counts: out.counts };
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : e.message || String(e);
    await q(`UPDATE backup_runs SET status='failed', error=$2, finished_at=now() WHERE id=$1`, [run.id, msg.slice(0, 1000)]);
    if (target) await q('UPDATE backup_targets SET last_error=$2 WHERE id=$1', [target.id, msg.slice(0, 500)]);
    throw e;
  } finally { fs.rmSync(tmp, { force: true }); }
}

/** Export a team's data (CSV, XML or JSON, optionally with files): to a destination, or as a download kept for a day. */
export async function runExport({ tid, format, files = false, target = null, by = null, step = () => {} }) {
  need(FORMATS[format], 400, 'Choose CSV, XML or JSON.');
  const t = (await q('SELECT name FROM tenants WHERE id=$1', [tid])).rows[0];
  need(t, 404, 'Team not found');
  const run = { id: crypto.randomUUID(), scope: 'team', kind: 'export', trigger: target ? 'manual' : 'download', tenant_id: tid, tenant_name: t.name,
    target_id: target?.id || null, target_name: target?.name || 'Download', status: 'running', format, created_by: by, started_at: new Date() };
  await insertRun(run);
  const tmp = tempFile(WORK_DIR, '');
  let out = null;
  try {
    step('Gathering the team’s data');
    out = await writeExport(tmp, tid, { format, files, UPLOAD_DIR });
    const name = `raceops-export-${slug(t.name)}-${stamp()}.${out.ext}`;
    let ref;
    if (target) {
      step(`Sending to ${target.name}`);
      ({ ref } = await driver(target).put(out.file, name));
    } else {
      fs.mkdirSync(DOWNLOADS, { recursive: true });
      ref = `${run.id}.${out.ext}`;
      fs.renameSync(out.file, path.join(DOWNLOADS, ref));
    }
    await q(`UPDATE backup_runs SET status='ok', file_name=$2, remote_ref=$3, size=$4, counts=$5, finished_at=now() WHERE id=$1`, [run.id, name, ref, out.size, JSON.stringify(out.counts)]);
    await audit(by, 'backup.export', t.name, { format, files, target: target?.name || 'download' });
    return { run: run.id, file_name: name, size: out.size, counts: out.counts };
  } catch (e) {
    await q(`UPDATE backup_runs SET status='failed', error=$2, finished_at=now() WHERE id=$1`, [run.id, String(e.message).slice(0, 1000)]);
    throw e;
  } finally { if (out?.file) fs.rmSync(out.file, { force: true }); }
}

/** Fetch a run's file to a local temp file (the caller removes it). */
async function fetchRun(run) {
  need(run.status === 'ok', 400, 'That backup isn’t available.');
  const tmp = tempFile(WORK_DIR);
  if (run.trigger === 'download') {
    const p = path.join(DOWNLOADS, path.basename(run.remote_ref || ''));
    need(fs.existsSync(p), 404, 'Downloads are kept for a day; this one has gone. Make a new backup.');
    fs.copyFileSync(p, tmp);
  } else if (!run.target_id) {
    await driverFor({ ...PLATFORM_TARGET, config: { folder: path.dirname(run.remote_ref) } }).get(path.basename(run.remote_ref), tmp);
  } else {
    await driver(await targetRow(run.target_id)).get(run.remote_ref, tmp);
  }
  return tmp;
}

async function removeRun(run) {
  if (run.status === 'ok') {
    if (run.trigger === 'download') fs.rmSync(path.join(DOWNLOADS, path.basename(run.remote_ref || '')), { force: true });
    else if (!run.target_id) await driverFor({ ...PLATFORM_TARGET, config: { folder: path.dirname(run.remote_ref) } }).remove(path.basename(run.remote_ref)).catch(() => {});
    else await driver(await targetRow(run.target_id)).remove(run.remote_ref);
  }
  await q(`UPDATE backup_runs SET status='removed' WHERE id=$1`, [run.id]);
}

// ---------------------------------------------------------------- schedules
export function nextRun(p, from = new Date()) {
  if (!p || p.frequency === 'off') return null;
  const d = new Date(from);
  d.setHours(Math.min(23, Math.max(0, p.at_hour ?? 2)), 0, 0, 0);
  if (p.frequency === 'daily') { if (d <= from) d.setDate(d.getDate() + 1); return d; }
  if (p.frequency === 'weekly') { while (d <= from || d.getDay() !== (p.weekday ?? 0)) d.setDate(d.getDate() + 1); return d; }
  const md = Math.min(28, Math.max(1, p.monthday ?? 1));
  d.setDate(md);
  if (d <= from) { d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(md); }
  return d;
}
const FREQS = ['off', 'daily', 'weekly', 'monthly'];
function cleanPlan(b = {}) {
  const int = (x, lo, hi, dflt) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
  return { frequency: FREQS.includes(b.frequency) ? b.frequency : 'off', at_hour: int(b.at_hour, 0, 23, 2), weekday: int(b.weekday, 0, 6, 0), monthday: int(b.monthday, 1, 28, 1), keep: int(b.keep, 1, 365, 7) };
}
async function savePlan(scope, tid, b, by) {
  const p = cleanPlan(b);
  const next = nextRun(p);
  const { rows: [row] } = await q(`INSERT INTO backup_plans(scope,tenant_id,target_id,frequency,at_hour,weekday,monthday,keep,next_run_at,updated_by,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     ON CONFLICT (scope, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))
     DO UPDATE SET target_id=EXCLUDED.target_id, frequency=EXCLUDED.frequency, at_hour=EXCLUDED.at_hour, weekday=EXCLUDED.weekday, monthday=EXCLUDED.monthday,
       keep=EXCLUDED.keep, next_run_at=EXCLUDED.next_run_at, updated_by=EXCLUDED.updated_by, updated_at=now() RETURNING *`,
  [scope, tid, b.target_id || null, p.frequency, p.at_hour, p.weekday, p.monthday, p.keep, next, by]);
  return row;
}
const getPlan = async (scope, tid) => (await q('SELECT * FROM backup_plans WHERE scope=$1 AND tenant_id IS NOT DISTINCT FROM $2', [scope, tid])).rows[0] || null;

/** The platform's destination for team backups (set by a platform admin), if any. */
async function platformTeamTarget() {
  const p = await getPlan('teams', null);
  return p?.target_id ? (await q('SELECT * FROM backup_targets WHERE id=$1', [p.target_id])).rows[0] || null : null;
}

async function prune(scope, tid, targetId, keep) {
  const { rows } = await q(`SELECT * FROM backup_runs WHERE scope=$1 AND tenant_id IS NOT DISTINCT FROM $2 AND target_id IS NOT DISTINCT FROM $3
      AND trigger='scheduled' AND status='ok' ORDER BY started_at DESC OFFSET $4`, [scope, tid, targetId, keep]);
  for (const r of rows) await removeRun(r).catch((e) => console.error('Backup prune:', e.message));
}

async function scheduledTeam(tid, target, keep) {
  if (!target) return;
  if (busy.has('full') || busy.has(tid)) return;
  busy.add(tid);
  try {
    await runBackup({ scope: 'team', tid, target, trigger: 'scheduled' });
    await prune('team', tid, target.id, keep);
  } catch (e) {
    const { rows } = await q("SELECT m.user_id FROM memberships m JOIN roles r ON r.id=m.role_id WHERE m.tenant_id=$1 AND r.permissions ? 'backup.manage'", [tid]);
    mailTeam(tid, 'Scheduled team backup failed', `The scheduled backup of your team's data to ${target.name} didn't work:\n\n${e.message}`, '/team/backups', rows.map((r) => r.user_id)).catch(() => {});
  } finally { busy.delete(tid); }
}

let ticking = false;
export async function tick() {
  if (ticking || maintenance) return;
  ticking = true;
  const client = await pool.connect();
  try {
    const { rows: [{ ok }] } = await client.query('SELECT pg_try_advisory_lock(73514) AS ok');
    if (!ok) return;
    try {
      const { rows: plans } = await client.query(`SELECT * FROM backup_plans WHERE frequency <> 'off' AND next_run_at IS NOT NULL AND next_run_at <= now() ORDER BY scope`);
      for (const p of plans) {
        await client.query('UPDATE backup_plans SET next_run_at=$2, last_run_at=now() WHERE id=$1', [p.id, nextRun(p)]);
        if (p.scope === 'full') {
          if (busy.size) continue;
          const target = p.target_id ? (await q('SELECT * FROM backup_targets WHERE id=$1', [p.target_id])).rows[0] : null;
          if (!target) { mailAdmins('Scheduled full backup skipped', 'The full backup schedule has no destination. Choose one under Platform admin → Backups.', '/admin/backups').catch(() => {}); continue; }
          busy.add('full');
          try { await runBackup({ scope: 'full', target, trigger: 'scheduled' }); await prune('full', null, target.id, p.keep); } catch (e) {
            mailAdmins('Scheduled full backup failed', `The scheduled full backup to ${target.name} didn't work:\n\n${e.message}`, '/admin/backups').catch(() => {});
          } finally { busy.delete('full'); }
        } else if (p.scope === 'team') {
          const target = p.target_id ? (await q('SELECT * FROM backup_targets WHERE id=$1', [p.target_id])).rows[0] : await platformTeamTarget();
          await scheduledTeam(p.tenant_id, target, p.keep);
        } else if (p.scope === 'teams') {
          const target = p.target_id ? (await q('SELECT * FROM backup_targets WHERE id=$1', [p.target_id])).rows[0] : null;
          if (!target) continue;
          const { rows: teams } = await q(`SELECT id FROM tenants t WHERE status <> 'suspended'
             AND NOT EXISTS (SELECT 1 FROM backup_plans b WHERE b.scope='team' AND b.tenant_id=t.id AND b.frequency <> 'off')`);
          for (const t of teams) await scheduledTeam(t.id, target, p.keep);
        }
      }
      // downloads and uploaded restore files are kept for a day
      const old = Date.now() - 24 * 3600_000;
      for (const dir of [DOWNLOADS, UPLOADS]) if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (fs.statSync(path.join(dir, f)).mtimeMs < old) fs.rmSync(path.join(dir, f), { force: true });
      await client.query(`UPDATE backup_runs SET status='removed' WHERE trigger='download' AND status='ok' AND started_at < now() - interval '1 day'`);
      await client.query(`UPDATE backup_runs SET status='failed', error='Stopped (the server restarted)', finished_at=now() WHERE status='running' AND started_at < now() - interval '1 day'`);
    } finally { await client.query('SELECT pg_advisory_unlock(73514)'); }
  } catch (e) {
    console.error('Backup schedule:', e.message);
  } finally { client.release(); ticking = false; }
}
export function startSchedules() {
  q(`UPDATE backup_runs SET status='failed', error='Stopped (the server restarted)', finished_at=now() WHERE status='running'`).catch(() => {});
  const run = () => tick().catch(() => {});
  setTimeout(run, 20_000).unref();
  setInterval(run, 60_000).unref();
}

// ---------------------------------------------------------------- routes
const targetView = (t) => ({ id: t.id, name: t.name, kind: t.kind, kind_label: KINDS[t.kind]?.label || t.kind, config: t.config, connected: !!t.secret || t.kind === 'local',
  needs_connect: KINDS[t.kind]?.oauth && !t.secret, last_ok_at: t.last_ok_at, last_error: t.last_error, created_at: t.created_at });
const planView = (p) => p && { target_id: p.target_id, frequency: p.frequency, at_hour: p.at_hour, weekday: p.weekday, monthday: p.monthday, keep: p.keep, next_run_at: p.next_run_at, last_run_at: p.last_run_at };
const RUN_SELECT = `SELECT r.*, u.name AS created_by_name FROM backup_runs r LEFT JOIN users u ON u.id=r.created_by`;

const upload = multer({
  storage: multer.diskStorage({ destination: (_r, _f, cb) => { fs.mkdirSync(UPLOADS, { recursive: true }); cb(null, UPLOADS); }, filename: (_r, _f, cb) => cb(null, `${crypto.randomUUID()}.raceops`) }),
  limits: { fileSize: MAX_RESTORE_MB * 1024 * 1024, files: 1 },
});
const uploadPath = (id) => { need(UUID.test(id || ''), 400, 'Upload the backup file again.'); const p = path.join(UPLOADS, `${id}.raceops`); need(fs.existsSync(p), 404, 'That upload has expired. Upload the backup file again.'); return p; };

/** Target CRUD shared by the platform (tid null) and a team. `back` = the page to return to after connecting. */
function targetRoutes(R, { tidOf, back, by }) {
  const mine = async (req) => {
    const t = await targetRow(req.params.id);
    need((t.tenant_id || null) === tidOf(req), 404, 'Not found');
    return t;
  };
  R.post('/targets', h(async (req, res) => {
    const b = req.body || {};
    need(KINDS[b.kind], 400, 'Choose what kind of destination it is.');
    const av = available()[b.kind];
    need(av.ready, 400, av.why);
    need(String(b.name || '').trim(), 400, 'Give the destination a name.');
    const config = cleanConfig(b.kind, b.config);
    const secret = cleanSecret(b.kind, b.secret);
    const { rows: [t] } = await q(`INSERT INTO backup_targets(tenant_id,name,kind,config,secret,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tidOf(req), String(b.name).trim().slice(0, 80), b.kind, JSON.stringify(config), seal(secret), by(req)]);
    let check = null;
    if (!KINDS[b.kind].oauth) check = await testTarget(t);
    await audit(by(req), 'backup.target.create', t.name, { kind: t.kind, tenant: t.tenant_id });
    res.json({ target: targetView((await targetRow(t.id))), check, connect_url: KINDS[b.kind].oauth ? connectUrl(t, req, back) : null });
  }));
  R.patch('/targets/:id', h(async (req, res) => {
    const t = await mine(req);
    const b = req.body || {};
    const config = b.config ? cleanConfig(t.kind, { ...t.config, ...b.config, folder_id: t.config.folder_id }) : t.config;
    const secret = t.kind === 's3' && b.secret?.access_key_id ? seal(cleanSecret(t.kind, b.secret)) : t.secret;
    await q('UPDATE backup_targets SET name=COALESCE($2,name), config=$3, secret=$4, updated_at=now() WHERE id=$1', [t.id, b.name ? String(b.name).trim().slice(0, 80) : null, JSON.stringify(config), secret]);
    const fresh = await targetRow(t.id);
    res.json({ target: targetView(fresh), check: KINDS[t.kind].oauth && !fresh.secret ? null : await testTarget(fresh) });
  }));
  R.post('/targets/:id/connect', h(async (req, res) => {
    const t = await mine(req);
    need(KINDS[t.kind].oauth, 400, 'This destination doesn’t need connecting.');
    need(available()[t.kind].ready, 400, available()[t.kind].why);
    res.json({ url: connectUrl(t, req, back) });
  }));
  R.post('/targets/:id/test', h(async (req, res) => res.json({ check: await testTarget(await mine(req)) })));
  R.get('/targets/:id/files', h(async (req, res) => {
    const t = await mine(req);
    const files = (await driver(t).list()).sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
    res.json({ files });
  }));
  R.delete('/targets/:id', h(async (req, res) => {
    const t = await mine(req);
    await q('DELETE FROM backup_targets WHERE id=$1', [t.id]);
    await audit(by(req), 'backup.target.delete', t.name, { kind: t.kind, tenant: t.tenant_id });
    res.json({ ok: true });
  }));
}
async function testTarget(t) {
  try {
    await driver(t).test();
    await q('UPDATE backup_targets SET last_ok_at=now(), last_error=NULL WHERE id=$1', [t.id]);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : e.message;
    await q('UPDATE backup_targets SET last_error=$2 WHERE id=$1', [t.id, msg.slice(0, 500)]);
    return { ok: false, error: msg };
  }
}
function connectUrl(t, req, back) {
  const state = crypto.randomBytes(24).toString('base64url');
  pendingOAuth.set(state, { target: t.id, user: req.user.id, back: back(req), at: Date.now() });
  return authorizeUrl(t.kind, state);
}

/** Restore source → a local file: a run, an upload, or a file on a destination. Returns { file, cleanup }. */
async function sourceFile(b, { tid = null, admin = false }) {
  if (b.source === 'upload') return { file: uploadPath(b.upload_id), cleanup: () => {} };
  if (b.source === 'run') {
    need(UUID.test(b.run_id || ''), 400, 'Choose a backup.');
    const { rows: [run] } = await q('SELECT * FROM backup_runs WHERE id=$1', [b.run_id]);
    need(run && (admin || (run.scope === 'team' && run.tenant_id === tid)), 404, 'That backup isn’t available.');
    need(run.kind === 'backup', 400, 'That’s an export, not a backup: it can’t be restored. Choose a backup.');
    const f = await fetchRun(run);
    return { file: f, cleanup: () => fs.rmSync(f, { force: true }) };
  }
  if (b.source === 'target') {
    const t = await targetRow(b.target_id);
    need(admin || t.tenant_id === tid, 404, 'Not found');
    const f = tempFile(WORK_DIR);
    await driver(t).get(String(b.ref || ''), f);
    return { file: f, cleanup: () => fs.rmSync(f, { force: true }) };
  }
  throw new HttpError(400, 'Choose a backup to restore from.');
}

export function mountBackupPublic(app) {
  // OAuth: the cloud's sign-in page sends the browser back here (no RaceOps sign-in on this request; the state is the key)
  app.get('/api/backup/oauth/callback', h(async (req, res) => {
    const p = pendingOAuth.get(String(req.query.state || ''));
    if (!p) return res.redirect('/?backup=expired');
    pendingOAuth.delete(String(req.query.state));
    const sep = p.back.includes('?') ? '&' : '?';
    if (req.query.error || !req.query.code) return res.redirect(`${p.back}${sep}connect=cancelled`);
    try {
      const t = await targetRow(p.target);
      const secret = await exchangeCode(t.kind, String(req.query.code));
      await q('UPDATE backup_targets SET secret=$2, last_error=NULL, updated_at=now() WHERE id=$1', [t.id, seal(secret)]);
      const check = await testTarget(await targetRow(t.id));
      await audit(p.user, 'backup.target.connect', t.name, { kind: t.kind, tenant: t.tenant_id });
      res.redirect(`${p.back}${sep}connected=${check.ok ? t.id : 'error'}`);
    } catch (e) {
      res.redirect(`${p.back}${sep}connect=failed&why=${encodeURIComponent(e.message.slice(0, 200))}`);
    }
  }));
  if (process.env.BACKUP_CLOUD_MOCK === '1') {
    app.get('/api/backup/oauth/mock', (req, res) => res.redirect(`/api/backup/oauth/callback?code=mock&state=${encodeURIComponent(String(req.query.state || ''))}`));
  }

  // first run on a new server: restore a full backup instead of setting up from scratch
  app.post('/api/setup/restore', upload.single('file'), h(async (req, res) => {
    const file = req.file?.path;
    try {
      need(file, 400, 'Choose the backup file.');
      const { rows } = await q('SELECT count(*)::int AS n FROM users');
      need(rows[0].n === 0, 409, 'This server is already set up. Restore from Platform admin → Backups instead.');
      const op = startOp('restore-full', { user: null, lock: 'full' }, async (step) => {
        try { return await runFullRestore(file, { safety: false, step }); } finally { fs.rmSync(file, { force: true }); }
      });
      res.json({ op: opView(op) });
    } catch (e) { if (file) fs.rmSync(file, { force: true }); throw e; }
  }));
  // progress of a backup or restore: the job id (random, given only to whoever started it) is the key, so this
  // keeps answering while a full restore holds the users table
  app.get('/api/backup/ops/:id', (req, res) => {
    const o = ops.get(req.params.id);
    if (!o) return res.status(404).json({ error: 'That job was lost (the server may have restarted). Check the list of backups.' });
    res.json({ op: opView(o) });
  });
}

/** Platform admin: /api/admin/backups */
export function mountBackupAdmin(A) {
  const R = express.Router();
  A.use('/backups', R);
  targetRoutes(R, { tidOf: () => null, back: () => '/admin/backups', by: (req) => req.user.id });

  R.get('/', h(async (_req, res) => {
    const { rows: targets } = await q('SELECT * FROM backup_targets WHERE tenant_id IS NULL ORDER BY name');
    const { rows: runs } = await q(`${RUN_SELECT} WHERE r.status <> 'removed' ORDER BY r.started_at DESC LIMIT 300`);
    const { rows: teams } = await q('SELECT id, name FROM tenants ORDER BY name');
    const { rows: teamPlans } = await q(`SELECT p.tenant_id, p.frequency, t.name AS target_name FROM backup_plans p LEFT JOIN backup_targets t ON t.id=p.target_id WHERE p.scope='team' AND p.frequency <> 'off'`);
    res.json({
      encryption: encryptionOn(), kinds: available(), backup_dir: BACKUP_DIR, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      targets: targets.map(targetView), plans: { full: planView(await getPlan('full', null)), teams: planView(await getPlan('teams', null)) },
      runs, teams, team_plans: teamPlans,
    });
  }));
  R.put('/plans/:scope', h(async (req, res) => {
    need(['full', 'teams'].includes(req.params.scope), 404, 'Not found');
    const b = req.body || {};
    if (b.target_id) { const t = await targetRow(b.target_id); need(t.tenant_id === null, 400, 'Choose one of the platform’s destinations.'); }
    need(cleanPlan(b).frequency === 'off' || b.target_id, 400, 'Choose where the scheduled backups go.');
    const p = await savePlan(req.params.scope, null, b, req.user.id);
    await audit(req.user.id, 'backup.plan', req.params.scope, planView(p));
    res.json({ plan: planView(p) });
  }));
  R.post('/run', h(async (req, res) => {
    const target = req.body?.target_id ? await targetRow(req.body.target_id) : null;
    need(!target || target.tenant_id === null, 400, 'Choose one of the platform’s destinations.');
    const op = startOp('backup-full', { user: req.user.id, lock: 'full' }, (step) => runBackup({ scope: 'full', target, by: req.user.id, step }));
    await audit(req.user.id, 'backup.full', target?.name || 'download', {});
    res.json({ op: opView(op) });
  }));
  R.post('/teams/:tid/run', h(async (req, res) => {
    const target = req.body?.target_id ? await targetRow(req.body.target_id) : null;
    need(!target || target.tenant_id === null || target.tenant_id === req.params.tid, 400, 'Choose a destination.');
    const op = startOp('backup-team', { tid: req.params.tid, user: req.user.id, lock: req.params.tid }, (step) => runBackup({ scope: 'team', tid: req.params.tid, target, by: req.user.id, step }));
    res.json({ op: opView(op) });
  }));
  R.get('/runs/:id/download', h(async (req, res) => {
    const { rows: [run] } = await q('SELECT * FROM backup_runs WHERE id=$1', [req.params.id]);
    need(run, 404, 'Not found');
    await sendRun(res, run);
  }));
  R.delete('/runs/:id', h(async (req, res) => {
    const { rows: [run] } = await q('SELECT * FROM backup_runs WHERE id=$1', [req.params.id]);
    need(run, 404, 'Not found');
    await removeRun(run);
    await audit(req.user.id, 'backup.remove', run.file_name, { scope: run.scope, tenant: run.tenant_id });
    res.json({ ok: true });
  }));
  // a backup file from the person's computer: checked, then kept for a day for the restore
  R.post('/upload', upload.single('file'), h(async (req, res) => {
    need(req.file, 400, 'Choose the backup file.');
    try {
      const header = await verify(req.file.path);
      res.json({ upload_id: path.basename(req.file.path, '.raceops'), header, teams: header.scope === 'full' ? await teamsIn(req.file.path) : [header.tenant] });
    } catch (e) { fs.rmSync(req.file.path, { force: true }); throw e; }
  }));
  // what's in a backup (for choosing a team from a full backup)
  R.post('/inspect', h(async (req, res) => {
    const src = await sourceFile(req.body || {}, { admin: true });
    try {
      const header = await verify(src.file);
      const teams = header.scope === 'full' ? await teamsIn(src.file) : [header.tenant];
      const { rows } = await q('SELECT id FROM tenants');
      const here = new Set(rows.map((r) => r.id));
      res.json({ header, teams: teams.map((t) => ({ ...t, here: here.has(t.id) })) });
    } finally { src.cleanup(); }
  }));
  R.post('/restore', h(async (req, res) => {
    const b = req.body || {};
    const by = req.user.id;
    if (b.mode === 'full') {
      need(b.confirm === 'RESTORE', 400, 'Type RESTORE to confirm. Everything on this server will be replaced by the backup.');
      const op = startOp('restore-full', { user: by, lock: 'full' }, async (step) => {
        step('Getting the backup');
        const src = await sourceFile(b, { admin: true });
        try { return await runFullRestore(src.file, { by, step }); } finally { src.cleanup(); }
      });
      await audit(by, 'backup.restore.full.start', b.source, {});
      return res.json({ op: opView(op) });
    }
    need(UUID.test(b.tenant_id || ''), 400, 'Choose the team to restore.');
    const op = startOp('restore-team', { tid: b.tenant_id, user: by, lock: b.tenant_id }, (step) => teamRestoreJob(b, b.tenant_id, { by, admin: true, step }));
    res.json({ op: opView(op) });
  }));
}

async function teamRestoreJob(b, tid, { by, admin, step }) {
  step('Getting the backup');
  const src = await sourceFile(b, { tid, admin });
  try {
    step('Checking the backup');
    const header = await verify(src.file);
    await checkVersion(header);
    if (header.scope === 'team') need(header.tenant?.id === tid, 400, `This backup is of another team (${header.tenant?.name}). Choose one of this team’s backups.`);
    else need(admin, 403, 'Only platform admins can restore a team from a full backup.');
    step('Reading the team’s data');
    const data = await extractTeam(src.file, tid);
    const exists = (await q('SELECT 1 FROM tenants WHERE id=$1', [tid])).rows.length;
    let safety = null;
    if (exists) { step('Taking a safety backup of the team as it is now'); safety = (await localSafety('team', tid, by)).file_name; }
    step('Restoring');
    const r = await restoreTeam(tid, data, { by });
    return { ...r, created_at: header.created_at, safety };
  } finally { src.cleanup(); }
}

async function sendRun(res, run) {
  const f = await fetchRun(run);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(run.file_name || 'backup.raceops')}`);
  res.sendFile(f, { dotfiles: 'allow' }, (e) => { fs.rmSync(f, { force: true }); if (e && !res.headersSent) res.status(500).end(); });
}

/** A team's own backups: /api/t/:tid/backup (owner, or a role with backup.manage). */
export function mountBackupTeam(T) {
  const R = express.Router({ mergeParams: true });
  T.use('/backup', (req, _res, next) => next(can(req.role, 'backup.manage') || req.user.is_platform_admin ? undefined : new HttpError(403, 'Not permitted')), R);
  targetRoutes(R, { tidOf: (req) => req.tid, back: () => '/team/backups', by: (req) => req.user.id });
  const checkTarget = async (id, tid) => {
    if (!id || id === 'platform') return platformTeamTarget();
    const t = await targetRow(id);
    need(t.tenant_id === tid, 400, 'Choose one of the team’s destinations.');
    return t;
  };

  R.get('/', h(async (req, res) => {
    const { rows: targets } = await q('SELECT * FROM backup_targets WHERE tenant_id=$1 ORDER BY name', [req.tid]);
    const { rows: runs } = await q(`${RUN_SELECT} WHERE r.scope='team' AND r.tenant_id=$1 AND r.status <> 'removed' ORDER BY r.started_at DESC LIMIT 200`, [req.tid]);
    const pt = await platformTeamTarget();
    const def = await getPlan('teams', null);
    res.json({
      encryption: encryptionOn(), kinds: available(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      targets: targets.map(targetView), plan: planView(await getPlan('team', req.tid)),
      platform: pt ? { name: pt.name, kind_label: KINDS[pt.kind].label, schedule: def?.frequency !== 'off' ? planView(def) : null } : null,
      runs: runs.map((r) => ({ ...r, remote_ref: undefined })),
    });
  }));
  R.put('/plan', h(async (req, res) => {
    const b = req.body || {};
    const target = cleanPlan(b).frequency === 'off' ? null : await checkTarget(b.target_id, req.tid);
    need(cleanPlan(b).frequency === 'off' || target, 400, 'Choose where the scheduled backups go.');
    const p = await savePlan('team', req.tid, { ...b, target_id: b.target_id === 'platform' ? null : b.target_id || null }, req.user.id);
    res.json({ plan: planView(p) });
  }));
  R.post('/run', h(async (req, res) => {
    const target = req.body?.target_id === 'download' ? null : await checkTarget(req.body?.target_id, req.tid);
    need(req.body?.target_id === 'download' || target, 400, 'Choose where the backup goes.');
    const op = startOp('backup-team', { tid: req.tid, user: req.user.id, lock: req.tid }, (step) => runBackup({ scope: 'team', tid: req.tid, target, by: req.user.id, step }));
    res.json({ op: opView(op) });
  }));
  R.post('/export', h(async (req, res) => {
    const b = req.body || {};
    const target = !b.target_id || b.target_id === 'download' ? null : await checkTarget(b.target_id, req.tid);
    need(!b.target_id || b.target_id === 'download' || target, 400, 'Choose where the export goes.');
    const op = startOp('export', { tid: req.tid, user: req.user.id, lock: req.tid }, (step) => runExport({ tid: req.tid, format: b.format, files: !!b.files, target, by: req.user.id, step }));
    res.json({ op: opView(op) });
  }));
  const teamRun = async (req) => {
    const { rows: [run] } = await q('SELECT * FROM backup_runs WHERE id=$1', [req.params.id]);
    need(run && run.scope === 'team' && run.tenant_id === req.tid, 404, 'Not found');
    return run;
  };
  R.get('/runs/:id/download', h(async (req, res) => sendRun(res, await teamRun(req))));
  R.delete('/runs/:id', h(async (req, res) => { await removeRun(await teamRun(req)); res.json({ ok: true }); }));
  R.post('/upload', upload.single('file'), h(async (req, res) => {
    need(req.file, 400, 'Choose the backup file.');
    try {
      const header = await verify(req.file.path);
      need(header.scope === 'team', 400, 'That’s a full backup of the whole platform. Only a platform admin can restore from it.');
      need(header.tenant?.id === req.tid, 400, `This backup is of another team (${header.tenant?.name}).`);
      res.json({ upload_id: path.basename(req.file.path, '.raceops'), header });
    } catch (e) { fs.rmSync(req.file.path, { force: true }); throw e; }
  }));
  R.post('/restore', h(async (req, res) => {
    const b = req.body || {};
    need(b.confirm === true, 400, 'Confirm the restore: the team’s data will be replaced by the backup.');
    const op = startOp('restore-team', { tid: req.tid, user: req.user.id, lock: req.tid }, (step) => teamRestoreJob(b, req.tid, { by: req.user.id, admin: false, step }));
    res.json({ op: opView(op) });
  }));
}

export { BACKUP_DIR };
