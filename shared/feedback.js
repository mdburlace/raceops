// Feedback & ideas: shared by the server (validation) and the web app (forms, pipeline, brief for Claude).
import { AREAS, MODULES } from './catalog.js';
import { pathMatches } from './guide.js';

export const KINDS = [
  { key: 'bug', label: 'Something isn’t working', short: 'Bug' },
  { key: 'enhancement', label: 'Improve something that exists', short: 'Enhancement' },
  { key: 'feature', label: 'A new feature', short: 'New feature' },
  { key: 'change', label: 'A change to how something works', short: 'Change' },
];
export const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));
export const USER_KINDS = ['bug', 'enhancement', 'feature'];

export const PRIORITIES = ['low', 'normal', 'high', 'critical'];
export const PRIORITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical' };

export const LANES = [
  { key: 'now', label: 'Now', blurb: 'Being actioned straight away' },
  { key: 'next', label: 'Next', blurb: 'On the roadmap, coming up' },
  { key: 'later', label: 'Later', blurb: 'On the roadmap, further out' },
];
export const LANE = Object.fromEntries(LANES.map((l) => [l.key, l]));

export const STATUS = {
  draft: { label: 'Idea (draft)', level: 'muted' },
  new: { label: 'Waiting for review', level: 'info' },
  approved: { label: 'Approved', level: 'ok' },
  in_progress: { label: 'In progress', level: 'warn' },
  done: { label: 'Done', level: 'ok' },
  declined: { label: 'Not going ahead', level: 'muted' },
  duplicate: { label: 'Already requested', level: 'muted' },
  withdrawn: { label: 'Withdrawn', level: 'muted' },
};
export const OPEN_STATUSES = ['draft', 'new', 'approved', 'in_progress'];

/**
 * Files attached to feedback and ideas. The type comes from the extension (never the browser's say-so):
 * `show` = opened in the browser (pictures, PDFs, videos); everything else downloads.
 */
export const FILE_TYPES = {
  png: { mime: 'image/png', show: 'image' }, jpg: { mime: 'image/jpeg', show: 'image' }, jpeg: { mime: 'image/jpeg', show: 'image' },
  webp: { mime: 'image/webp', show: 'image' }, gif: { mime: 'image/gif', show: 'image' }, heic: { mime: 'image/heic' },
  pdf: { mime: 'application/pdf', show: 'pdf' },
  mp4: { mime: 'video/mp4', show: 'video' }, webm: { mime: 'video/webm', show: 'video' }, mov: { mime: 'video/quicktime', show: 'video' },
  txt: { mime: 'text/plain' }, log: { mime: 'text/plain' }, md: { mime: 'text/markdown' }, csv: { mime: 'text/csv' }, json: { mime: 'application/json' },
  doc: { mime: 'application/msword' }, docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xls: { mime: 'application/vnd.ms-excel' }, xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  zip: { mime: 'application/zip' },
};
export const FILE_LIMITS = { perItem: 5, mb: 20 };
export const FILE_ACCEPT = Object.keys(FILE_TYPES).map((x) => `.${x}`).join(',');
export const FILE_KINDS_TEXT = 'pictures, screen recordings (MP4, WebM, MOV), PDFs, Word, Excel and PowerPoint files, text, CSV, JSON and log files, and ZIP files';
export const fileExt = (name) => (/\.([a-z0-9]+)$/i.exec(String(name || ''))?.[1] || '').toLowerCase();
export const fileType = (name) => FILE_TYPES[fileExt(name)] || null;
export const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Functionality areas an item can be linked to. Each knows where its code lives, so the brief sent
 * to Claude points at the right files. Modules come from the catalogue; the rest are the app's shared parts.
 */
