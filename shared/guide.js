// User guide: articles live in docs/guide/*.md (Markdown with a small front-matter block).
// Shared by the app (Help pages, "?" links on page headers, the setup checklist) and by
// tools/check-guide.mjs, which fails the build when something new isn't documented.
//
// Front matter (one "key: value" per line; lists are comma-separated):
//   id        unique slug, used in links: /help/<id>
//   title     article title
//   section   one of SECTIONS below
//   order     sort order inside the section (number)
//   summary   one line shown in lists and search
//   for       who it's for — any match shows it (see visibleTo): everyone, owner, admin, platform,
//             module:<key>, edit:<key>, perm:<key>
//   team      race | shop — limit to a team type (blank = any)
//   pages     app routes this article explains — gives those pages their "?" link (/r/setup/*, /events/:id)
//   covers    what it documents, checked by the build: type:, module:, feature:, perm:, role:,
//             teamtype:, setting:, pref:, platform:, option:
//   related   other article ids
//   persona   (role guides only) the role this guide is written for

export const SECTIONS = [
  { key: 'start', label: 'Getting started', blurb: 'Setting RaceOps up for a new team, in order.' },
  { key: 'roles', label: 'Guides by role', blurb: 'How to do your job in RaceOps, role by role.' },
  { key: 'settings', label: 'Settings & options', blurb: 'Every switch and option: where it is, who can change it and what it does.' },
  { key: 'track', label: 'At the track', blurb: 'Events, setup sheets, weather, fuel, the advisor and checks.' },
  { key: 'workshop', label: 'In the workshop', blurb: 'Assets, maintenance, schedules and the shock & bar dyno.' },
  { key: 'engines', label: 'Engine builds', blurb: 'Build sheets and engines from your engine builder.' },
  { key: 'shop', label: 'Engine shop', blurb: 'Customers, jobs, handover packs and sharing engines.' },
  { key: 'team', label: 'Team management', blurb: 'Members, roles, forms, reports and reviews.' },
  { key: 'tools', label: 'Everyday tools', blurb: 'Offline use, calculators, AI, importing files and your own look.' },
  { key: 'admin', label: 'Platform admin', blurb: 'Running the server: teams, licences, plans and global settings.' },
  { key: 'reference', label: 'Reference', blurb: 'Lists and tables that are always up to date.' },
];
export const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

const LIST_KEYS = ['for', 'pages', 'covers', 'related'];

/** Split a Markdown file into { meta, body }. */
export function parseArticle(raw, file = '') {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i < 0) throw new Error(`${file}: bad front-matter line "${line}"`);
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    meta[k] = LIST_KEYS.includes(k) ? v.split(',').map((x) => x.trim()).filter(Boolean) : v;
  }
  for (const k of LIST_KEYS) meta[k] = meta[k] || [];
  meta.order = Number(meta.order) || 100;
  if (!meta.for.length) meta.for = ['everyone'];
  return { ...meta, file, body: m[2] };
}

export function loadArticles(files) {
  return Object.entries(files)
    .map(([file, raw]) => parseArticle(raw, file))
    .sort((a, b) => (SECTIONS.findIndex((s) => s.key === a.section) - SECTIONS.findIndex((s) => s.key === b.section)) || a.order - b.order || a.title.localeCompare(b.title));
}

/**
 * Can this person see the article? ctx: { role, can(perm), canModule(key, action), teamType, platformAdmin }.
 * `all` shows every article whatever the role (the "show all" switch) — team type still applies.
 */
export function visibleTo(a, ctx, all = false) {
  const tt = ctx.teamType || 'race';
  if (a.team === 'race' && tt === 'engine_shop') return false;
  if (a.team === 'shop' && tt === 'race') return false;
  if (all) return true;
  return a.for.some((t) => {
    if (t === 'everyone') return true;
    if (t === 'owner') return !!ctx.role?.is_owner;
    if (t === 'admin') return !!ctx.role?.is_owner || ['members.manage', 'roles.manage', 'forms.manage', 'team.manage'].some((p) => ctx.can?.(p));
    if (t === 'platform') return !!ctx.platformAdmin;
    const [kind, key] = t.split(':');
    if (kind === 'module') return !!ctx.canModule?.(key, 'view');
    if (kind === 'edit') return !!ctx.canModule?.(key, 'edit');
    if (kind === 'perm') return !!ctx.can?.(key);
    return false;
  });
}

/** Does an article's page pattern cover a route or a real path? `*` and `:param` match one segment; a trailing `/*` matches the rest. */
export function pathMatches(pattern, path) {
  const norm = (p) => p.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  const a = norm(pattern).split('/'); const b = norm(path).split('/');
  for (let i = 0; i < a.length; i++) {
    const seg = a[i];
    if (seg === '*' && i === a.length - 1 && b.length >= a.length) return true;
    if (i >= b.length) return false;
    if (seg === '*' || seg.startsWith(':') || b[i].startsWith(':') || b[i] === '*') continue;
    if (seg !== b[i]) return false;
  }
  return a.length === b.length;
}

/** The best article for the page at `path` (most specific pattern wins), among those the person can see. */
export function articleForPath(articles, path, ctx) {
  let best = null; let score = -1;
  for (const a of articles) {
    if (ctx && !visibleTo(a, ctx, true)) continue;
    for (const p of a.pages) {
      if (!pathMatches(p, path)) continue;
      const s = p.split('/').filter((x) => x && x !== '*' && !x.startsWith(':')).length * 10 - (p.endsWith('*') ? 1 : 0);
      if (s > score) { best = a; score = s; }
    }
  }
  return best;
}

/** Simple search over title, summary and body; returns articles ranked. */
export function searchArticles(articles, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  return articles.map((a) => {
    const t = a.title.toLowerCase(); const s = (a.summary || '').toLowerCase(); const b = a.body.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (!t.includes(w) && !s.includes(w) && !b.includes(w)) return null;
      score += (t.includes(w) ? 10 : 0) + (s.includes(w) ? 4 : 0) + Math.min(5, b.split(w).length - 1);
    }
    return { a, score };
  }).filter(Boolean).sort((x, y) => y.score - x.score).map((x) => x.a);
}

/** A short plain-text excerpt around the first search word. */
export function excerpt(body, q, len = 160) {
  const text = body.replace(/\{\{[a-z-]+\}\}/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`|]/g, '').replace(/\s+/g, ' ').trim();
  const w = String(q || '').toLowerCase().split(/\s+/).find((x) => x.length > 1);
  const i = w ? text.toLowerCase().indexOf(w) : -1;
  const start = Math.max(0, i - 50);
  return (start > 0 ? '…' : '') + text.slice(start, start + len) + (text.length > start + len ? '…' : '');
}

/** Internal links in an article body: /help/<id>. */
export const helpLinks = (body) => [...body.matchAll(/\]\(\/help\/([a-z0-9-]+)(?:#[^)]*)?\)/g)].map((m) => m[1]);
/** Images in an article body: img/<file>. */
export const helpImages = (body) => [...body.matchAll(/!\[[^\]]*\]\((img\/[^)\s]+)\)/g)].map((m) => m[1]);
/** Live blocks drawn by the app itself rather than as Markdown (e.g. the interactive setup checklist). */
export const APP_EMBEDS = ['checklist'];
/** Live tables: {{name}} on a line of its own, filled from the app's own data (see EMBEDS in guideData.js). */
export const helpEmbeds = (body) => [...body.matchAll(/^\{\{([a-z-]+)\}\}\s*$/gm)].map((m) => m[1]);
