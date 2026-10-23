// Help & guide: the user guide from docs/guide, filtered to the reader's role and team type.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { SECTIONS, SECTION, excerpt, searchArticles, visibleTo } from '@shared/guide.js';
import { Empty, PageHeader, Section } from '../components/ui.jsx';
import { SetupChecklist } from '../components/SetupChecklist.jsx';
import { ARTICLE, renderArticle, rolesFor, useGuideCtx, visibleArticles } from '../lib/guide.js';

const ALL_KEY = 'raceops.help.all';
const readAll = () => { try { return localStorage.getItem(ALL_KEY) === '1'; } catch { return false; } };
const writeAll = (x) => { try { localStorage.setItem(ALL_KEY, x ? '1' : '0'); } catch { /* private mode */ } };

function ArticleLink({ a, q }) {
  return (
    <Link to={`/help/${a.id}`} className="list-row help-row">
      <span className="grow"><span className="row-title">{a.title}</span>
        <span className="row-sub">{q ? excerpt(a.body, q) : a.summary}</span></span>
    </Link>
  );
}

export function HelpHome() {
  const ctx = useGuideCtx();
  const [all, setAllState] = useState(readAll);
  const [q, setQ] = useState('');
  const setAll = (x) => { setAllState(x); writeAll(x); };
  const list = useMemo(() => visibleArticles(ctx, all), [ctx, all]);
  const { mine, others } = rolesFor(ctx, all);
  const hits = q.trim() ? searchArticles(list, q) : null;
  const start = ARTICLE['getting-started'] && visibleTo(ARTICLE['getting-started'], ctx, all);

  return (
    <div className="help">
      <PageHeader title="Help & guide" sub="How to set RaceOps up, change its options, and do your job in it"
        below={(
          <div className="help-search">
            <input type="search" placeholder="Search the guide, e.g. fuel, adjusters, invite" aria-label="Search the guide" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="toggle small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /><span>Show everything</span></label>
            <Link className="btn small ghost" to={`/print/guide${all ? '?all=1' : ''}`}>Print / PDF</Link>
          </div>
        )} />
      {hits ? (
        <Section title={`${hits.length} result${hits.length === 1 ? '' : 's'}`}>
          {hits.length ? <div className="list">{hits.map((a) => <ArticleLink key={a.id} a={a} q={q} />)}</div>
            : <Empty>Nothing matches “{q}”.{!all && ' Tick “Show everything” to search articles for every role.'}</Empty>}
        </Section>
      ) : (
        <>
          {start && (
            <Link to="/help/getting-started" className="card help-start">
              <b>New team? Start here</b><span className="muted">{ARTICLE['getting-started'].summary}</span>
            </Link>
          )}
          {(mine || others.length > 0) && (
            <Section title="Guides by role" className="help-roles">
              {mine && (
                <Link to={`/help/${mine.id}`} className="help-role mine" data-testid="my-role-guide">
                  <span className="small muted">Your guide</span><b>{mine.title}</b><span className="muted small">{mine.summary}</span>
                </Link>
              )}
              {others.length > 0 && (
                <div className="help-role-grid">
                  {others.map((r) => <Link key={r.id} to={`/help/${r.id}`} className="help-role"><b>{r.title}</b><span className="muted small">{r.summary}</span></Link>)}
                </div>
              )}
            </Section>
          )}
          {SECTIONS.filter((s) => s.key !== 'roles').map((s) => {
            const items = list.filter((a) => a.section === s.key);
            if (!items.length) return null;
            return (
              <Section key={s.key} title={s.label}>
                <p className="muted small help-blurb">{s.blurb}</p>
                <div className="list">{items.map((a) => <ArticleLink key={a.id} a={a} />)}</div>
              </Section>
            );
          })}
          {!all && <p className="muted small">Showing what fits your role. Tick <b>Show everything</b> to see every article.</p>}
        </>
      )}
    </div>
  );
}

