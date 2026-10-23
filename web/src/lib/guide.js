// The user guide in the app: articles bundled from docs/guide (so Help works offline), who can
// see them, the article for the current page, and Markdown → HTML.
import { useMemo } from 'react';
import { marked } from 'marked';
import { loadArticles, visibleTo, articleForPath } from '@shared/guide.js';
import { expandEmbeds } from '@shared/guideData.js';
import { teamType } from '@shared/shop.js';
import { useSession } from './session.jsx';

const raw = import.meta.glob('@docs/guide/*.md', { query: '?raw', import: 'default', eager: true });
const imgs = import.meta.glob('@docs/guide/img/*', { query: '?url', import: 'default', eager: true });
const base = (p) => p.split('/').pop();

export const ARTICLES = loadArticles(Object.fromEntries(Object.entries(raw).map(([p, s]) => [base(p), s])));
export const ARTICLE = Object.fromEntries(ARTICLES.map((a) => [a.id, a]));
const IMG = Object.fromEntries(Object.entries(imgs).map(([p, u]) => [`img/${base(p)}`, u]));
// training videos: loaded when played (not stored for offline use — they're large)
const vids = import.meta.glob('@docs/guide/video/*', { query: '?url', import: 'default', eager: true });
const VID = Object.fromEntries(Object.entries(vids).map(([p, u]) => [`video/${base(p)}`, u]));

/** Who's reading: the role, rights and team type the guide filters by. */
export function useGuideCtx() {
  const { membership, can, canModule, user } = useSession();
  return useMemo(() => ({ role: membership?.role, can, canModule, teamType: teamType(membership), platformAdmin: !!user?.is_platform_admin }),
    [membership, can, canModule, user?.is_platform_admin]);
}

export const visibleArticles = (ctx, all) => ARTICLES.filter((a) => visibleTo(a, ctx, all));

/** The article for a page (used by the "?" in page headers). */
export const helpForPath = (path, ctx) => articleForPath(ARTICLES, path, ctx);

/** The role guide that best fits this person, first; then the others they can see. */
export function rolesFor(ctx, all) {
  const roles = ARTICLES.filter((a) => a.section === 'roles' && visibleTo(a, ctx, all));
  const m = (k, a = 'view') => !!ctx.canModule?.(k, a);
  const shop = ctx.teamType !== 'race';
  const primary = ctx.role?.is_owner ? 'owner'
    : shop && (m('jobs', 'edit') || m('engines', 'edit')) && ctx.teamType === 'engine_shop' ? 'engine-builder'
      : m('setups', 'edit') ? 'crew-chief'
        : (m('maintenance', 'edit') || m('assets', 'edit')) ? 'mechanic'
          : shop && m('jobs', 'edit') ? 'engine-builder'
            : m('setups') ? 'driver'
              : ctx.platformAdmin ? 'platform-admin' : null;
  const mine = roles.find((r) => r.persona === primary) || null;
  return { mine, others: roles.filter((r) => r !== mine) };
}

marked.use({ gfm: true, breaks: false });
const renderer = new marked.Renderer();
renderer.image = ({ href, text }) => (/\.(webm|mp4)$/i.test(href)
  ? `<figure class="guide-video"><video src="${VID[href] || href}" controls preload="none" playsinline${(() => { const p = IMG[href.replace(/^video\//, 'img/').replace(/\.(webm|mp4)$/i, '.webp')]; return p ? ` poster="${p}"` : ''; })()}></video><figcaption>${text || ''}</figcaption></figure>`
  : `<img src="${IMG[href] || href}" alt="${text || ''}" loading="lazy" />`);
const attr = (html) => html.replace(/<[^>]+>/g, '').replace(/"/g, '&quot;');
/** "Multi-day events" → "multi-day-events": the anchor a link like /help/events-sessions#multi-day-events jumps to. */
export const headingId = (text) => String(text).replace(/<[^>]+>/g, '').toLowerCase().replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
renderer.heading = function heading({ tokens, depth }) {
  const inner = this.parser.parseInline(tokens);
  return `<h${depth} id="${headingId(inner)}">${inner}</h${depth}>`;
};
// tables: each cell carries its column name, so on a phone the rows stack as labelled cards
renderer.table = function table(t) {
  const head = t.header.map((c) => this.parser.parseInline(c.tokens));
  const rows = t.rows.map((r) => `<tr>${r.map((c, i) => `<td data-label="${attr(head[i] || '')}">${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
  return `<div class="help-table"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
};

/** Article body → HTML, split around app-drawn blocks such as {{checklist}}. Returns [{ html } | { app }]. */
export function renderArticle(a) {
  const parts = expandEmbeds(a.body).split(/^\{\{([a-z-]+)\}\}\s*$/m);
  return parts.map((p, i) => (i % 2 ? { app: p } : { html: marked.parse(p, { renderer }) })).filter((p) => p.app || p.html.trim());
}
