// Email notifications (shared-calendar requests, decisions, questions and followed series/tracks; feedback and roadmap).
// Set SMTP_HOST (and SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE) in the Portainer stack to
// turn them on; APP_URL makes links in emails point at the app. Without SMTP_HOST nothing is sent.
// MAIL_TRANSPORT=file writes each email as JSON into MAIL_OUTBOX instead (automated tests only).
import fs from 'node:fs';
import path from 'node:path';
import { q } from './db.js';
import { settings } from './settings.js';

let transport = null;
const fileMode = () => process.env.MAIL_TRANSPORT === 'file';
export const mailConfigured = () => fileMode() || !!process.env.SMTP_HOST;
export const mailFrom = () => process.env.SMTP_FROM || process.env.SMTP_USER || `RaceOps <no-reply@${process.env.SMTP_HOST || 'localhost'}>`;

async function getTransport() {
  if (transport) return transport;
  const { default: nodemailer } = await import('nodemailer');
  const port = Number(process.env.SMTP_PORT || 587);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    disableFileAccess: true, disableUrlAccess: true,
  });
  return transport;
}

const link = (p) => (p && process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}${p}` : '');

/** Send one email; failures are logged, never thrown (notifications must not break the request). */
export async function sendMail({ to, subject, text, path: appPath }) {
  if (!mailConfigured() || !to?.length) return false;
  const app = settings().general?.app_name || 'RaceOps';
  const url = link(appPath);
  const msg = { from: mailFrom(), to: [...new Set(to)].join(', '), subject: `${app}: ${subject}`, text: `${text}${url ? `\n\n${url}` : ''}\n\n— ${app}\nYou can turn these emails off under your profile in ${app}.` };
  try {
    if (fileMode()) {
      const dir = process.env.MAIL_OUTBOX || '/tmp/raceops-outbox';
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`), JSON.stringify(msg));
      return true;
    }
    await (await getTransport()).sendMail(msg);
    return true;
  } catch (e) {
    console.error('Email not sent:', e.message);
    return false;
  }
}

const wants = (u) => u.email && u.prefs?.email_notices !== false && !u.disabled;

/** Platform admins (who haven't turned these emails off). */
export async function mailAdmins(subject, text, appPath) {
  if (!mailConfigured()) return;
  const { rows } = await q(`SELECT email, prefs, disabled FROM users WHERE is_platform_admin`);
  await sendMail({ to: rows.filter(wants).map((u) => u.email), subject, text, path: appPath });
}

/** Team members who look after the calendar (owners, and roles with Calendars → edit), plus extra users. */
export async function mailTeam(tid, subject, text, appPath, extraUserIds = []) {
  if (!mailConfigured() || !tid) return;
  const { rows } = await q(`SELECT u.id, u.email, u.prefs, u.disabled, r.is_owner, r.permissions FROM memberships m
      JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id WHERE m.tenant_id=$1`, [tid]);
  const to = rows.filter((u) => wants(u) && (u.is_owner || (u.permissions || []).includes('calendar.edit') || extraUserIds.includes(u.id))).map((u) => u.email);
  await sendMail({ to, subject, text, path: appPath });
}

/** One person (if they haven't turned these emails off). */
export async function mailUser(userId, subject, text, appPath) {
  if (!mailConfigured() || !userId) return;
  const { rows } = await q(`SELECT email, prefs, disabled FROM users WHERE id=$1`, [userId]);
  await sendMail({ to: rows.filter(wants).map((u) => u.email), subject, text, path: appPath });
}