const MODULE_CODE = {
  cars: ['web/src/pages/Assets.jsx (CarList)', 'shared/baseForms.js (car form)'],
  contacts: ['web/src/pages/Contacts.jsx', 'web/src/components/ContactLinks.jsx'],
  tracks: ['web/src/pages/Tracks.jsx', 'shared/tracks.js', 'shared/seed/tracks.json'],
  events: ['web/src/pages/Events.jsx', 'web/src/pages/Series.jsx', 'shared/sessions.js'],
  calendar: ['web/src/pages/Calendar.jsx', 'web/src/components/SharedRequests.jsx', 'shared/calendar.js', 'server/src/calendar.js', 'server/src/calendarRequests.js', 'server/src/calendarPlus.js'],
  setups: ['web/src/pages/Setups.jsx', 'web/src/pages/Advisor.jsx', 'web/src/components/SheetNav.jsx', 'shared/advisor.js', 'shared/setupLayout.js'],
  trackside: ['web/src/pages/Phase2.jsx (between-round checks)', 'shared/baseForms2.js (trackCheckForm)'],
  gears: ['web/src/pages/Gears.jsx', 'shared/gearLists.js', 'web/src/lib/gears.js'],
  maintenance: ['web/src/pages/Maintenance.jsx'],
  assets: ['web/src/pages/Assets.jsx'],
  dyno: ['web/src/pages/Phase2.jsx (dyno)', 'web/src/components/DynoChart.jsx', 'web/src/components/BarTests.jsx', 'web/src/components/DynoInitial.jsx', 'shared/dyno.js', 'shared/bars.js'],
  engines: ['web/src/pages/Phase2.jsx (engine builds)', 'shared/calcs.js', 'shared/engineChecks.js'],
  jobs: ['web/src/pages/Shop.jsx', 'shared/shop.js', 'shared/enginePack.js'],
  customers: ['web/src/pages/Shop.jsx', 'web/src/pages/Sharing.jsx', 'server/src/sharing.js'],
  reports: ['web/src/pages/Phase2.jsx (reports, Crew Chief stats)'],
  reviews: ['web/src/pages/Phase2.jsx (reviews)'],
  ai: ['web/src/components/Ai.jsx', 'web/src/lib/ai.js', 'server/src/ai.js', 'server/src/jobs.js'],
  analytics: ['web/src/pages/Analytics.jsx', 'shared/analytics.js'],
};
const SYSTEM_AREAS = [
  { key: 'system:forms', label: 'Forms and fields', code: ['web/src/components/FormRenderer.jsx', 'web/src/components/TableFields.jsx', 'web/src/pages/Forms.jsx', 'web/src/pages/RecordEdit.jsx', 'shared/baseForms*.js', 'shared/fieldInfo.js'] },
  { key: 'system:sync', label: 'Offline and sync', code: ['web/src/lib/sync.js', 'web/src/lib/store.js', 'server/src/index.js (sync routes, applyChange)'] },
  { key: 'system:accounts', label: 'Sign-in, members and roles', code: ['web/src/pages/Auth.jsx', 'web/src/pages/Team.jsx', 'server/src/auth.js', 'server/src/ratelimit.js', 'shared/catalog.js'] },
  { key: 'system:licensing', label: 'Plans and licences', code: ['shared/catalog.js (FEATURES, PLANS)', 'shared/platform.js', 'server/src/admin.js'] },
  { key: 'system:platform', label: 'Platform admin', code: ['web/src/pages/Admin.jsx', 'server/src/admin.js', 'server/src/settings.js'] },
  { key: 'system:navigation', label: 'Navigation, home and layout', code: ['web/src/components/Layout.jsx', 'web/src/pages/Areas.jsx', 'web/src/styles.css'] },
  { key: 'system:appearance', label: 'Themes and appearance', code: ['web/src/components/Appearance.jsx', 'shared/themes.js', 'web/src/lib/theme.js'] },
  { key: 'system:guide', label: 'Help & guide', code: ['docs/guide/*.md', 'web/src/pages/Help.jsx', 'shared/guide.js', 'shared/guideData.js', 'tools/check-guide.mjs'] },
  { key: 'system:calculators', label: 'Calculators', code: ['web/src/pages/Calculators.jsx', 'web/src/components/Calculator.jsx', 'shared/calcs.js'] },
  { key: 'system:weather', label: 'Track weather', code: ['web/src/components/Weather.jsx', 'server/src/weather.js', 'shared/weather.js'] },
  { key: 'system:import', label: 'Import from files', code: ['web/src/lib/parse.js', 'web/src/components/Ai.jsx', 'server/src/ai.js'] },
  { key: 'system:email', label: 'Email notifications', code: ['server/src/mail.js'] },
  { key: 'system:feedback', label: 'Feedback & roadmap', code: ['web/src/pages/Feedback.jsx', 'web/src/pages/FeedbackAdmin.jsx', 'server/src/feedback.js', 'shared/feedback.js'] },
  { key: 'system:deploy', label: 'Server, deployment and backups', code: ['Dockerfile', 'docker-compose.yml', 'README.md', 'docs/design/ROLLOUT.md'] },
];

