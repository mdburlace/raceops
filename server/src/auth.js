import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { q } from './db.js';
import { entitlements, mergeRoles } from '../../shared/catalog.js';
import { licenceState } from '../../shared/platform.js';
import { settings } from './settings.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
if (process.env.NODE_ENV === 'production' && (SECRET === 'dev-secret-change-me' || SECRET.length < 24)) {
  console.error('JWT_SECRET must be set to a random string of at least 24 characters.');
  process.exit(1);
}
// Long-lived so the installed app keeps working through offline race weekends.
const TTL = process.env.JWT_TTL || '60d';

export const hashPassword = (p) => bcrypt.hash(p, 10);
export const checkPassword = (p, h) => bcrypt.compare(p, h);
export const signToken = (user) => jwt.sign({ sub: user.id }, SECRET, { expiresIn: TTL });
export const randomToken = () => crypto.randomBytes(24).toString('base64url');

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function requireAuth(req, _res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
    if (!token) throw new HttpError(401, 'Not signed in');
    let payload;
    try { payload = jwt.verify(token, SECRET); } catch { throw new HttpError(401, 'Session expired'); }
    const { rows } = await q("SELECT id, email, name, is_platform_admin, disabled, prefs, photo->>'at' AS photo_at FROM users WHERE id=$1", [payload.sub]);
    if (!rows[0]) throw new HttpError(401, 'User not found');
    if (rows[0].disabled) throw new HttpError(401, 'This account has been disabled');
    req.user = rows[0];
    next();
  } catch (e) { next(e); }
}

/** Loads the caller's membership/role for :tid. */
export async function requireMember(req, _res, next) {
  try {
    const { rows } = await q(
      `SELECT r.id, r.name, r.permissions, r.is_owner, t.plan, t.features, t.status, t.licence_expires, m.extra_role_ids
         FROM memberships m JOIN roles r ON r.id = m.role_id JOIN tenants t ON t.id = m.tenant_id
        WHERE m.user_id=$1 AND m.tenant_id=$2`,
      [req.user.id, req.params.tid]
    );
    if (!rows[0]) throw new HttpError(403, 'Not a member of this team');
    const state = licenceState(rows[0]);
    if (state === 'suspended' && !req.user.is_platform_admin) throw new HttpError(403, 'This team has been suspended. Contact the platform administrator.');
    // a member with more than one role gets everything any of them allows (the main role keeps its id)
    req.role = rows[0];
    if (rows[0].extra_role_ids?.length) {
      const { rows: extra } = await q('SELECT id, name, permissions, is_owner FROM roles WHERE id = ANY($1) AND tenant_id=$2', [rows[0].extra_role_ids, req.params.tid]);
      req.role = { ...rows[0], ...mergeRoles([rows[0], ...extra]), id: rows[0].id };
    }
    req.ent = entitlements(rows[0], settings().plans);
    // an expired licence keeps the data readable but stops changes
    req.readOnly = state === 'expired' && !req.user.is_platform_admin;
    req.tid = req.params.tid;
    next();
  } catch (e) { next(e); }
}
