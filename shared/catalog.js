// Shared between server and web app: modules, record types and permissions.
// Phase 2 modules (dyno, gears, tires, engines) are listed with phase: 2 so roles
// can be prepared now; their screens arrive in the next release.

export const MODULES = [
  { key: 'cars', label: 'Cars', types: ['car'] },
  { key: 'events', label: 'Events', types: ['event'] },
  { key: 'setups', label: 'Setups', types: ['setup'] },
  { key: 'maintenance', label: 'Maintenance', types: ['maintenance', 'schedule'] },
  { key: 'assets', label: 'Assets', types: ['asset', 'measurement'] },
  { key: 'dyno', label: 'Shock & bar dyno', types: ['dyno_run'], phase: 2 },
  { key: 'gears', label: 'Gears & tires', types: ['gear', 'tire'], phase: 2 },
  { key: 'engines', label: 'Engine builds', types: ['engine_build'], phase: 2 },
];

export const ACTIONS = ['view', 'edit', 'delete'];

export const ADMIN_PERMISSIONS = [
  { key: 'forms.manage', label: 'Edit forms & fields' },
  { key: 'members.manage', label: 'Invite & manage members' },
  { key: 'roles.manage', label: 'Create & edit roles' },
  { key: 'team.manage', label: 'Edit team settings' },
];

export const ALL_PERMISSIONS = [
  ...MODULES.flatMap((m) => ACTIONS.map((a) => `${m.key}.${a}`)),
  ...ADMIN_PERMISSIONS.map((p) => p.key),
];

export const TYPE_MODULE = Object.fromEntries(
  MODULES.flatMap((m) => m.types.map((t) => [t, m.key]))
);

export const RECORD_TYPES = [...Object.keys(TYPE_MODULE), 'form'];

/** role: { is_owner, permissions[] } */
export function can(role, perm) {
  if (!role) return false;
  if (role.is_owner) return true;
  return (role.permissions || []).includes(perm);
}

export function canType(role, type, action) {
  if (type === 'form') return action === 'view' ? !!role : can(role, 'forms.manage');
  const mod = TYPE_MODULE[type];
  if (!mod) return false;
  return can(role, `${mod}.${action}`);
}

const viewAll = MODULES.map((m) => `${m.key}.view`);
const mod = (keys, actions) => keys.flatMap((k) => actions.map((a) => `${k}.${a}`));

export const DEFAULT_ROLES = [
  { name: 'Owner', description: 'Full control of the team', is_owner: true, permissions: [] },
  {
    name: 'Crew Chief',
    description: 'Runs setups, maintenance and assets; edits forms',
    permissions: [...mod(MODULES.map((m) => m.key), ACTIONS), 'forms.manage'],
  },
  {
    name: 'Mechanic',
    description: 'Logs maintenance, assets and measurements; reads setups',
    permissions: [...viewAll, ...mod(['maintenance', 'assets', 'dyno', 'gears', 'engines'], ['edit'])],
  },
  {
    name: 'Driver / Viewer',
    description: 'Read-only access to cars, events and setups',
    permissions: ['cars.view', 'events.view', 'setups.view'],
  },
];