export function HelpArticle() {
  const { id } = useParams();
  const nav = useNavigate();
  const ctx = useGuideCtx();
  const a = ARTICLE[id];
  const parts = useMemo(() => (a ? renderArticle(a) : []), [a]);
  if (!a) return <div><PageHeader title="Not found" back="/help" /><Empty>That guide page doesn’t exist. <Link to="/help">Back to Help</Link></Empty></div>;
  const forYou = visibleTo(a, ctx);
  const page = a.pages.find((p) => !p.includes(':') && !p.includes('*') && p !== '/' && !p.startsWith('/help'));
  const related = a.related.map((r) => ARTICLE[r]).filter((r) => r && visibleTo(r, ctx, true));
  // links inside the article stay in the app
  const onClick = (e) => {
    const link = e.target.closest('a');
    const href = link?.getAttribute('href');
    if (href && href.startsWith('/') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); nav(href); }
  };
  return (
    <div className="help">
      <PageHeader title={a.title} sub={SECTION[a.section]?.label} back="/help">
        {page && forYou && <Link className="btn ghost" to={page}>Open this page</Link>}
      </PageHeader>
      {!forYou && <div className="notice info small">This is written for another role. Your role may not have access to everything here.</div>}
      <article className="card help-article" onClick={onClick}>
        {parts.map((p, i) => (p.app === 'checklist' ? <SetupChecklist key={i} inHelp />
          // eslint-disable-next-line react/no-danger
          : <div key={i} className="md" dangerouslySetInnerHTML={{ __html: p.html }} />))}
      </article>
      {related.length > 0 && (
        <Section title="Related">
          <div className="list">{related.map((r) => <ArticleLink key={r.id} a={r} />)}</div>
        </Section>
      )}
    </div>
  );
}

/** The whole guide on one page, for printing or saving as a PDF: what fits the reader's role, or everything. */
export function HelpPrint() {
  const nav = useNavigate();
  const ctx = useGuideCtx();
  const { membership, user } = useSession();
  const [params, setParams] = useSearchParams();
  const all = params.get('all') === '1';
  const { mine } = rolesFor(ctx, all);
  const list = useMemo(() => {
    const v = visibleArticles(ctx, all);
    return mine ? [mine, ...v.filter((a) => a !== mine)] : v;
  }, [ctx, all, mine]);
  const sections = SECTIONS.map((s) => ({ ...s, items: list.filter((a) => a.section === s.key && a !== mine) })).filter((s) => s.items.length);
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const body = (a) => renderArticle(a).map((p, i) => (p.app === 'checklist'
    ? <p key={i} className="muted small">The live “Set up your team” checklist is on Home in the app.</p>
    // eslint-disable-next-line react/no-danger
    : <div key={i} className="md" dangerouslySetInnerHTML={{ __html: p.html.replace(/href="\/help\/([a-z0-9-]+)"/g, 'href="#g-$1"') }} />));
  // ?ids=a,b prints just those articles (e.g. the quick reference cards, one card per page)
  const ids = (params.get('ids') || '').split(',').map((x) => x.trim()).filter((x) => ARTICLE[x]);
  if (ids.length) {
    const only = ids.map((x) => ARTICLE[x]);
    return (
      <div className={`print-page help-print${ids.includes('training-cards') ? ' print-cards' : ''}`}>
        <div className="print-tools no-print">
          <button type="button" className="btn ghost" onClick={() => nav(-1)}>‹ Back</button>
          <button type="button" className="btn primary" onClick={() => window.print()}>Print / save as PDF</button>
        </div>
        <article className="print-sheet">
          {only.map((a) => <section key={a.id} id={`g-${a.id}`} className="hp-article hp-first"><h2 className="hp-only-title">{a.title}</h2>{body(a)}</section>)}
        </article>
      </div>
    );
  }
  return (
    <div className="print-page help-print">
      <div className="print-tools no-print">
        <button type="button" className="btn ghost" onClick={() => nav(-1)}>‹ Back</button>
        <label className="check-row"><input type="checkbox" checked={all} onChange={(e) => setParams(e.target.checked ? { all: '1' } : {})} /> Every role (not just mine)</label>
        <button type="button" className="btn primary" onClick={() => window.print()}>Print / save as PDF</button>
      </div>
      <article className="print-sheet">
        <header className="hp-cover">
          <h1>{membership?.tenant_name || 'RaceOps'} — user guide</h1>
          <p className="muted">{all ? 'Every role' : `For ${user?.name || 'you'} · ${membership?.role?.name || ''}`} · {today} · {list.length} articles</p>
        </header>
        <nav className="hp-toc" aria-label="Contents">
          <h2>Contents</h2>
          {mine && <p><a href={`#g-${mine.id}`}><b>Your guide: {mine.title}</b></a></p>}
          {sections.map((s) => (
            <div key={s.key}><h3>{s.label}</h3>
              <ol>{s.items.map((a) => <li key={a.id}><a href={`#g-${a.id}`}>{a.title}</a></li>)}</ol></div>
          ))}
        </nav>
        {mine && <section id={`g-${mine.id}`} className="hp-article"><p className="hp-sec">Your guide</p><h2>{mine.title}</h2>{body(mine)}</section>}
        {sections.map((s) => s.items.map((a, i) => (
          <section key={a.id} id={`g-${a.id}`} className={`hp-article${i === 0 ? ' hp-first' : ''}`}>
            <p className="hp-sec">{s.label}</p><h2>{a.title}</h2>{body(a)}
          </section>
        )))}
      </article>
    </div>
  );
}
