// Release notes: every release of RaceOps, newest first (Help & guide → Release notes). Each release has a
// summary and date, then New features, Improvements, Bug fixes and Notes. When a platform admin has set the
// code repository, each release also links to its code changes and pull requests.
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RELEASE_SECTIONS, releaseLinks } from '@shared/releases.js';
import { Empty, PageHeader, Section } from '../components/ui.jsx';
import { renderMarkdown } from '../lib/guide.js';
import { CURRENT, RELEASE, RELEASES, markReleaseSeen, releaseDate } from '../lib/releases.js';
import { useSession } from '../lib/session.jsx';

/** How many top-level points a section has. */
const points = (md) => String(md || '').split('\n').filter((l) => /^[-*] /.test(l)).length;

function counts(r) {
  const words = { features: ['new feature', 'new features'], improvements: ['improvement', 'improvements'], fixes: ['bug fix', 'bug fixes'] };
  return Object.entries(words).map(([k, [one, many]]) => { const n = points(r.sections[k]); return n ? `${n} ${n === 1 ? one : many}` : ''; }).filter(Boolean).join(' · ');
}

/** "Code changes" and pull request links, when the platform admin has set the code repository. */
function RepoLinks({ r }) {
  const { platform } = useSession();
  const { prs, code } = releaseLinks(r, platform?.release_repo_url);
  if (!code && !prs.length) return null;
  return (
    <div className="release-links" data-testid="release-links">
      {code && <a className="btn small ghost" href={code} target="_blank" rel="noreferrer">Code changes on GitHub ↗</a>}
      {prs.map((p) => <a key={p.n} className="btn small ghost" href={p.url} target="_blank" rel="noreferrer">Pull request #{p.n} ↗</a>)}
    </div>
  );
}

/** One release: summary, then its sections in order. */
export function ReleaseBody({ r }) {
  return (
    <div className="release-body">
      <p className="release-summary">{r.summary}</p>
      {RELEASE_SECTIONS.filter((s) => r.sections[s.key]).map((s) => (
        <section key={s.key} className={`release-sec release-${s.key}`} data-section={s.key}>
          <h3>{s.heading}</h3>
          {/* eslint-disable-next-line react/no-danger */}
          <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.sections[s.key]) }} />
        </section>
      ))}
      <RepoLinks r={r} />
    </div>
  );
}

const Badge = ({ r }) => (r === CURRENT ? <span className="pill pill-ok">This version</span> : null);

export function ReleaseList() {
  useEffect(() => { markReleaseSeen(); }, []); // read the notes: no "updated" note on Home
  const [latest, ...earlier] = RELEASES;
  if (!latest) return <div><PageHeader title="Release notes" back="/help" /><Empty>No release notes yet.</Empty></div>;
  return (
    <div className="releases">
      <PageHeader title="Release notes" back="/help"
        sub={`What changed in each release. You’re on version ${latest.version}, released ${releaseDate(latest.date)}.`} />
      <article className="card release-card latest" data-release={latest.version}>
        <div className="release-head">
          <h2><Link to={`/help/releases/${latest.version}`}>{latest.title}</Link></h2>
          <Badge r={latest} />
          <span className="muted small">Version {latest.version} · {releaseDate(latest.date)}</span>
        </div>
        <ReleaseBody r={latest} />
      </article>
      {earlier.length > 0 && (
        <Section title="Earlier releases">
          <div className="list">
            {earlier.map((r) => (
              <Link key={r.version} to={`/help/releases/${r.version}`} className="list-row release-row" data-release={r.version}>
                <span className="date-block"><b>{Number(r.date.slice(8)) || '–'}</b><small>{r.date ? new Date(`${r.date}T00:00:00`).toLocaleString(undefined, { month: 'short', year: '2-digit' }) : ''}</small></span>
                <span className="grow">
                  <span className="row-title">{r.title}</span>
                  <span className="row-sub">{r.summary}</span>
                  <span className="row-sub release-counts">Version {r.version}{counts(r) ? ` · ${counts(r)}` : ''}</span>
                </span>
                <span className="muted">›</span>
              </Link>
            ))}
          </div>
        </Section>
      )}
      <p className="muted small">Each release also adds a line to <Link to="/help/whats-new">What's new</Link>, with links to the guide articles it changed.</p>
    </div>
  );
}

export function ReleaseDetail() {
  const { version } = useParams();
  useEffect(() => { markReleaseSeen(); }, []);
  const r = RELEASE[version];
  if (!r) return <div><PageHeader title="Release not found" back="/help/releases" /><Empty>There’s no release {version}. <Link to="/help/releases">All release notes</Link></Empty></div>;
  const i = RELEASES.indexOf(r);
  const newer = RELEASES[i - 1]; const older = RELEASES[i + 1];
  return (
    <div className="releases">
      <PageHeader title={r.title} sub={`Version ${r.version} · released ${releaseDate(r.date)}`} back="/help/releases" />
      <article className="card release-card" data-release={r.version}>
        <Badge r={r} />
        <ReleaseBody r={r} />
      </article>
      <div className="release-nav">
        {older ? <Link className="btn ghost small" to={`/help/releases/${older.version}`}>‹ {older.title}</Link> : <span />}
        {newer && <Link className="btn ghost small" to={`/help/releases/${newer.version}`}>{newer.title} ›</Link>}
      </div>
    </div>
  );
}
