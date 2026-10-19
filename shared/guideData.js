// Data behind the user guide that comes from the app itself, so it can't go out of date:
//  - SETTINGS: every setting and option — where it is, who can change it, what it does and
//    which article explains it. tools/check-guide.mjs fails the build when the code gains a
//    setting that isn't listed here.
//  - EMBEDS: live tables an article can include with {{name}} on a line of its own.
import { DEFAULT_ROLES, MODULES, AREAS, FEATURES, PLANS, ADMIN_PERMISSIONS, moduleActions } from './catalog.js';
import { TEAM_TYPES, JOB_STATUSES } from './shop.js';
import { CALCS, CATEGORIES } from './calcs.js';
import { STANDARD_THEMES } from './themes.js';
import { ADJUSTERS, ADJUST_TYPES } from './baseForms2.js';

/**
 * scope: who the setting belongs to. code: the keys the build check matches against the code —
 * team:<key> (team settings), pref:<key> (a person's preferences), platform:<key> (general
 * platform settings), ai:<key> (platform AI settings), plan:<key> (plan fields), option:<name>
 * (switches stored on a record).
 */
export const SETTINGS = [
  // ---- your own account ----
  { id: 'theme', scope: 'Your account', label: 'Theme', where: 'Profile & device → Appearance', who: 'Each person, for themselves', what: 'Pick a standard theme or make your own (up to 12). Follows you to every device.', article: 'appearance', code: ['pref:theme', 'pref:custom_themes'] },
  { id: 'nav', scope: 'Your account', label: 'Sidebar sections', where: 'Arrow beside each sidebar heading, or Profile & device → Appearance', who: 'Each person, for themselves', what: 'Collapse sidebar sections to just their heading, or show and hide them.', article: 'appearance', code: ['pref:nav_collapsed'] },
  { id: 'checklist', scope: 'Your account', label: 'Hide the setup checklist', where: 'Home → Set up your team → Hide', who: 'Owners and team admins', what: 'Hides the getting-started checklist on Home for this team. Bring it back from Help → Getting started.', article: 'getting-started', code: ['pref:hidden_checklists'] },
  { id: 'password', scope: 'Your account', label: 'Password, install and sync', where: 'Profile & device', who: 'Each person', what: 'Change your password, install the app on this device, sync now, re-download all data or sign out.', article: 'offline-sync', code: [] },
  // ---- team ----
  { id: 'team_name', scope: 'Team', label: 'Team name', where: 'Team → Members & invites → Team settings', who: 'Owner, or a role with “Edit team settings”', what: 'Renames the team everywhere.', article: 'team-settings', code: [] },
  { id: 'team_type', scope: 'Team', label: 'Team type', where: 'Team → Members & invites → Team type & engine shop', who: 'Owner, or a role with “Edit team settings”', what: 'Race team, engine shop, or both. Decides which areas show in the menu and on Home.', article: 'team-type', code: ['team:team_type'] },
  { id: 'shop', scope: 'Team', label: 'Shop settings (labour rate, tax, job prefix, terms)', where: 'Team → Members & invites → Team type & engine shop', who: 'Owner, or a role with “Edit team settings”', what: 'Labour rate, tax rate and name, whether prices include tax, the job number prefix and the terms printed on handover packs.', article: 'shop-settings', code: ['team:shop'] },
  { id: 'weather_units', scope: 'Team', label: 'Weather units', where: 'Any setup sheet → Weather → units (US / metric)', who: 'Owner, or a role with “Edit team settings”', what: 'US (°F, inHg, ft) or metric for every setup sheet’s weather.', article: 'weather', code: ['team:weather_units'] },
  { id: 'ai_off', scope: 'Team', label: 'AI on or off for the team', where: 'Team → Members & invites → AI assistant', who: 'Owner, or a role with “Edit team settings”', what: 'Turns the AI assistant off (or back on) for everyone in the team.', article: 'ai-assistant', code: ['team:ai_off'] },
  { id: 'classes', scope: 'Team', label: 'Classes we race', where: 'At the Track → Tracks → Classes we race', who: 'Owner, or a role with “Edit team settings”', what: 'Tracks that run these classes are listed under Our tracks.', article: 'tracks', code: ['team:classes'] },
  { id: 'roles', scope: 'Team', label: 'Roles & permissions', where: 'Team → Roles & permissions', who: 'Owner, or a role with “Create & edit roles”', what: 'Make roles and choose which areas they enter and what they can view, edit and delete.', article: 'roles-permissions', code: [] },
  { id: 'invites', scope: 'Team', label: 'Invites and members', where: 'Team → Members & invites', who: 'Owner, or a role with “Invite & manage members”', what: 'Invite people with a role, change roles, remove members.', article: 'members-invites', code: [] },
  { id: 'forms', scope: 'Team', label: 'Forms, fields and field descriptions', where: 'Team → Forms', who: 'Owner, or a role with “Edit forms & fields”', what: 'Add, hide or reorder fields and sections, and write your own ⓘ descriptions.', article: 'forms', code: [] },
  // ---- on a record ----
  { id: 'feed_lifecycle', scope: 'On a record', label: 'Count our laps on the shop’s service tracker', where: 'Engine Builds → Engines from your engine builder → the engine → Service tracking (also offered when you accept the link)', who: 'Anyone who can edit assets', what: 'Per engine, off by default. When on, your laps on that engine since its last service count on the engine shop’s lifecycle bars. The shop never sees your setups.', article: 'linked-engines', code: ['option:feed_lifecycle'] },
  { id: 'share_link', scope: 'On a record', label: 'Engine page link (no login)', where: 'A customer engine → Customer access', who: 'Engine shop staff who can edit assets', what: 'A private link that shows the owner the engine’s builds and work history. Replace or turn off at any time.', article: 'share-engine-page', code: ['option:share_link'] },
  { id: 'team_link', scope: 'On a record', label: 'Link to the owner’s RaceOps team', where: 'A customer engine → Customer access → Invite the owner’s team', who: 'Engine shop staff who can edit assets', what: 'Connects the engine to the owner’s team: they see your build history, you see their laps since the last service.', article: 'link-owner-team', code: ['option:team_link'] },
  { id: 'share_prices', scope: 'On a record', label: 'Show prices to the customer', where: 'A job → Show prices to the customer', who: 'Engine shop staff who can edit jobs', what: 'Prices on that job show on the engine page link and the owner team’s copy. Off by default.', article: 'shop-jobs', code: ['option:share_prices'] },
  { id: 'baseline', scope: 'On a record', label: 'Save as a baseline setup', where: 'A setup sheet → Save as a baseline setup', who: 'Anyone who can edit setups', what: 'Keeps the sheet as a named starting point for any event.', article: 'setup-sheets', code: ['option:baseline'] },
  { id: 'car_fuel', scope: 'On a record', label: 'Minimum fuel (pickup), gear list, ring & pinion', where: 'Team → Cars → the car', who: 'Anyone who can edit cars', what: 'Used by the fuel planner, gear calculator and final drive on setup sheets.', article: 'cars', code: ['option:fuel_min', 'option:rp_ratio', 'option:gear_list'] },
  { id: 'shock_info', scope: 'On a record', label: 'Shock position and adjustable type', where: 'Workshop → Assets → the shock', who: 'Anyone who can edit assets', what: 'Position decides which corner lists the shock first on setup sheets; the type decides which adjuster boxes show.', article: 'assets', code: ['option:position', 'option:adjust_type'] },
  // ---- platform ----
  { id: 'app_name', scope: 'Platform', label: 'App name, support email, invite lifetime', where: 'Platform admin → Settings', who: 'Platform admins', what: 'Name shown in the menu and browser tab, the support email shown to users, and how long invite links last.', article: 'platform-admin', code: ['platform:app_name', 'platform:support_email', 'platform:invite_days'] },
  { id: 'defaults', scope: 'Platform', label: 'Default plan and seats for new teams', where: 'Platform admin → Settings', who: 'Platform admins', what: 'What a new team starts with.', article: 'platform-admin', code: ['platform:default_plan', 'platform:default_seats'] },
  { id: 'announcement', scope: 'Platform', label: 'Announcement banner', where: 'Platform admin → Settings', who: 'Platform admins', what: 'A banner for every user (Information / Warning / Critical) with an optional end date.', article: 'platform-admin', code: ['platform:announcement'] },
  { id: 'licences', scope: 'Platform', label: 'Team plan, status, seats, licence end, feature overrides, team type', where: 'Platform admin → Teams & licences', who: 'Platform admins', what: 'What each team can use and until when.', article: 'platform-admin', code: [] },
  { id: 'plans', scope: 'Platform', label: 'Plans: features, seats, licences, price note, shared engines limit', where: 'Platform admin → Plans & allocation', who: 'Platform admins', what: 'What each plan includes, seats per team, licences to allocate, and how many engines a shop can share at once.', article: 'platform-admin', code: ['plan:features', 'plan:seats', 'plan:pool', 'plan:price', 'plan:share_limit'] },
  { id: 'ai_platform', scope: 'Platform', label: 'AI assistant: on/off, models, allowance, prices', where: 'Platform admin → AI assistant', who: 'Platform admins', what: 'Turn AI on for the server, pick the models, set each team’s monthly allowance and the token prices used for estimates.', article: 'ai-assistant', code: ['ai:enabled', 'ai:model_fast', 'ai:model_smart', 'ai:monthly_usd', 'ai:prices'] },
  { id: 'pick_lists', scope: 'Platform', label: 'Pick-lists', where: 'Platform admin → Pick-lists', who: 'Platform admins', what: 'Track conditions, car behaviour, contact roles, supplier categories and race classes every team picks from.', article: 'platform-admin', code: [] },
  { id: 'directory', scope: 'Platform', label: 'Track directory, shared contacts and tuning guides', where: 'Platform admin → Tracks & directory', who: 'Platform admins', what: 'The shared track list and records every team can read.', article: 'platform-admin', code: [] },
];

