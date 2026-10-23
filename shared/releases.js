// Release notes: one Markdown file per release in docs/releases/<version>.md, bundled into the app
// (Help & guide → Release notes) so they work offline, and checked by tools/check-guide.mjs.
//
// Front matter (one "key: value" per line):
//   version   YYYY.MM.DD — the day it was released; a second release the same day is YYYY.MM.DD.2
//   date      YYYY-MM-DD — the release date (the same day as the version)
//   title     a few words for the list, e.g. "Multi-day events"
//   summary   one or two sentences: what this release is about
//   pr        optional: the pull request numbers, comma-separated (linked when the code repository is set)
//   commits   optional: the release's commits, "<first-excluded>...<last>" (a GitHub compare range) or the
//             last commit alone (the first release). Without it, the link lists the day's commits.
// Body: the sections below, as "## <heading>" with a bullet list each, in this order. Leave out a section
// with nothing in it.
export const RELEASE_SECTIONS = [
  { key: 'features', heading: 'New features', blurb: 'Things you couldn’t do before.' },
  { key: 'improvements', heading: 'Improvements', blurb: 'Changes to features you already use.' },
  { key: 'fixes', heading: 'Bug fixes', blurb: 'Things that weren’t working properly.' },
  { key: 'notes', heading: 'Notes', blurb: 'Anything to know or do for this release: settings, updating the app, known limits.' },
];
const BY_HEADING = Object.fromEntries(RELEASE_SECTIONS.map((s) => [s.heading.toLowerCase(), s.key]));

export const VERSION_RE = /^(\d{4})\.(\d{2})\.(\d{2})(?:\.(\d+))?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** One release file → { version, date, title, summary, pr, commits, sections: { features, … }, extra, file }. */
export function parseRelease(raw, file = '') {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(String(raw || ''));
  if (!m) return { file, problems: [`${file}: missing front matter (--- … ---)`], sections: {}, pr: [] };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const sections = {};
  const extra = [];
  let cur = null;
  for (const line of m[2].split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      cur = BY_HEADING[h[1].toLowerCase()] || null;
      if (!cur) extra.push(h[1]);
      else sections[cur] = '';
      continue;
    }
    if (cur) sections[cur] += `${line}\n`;
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k].trim();
  return {
    file,
    version: meta.version || '',
    date: meta.date || '',
    title: meta.title || '',
    summary: meta.summary || '',
    pr: String(meta.pr || '').split(',').map((x) => Number(x.trim().replace(/^#/, ''))).filter((n) => Number.isInteger(n) && n > 0),
    commits: meta.commits || '',
    sections: Object.fromEntries(Object.entries(sections).filter(([, v]) => v)),
    extra,
  };
}

/** Newest first: by version (which starts with the date), then a same-day release number. */
export function compareVersions(a, b) {
  const pa = VERSION_RE.exec(a || ''); const pb = VERSION_RE.exec(b || '');
  if (!pa || !pb) return String(b || '').localeCompare(String(a || ''));
  for (let i = 1; i <= 4; i++) {
    const d = (Number(pb[i]) || (i === 4 ? 1 : 0)) - (Number(pa[i]) || (i === 4 ? 1 : 0));
    if (d) return d;
  }
  return 0;
}

/** Every release, newest first. files: { 'name.md': raw }. */
export function loadReleases(files) {
  return Object.entries(files).map(([file, raw]) => parseRelease(raw, file)).sort((a, b) => compareVersions(a.version, b.version));
}

/** What's wrong with the release notes (for the build check): [] when they're fine. */
export function releaseProblems(releases) {
  const out = [];
  const seen = new Set();
  for (const r of releases) {
    const f = r.file || r.version;
    if (r.problems) { out.push(...r.problems); continue; }
    if (!VERSION_RE.test(r.version)) out.push(`${f}: version "${r.version}" should be YYYY.MM.DD (or YYYY.MM.DD.2 for a second release that day).`);
    if (!DATE_RE.test(r.date)) out.push(`${f}: date "${r.date}" should be YYYY-MM-DD.`);
    else if (VERSION_RE.test(r.version) && r.version.slice(0, 10).replace(/\./g, '-') !== r.date) out.push(`${f}: version ${r.version} and date ${r.date} should be the same day.`);
    if (r.file && r.version && r.file.replace(/\.md$/, '') !== r.version) out.push(`${f}: name the file after the version (${r.version}.md).`);
    if (seen.has(r.version)) out.push(`${f}: version ${r.version} is used twice.`);
    seen.add(r.version);
    if (!r.title) out.push(`${f}: needs a title.`);
    if (!r.summary) out.push(`${f}: needs a summary.`);
    if (!Object.keys(r.sections).length) out.push(`${f}: needs at least one of: ${RELEASE_SECTIONS.map((s) => s.heading).join(', ')}.`);
    for (const x of r.extra) out.push(`${f}: unknown section "## ${x}" — use ${RELEASE_SECTIONS.map((s) => `"## ${s.heading}"`).join(', ')}.`);
    if (r.commits && !/^[0-9a-f]{7,40}(\.\.\.[0-9a-f]{7,40})?$/.test(r.commits)) out.push(`${f}: commits "${r.commits}" should be a commit, or "<from>...<to>".`);
  }
  return out;
}

/** A GitHub repository address, tidied ("https://github.com/owner/repo"), or '' if it isn't one. */
export function cleanRepoUrl(url) {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(String(url || '').trim());
  return m ? `https://github.com/${m[1]}/${m[2]}` : '';
}

/** Links for a release in the code repository: { prs: [{ n, url }], code } — empty when no repository is set. */
export function releaseLinks(r, repoUrl) {
  const base = cleanRepoUrl(repoUrl);
  if (!base || !r) return { prs: [], code: '' };
  const code = r.commits
    ? (r.commits.includes('...') ? `${base}/compare/${r.commits}` : `${base}/commits/${r.commits}`)
    : DATE_RE.test(r.date) ? `${base}/commits?since=${r.date}&until=${r.date}` : '';
  return { prs: r.pr.map((n) => ({ n, url: `${base}/pull/${n}` })), code };
}