export const FEATURE_AREAS = [
  ...AREAS.map((a) => ({ key: `area:${a.key}`, label: a.label, group: 'Areas', code: [] })),
  ...MODULES.map((m) => ({ key: `module:${m.key}`, label: m.label, group: 'Features', code: MODULE_CODE[m.key] || [] })),
  ...SYSTEM_AREAS.map((s) => ({ ...s, group: 'Across the app' })),
];
export const FEATURE_AREA = Object.fromEntries(FEATURE_AREAS.map((a) => [a.key, a]));
export const cleanAreas = (list) => [...new Set((Array.isArray(list) ? list : []).filter((k) => FEATURE_AREA[k]))].slice(0, 12);

/** A guess at the area from the page something was reported on. */
export function areaForPage(page = '') {
  const p = String(page).split('?')[0];
  const rules = [
    [/^\/calendar|^\/print\/calendar/, 'module:calendar'], [/^\/setups|^\/compare|^\/r\/setup/, 'module:setups'],
    [/^\/track\/advisor/, 'module:setups'], [/^\/track\/checks|^\/r\/track_check/, 'module:trackside'],
    [/^\/track\/gears|^\/r\/(gear|gear_list|tire)/, 'module:gears'], [/^\/events|^\/series|^\/r\/(event|series)/, 'module:events'],
    [/^\/tracks|^\/r\/(track|team_track)/, 'module:tracks'], [/^\/maintenance|^\/r\/(maintenance|schedule)/, 'module:maintenance'],
    [/^\/workshop\/dyno|^\/r\/dyno_run/, 'module:dyno'], [/^\/assets|^\/r\/(asset|measurement)/, 'module:assets'],
    [/^\/engines\/linked|^\/link-engine/, 'module:customers'], [/^\/engines|^\/r\/engine_build/, 'module:engines'],
    [/^\/jobs|^\/r\/job|^\/print\/job/, 'module:jobs'], [/^\/customers|^\/r\/customer/, 'module:customers'],
    [/^\/team\/reports|^\/team\/stats/, 'module:reports'], [/^\/team\/reviews|^\/r\/review/, 'module:reviews'],
    [/^\/cars|^\/r\/car/, 'module:cars'], [/^\/contacts|^\/suppliers|^\/r\/(contact|supplier)/, 'module:contacts'],
    [/^\/analytics/, 'module:analytics'], [/^\/ask/, 'module:ai'], [/^\/calculators/, 'system:calculators'],
    [/^\/forms/, 'system:forms'], [/^\/help/, 'system:guide'], [/^\/admin/, 'system:platform'],
    [/^\/team\/members|^\/roles|^\/profile/, 'system:accounts'], [/^\/feedback/, 'system:feedback'],
  ];
  return rules.find(([re]) => re.test(p))?.[1] || null;
}

/** Words for matching similar requests ("vote for this instead"). */
const STOP = new Set('a an and are as at be but by can for from has have i in is it its my of on or so that the this to was we when with you your'.split(' '));
export const words = (s) => String(s || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) || [];
export function similarity(a, b) {
  const x = new Set(words(a)); const y = new Set(words(b));
  if (!x.size || !y.size) return 0;
  let n = 0; for (const w of x) if (y.has(w)) n++;
  return n / Math.min(x.size, y.size);
}

