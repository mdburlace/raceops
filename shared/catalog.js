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
  // each engine's tune (fuel settings for the weather, ending tune, fuel system), in versions. Used at the
  // track, in the workshop and by engine builders, so it needs no area (like the calendar).
  { key: 'enginetunes', label: 'Engine tunes', types: ['engine_tune'], area: null },
  { key: 'enginechecks', label: 'Workshop engine checks', types: ['engine_check'], area: 'workshop' },
  // engine shop work for customers (shown to teams set up as an engine shop)
  { key: 'jobs', label: 'Shop jobs (parts & labour)', types: ['job'], area: 'engines' },
  { key: 'customers', label: 'Customers', types: ['customer'], area: 'engines' },
  { key: 'reports', label: 'Reports & Crew Chief stats', types: [], area: 'team', actions: ['view'], feature: 'reports' },
  { key: 'reviews', label: 'Performance reviews', types: ['review'], area: 'team', feature: 'reviews' },
  // AI assistant: photo fill, voice debrief, Ask RaceOps (needs the 'ai' licence add-on)
  { key: 'ai', label: 'AI assistant', types: [], area: null, actions: ['view'], feature: 'ai' },
  // charts and trends worked out from the team's own records
  { key: 'analytics', label: 'Analytics', types: [], area: null, actions: ['view'], feature: 'analytics' },
  // parts orders: anyone with edit raises a request; a role with "Approve parts orders" approves it
  { key: 'purchases', label: 'Parts orders', types: ['purchase'], area: null },
  // business and logistics modules: no area (like the calendar), each switched on per plan by its feature
  { key: 'finance', label: 'Finance (budget, expenses, income, contracts)', types: ['expense', 'income', 'budget', 'contract'], area: null, feature: 'finance' },
  { key: 'transport', label: 'Transport (trips, load lists, pre-trip checks, licences)', types: ['trip', 'load_list', 'pre_trip', 'licence'], area: null, feature: 'transport' },
  { key: 'partnerships', label: 'Partnerships (sponsors, livery, hospitality)', types: ['sponsor', 'livery', 'guest'], area: null, feature: 'partnerships' },
  { key: 'marketing', label: 'Marketing (media, results posts, merchandise)', types: ['media', 'social_post', 'merch'], area: null, feature: 'marketing' },
];

export const ACTIONS = ['view', 'edit', 'delete'];
export const moduleActions = (m) => m.actions || ACTIONS;

export const ADMIN_PERMISSIONS = [
  { key: 'forms.manage', label: 'Edit forms & fields' },
  { key: 'members.manage', label: 'Invite & manage members' },
  { key: 'roles.manage', label: 'Create & edit roles' },
  { key: 'team.manage', label: 'Edit team settings' },
  { key: 'team.photo', label: 'Change the team photo' },
  { key: 'backup.manage', label: 'Back up, restore & export team data' },
  { key: 'trash.manage', label: 'Recover anyone’s deleted items' },
];

// Rights that sit beside a module's view / edit / delete.
//  - part rights let a role edit only some sections of a record it can otherwise only view (a driver's
//    debrief, the car chief's change list, the tyre specialist's tyre and wheel sections). The server
//    allows a change only when every value that changed is in one of those sections.
//  - money.view shows costs and amounts on parts orders, finance and sponsor deals (MONEY_FIELDS);
//    without it they're hidden on the device and kept unchanged by the server.
//  - purchases.approve: approve or decline parts orders.
//  - setups.unlock: unlock a locked setup sheet (anyone who can edit setups locks one; nobody changes it while locked).
export const PART_PERMISSIONS = [
  { key: 'setups.part.feedback', module: 'setups', type: 'setup', sections: ['feedback'], label: 'Setup sheets: edit only Track conditions & car feedback (driver debrief)' },
  { key: 'setups.part.changes', module: 'setups', type: 'setup', sections: ['changes'], label: 'Setup sheets: tick off the change list' },
  { key: 'setups.part.tires', module: 'setups', type: 'setup', sections: ['tires', 'wheels'], label: 'Setup sheets: edit only the tyre and wheel sections' },
];
export const SPECIAL_PERMISSIONS = [
  ...PART_PERMISSIONS,
  { key: 'purchases.approve', module: 'purchases', label: 'Approve or decline parts orders' },
  { key: 'setups.unlock', module: 'setups', label: 'Unlock locked setup sheets' },
  { key: 'money.view', module: null, label: 'See costs, prices and amounts (parts orders, finance, sponsor deals)' },
];
/** Fields only shown to roles with money.view (top-level values keys, by record type). */
export const MONEY_FIELDS = {
  purchase: ['unit_cost', 'cost'],
  expense: ['amount', 'tax_amount', 'rate'],
  income: ['amount', 'tax_amount', 'rate'],
  budget: ['amount', 'lines', 'income_lines'],
  contract: ['value', 'per_diem', 'pay_per_event'],
  sponsor: ['value', 'payments', 'in_kind'],
  engine_build: ['rebuild_cost'],
  merch: ['cost'],
};
export const moneyFields = (type) => MONEY_FIELDS[type] || [];