// ---------------- live tables ----------------
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');
const moduleLabel = Object.fromEntries(MODULES.map((m) => [m.key, m.label]));

function rolesTable() {
  return table(['Role', 'What it’s for', 'Can edit', 'Can view only'], DEFAULT_ROLES.map((r) => {
    if (r.is_owner) return [`**${r.name}**`, r.description, 'Everything, including roles, members and settings', '—'];
    const edit = MODULES.filter((m) => r.permissions.includes(`${m.key}.edit`)).map((m) => m.label);
    const view = MODULES.filter((m) => r.permissions.includes(`${m.key}.view`) && !r.permissions.includes(`${m.key}.edit`)).map((m) => m.label);
    const admin = ADMIN_PERMISSIONS.filter((p) => r.permissions.includes(p.key)).map((p) => p.label);
    return [`**${r.name}**`, r.description, [...edit, ...admin].join(', ') || '—', view.join(', ') || '—'];
  }));
}

export const EMBEDS = {
  settings: () => ['Your account', 'Team', 'On a record', 'Platform'].map((scope) => `### ${scope}\n\n${table(['Setting', 'Where', 'Who can change it', 'What it does'],
    SETTINGS.filter((s) => s.scope === scope).map((s) => [`[${s.label}](/help/${s.article})`, s.where, s.who, s.what]))}`).join('\n\n'),
  roles: rolesTable,
  permissions: () => table(['Area', 'Module', 'Actions'], MODULES.map((m) => [AREAS.find((a) => a.key === m.area)?.label || 'Shared (every area)', m.label, moduleActions(m).join(', ')]))
    + `\n\nTeam admin rights: ${ADMIN_PERMISSIONS.map((p) => `**${p.label}**`).join(', ')}.`,
  'team-types': () => table(['Team type', 'What it’s for'], Object.values(TEAM_TYPES).map((t) => [`**${t.label}**`, t.blurb])),
  'job-statuses': () => table(['Status', 'Open job?'], JOB_STATUSES.map((s) => [s.key, s.open ? 'Yes' : 'No — finished'])),
  plans: () => table(['Plan', 'Includes'], Object.values(PLANS).map((p) => [`**${p.label}**`, p.features.map((f) => FEATURES.find((x) => x.key === f)?.label || f).join(', ')])),
  calculators: () => CATEGORIES.map((c) => `### ${c.label}\n\n${table(['Calculator', 'What it does'], CALCS.filter((x) => x.cat === c.key).map((x) => [`**${x.title}**`, x.blurb || '']))}`).join('\n\n'),
  themes: () => table(['Theme', 'Look'], [['**Match this device**', 'Light or dark, following the phone or computer setting'], ...STANDARD_THEMES.map((t) => [`**${t.name}**`, t.note || (t.base === 'dark' ? 'Dark' : 'Light')])]),
  adjusters: () => table(['Shock type', 'Adjuster boxes on the setup sheet'], ADJUST_TYPES.map((t) => [t, t === 'Non-adjustable' ? 'None — shows “Not adjustable”' : (ADJUSTERS[t] || []).join(', ')])),
  modules: () => table(['Module', 'Area'], MODULES.map((m) => [moduleLabel[m.key], AREAS.find((a) => a.key === m.area)?.label || 'Shared'])),
};

/** Replace {{name}} lines with their live tables. Unknown names are left visible so the check catches them. */
export const expandEmbeds = (body) => body.replace(/^\{\{([a-z-]+)\}\}\s*$/gm, (m, k) => (EMBEDS[k] ? EMBEDS[k]() : m));
