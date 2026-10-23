// Shared between server and web app: areas, modules, record types, permissions and
// licensed features.
//
// Access to a record type requires ALL of:
//   1. the team is licensed for the area and the module's feature  (entitlements)
//   2. the role can enter the area                                  (area.<key>)
//   3. the role has the module action                               (<module>.<view|edit|delete>)
// Owners skip 2 and 3 but never 1.

export const AREAS = [
  {
    key: 'track', label: 'At the Track', short: 'Track',
    blurb: 'Events, setup sheets per session, between-round checks, gears and tire stagger.',
    roadmap: ['Weather station / phone sensor auto-fill', 'Lap-time & transponder import', 'Setup suggestions from past results at the same track'],
  },
  {
    key: 'workshop', label: 'In the Workshop', short: 'Workshop',
    blurb: 'Car checklists, service schedules, asset lifecycle and shock & bar dyno testing.',
    roadmap: ['Dyno file import (Slade / Intercomp / Roehrig CSV)', 'Parts ordering & re-stock alerts', 'QR labels for assets'],
  },
  {
    key: 'engines', label: 'Engine Builds', short: 'Engines',
    blurb: 'Full build sheets per engine: block, crank, cam, pistons, heads, valvetrain and torque specs.',
    roadmap: ['Per-cylinder piston volume & CC calculators', 'Dyno sheet (HP/torque) overlays', 'Freshen reminders from engine laps'],
  },
  {
    key: 'team', label: 'Team Management', short: 'Team',
    blurb: 'Members, roles & permissions, forms, reporting, Crew Chief stats and performance reviews.',
    roadmap: ['Scheduled PDF/email reports', 'Licensing & billing self-service', 'Season budget vs spend'],
  },
];

// area: null = shared core data every area relies on (cars).
export const MODULES = [
  { key: 'cars', label: 'Cars', types: ['car'], area: null },
  { key: 'contacts', label: 'Contacts & suppliers', types: ['contact', 'contact_link', 'supplier'], area: null },
  { key: 'tracks', label: 'Tracks', types: ['track', 'team_track'], area: 'track' },
  { key: 'events', label: 'Events & series', types: ['event', 'series'], area: 'track' },
  // the team's racing calendar, the shared series / track / major-event calendars it pulls from, and
  // series entries. Shown under Team Management, but open to any role with the right (no area needed),
  // so drivers and crew can see where the team is racing.
  { key: 'calendar', label: 'Calendars', types: ['fixture', 'season_plan', 'local_note', 'follow'], area: null },
  { key: 'setups', label: 'Setup sheets & advisor', types: ['setup', 'tuning_guide'], area: 'track' },
  { key: 'trackside', label: 'At-track checks', types: ['track_check'], area: 'track', feature: 'trackside' },
  { key: 'gears', label: 'Gears & tires', types: ['gear', 'gear_list', 'tire'], area: 'track', feature: 'gears' },
  { key: 'maintenance', label: 'Car maintenance', types: ['maintenance', 'schedule'], area: 'workshop' },
  { key: 'assets', label: 'Assets', types: ['asset', 'measurement'], area: 'workshop' },
  { key: 'shopsetups', label: 'Workshop setup sheets', types: ['shop_setup'], area: 'workshop' },
  { key: 'dyno', label: 'Shock & bar dyno', types: ['dyno_run'], area: 'workshop', feature: 'dyno' },
  { key: 'engines', label: 'Engine builds', types: ['engine_build'], area: 'engines' },
  // engine shop work for customers (shown to teams set up as an engine shop)
  { key: 'jobs', label: 'Shop jobs (parts & labour)', types: ['job'], area: 'engines' },
  { key: 'customers', label: 'Customers', types: ['customer'], area: 'engines' },
  { key: 'reports', label: 'Reports & Crew Chief stats', types: [], area: 'team', actions: ['view'], feature: 'reports' },
  { key: 'reviews', label: 'Performance reviews', types: ['review'], area: 'team', feature: 'reviews' },
  // AI assistant: photo fill, voice debrief, Ask RaceOps (needs the 'ai' licence add-on)
  { key: 'ai', label: 'AI assistant', types: [], area: null, actions: ['view'], feature: 'ai' },
  // charts and trends worked out from the team's own records
  { key: 'analytics', label: 'Analytics', types: [], area: null, actions: ['view'], feature: 'analytics' },
];

export const ACTIONS = ['view', 'edit', 'delete'];
export const moduleActions = (m) => m.actions || ACTIONS;

export const ADMIN_PERMISSIONS = [
  { key: 'forms.manage', label: 'Edit forms & fields' },
  { key: 'members.manage', label: 'Invite & manage members' },
  { key: 'roles.manage', label: 'Create & edit roles' },
  { key: 'team.manage', label: 'Edit team settings' },
  { key: 'backup.manage', label: 'Back up, restore & export team data' },
  { key: 'trash.manage', label: 'Recover anyone’s deleted items' },
];

export const AREA_PERMISSIONS = AREAS.map((a) => ({ key: `area.${a.key}`, label: `Enter “${a.label}”` }));

