import { q } from './db.js';
import { DEFAULT_GENERAL, DEFAULT_AI, LISTS, mergePlans, announcementActive } from '../../shared/platform.js';

// Platform settings are small and read on every request, so they are cached in memory
// and reloaded whenever an admin saves (single server process).
let cache = null;

export async function loadSettings() {
  const { rows } = await q('SELECT key, value FROM platform_settings');
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const general = { ...DEFAULT_GENERAL, ...(raw.general || {}) };
  general.announcement = { ...DEFAULT_GENERAL.announcement, ...(raw.general?.announcement || {}) };
  cache = {
    plans: mergePlans(raw.plans),
    storedPlans: raw.plans || {},
    general,
    lists: Object.fromEntries(LISTS.map((l) => [l.key, Array.isArray(raw.lists?.[l.key]) ? raw.lists[l.key] : l.default])),
    customLists: raw.lists || {},
    ai: { ...DEFAULT_AI, ...(raw.ai || {}), prices: { ...DEFAULT_AI.prices, ...(raw.ai?.prices || {}) } },
  };
  return cache;
}

export const settings = () => cache;

export async function saveSetting(key, value, userId) {
  await q(`INSERT INTO platform_settings(key,value,updated_by,updated_at) VALUES ($1,$2,$3,now())
           ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`,
  [key, JSON.stringify(value), userId]);
  return loadSettings();
}

/** What every signed-in device receives (and keeps for offline use). */
export function publicSettings() {
  const s = cache;
  return {
    app_name: s.general.app_name || 'RaceOps',
    support_email: s.general.support_email || '',
    announcement: announcementActive(s.general.announcement) ? s.general.announcement : null,
    lists: s.lists,
  };
}

export async function audit(userId, action, target, detail = {}) {
  await q('INSERT INTO admin_audit(user_id,action,target,detail) VALUES ($1,$2,$3,$4)', [userId, action, target, JSON.stringify(detail)]);
}

/** Seats a team may use: its own allocation, else its plan's, else unlimited (null). */
export function seatLimit(t) {
  if (t.seats !== null && t.seats !== undefined) return t.seats;
  const p = cache.plans[t.plan];
  return p?.seats ?? null;
}