/**
 * The brief handed to Claude: everything needed to action the item in this repository, following CLAUDE.md.
 * articles: guide articles ({ id, title, covers, pages }) to point at; appUrl: link back to the item.
 */
export function buildBrief(item, { articles = [], appUrl = '' } = {}) {
  const kind = KIND[item.kind]?.short || item.kind;
  const areas = (item.areas || []).map((k) => FEATURE_AREA[k]).filter(Boolean);
  const moduleKeys = (item.areas || []).filter((k) => k.startsWith('module:')).map((k) => k.slice(7));
  const pageOf = (p) => String(p || '').split('?')[0];
  const related = articles.filter((a) => (a.covers || []).some((c) => moduleKeys.includes(String(c).replace(/^module:/, '')) && String(c).startsWith('module:'))
    || (item.page && (a.pages || []).some((p) => pathMatches(p, pageOf(item.page)))));
  const L = [];
  L.push(`# ${kind}: ${item.title}`, '');
  L.push(`RaceOps feedback #${item.ref ?? '?'} · priority **${PRIORITY_LABEL[item.priority] || item.priority}**${item.lane ? ` · lane **${LANE[item.lane]?.label || item.lane}**` : ''}${item.votes ? ` · ${item.votes} vote${item.votes === 1 ? '' : 's'}` : ''}${item.source === 'user' && item.team_name ? ` · reported by a user in ${item.team_name}` : ''}`, '');
  if (item.description) L.push('## What and why', '', item.description.trim(), '');
  if (item.kind === 'bug') {
    if (item.steps) L.push('## Steps to reproduce', '', item.steps.trim(), '');
    if (item.expected) L.push('## Expected vs what happened', '', item.expected.trim(), '');
    const c = item.context || {};
    const env = [item.page && `Page: \`${item.page}\``, c.app && `App: ${c.app}`, c.browser && `Browser: ${c.browser}`, c.screen && `Screen: ${c.screen}`,
      c.online !== undefined && `Online: ${c.online ? 'yes' : 'no'}`, c.sync && `Sync: ${c.sync}`, c.installed !== undefined && `Installed app: ${c.installed ? 'yes' : 'no'}`].filter(Boolean);
    if (env.length) L.push('## Where it happened', '', ...env.map((e) => `- ${e}`), '');
  }
  if (item.acceptance) L.push('## Done when', '', item.acceptance.trim(), '');
  if (areas.length) {
    L.push('## Functionality areas', '');
    for (const a of areas) L.push(`- **${a.label}** (\`${a.key}\`)${a.code.length ? `: ${a.code.map((c) => `\`${c}\``).join(', ')}` : ''}`);
    L.push('');
  }
  if (related.length) {
    L.push('## User guide articles to update', '');
    for (const a of related) L.push(`- \`docs/guide/${a.id}.md\` — ${a.title}`);
    L.push('');
  }
  if (item.comments?.length) {
    L.push('## Discussion', '');
    for (const c of item.comments) L.push(`- **${c.from_admin ? 'Platform admin' : 'Submitter'}:** ${String(c.body).replace(/\s+/g, ' ').trim()}`);
    L.push('');
  }
  if (item.files?.length) {
    L.push('## Attachments', '', `In RaceOps on feedback #${item.ref ?? '?'} (sign in as a platform admin to open them):`, '');
    for (const f of item.files) L.push(`- ${f.filename} (${fmtSize(f.size)})`);
    L.push('');
  }
  L.push('## How to do it', '',
    '- Follow `CLAUDE.md`: keep the user guide current (articles, ⓘ field descriptions, settings, role guides, What’s new, screenshots), and the design documents (`docs/design/DESIGN.md`, `ROLLOUT.md`).',
    '- Add or update an end-to-end suite in `tests/e2e/` and run `tests/e2e/run.sh`; every suite must pass.',
    '- Keep changes backward compatible with installed apps that sync later (DESIGN.md §21).',
    `- When it ships, mark feedback #${item.ref ?? '?'} as done in **Platform admin → Feedback & ideas**, with the release.`);
  if (appUrl) L.push('', `Item in RaceOps: ${appUrl}`);
  return L.join('\n');
}
