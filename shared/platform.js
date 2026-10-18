// Platform-wide (global admin) settings shared by server and web app.
import { PLANS, FEATURES } from './catalog.js';
import { TRACK_CONDITIONS, CAR_BEHAVIOUR, CONTACT_ROLES } from './baseForms3.js';

export const SUPPLIER_CATEGORIES = ['Parts', 'Tires', 'Fuel & oil', 'Engines', 'Shocks & suspension', 'Chassis', 'Safety gear', 'Services', 'Other'];
export const RACE_CLASSES = ['410 Sprintcars', '360 Sprintcars', '305 Sprintcars', 'Wingless Sprints', 'Speedcars / Midgets', 'Micro Sprints',
  'Late Models', 'Modifieds', 'Super Sedans', 'Street Stocks', 'Junior Sedans', 'Formula 500', 'Compact Speedcars'];

/** Global pick-lists. `fields` are the form fields ([target, key]) that take their choices from the list. */
export const LISTS = [
  { key: 'track_conditions', label: 'Track conditions', help: 'Quick-pick descriptions on setup sheets.', default: TRACK_CONDITIONS, fields: [['setup', 'track_conditions']] },
  { key: 'car_behaviour', label: 'Car behaviour', help: 'Driver and crew lead feedback on setup sheets.', default: CAR_BEHAVIOUR, fields: [['setup', 'driver_feel'], ['setup', 'crew_feel']] },
  { key: 'contact_roles', label: 'Contact roles', help: 'Roles a contact can hold with a track, supplier, series, event or car.', default: CONTACT_ROLES, fields: [['contact_link', 'role']] },
  { key: 'supplier_categories', label: 'Supplier categories', help: 'Categories for team suppliers.', default: SUPPLIER_CATEGORIES, fields: [['supplier', 'category']] },
  { key: 'race_classes', label: 'Race classes', help: 'Class quick-picks for the track directory and each team’s “Classes we race”.', default: RACE_CLASSES, fields: [['track', 'classes']] },
];
export const LIST = Object.fromEntries(LISTS.map((l) => [l.key, l]));
export const listForField = (target, key) => LISTS.find((l) => l.fields.some(([t, k]) => t === target && k === key))?.key || null;

export const DEFAULT_GENERAL = {
  app_name: 'RaceOps',
  default_plan: 'pro',
  default_seats: null, // null = unlimited
  invite_days: 14,
  announcement: { text: '', level: 'info', until: null },
  support_email: '',
};

export const ANNOUNCE_LEVELS = { info: 'Information', warn: 'Warning', critical: 'Critical' };
export const TEAM_STATUS = { active: 'Active', trial: 'Trial', suspended: 'Suspended' };

/** Plans = built-in plans merged with admin edits; admins can add plans. */
export function mergePlans(stored = {}) {
  const out = {};
  for (const [k, p] of Object.entries(PLANS)) out[k] = { label: p.label, features: [...p.features], seats: null, pool: null, price: '', builtin: true };
  for (const [k, p] of Object.entries(stored || {})) {
    if (!p) continue;
    if (p.deleted) { delete out[k]; continue; }
    out[k] = { ...(out[k] || { builtin: false }), ...p, customised: true, features: (p.features || out[k]?.features || []).filter((f) => FEATURES.some((x) => x.key === f)) };
  }
  return out;
}

/** Licence status for a team: active | trial | suspended | expired (read-only). */
export function licenceState(t) {
  if (t?.status === 'suspended') return 'suspended';
  if (t?.licence_expires && new Date(`${String(t.licence_expires).slice(0, 10)}T23:59:59`) < new Date()) return 'expired';
  return t?.status === 'trial' ? 'trial' : 'active';
}

export const announcementActive = (a) => !!(a?.text && (!a.until || new Date(`${String(a.until).slice(0, 10)}T23:59:59`) >= new Date()));
