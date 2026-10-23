// Partnerships and marketing on the server:
//  - the sponsor portal: a no-login, read-only page for one sponsor — their deal (no amounts), what
//    was promised and delivered, results at the meetings in the deal, posts and photos naming them;
//  - the media library's file list (photos on media records, for thumbnails).
// Deliverable progress is worked out with shared/partners.js, the same code the app uses.
import crypto from 'node:crypto';
import path from 'node:path';
import { q } from './db.js';
import { HttpError } from './auth.js';
import { canType } from '../../shared/catalog.js';
import { dealResults, deliverableProgress } from '../../shared/partners.js';

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const vals = (r) => r?.data?.values || {};
const PORTAL_TYPES = ['sponsor', 'event', 'setup', 'track', 'social_post', 'media', 'livery', 'guest', 'car'];

async function teamData(tid) {
  const { rows } = await q(`SELECT id, type, data FROM records WHERE (tenant_id=$1 OR (tenant_id IS NULL AND type='track')) AND NOT deleted AND type = ANY($2)`, [tid, PORTAL_TYPES]);
  const byType = {}; const byId = {};
  for (const r of rows) { (byType[r.type] ||= []).push(r); byId[r.id] = r; }
  return { list: (t) => byType[t] || [], byId };
}

/** What a sponsor sees: no amounts, no private notes. */
async function portalView(p) {
  const data = await teamData(p.tenant_id);
  const sponsor = data.byId[p.sponsor_id];
  need(sponsor && sponsor.type === 'sponsor', 404, 'This page is no longer available.');
  const { rows: [t] } = await q('SELECT name FROM tenants WHERE id=$1', [p.tenant_id]);
  const today = new Date().toISOString().slice(0, 10);
  const v = vals(sponsor);
  const progress = deliverableProgress(data.list, sponsor, today).map((r) => ({ kind: r.kind || '', detail: r.detail || '', per: r.per || '', target: r.target, done: r.done, manual: !!r.manual }));
  const media = data.list('media').filter((m) => (vals(m).sponsors || []).includes(sponsor.id) && vals(m).approved);
  const files = media.length ? (await q(`SELECT id, record_id, filename, mime FROM attachments WHERE tenant_id=$1 AND record_id = ANY($2) AND mime LIKE 'image/%' ORDER BY created_at DESC`,
    [p.tenant_id, media.map((m) => m.id)])).rows : [];
  const posts = data.list('social_post').filter((x) => vals(x).status === 'Posted' && (vals(x).sponsors || []).includes(sponsor.id))
    .map((x) => ({ text: vals(x).text || '', posted_on: vals(x).posted_on || '', link: /^https?:\/\//.test(vals(x).link || '') ? vals(x).link : '', event: vals(data.byId[vals(x).event]).name || '' }))
    .sort((a, b) => String(b.posted_on).localeCompare(String(a.posted_on)));
  const liveries = data.list('livery').filter((l) => (vals(l).sponsors || []).includes(sponsor.id))
    .map((l) => ({ name: vals(l).name || '', car: vals(data.byId[vals(l).car]).number ? `#${vals(data.byId[vals(l).car]).number}` : '', from: vals(l).from || '', to: vals(l).to || '' }));
  return {
    team: t?.name || '', sponsor: { name: v.name || '', level: v.level || '', stage: v.stage || '', start: v.start || '', end: v.end || '' },
    deliverables: progress, results: dealResults(data.list, data.byId, sponsor, today), posts, liveries,
    photos: files.map((f) => ({ id: f.id, filename: f.filename, caption: vals(data.byId[f.record_id]).caption || '', event: vals(data.byId[vals(data.byId[f.record_id]).event]).name || '' })),
  };
}

const hits = new Map();
function limit(req) {
  const ip = req.ip || 'x'; const now = Date.now();
  const list = (hits.get(ip) || []).filter((x) => now - x < 60_000); list.push(now); hits.set(ip, list);
  need(list.length <= 120, 429, 'Too many requests — try again in a minute.');
}
async function portalByToken(token) {
  const { rows: [p] } = await q('SELECT * FROM sponsor_portals WHERE token=$1', [String(token).slice(0, 80)]);
  need(p && !p.revoked_at, 404, 'This link has been turned off or doesn’t exist. Ask the team for a new one.');
  return p;
}

/** No-login sponsor pages (/sp/:token) and their photos. */
export function mountPublicPartners(app, { UPLOAD_DIR }) {
  app.get('/api/public/sponsor/:token', h(async (req, res) => {
    limit(req);
    const p = await portalByToken(req.params.token);
    const view = await portalView(p);
    await q('UPDATE sponsor_portals SET views=views+1, last_viewed_at=now() WHERE id=$1', [p.id]);
    res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex').json(view);
  }));
  app.get('/api/public/sponsor/:token/photos/:id', h(async (req, res) => {
    limit(req);
    const p = await portalByToken(req.params.token);
    const { rows: [a] } = await q(`SELECT a.* FROM attachments a JOIN records r ON r.id=a.record_id
      WHERE a.id=$1 AND a.tenant_id=$2 AND r.type='media' AND NOT r.deleted AND a.mime LIKE 'image/%'
        AND r.data->'values'->'sponsors' ? $3 AND (r.data->'values'->>'approved')::boolean IS TRUE`, [req.params.id, p.tenant_id, p.sponsor_id]);
    need(a, 404, 'Not found');
    res.setHeader('Content-Type', a.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(path.join(UPLOAD_DIR, a.storage_path));
  }));
}

export function mountPartners(T) {
  const guard = (req, action) => need(canType(req.role, req.ent, 'sponsor', action), 403, 'Your role can’t manage sponsor pages.');
  const sponsorOf = async (req) => {
    const { rows: [s] } = await q("SELECT id FROM records WHERE id=$1 AND tenant_id=$2 AND type='sponsor' AND NOT deleted", [req.params.id, req.tid]);
    need(s, 404, 'Save the sponsor (and let it sync) first.');
    return s;
  };
  T.get('/sponsors/:id/portal', h(async (req, res) => {
    guard(req, 'view');
    const { rows: [p] } = await q('SELECT token, created_at, views, last_viewed_at FROM sponsor_portals WHERE tenant_id=$1 AND sponsor_id=$2 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1', [req.tid, req.params.id]);
    res.json({ portal: p || null });
  }));
  T.post('/sponsors/:id/portal', h(async (req, res) => {
    guard(req, 'edit');
    await sponsorOf(req);
    await q('UPDATE sponsor_portals SET revoked_at=now() WHERE tenant_id=$1 AND sponsor_id=$2 AND revoked_at IS NULL', [req.tid, req.params.id]);
    const { rows: [p] } = await q('INSERT INTO sponsor_portals(tenant_id, sponsor_id, token, created_by) VALUES ($1,$2,$3,$4) RETURNING token, created_at, views',
      [req.tid, req.params.id, crypto.randomBytes(18).toString('base64url'), req.user.id]);
    res.json({ portal: p });
  }));
  T.delete('/sponsors/:id/portal', h(async (req, res) => {
    guard(req, 'edit');
    await q('UPDATE sponsor_portals SET revoked_at=now() WHERE tenant_id=$1 AND sponsor_id=$2 AND revoked_at IS NULL', [req.tid, req.params.id]);
    res.json({ ok: true });
  }));

  // the media library: every photo on the team's media records (thumbnails load from /attachments/:id/file)
  T.get('/media/files', h(async (req, res) => {
    need(canType(req.role, req.ent, 'media', 'view'), 403, 'Not permitted');
    const { rows } = await q(`SELECT a.id, a.record_id, a.filename, a.mime, a.created_at FROM attachments a JOIN records r ON r.id=a.record_id
      WHERE a.tenant_id=$1 AND r.type='media' AND NOT r.deleted ORDER BY a.created_at DESC LIMIT 500`, [req.tid]);
    res.json(rows);
  }));
}