export const AREA_PERMISSIONS = AREAS.map((a) => ({ key: `area.${a.key}`, label: `Enter “${a.label}”` }));

export const ALL_PERMISSIONS = [
  ...AREA_PERMISSIONS.map((p) => p.key),
  ...MODULES.flatMap((m) => moduleActions(m).map((a) => `${m.key}.${a}`)),
  ...ADMIN_PERMISSIONS.map((p) => p.key),
  ...SPECIAL_PERMISSIONS.map((p) => p.key),
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
  { key: 'finance', label: 'Finance', area: null },
  { key: 'transport', label: 'Transport', area: null },
  { key: 'partnerships', label: 'Partnerships', area: null },
  { key: 'marketing', label: 'Marketing', area: null },
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

/**
 * Sections of a record type this role may edit without the module's edit right (part rights), or []
 * when it has the full edit right, can't view the type, or has no part rights for it.
 */
export function editableSections(role, ent, type) {
  if (!role || !canType(role, ent, type, 'view') || canType(role, ent, type, 'edit')) return [];
  return [...new Set(PART_PERMISSIONS.filter((p) => p.type === type && can(role, p.key)).flatMap((p) => p.sections))];
}
export const canSeeMoney = (role) => can(role, 'money.view');

/** One role made from several (a member who holds more than one): everything any of them allows. */
export function mergeRoles(roles) {
  const list = (roles || []).filter(Boolean);
  if (!list.length) return null;
  const first = list[0];
  return {
    ...first,
    name: list.map((r) => r.name).join(' + '),
    names: list.map((r) => r.name),
    is_owner: list.some((r) => r.is_owner),
    permissions: [...new Set(list.flatMap((r) => r.permissions || []))],
  };
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

const VIEW_TRACK = ['cars', 'events', 'calendar', 'setups', 'gears', 'tracks', 'contacts', 'ai', 'analytics', 'enginetunes'];
const BUSINESS = ['finance', 'transport', 'partnerships', 'marketing'];

// alias: an older name for the same role, so Add standard roles doesn't add it a second time
export const DEFAULT_ROLES = [
  { name: 'Owner', description: 'Full control of the team', is_owner: true, permissions: [] },
  {
    name: 'Crew Chief',
    description: 'Runs the car at the track and in the workshop; calls changes, approves parts orders, edits forms; sees reports',
    permissions: [...areas('track', 'workshop', 'engines', 'team'), ...mod(allMods.filter((m) => m !== 'reviews' && !BUSINESS.includes(m)), ACTIONS),
      ...mod(['transport'], ['view']), 'forms.manage', 'purchases.approve', 'money.view', 'setups.unlock'],
  },
  {
    name: 'Car Chief',
    description: 'Mechanic who also works the setup sheet’s change list: ticks off each change the crew chief calls',
    permissions: [
      ...areas('track', 'workshop', 'engines'),
      ...mod(['cars', 'events', 'calendar', 'setups', 'gears', 'tracks', 'contacts', 'ai', 'analytics'], ['view']),
      ...mod(['trackside', 'maintenance', 'assets', 'dyno', 'engines', 'jobs', 'shopsetups', 'enginetunes', 'enginechecks', 'purchases'], ['view', 'edit']),
      ...mod(['customers'], ['view']),
      'setups.part.changes',
    ],
  },
  {
    name: 'Mechanic',
    description: 'Workshop and engine work; reads setups and track checks; raises parts orders',
    permissions: [
      ...areas('track', 'workshop', 'engines'),
      ...mod(['cars', 'events', 'calendar', 'setups', 'gears', 'tracks', 'contacts', 'ai', 'analytics'], ['view']),
      ...mod(['trackside', 'maintenance', 'assets', 'dyno', 'engines', 'jobs', 'shopsetups', 'enginetunes', 'enginechecks', 'purchases'], ['view', 'edit']),
      ...mod(['customers'], ['view']),
    ],
  },
  {
    name: 'Tire Specialist',
    description: 'Looks after the tyres: tyre stock and work log, and the tyre and wheel sections of each setup sheet',
    permissions: [
      ...areas('track', 'workshop'),
      ...mod(['cars', 'events', 'calendar', 'setups', 'tracks', 'contacts', 'ai', 'analytics', 'assets'], ['view']),
      ...mod(['gears', 'purchases'], ['view', 'edit']),
      'setups.part.tires',
    ],
  },
  {
    name: 'Driver',
    description: 'Reads the setup at the track; fills in Track conditions & car feedback (the debrief) after each session',
    permissions: [...areas('track'), ...mod(VIEW_TRACK, ['view']), 'setups.part.feedback'],
  },
  {
    name: 'Viewer', alias: 'Driver / Viewer',
    description: 'Read-only access at the track',
    permissions: [...areas('track'), ...mod(VIEW_TRACK, ['view'])],
  },
  {
    name: 'Transport',
    description: 'Hauler driver and transport crew: trips, load lists, pre-trip checks, licences and the team’s vehicles',
    permissions: [
      ...areas('track', 'workshop'),
      ...mod(['cars', 'events', 'calendar', 'tracks', 'contacts', 'engines'], ['view']),
      ...mod(['transport'], ACTIONS), ...mod(['assets', 'maintenance'], ['view', 'edit']),
    ],
  },
  {
    name: 'Business Manager',
    description: 'Office and business manager: budget, expenses, income, contracts, exports to accounting software',
    permissions: [
      ...areas('team'),
      ...mod(['cars', 'events', 'calendar', 'customers', 'jobs', 'reports', 'transport', 'partnerships'], ['view']),
      ...mod(['finance'], ACTIONS), ...mod(['purchases', 'contacts'], ['view', 'edit']),
      'money.view',
    ],
  },
  {
    name: 'Partnerships Manager',
    description: 'Sponsors and partners: deals, deliverables, sponsor reports, paint schemes and hospitality',
    permissions: [
      ...areas('team'),
      ...mod(['cars', 'events', 'calendar', 'reports', 'ai'], ['view']),
      ...mod(['partnerships'], ACTIONS), ...mod(['marketing', 'contacts'], ['view', 'edit']),
      'money.view',
    ],
  },
  {
    name: 'Marketing Manager',
    description: 'Media library, results posts for social media, merchandise and hospitality check-in',
    permissions: [
      ...areas('team'),
      ...mod(['cars', 'events', 'calendar', 'contacts', 'ai'], ['view']),
      ...mod(['marketing'], ACTIONS), ...mod(['partnerships'], ['view', 'edit']), 'team.photo',
    ],
  },
];

/** Standard roles a team doesn't have yet (by name or older name), for Add standard roles. */
export function missingStandardRoles(existingNames) {
  const have = new Set((existingNames || []).map((n) => String(n).trim().toLowerCase()));
  return DEFAULT_ROLES.filter((r) => !r.is_owner && !have.has(r.name.toLowerCase()) && !(r.alias && have.has(r.alias.toLowerCase())));
}
