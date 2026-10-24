// Photos: the team's photo (Team → Team profile) and each member's photo (Profile, or Team → Members).
//
// The app shrinks a photo before sending it (at most 800 px, JPEG), so files stay small. Files live under
// UPLOAD_DIR — the team's in its own folder (<tid>/team-photo-<time>.<ext>, so team backups carry it) and a
// member's in users/ (<uid>-<time>.<ext>). The team photo is recorded in tenants.settings.photo and a member's
// in users.photo, both as { path, at, by }; devices only ever see `at`, used to refresh a cached picture.
//
// Who can change them:
//  - the team photo: the owner, and roles with "Change the team photo" (team.photo) or "Edit team settings";
//  - a member's photo: the member, or someone who can manage members in a team they're in (not an owner's
//    photo unless they're an owner too).
// Anyone in the team sees the team photo; anyone who shares a team with a member sees theirs.
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { q } from './db.js';
import { HttpError } from './auth.js';
import { can } from '../../shared/catalog.js';

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const need = (ok, status, msg) => { if (!ok) throw new HttpError(status, msg); };

/** The real type of an image from its first bytes (the browser's word for it isn't trusted). */
export function imageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export function mountPhotos(app, T, { UPLOAD_DIR }) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });
  const inUploads = (rel) => {
    const p = path.resolve(UPLOAD_DIR, String(rel || ''));
    return rel && p.startsWith(path.resolve(UPLOAD_DIR) + path.sep) ? p : null;
  };
  const save = (dir, base, file) => {
    need(file?.buffer?.length, 400, 'Choose a photo to upload.');
    const type = imageType(file.buffer);
    need(type, 400, 'That file isn’t a JPEG, PNG or WebP photo.');
    const rel = path.posix.join(dir, `${base}-${Date.now()}.${TYPES[type]}`);
    fs.mkdirSync(path.join(UPLOAD_DIR, dir), { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, rel), file.buffer);
    return rel;
  };
  const remove = (rel) => { const p = inUploads(rel); if (p) fs.rmSync(p, { force: true }); };
  const send = (res, rel) => {
    const p = inUploads(rel);
    need(p && fs.existsSync(p), 404, 'No photo');
    res.set('Cache-Control', 'private, max-age=86400');
    res.sendFile(p);
  };
  const tooBig = (err, _req, _res, next) => next(err?.code === 'LIMIT_FILE_SIZE' ? new HttpError(400, 'That photo is too big (3 MB at most).') : err);

  // ---------------------------------------------------------------- the team photo
  const canTeamPhoto = (req) => req.role.is_owner || can(req.role, 'team.photo') || can(req.role, 'team.manage');
  const setTeamPhoto = async (tid, photo) => {
    const { rows: [t] } = await q('SELECT settings FROM tenants WHERE id=$1', [tid]);
    const old = t?.settings?.photo?.path;
    const settings = { ...(t?.settings || {}) };
    if (photo) settings.photo = photo; else delete settings.photo;
    await q('UPDATE tenants SET settings=$2 WHERE id=$1', [tid, JSON.stringify(settings)]);
    if (old && old !== photo?.path) remove(old);
    return photo ? { at: photo.at } : {};
  };
  T.get('/photo', h(async (req, res) => {
    const { rows: [t] } = await q('SELECT settings FROM tenants WHERE id=$1', [req.tid]);
    send(res, t?.settings?.photo?.path);
  }));
  T.put('/photo', upload.single('file'), tooBig, h(async (req, res) => {
    need(canTeamPhoto(req), 403, 'Your role can’t change the team photo.');
    const rel = save(req.tid, 'team-photo', req.file);
    res.json(await setTeamPhoto(req.tid, { path: rel, at: new Date().toISOString(), by: req.user.id }));
  }));
  T.delete('/photo', h(async (req, res) => {
    need(canTeamPhoto(req), 403, 'Your role can’t change the team photo.');
    res.json(await setTeamPhoto(req.tid, null));
  }));

  // ---------------------------------------------------------------- member photos
  const setUserPhoto = async (uid, photo) => {
    const { rows: [u] } = await q('SELECT photo FROM users WHERE id=$1', [uid]);
    need(u, 404, 'No such person');
    await q('UPDATE users SET photo=$2 WHERE id=$1', [uid, photo ? JSON.stringify(photo) : null]);
    if (u.photo?.path && u.photo.path !== photo?.path) remove(u.photo.path);
    return photo ? { at: photo.at } : {};
  };
  const userPhotoPut = (uid, req) => setUserPhoto(uid, { path: save('users', uid, req.file), at: new Date().toISOString(), by: req.user.id });

  // your own
  app.put('/api/me/photo', upload.single('file'), tooBig, h(async (req, res) => res.json(await userPhotoPut(req.user.id, req))));
  app.delete('/api/me/photo', h(async (req, res) => res.json(await setUserPhoto(req.user.id, null))));
  // anyone you share a team with (platform admins see everyone's)
  app.get('/api/users/:uid/photo', h(async (req, res) => {
    const uid = req.params.uid;
    need(/^[0-9a-f-]{36}$/i.test(uid), 404, 'No photo');
    if (uid !== req.user.id && !req.user.is_platform_admin) {
      const { rows } = await q(`SELECT 1 FROM memberships a JOIN memberships b ON b.tenant_id=a.tenant_id WHERE a.user_id=$1 AND b.user_id=$2 LIMIT 1`, [req.user.id, uid]);
      need(rows.length, 404, 'No photo');
    }
    const { rows: [u] } = await q('SELECT photo FROM users WHERE id=$1', [uid]);
    send(res, u?.photo?.path);
  }));
  // a team manager, for a member of their team
  const canMemberPhoto = async (req) => {
    need(can(req.role, 'members.manage') || req.role.is_owner || req.params.uid === req.user.id, 403, 'Your role can’t change other people’s photos.');
    const { rows: [m] } = await q(`SELECT r.is_owner FROM memberships m JOIN roles r ON r.id=m.role_id WHERE m.tenant_id=$1 AND m.user_id=$2`, [req.tid, req.params.uid]);
    need(m, 404, 'That person isn’t in this team.');
    need(!m.is_owner || req.role.is_owner || req.params.uid === req.user.id, 403, 'Only an owner can change an owner’s photo.');
  };
  T.put('/members/:uid/photo', upload.single('file'), tooBig, h(async (req, res) => { await canMemberPhoto(req); res.json(await userPhotoPut(req.params.uid, req)); }));
  T.delete('/members/:uid/photo', h(async (req, res) => { await canMemberPhoto(req); res.json(await setUserPhoto(req.params.uid, null)); }));
}

