#!/usr/bin/env node
// Checks the user guide (docs/guide) against the app, and fails when something the app offers
// isn't documented: a page, a record type, a module, a licence feature, an admin right, a team
// type, a built-in role, a setting found in the code, or a form field without an ⓘ description.
// Runs before every web build (npm run build) and on its own: node tools/check-guide.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadArticles, SECTION, pathMatches, helpLinks, helpImages, helpEmbeds, APP_EMBEDS } from '../shared/guide.js';
import { CHECKLIST } from '../shared/guideChecklist.js';
import { SETTINGS, EMBEDS } from '../shared/guideData.js';
import { MODULES, FEATURES, ADMIN_PERMISSIONS, DEFAULT_ROLES, RECORD_TYPES } from '../shared/catalog.js';
import { TEAM_TYPES } from '../shared/shop.js';
import { DEFAULT_GENERAL, DEFAULT_AI, mergePlans } from '../shared/platform.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE = path.join(ROOT, 'docs/guide');
const problems = [];
const bad = (msg) => problems.push(msg);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- articles ----
const files = Object.fromEntries(fs.readdirSync(GUIDE).filter((f) => f.endsWith('.md')).map((f) => [f, fs.readFileSync(path.join(GUIDE, f), 'utf8')]));
let articles = [];
try { articles = loadArticles(files); } catch (e) { bad(e.message); }
const byId = new Map();
for (const a of articles) {
  if (!a.id || !/^[a-z0-9-]+$/.test(a.id)) bad(`${a.file}: id must be lower-case letters, numbers and dashes`);
  if (byId.has(a.id)) bad(`${a.file}: id "${a.id}" is also used by ${byId.get(a.id).file}`);
  byId.set(a.id, a);
  if (`${a.id}.md` !== a.file) bad(`${a.file}: file name should be ${a.id}.md`);
  if (!a.title) bad(`${a.file}: needs a title`);
  if (!a.summary) bad(`${a.file}: needs a one-line summary`);
  if (!SECTION[a.section]) bad(`${a.file}: unknown section "${a.section}" (use one of ${Object.keys(SECTION).join(', ')})`);
  if (a.team && !['race', 'shop'].includes(a.team)) bad(`${a.file}: team must be race or shop`);
  for (const t of a.for) if (!/^(everyone|owner|admin|platform|(module|edit|perm):[a-z._]+)$/.test(t)) bad(`${a.file}: unknown "for" value "${t}"`);
  for (const t of a.for) {
    const [k, key] = t.split(':');
    if ((k === 'module' || k === 'edit') && !MODULES.some((m) => m.key === key)) bad(`${a.file}: for ${t} — no such module`);
  }
}
for (const a of articles) {
  for (const r of a.related) if (!byId.has(r)) bad(`${a.file}: related "${r}" isn't an article`);
  for (const l of helpLinks(a.body)) if (!byId.has(l)) bad(`${a.file}: link to /help/${l} — no such article`);
  for (const img of helpImages(a.body)) if (!fs.existsSync(path.join(GUIDE, img))) bad(`${a.file}: image ${img} is missing from docs/guide`);
  for (const e of helpEmbeds(a.body)) if (!EMBEDS[e] && !APP_EMBEDS.includes(e)) bad(`${a.file}: {{${e}}} isn't a known live table (${Object.keys(EMBEDS).join(', ')})`);
}
// ---- the training pack stays current ----
// Every training article lists the demo names it relies on (demo:), which must still be in the practice data.
const practiceSrc = fs.readFileSync(path.join(ROOT, 'shared/practiceData.js'), 'utf8');
for (const a of articles.filter((x) => x.section === 'training')) {
  for (const n of String(a.demo || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    if (!practiceSrc.includes(n)) bad(`${a.file}: uses the demo name "${n}", which isn't in shared/practiceData.js any more. Update the exercise or the practice data.`);
  }
}
// The training pack is reviewed for every release: training.md's reviewed: names the newest What's new entry it was checked against.
const latestNew = /^- \*\*(.+?)\.?\*\*/m.exec(files['whats-new.md'] || '')?.[1];
const reviewed = byId.get('training')?.reviewed;
if (latestNew && reviewed !== latestNew) {
  bad(`The training pack hasn't been reviewed for "${latestNew}" (newest in What's new; last reviewed: "${reviewed || 'never'}"). `
    + 'Check the training articles, cards, quick start, practice data, videos and e2e34 against this change and update what it affects, '
    + `then set "reviewed: ${latestNew}" in docs/guide/training.md. See CLAUDE.md → "Training pack".`);
}
for (const c of CHECKLIST) if (!byId.has(c.article)) bad(`Setup checklist item "${c.id}" points at article "${c.article}", which doesn't exist`);
const covers = new Set(articles.flatMap((a) => a.covers));
const forTokens = new Set(articles.flatMap((a) => a.for));
const need = (token, what, hint) => { if (!covers.has(token)) bad(`Not in the guide: ${what}. Add "${token}" to the covers: line of the article that explains it${hint ? ` (${hint})` : ''}.`); };

// ---- pages (routes in App.jsx) ----
const app = fs.readFileSync(path.join(ROOT, 'web/src/App.jsx'), 'utf8');
const routes = [...new Set([...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*').map((p) => (p.startsWith('/') ? p : `/${p}`)))];
if (/<Route index /.test(app)) routes.push('/');
const patterns = articles.flatMap((a) => a.pages.map((p) => ({ p, a })));
for (const r of routes) if (!patterns.some(({ p }) => pathMatches(p, r))) bad(`Page ${r} has no guide article. Add it to the pages: line of the article for that screen.`);
for (const { p, a } of patterns) {
  const rec = /^\/r\/([a-z_]+)\//.exec(p);
  if (rec) { if (!RECORD_TYPES.includes(rec[1])) bad(`${a.file}: pages ${p} — "${rec[1]}" isn't a record type`); continue; }
  if (!routes.some((r) => pathMatches(p, r) || pathMatches(r, p))) bad(`${a.file}: pages ${p} doesn't match any page in App.jsx`);
}

// ---- things the app offers ----
for (const t of RECORD_TYPES) if (!covers.has(`type:${t}`) && !patterns.some(({ p }) => p.startsWith(`/r/${t}/`))) need(`type:${t}`, `record type "${t}"`, 'or add /r/<type>/* to its pages:');
for (const m of MODULES) if (!covers.has(`module:${m.key}`) && !forTokens.has(`module:${m.key}`) && !forTokens.has(`edit:${m.key}`)) need(`module:${m.key}`, `module "${m.label}"`);
for (const f of FEATURES) need(`feature:${f.key}`, `licence feature "${f.label}"`);
for (const p of ADMIN_PERMISSIONS) need(`perm:${p.key}`, `admin right "${p.label}"`);
for (const k of Object.keys(TEAM_TYPES)) need(`teamtype:${k}`, `team type "${TEAM_TYPES[k].label}"`);
for (const r of DEFAULT_ROLES) need(`role:${slug(r.name)}`, `built-in role "${r.name}"`, 'usually its role guide');

// ---- settings: every setting the code reads must be in shared/guideData.js SETTINGS, with an article ----
const known = new Set(SETTINGS.flatMap((s) => s.code));
for (const s of SETTINGS) {
  if (!byId.has(s.article)) bad(`SETTINGS "${s.id}" points at article "${s.article}", which doesn't exist`);
  else if (!byId.get(s.article).covers.includes(`setting:${s.id}`)) bad(`Article ${s.article}.md should list "setting:${s.id}" in covers: (it explains ${s.label})`);
}
const src = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (!['node_modules', 'dist', 'seed'].includes(f.name)) walk(p); } else if (/\.(jsx?|mjs)$/.test(f.name)) src.push([p, fs.readFileSync(p, 'utf8')]); } };
for (const d of ['web/src', 'server/src', 'shared']) walk(path.join(ROOT, d));
const found = new Map();
const note = (key, file) => { if (!found.has(key)) found.set(key, path.relative(ROOT, file)); };
const IGNORE_TEAM = new Set(['general', 'ai', 'data_epoch']); // platform settings objects, and data_epoch (set by restores, not a setting anyone changes)
for (const [file, text] of src) {
  if (file.endsWith('guideData.js')) continue;
  for (const m of text.matchAll(/\.settings\??\.([a-z_]+)/g)) if (!IGNORE_TEAM.has(m[1])) note(`team:${m[1]}`, file);
  for (const m of text.matchAll(/\.\.\.\(membership\.settings \|\| \{\}\), ([a-z_]+):/g)) note(`team:${m[1]}`, file);
  for (const m of text.matchAll(/\bprefs\??\.([a-z_]+)/g)) if (m[1] !== 'pending') note(`pref:${m[1]}`, file);
}
const themes = fs.readFileSync(path.join(ROOT, 'shared/themes.js'), 'utf8');
for (const m of themes.matchAll(/if \('([a-z_]+)' in p\)/g)) note(`pref:${m[1]}`, 'shared/themes.js');
for (const k of Object.keys(DEFAULT_GENERAL)) note(`platform:${k}`, 'shared/platform.js');
for (const k of Object.keys(DEFAULT_AI)) note(`ai:${k}`, 'shared/platform.js');
for (const k of Object.keys(Object.values(mergePlans({}))[0])) if (!['label', 'builtin'].includes(k)) note(`plan:${k}`, 'shared/platform.js');
for (const [key, file] of found) if (!known.has(key)) bad(`Setting "${key}" (used in ${file}) isn't documented. Add it to SETTINGS in shared/guideData.js with where/who/what and its article.`);

// ---- form fields: each standard field needs an ⓘ description (shared/fieldInfo.js) ----
const { hasInfo } = await import('../shared/fieldInfo.js');
const { BASE_FORMS } = await import('../shared/baseForms.js');
const { applyUpgrades } = await import('../shared/baseForms2.js');
const missing = [];
for (const base of BASE_FORMS) {
  const form = structuredClone(base);
  applyUpgrades(form);
  for (const s of form.sections || []) for (const f of s.fields || []) {
    if (!f.key || f.type === 'heading') continue;
    if (!hasInfo(form.target, f.key)) missing.push(`${form.target}.${f.key}`);
  }
}
// Fields that pre-date this check are listed in tools/guide-baseline.json; anything new must have a description.
const BASE_FILE = path.join(ROOT, 'tools/guide-baseline.json');
if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(BASE_FILE, `${JSON.stringify({ note: 'Fields without an ⓘ description from before the guide check. Shrink this list; never add to it.', fields: [...new Set(missing)].sort() }, null, 1)}\n`);
  console.log(`Wrote ${missing.length} fields to tools/guide-baseline.json`);
}
const baseline = new Set(fs.existsSync(BASE_FILE) ? JSON.parse(fs.readFileSync(BASE_FILE, 'utf8')).fields : []);
for (const m of [...new Set(missing)]) if (!baseline.has(m)) bad(`Field ${m} has no ⓘ description. Add it to FIELD_INFO in shared/fieldInfo.js.`);

if (problems.length) {
  console.error(`\nUser guide check: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n`);
  for (const p of problems) console.error(` • ${p}`);
  console.error('\nSee CLAUDE.md → "User guide" for how to document a change.\n');
  process.exit(1);
}
console.log(`User guide check: ${articles.length} articles, ${routes.length} pages, ${SETTINGS.length} settings — all documented.`);
