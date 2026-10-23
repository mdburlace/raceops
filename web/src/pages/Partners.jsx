// Partnerships and Marketing: the sponsor pipeline and deals (with deliverables that collect their
// own evidence), paint schemes, hospitality guests and check-in, the sponsor report and proposal,
// the sponsor portal, and — for marketing — results posts, the media library and merchandise.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Empty, PageHeader, Pill, Section, useOnline } from '../components/ui.jsx';
import { api, fileUrl } from '../lib/api.js';
import { fmtDate, titleOf, today, useTeamData, v } from '../lib/data.js';
import { saveRecord } from '../lib/store.js';
import { useSession } from '../lib/session.jsx';
import { dealResults, deliverableProgress, sponsorSummary } from '@shared/partners.js';
import { SPONSOR_STAGES } from '@shared/baseForms5.js';
import { useMoney } from './Business.jsx';

// ---------------------------------------------------------------- partnerships
export function Partnerships() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'sponsors';
  const data = useTeamData();
  const { canType } = useSession();
  if (!data) return null;
  const add = { sponsors: ['sponsor', 'New sponsor'], livery: ['livery', 'New paint scheme'], guests: ['guest', 'Add a guest'] }[tab];
  const ev = params.get('event');
  return (
    <div>
      <PageHeader title="Partnerships" sub="Sponsors from first pitch to renewal, what you promised and proof it was delivered">
        {add && canType(add[0], 'edit') && <Link className="btn primary" to={`/r/${add[0]}/new${tab === 'guests' && ev ? `?event=${ev}` : ''}`}>{add[1]}</Link>}
      </PageHeader>
      <div className="tabs scroll">
        {[['sponsors', 'Sponsors'], ['livery', 'Paint schemes'], ['guests', 'Hospitality']].map(([k, label]) => (
          <button type="button" key={k} className={tab === k ? 'active' : ''} onClick={() => setParams(k === 'sponsors' ? {} : { tab: k })}>{label}</button>
        ))}
      </div>
      {tab === 'sponsors' && <Pipeline data={data} />}
      {tab === 'livery' && <Liveries data={data} />}
      {tab === 'guests' && <Guests data={data} />}
    </div>
  );
}