export const ALL_PERMISSIONS = [
  ...AREA_PERMISSIONS.map((p) => p.key),
  ...MODULES.flatMap((m) => moduleActions(m).map((a) => `${m.key}.${a}`)),
  ...ADMIN_PERMISSIONS.map((p) => p.key),
];

export const TYPE_MODULE = Object.fromEntries(MODULES.flatMap((m) => m.types.map((t) => [t, m.key])));
export const MODULE = Object.fromEntries(MODULES.map((m) => [m.key, m]));
export const RECORD_TYPES = [...Object.keys(TYPE_MODULE), 'form'];

// Types that can live in the shared, cross-team directory (tenant_id NULL on the server).
// Only platform admins create or change global records; every team can read them. Teams send
// series, tracks and dates to the shared calendars as requests (server/src/calendarRequests.js).
export const GLOBAL_TYPES = ['track', 'contact', 'supplier', 'contact_link', 'tuning_guide', 'series', 'fixture'];

// ---------------- licensing ----------------
export const FEATURES = [
  ...AREAS.map((a) => ({ key: a.key, label: a.label, area: a.key })),
  { key: 'trackside', label: 'At-track checks', area: 'track' },
  { key: 'gears', label: 'Gears & tires / stagger', area: 'track' },
  { key: 'dyno', label: 'Shock & bar dyno', area: 'workshop' },
  { key: 'reports', label: 'Reports & Crew Chief stats', area: 'team' },
  { key: 'reviews', label: 'Performance reviews', area: 'team' },
  { key: 'analytics', label: 'Analytics', area: null },
  { key: 'ai', label: 'AI assistant', area: null, addon: true },
];
const ALL_FEATURE_KEYS = FEATURES.map((f) => f.key);

export const PLANS = {
  pro: { label: 'Pro — everything', features: ALL_FEATURE_KEYS },
  trackside: { label: 'Trackside — track + workshop basics', features: ['track', 'trackside', 'gears', 'workshop', 'team', 'analytics'] },
  engine_shop: { label: 'Engine shop — workshop + engines', features: ['workshop', 'dyno', 'engines', 'team', 'reports'] },
};

/** Effective feature set for a team: plan defaults, then per-team overrides { key: bool }. */
export function entitlements(tenant, plans = PLANS) {
  if (Array.isArray(tenant?.entitlements)) return new Set(tenant.entitlements); // computed by the server
  const plan = plans[tenant?.plan] || plans.pro || PLANS.pro;
  const set = new Set(plan.features);
  for (const [k, on] of Object.entries(tenant?.features || {})) { if (on) set.add(k); else set.delete(k); }
  return set;
}

export const moduleLicensed = (ent, m) => !!m && (!m.area || ent.has(m.area)) && (!m.feature || ent.has(m.feature));
export const areaLicensed = (ent, area) => ent.has(area);

// ---------------- permission checks ----------------
export function can(role, perm) {
  if (!role) return false;
  if (role.is_owner) return true;
  return (role.permissions || []).includes(perm);
}

export const canArea = (role, ent, area) => areaLicensed(ent, area) && can(role, `area.${area}`);

export function canModule(role, ent, modKey, action) {
  const m = MODULE[modKey];
  if (!moduleLicensed(ent, m)) return false;
  if (m.area && !can(role, `area.${m.area}`)) return false;
  return can(role, `${modKey}.${action}`);
}

export function canType(role, ent, type, action) {
  if (!role) return false;
  if (type === 'form') return action === 'view' ? true : can(role, 'forms.manage');
  const mod = TYPE_MODULE[type];
  return mod ? canModule(role, ent, mod, action) : false;
}

const mod = (keys, actions) => keys.flatMap((k) => actions.filter((a) => moduleActions(MODULE[k]).includes(a)).map((a) => `${k}.${a}`));
const areas = (...keys) => keys.map((k) => `area.${k}`);
const allMods = MODULES.map((m) => m.key);

export const DEFAULT_ROLES = [
  { name: 'Owner', description: 'Full control of the team', is_owner: true, permissions: [] },
  {
    name: 'Crew Chief',
    description: 'Runs the car at the track and in the workshop; edits forms; sees reports',
    permissions: [...areas('track', 'workshop', 'engines', 'team'), ...mod(allMods.filter((m) => m !== 'reviews'), ACTIONS), 'forms.manage'],
  },
  {
    name: 'Mechanic',
    description: 'Workshop and engine work; reads setups and track checks',
    permissions: [
      ...areas('track', 'workshop', 'engines'),
      ...mod(['cars', 'events', 'calendar', 'setups', 'gears', 'tracks', 'contacts', 'ai', 'analytics'], ['view']),
      ...mod(['trackside', 'maintenance', 'assets', 'dyno', 'engines', 'jobs', 'shopsetups'], ['view', 'edit']),
      ...mod(['customers'], ['view']),
    ],
  },
  {
    name: 'Driver / Viewer',
    description: 'Read-only access at the track',
    permissions: [...areas('track'), ...mod(['cars', 'events', 'calendar', 'setups', 'gears', 'tracks', 'contacts', 'ai', 'analytics'], ['view'])],
  },
];