function Pipeline({ data }) {
  const money = useMoney();
  const { canMoney } = useSession();
  const list = data.list('sponsor');
  if (!list.length) return <Empty>No sponsors yet. Add prospects too — the pipeline runs Prospect → Pitched → Signed → Renewal due.</Empty>;
  return (
    <div className="pipeline" data-testid="pipeline">
      {SPONSOR_STAGES.map((st) => {
        const here = list.filter((s) => (v(s, 'stage') || 'Prospect') === st);
        if (!here.length && st === 'Ended') return null;
        return (
          <section key={st} className="card pipeline-col">
            <h3>{st} <span className="count">{here.length}</span></h3>
            {here.map((s) => {
              const sum = sponsorSummary(data.list, s, today());
              return (
                <Link key={s.id} to={`/partners/sponsors/${s.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{v(s, 'name')}</span>
                    <span className="row-sub">{[v(s, 'level'), canMoney && v(s, 'value') && money(v(s, 'value'), v(s, 'currency')), v(s, 'end') && `to ${fmtDate(v(s, 'end'))}`].filter(Boolean).join(' · ')}</span></span>
                  {sum.total > 0 && ['Signed', 'Renewal due'].includes(st) && <Pill level={sum.met === sum.total ? 'ok' : 'warn'}>{sum.met}/{sum.total}</Pill>}
                </Link>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function Liveries({ data }) {
  const list = data.list('livery').slice().sort((a, b) => String(v(b, 'from')).localeCompare(String(v(a, 'from'))));
  if (!list.length) return <Empty>No paint schemes yet. Add each wrap version with the sponsors on it and a photo — it counts towards their logo deliverables.</Empty>;
  const t = today();
  return (
    <div className="card list">{list.map((l) => {
      const ended = (v(l, 'sponsors') || []).map((id) => data.byId[id]).filter((s) => s && (v(s, 'stage') === 'Ended' || (v(s, 'end') && v(s, 'end') < t)));
      const current = !v(l, 'to') || v(l, 'to') >= t;
      return (
        <Link key={l.id} to={`/r/livery/${l.id}`} className="list-row">
          <span className="grow"><span className="row-title">{titleOf(l, data)}</span>
            <span className="row-sub">{(v(l, 'sponsors') || []).map((id) => v(data.byId[id], 'name')).filter(Boolean).join(', ') || 'No sponsors listed'}</span></span>
          {current && ended.length > 0 && <Pill level="warn">carries {ended.length} ended sponsor{ended.length > 1 ? 's' : ''}</Pill>}
          <Pill level={current ? 'ok' : 'info'}>{current ? 'on the car' : `off ${fmtDate(v(l, 'to'))}`}</Pill>
        </Link>
      );
    })}</div>
  );
}

/** Hospitality: the guest list for an event and check-in at the gate (works offline). */
function Guests({ data }) {
  const [params, setParams] = useSearchParams();
  const { tid, user, canType } = useSession();
  const events = data.list('event').slice().sort((a, b) => String(v(b, 'date')).localeCompare(String(v(a, 'date'))));
  const upcoming = events.filter((e) => (v(e, 'end_date') || v(e, 'date') || '') >= today()).reverse();
  const ev = params.get('event') || upcoming[0]?.id || events[0]?.id || '';
  const guests = data.list('guest').filter((g) => v(g, 'event') === ev).sort((a, b) => String(v(a, 'name')).localeCompare(String(v(b, 'name'))));
  const edit = canType('guest', 'edit');
  const toggle = (g) => saveRecord(tid, 'guest', g.id, { ...g.data, values: { ...g.data.values, checked_in: !v(g, 'checked_in'), checked_in_at: v(g, 'checked_in') ? '' : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } }, user.id);
  const inCount = guests.filter((g) => v(g, 'checked_in')).length;
  return (
    <>
      <div className="toolbar">
        <select aria-label="Event" value={ev} onChange={(e) => setParams({ tab: 'guests', event: e.target.value })}>
          {events.map((e) => <option key={e.id} value={e.id}>{v(e, 'name')} · {fmtDate(v(e, 'date'))}</option>)}
        </select>
        <span className="muted">{inCount} of {guests.length} checked in</span>
      </div>
      {guests.length === 0 ? <Empty>No guests for this event yet.</Empty> : (
        <div className="card list guest-list">{guests.map((g) => (
          <div key={g.id} className="list-row" data-testid="guest-row">
            <Link to={`/r/guest/${g.id}`} className="grow"><span className="row-title">{v(g, 'name')}</span>
              <span className="row-sub">{[v(data.byId[v(g, 'sponsor')], 'name'), `${v(g, 'passes') || 1} × ${v(g, 'pass_type') || 'pass'}`, v(g, 'checked_in_at') && `in at ${v(g, 'checked_in_at')}`].filter(Boolean).join(' · ')}</span></Link>
            {edit ? <button type="button" className={`btn${v(g, 'checked_in') ? ' primary' : ''}`} onClick={() => toggle(g)}>{v(g, 'checked_in') ? 'Checked in ✓' : 'Check in'}</button>
              : <Pill level={v(g, 'checked_in') ? 'ok' : 'info'}>{v(g, 'checked_in') ? 'in' : 'not yet'}</Pill>}
          </div>
        ))}</div>
      )}
    </>
  );
}

/** One sponsor: the deal, deliverables with their evidence, the portal link, report and proposal. */
export function SponsorDetail() {
  const { id } = useParams();
  const data = useTeamData();
  const { canType, canMoney } = useSession();
  const money = useMoney();
  if (!data) return null;
  const s = data.byId[id];
  if (!s) return <PageHeader title="Sponsor not found" back="/partners" />;
  const rows = deliverableProgress(data.list, s, today());
  return (
    <div>
      <PageHeader title={v(s, 'name')} sub={[v(s, 'stage'), v(s, 'level')].filter(Boolean).join(' · ')} back="/partners">
        <Link className="btn ghost" to={`/print/sponsor/${id}`}>Season report</Link>
        <Link className="btn ghost" to={`/print/sponsor/${id}?kind=proposal`}>Proposal</Link>
        <Link className="btn ghost" to={`/r/sponsor/${id}`}>{canType('sponsor', 'edit') ? 'Edit' : 'Details'}</Link>
      </PageHeader>
      <div className="event-meta">
        {canMoney && v(s, 'value') && <span className="chip static">Value {money(v(s, 'value'), v(s, 'currency'))}</span>}
        {(v(s, 'start') || v(s, 'end')) && <span className="chip static">{fmtDate(v(s, 'start')) || '…'} – {fmtDate(v(s, 'end')) || '…'}</span>}
        {data.byId[v(s, 'contract')] && <Link className="chip" to={`/r/contract/${v(s, 'contract')}`}>Contract</Link>}
      </div>
      <Section title="What we promised">
        {rows.length === 0 ? <p className="muted">No deliverables yet — add them on the sponsor (logo positions, posts per event, hospitality passes).</p> : (
          <table className="table" data-testid="deliverables">
            <thead><tr><th>Promise</th><th>Done</th><th>Evidence</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}>
                <td>{r.kind}{r.detail ? ` — ${r.detail}` : ''}{r.qty ? ` (${r.qty}${r.per === 'Event' ? ' per event' : ''})` : ''}</td>
                <td>{r.manual ? <span className="muted small">tick off yourself</span> : <Pill level={r.done >= r.target ? 'ok' : 'warn'}>{r.done} / {r.target}</Pill>}</td>
                <td className="small">{r.evidence.slice(0, 4).map((e) => <Link key={e.id} to={`/r/${e.type}/${e.id}`} className="chip">{e.label}</Link>)}{r.evidence.length > 4 ? ` +${r.evidence.length - 4}` : ''}{r.photos ? <span className="muted"> · {r.photos} photo{r.photos === 1 ? '' : 's'}</span> : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>
      <PortalLink sponsor={s} />
    </div>
  );
}

function PortalLink({ sponsor }) {
  const { tid, canType } = useSession();
  const online = useOnline();
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const load = () => api(`/t/${tid}/sponsors/${sponsor.id}/portal`).then(setSt).catch((e) => setErr(e.message));
  useEffect(() => { if (online && !sponsor.dirty) load(); }, [online, sponsor.id, sponsor.dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = canType('sponsor', 'edit');
  const link = st?.portal ? `${window.location.origin}/sp/${st.portal.token}` : '';
  const act = async (method) => { setErr(''); try { await api(`/t/${tid}/sponsors/${sponsor.id}/portal`, { method }); await load(); } catch (e) { setErr(e.message); } };
  return (
    <Section title="Sponsor page (no login)">
      <p className="muted small">A private link for the sponsor: their deal (no amounts), what was promised and delivered, results at the meetings in the deal, posts and approved photos that show them.</p>
      {!online ? <p className="muted">Needs a connection.</p> : sponsor.dirty ? <p className="muted">Available once the sponsor has synced.</p> : !st ? <p className="muted">{err || 'Loading…'}</p> : st.portal ? (
        <div className="inline-row wrap">
          <input readOnly value={link} aria-label="Sponsor page link" className="grow" />
          <button type="button" className="btn small" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { window.prompt('Copy this link', link); } }}>{copied ? 'Copied ✓' : 'Copy'}</button>
          <a className="btn small ghost" href={link} target="_blank" rel="noreferrer">Open</a>
          {edit && <button type="button" className="btn small ghost" onClick={() => act('POST')}>New link</button>}
          {edit && <button type="button" className="btn small ghost danger" onClick={() => act('DELETE')}>Turn off</button>}
          <span className="muted small">Viewed {st.portal.views} time{st.portal.views === 1 ? '' : 's'}</span>
        </div>
      ) : edit ? <button type="button" className="btn" onClick={() => act('POST')}>Make a sponsor page link</button> : <p className="muted">No link yet.</p>}
      {err && st && <p className="error-text">{err}</p>}
    </Section>
  );
}

/** The season report (default) or the proposal, ready to print or save as a PDF. */
export function SponsorPrint() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const data = useTeamData();
  const { membership } = useSession();
  if (!data) return <p className="pad muted">Loading…</p>;
  const s = data.byId[id];
  if (!s) return <p className="pad">Sponsor not found.</p>;
  const proposal = params.get('kind') === 'proposal';
  const results = dealResults(data.list, data.byId, s, today());
  const all = proposal ? data.list('event').filter((e) => (v(e, 'date') || '') <= today()) : [];
  const recent = proposal ? dealResults(data.list, data.byId, { id: s.id, data: { values: {} } }, today()).slice(-10) : [];
  const rows = deliverableProgress(data.list, s, today());
  const cars = data.list('car').filter((c) => v(c, 'active') !== false);
  return (
    <div className="print-page sponsor-print" data-testid="sponsor-print">
      <div className="print-tools no-print">
        <button type="button" className="btn ghost" onClick={() => nav(-1)}>‹ Back</button>
        <button type="button" className="btn primary" onClick={() => window.print()}>Print / save as PDF</button>
      </div>
      <h1>{membership?.tenant_name} × {v(s, 'name')}</h1>
      <p className="muted">{proposal ? 'Partnership proposal' : `Season report${v(s, 'start') ? ` · ${fmtDate(v(s, 'start'))} – ${fmtDate(v(s, 'end')) || 'now'}` : ''}`}</p>
      {proposal ? (
        <>
          <h2>About the team</h2>
          <p>{cars.length} car{cars.length === 1 ? '' : 's'} racing · {all.length} meetings raced{v(s, 'pitch_crowd') ? ` · crowds of about ${v(s, 'pitch_crowd')}` : ''}{v(s, 'pitch_social') ? ` · ${v(s, 'pitch_social')} social followers` : ''}.</p>
          {v(s, 'pitch_notes') && <p className="pre">{v(s, 'pitch_notes')}</p>}
          <h2>Recent results</h2>
          <ResultsTable rows={recent} />
          <h2>What we’d offer</h2>
          <ul>{rows.map((r, i) => <li key={i}>{r.kind}{r.detail ? ` — ${r.detail}` : ''}{r.qty ? ` × ${r.qty}${r.per === 'Event' ? ' per event' : ''}` : ''}</li>)}</ul>
        </>
      ) : (
        <>
          <h2>What we promised and delivered</h2>
          <table className="table"><tbody>{rows.map((r, i) => (
            <tr key={i}><td>{r.kind}{r.detail ? ` — ${r.detail}` : ''}</td><td>{r.manual ? '—' : `${r.done} of ${r.target}`}</td></tr>
          ))}</tbody></table>
          <h2>Results</h2>
          <ResultsTable rows={results} />
          <h2>Posts</h2>
          <ul>{data.list('social_post').filter((p) => v(p, 'status') === 'Posted' && (v(p, 'sponsors') || []).includes(s.id))
            .map((p) => <li key={p.id}>{fmtDate(v(p, 'posted_on'))} — {String(v(p, 'text') || '').slice(0, 140)}{v(p, 'link') ? ` (${v(p, 'link')})` : ''}</li>)}</ul>
          <p className="muted small">Photos showing your logo are on your sponsor page.</p>
        </>
      )}
    </div>
  );
}

function ResultsTable({ rows }) {
  if (!rows.length) return <p className="muted">No meetings yet.</p>;
  return (
    <table className="table"><thead><tr><th>Date</th><th>Meeting</th><th>Track</th><th>Feature</th><th>Best finish</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td>{fmtDate(r.date)}</td><td>{r.name}</td><td>{r.track}</td><td>{r.feature ? `P${r.feature}` : '—'}</td><td>{r.best ? `P${r.best}` : '—'}</td></tr>)}</tbody></table>
  );
}

/** /sp/:token — the sponsor's own page, no login. */
export function SponsorPortal() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`/api/public/sponsor/${encodeURIComponent(token)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not load this page.');
      setD(j); document.title = `${j.team} × ${j.sponsor.name}`;
    }).catch((e) => setErr(e.message));
  }, [token]);
  if (err) return <div className="share-page"><div className="card"><h1>Page unavailable</h1><p>{err}</p></div></div>;
  if (!d) return <div className="share-page"><p className="muted">Loading…</p></div>;
  return (
    <div className="share-page sponsor-portal" data-testid="sponsor-portal">
      <div className="share-tools no-print"><button type="button" className="btn ghost small" onClick={() => window.print()}>Print / save as PDF</button></div>
      <h1>{d.team} × {d.sponsor.name}</h1>
      <p className="muted">{[d.sponsor.level, d.sponsor.start && `${fmtDate(d.sponsor.start)} – ${fmtDate(d.sponsor.end) || 'now'}`].filter(Boolean).join(' · ')}</p>
      <section className="card"><h3>What we promised</h3>
        <table className="table"><tbody>{d.deliverables.map((r, i) => <tr key={i}><td>{r.kind}{r.detail ? ` — ${r.detail}` : ''}</td><td>{r.manual ? '' : `${r.done} of ${r.target}`}</td></tr>)}</tbody></table>
      </section>
      {d.liveries.length > 0 && <section className="card"><h3>On the car</h3><ul>{d.liveries.map((l, i) => <li key={i}>{l.name}{l.car ? ` (${l.car})` : ''} · from {fmtDate(l.from) || '—'}{l.to ? ` to ${fmtDate(l.to)}` : ''}</li>)}</ul></section>}
      <section className="card"><h3>Results</h3><ResultsTable rows={d.results} /></section>
      {d.posts.length > 0 && <section className="card"><h3>Posts</h3><ul>{d.posts.map((p, i) => <li key={i}>{fmtDate(p.posted_on)} — {p.text.slice(0, 160)}{p.link ? <> <a href={p.link} target="_blank" rel="noreferrer">View</a></> : null}</li>)}</ul></section>}
      {d.photos.length > 0 && (
        <section className="card"><h3>Photos</h3>
          <div className="attachments">{d.photos.map((p) => (
            <figure key={p.id} className="att"><img src={`/api/public/sponsor/${encodeURIComponent(token)}/photos/${p.id}`} alt={p.caption || p.filename} loading="lazy" />
              <figcaption><span>{p.caption}</span><small className="muted">{p.event}</small></figcaption></figure>
          ))}</div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- marketing
export function Marketing() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'posts';
  const data = useTeamData();
  const { canType } = useSession();
  if (!data) return null;
  const add = { posts: ['social_post', 'New results post'], media: ['media', 'Add photo'], merch: ['merch', 'New item'] }[tab];
  return (
    <div>
      <PageHeader title="Marketing" sub="Results posts for social media, the media library and merchandise">
        {add && canType(add[0], 'edit') && <Link className="btn primary" to={`/r/${add[0]}/new`}>{add[1]}</Link>}
      </PageHeader>
      <div className="tabs scroll">
        {[['posts', 'Results posts'], ['media', 'Media library'], ['merch', 'Merchandise']].map(([k, label]) => (
          <button type="button" key={k} className={tab === k ? 'active' : ''} onClick={() => setParams(k === 'posts' ? {} : { tab: k })}>{label}</button>
        ))}
      </div>
      {tab === 'posts' && <Posts data={data} />}
      {tab === 'media' && <Media data={data} />}
      {tab === 'merch' && <Merch data={data} />}
    </div>
  );
}

function Posts({ data }) {
  const list = data.list('social_post').slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!list.length) return <Empty>No posts yet. After a meeting, start a results post: draft it from the result (or with AI), approve it, then share it from your phone.</Empty>;
  const level = { Draft: 'warn', Approved: 'info', Posted: 'ok' };
  return (
    <div className="card list">{list.map((p) => (
      <Link key={p.id} to={`/r/social_post/${p.id}`} className="list-row" data-testid="post-row">
        <span className="grow"><span className="row-title">{titleOf(p, data)}</span><span className="row-sub">{String(v(p, 'text') || '').slice(0, 90)}</span></span>
        <Pill level={level[v(p, 'status') || 'Draft']}>{v(p, 'status') || 'Draft'}</Pill>
      </Link>
    ))}</div>
  );
}

function Media({ data }) {
  const { tid } = useSession();
  const online = useOnline();
  const [files, setFiles] = useState(null);
  const [sponsor, setSponsor] = useState('');
  useEffect(() => { if (online) api(`/t/${tid}/media/files`).then(setFiles).catch(() => setFiles([])); }, [online, tid]);
  const list = data.list('media').filter((m) => !sponsor || (v(m, 'sponsors') || []).includes(sponsor))
    .sort((a, b) => String(v(b, 'date')).localeCompare(String(v(a, 'date'))));
  const sponsors = data.list('sponsor');
  return (
    <>
      {sponsors.length > 0 && (
        <div className="toolbar">
          <select aria-label="Sponsor" value={sponsor} onChange={(e) => setSponsor(e.target.value)}>
            <option value="">All photos</option>{sponsors.map((s) => <option key={s.id} value={s.id}>Showing {v(s, 'name')}</option>)}
          </select>
        </div>
      )}
      {!list.length ? <Empty>No photos yet. Add one per shot with the event, car, driver and the sponsors you can see — it counts as proof for their logo deliverable.</Empty> : (
        <div className="media-grid">{list.map((m) => {
          const f = (files || []).find((x) => x.record_id === m.id && x.mime.startsWith('image/'));
          return (
            <Link key={m.id} to={`/r/media/${m.id}`} className="media-tile card">
              {f ? <img src={fileUrl(tid, f.id)} alt={v(m, 'caption')} loading="lazy" /> : <span className="media-empty muted small">{online ? 'No photo yet' : 'Photos need a connection'}</span>}
              <span className="row-title">{v(m, 'caption')}</span>
              <span className="row-sub">{[fmtDate(v(m, 'date')), v(data.byId[v(m, 'event')], 'name')].filter(Boolean).join(' · ')}{v(m, 'approved') ? '' : ' · not approved'}</span>
            </Link>
          );
        })}</div>
      )}
    </>
  );
}

function Merch({ data }) {
  const list = data.list('merch').slice().sort((a, b) => String(v(a, 'name')).localeCompare(String(v(b, 'name'))));
  if (!list.length) return <Empty>No merchandise yet. Keep a stock count here and sell through your online shop (Square, Shopify…).</Empty>;
  return (
    <div className="card list">{list.map((m) => {
      const low = Number(v(m, 'stock')) <= Number(v(m, 'reorder_at')) && v(m, 'reorder_at') !== undefined && v(m, 'reorder_at') !== '';
      return (
        <Link key={m.id} to={`/r/merch/${m.id}`} className="list-row">
          <span className="grow"><span className="row-title">{titleOf(m)}</span><span className="row-sub">{v(m, 'price') ? `Sells for ${v(m, 'price')}` : ''}</span></span>
          <Pill level={low ? 'warn' : 'ok'}>{v(m, 'stock') ?? 0} in stock</Pill>
        </Link>
      );
    })}</div>
  );
}
