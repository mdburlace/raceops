// Feedback & roadmap: report a problem, ask for an improvement or a new feature, follow what happens to it,
// and see (and vote on) what's coming. Platform admins review everything in FeedbackAdmin.jsx.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, PageHeader, Pill, useOnline } from '../components/ui.jsx';
import { api, token } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { getSyncStatus } from '../lib/sync.js';
import { KIND, LANE, LANES, STATUS, OPEN_STATUSES } from '@shared/feedback.js';

export const fmtWhen = (t) => (t ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
export const fileSrc = (id) => `/api/feedback/files/${id}?token=${encodeURIComponent(token() || '')}`;
export const StatusPill = ({ item }) => {
  const s = STATUS[item.status] || { label: item.status, level: 'muted' };
  return (
    <>
      <Pill level={s.level}>{s.label}</Pill>
      {item.lane && ['approved', 'in_progress'].includes(item.status) && <Pill level="info">{LANE[item.lane]?.label}</Pill>}
    </>
  );
};
export const KindPill = ({ kind }) => <span className={`pill fb-kind fb-${kind}`}>{KIND[kind]?.short || kind}</span>;

/** What the device was doing — attached to problem reports so they can be reproduced. */
function deviceContext() {
  const s = getSyncStatus();
  return {
    browser: navigator.userAgent,
    screen: `${window.innerWidth}×${window.innerHeight}`,
    installed: window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true,
    online: navigator.onLine,
    sync: `${s.state}${s.pending ? `, ${s.pending} waiting` : ''}${s.error ? ` (${s.error})` : ''}`,
    time: new Date().toISOString(),
  };
}

export function Thumbs({ files }) {
  if (!files?.length) return null;
  return (
    <div className="fb-thumbs">
      {files.map((f) => <a key={f.id} href={fileSrc(f.id)} target="_blank" rel="noreferrer"><img src={fileSrc(f.id)} alt={f.filename} /></a>)}
    </div>
  );
}

export function Thread({ comments }) {
  if (!comments?.length) return null;
  return (
    <div className="req-thread">
      {comments.map((c) => (
        <div key={c.id} className={`req-msg${c.from_admin ? ' admin' : ''}`}>
          <span className="small muted">{c.from_admin ? (c.user_name && c.user_name !== 'RaceOps' ? `${c.user_name} (admin)` : 'RaceOps') : c.user_name || 'You'} · {fmtWhen(c.created_at)}</span>
          <p>{c.body}</p>
        </div>
      ))}
    </div>
  );
}

// ======================================================================= send
function SendForm({ onSent }) {
  const { tid, membership } = useSession();
  const [params] = useSearchParams();
  const from = params.get('from') || '';
  const [kind, setKind] = useState(params.get('kind') || '');
  const [v, setV] = useState({ title: '', description: '', steps: '', expected: '' });
  const [page, setPage] = useState(from && !from.startsWith('/feedback') ? from : '');
  const [files, setFiles] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (kind === 'bug' || v.title.trim().length < 4) { setSimilar([]); return undefined; }
    const t = setTimeout(() => api(`/feedback/similar?q=${encodeURIComponent(v.title)}`).then((r) => setSimilar(r.items)).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [v.title, kind]);

  const vote = async (it) => {
    const r = await api(`/feedback/${it.id}/vote`, { method: 'POST', body: { on: !it.voted } });
    setSimilar((list) => list.map((x) => (x.id === it.id ? { ...x, ...r } : x)));
  };

  const send = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await api('/feedback', { method: 'POST', body: { kind, ...v, page, tenant_id: tid, context: kind === 'bug' ? deviceContext() : {} } });
      for (const f of files) {
        const fd = new FormData(); fd.append('file', f);
        await api(`/feedback/${r.item.id}/files`, { method: 'POST', form: fd }).catch((e) => setErr(`Sent, but a picture wasn’t added: ${e.message}`));
      }
      setV({ title: '', description: '', steps: '', expected: '' }); setFiles([]); setKind('');
      onSent(r.item);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const bug = kind === 'bug';
  return (
    <div className="card fb-send" data-testid="fb-send">
      <h3>What would you like to send?</h3>
      <div className="fb-kinds" role="radiogroup" aria-label="What you’re sending">
        {[['bug', 'Something isn’t working', 'A bug or error — tell us what happened.'],
          ['enhancement', 'Improve something', 'Make an existing screen or feature better.'],
          ['feature', 'A new feature', 'Something RaceOps doesn’t do yet.']].map(([k, l, d]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={`fb-kind-card${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>
            <b>{l}</b><span className="small muted">{d}</span>
          </button>
        ))}
      </div>
      {kind && (
        <>
          <label className="field"><span className="label">{bug ? 'In a few words, what’s wrong?' : 'In a few words, what would you like?'}</span>
            <input aria-label="Title" value={v.title} onChange={set('title')} maxLength={140} placeholder={bug ? 'e.g. Setup sheet won’t save stagger' : 'e.g. Log tyre pressures for each session'} /></label>
          {similar.length > 0 && (
            <div className="notice info small fb-similar" data-testid="fb-similar">
              <b>Already on the roadmap?</b> If one of these is what you mean, vote for it instead.
              {similar.map((s) => (
                <div key={s.id} className="inline-row">
                  <span className="grow">#{s.ref} {s.title} <StatusPill item={s} /></span>
                  <button type="button" className={`btn small ${s.voted ? '' : 'ghost'}`} aria-pressed={s.voted} onClick={() => vote(s)}>{s.voted ? `✓ Voted (${s.votes})` : `Vote (${s.votes})`}</button>
                </div>
              ))}
            </div>
          )}
          <label className="field"><span className="label">{bug ? 'What went wrong?' : 'What would you like, and why?'}</span>
            <textarea aria-label="Details" rows={4} value={v.description} onChange={set('description')}
              placeholder={bug ? 'What you saw, including any message on screen.' : 'What you’d use it for, and how it would help at the track or in the workshop.'} /></label>
          {bug && (
            <>
              <label className="field"><span className="label">What were you doing? (steps)</span>
                <textarea aria-label="Steps" rows={3} value={v.steps} onChange={set('steps')} placeholder={'1. Opened a setup sheet\n2. Changed stagger\n3. Pressed Save'} /></label>
              <label className="field"><span className="label">What did you expect to happen?</span>
                <textarea aria-label="Expected" rows={2} value={v.expected} onChange={set('expected')} /></label>
            </>
          )}
          {page && (
            <p className="small muted">About the page <code>{page}</code> <button type="button" className="btn small ghost" onClick={() => setPage('')}>Not this page</button></p>
          )}
          <label className="field"><span className="label">Pictures (optional, up to 3)</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple aria-label="Pictures"
              onChange={(e) => setFiles([...e.target.files].slice(0, 3))} /></label>
          {bug && <p className="small muted">We’ll include your device, browser, screen size and sync status so we can reproduce it. Team: {membership?.tenant_name}.</p>}
          {err && <div className="notice error small">{err}</div>}
          <div className="row-actions">
            <button type="button" className="btn primary" disabled={busy || v.title.trim().length < 4 || !(v.description.trim() || v.steps.trim())} onClick={send}>
              {busy ? 'Sending…' : bug ? 'Send problem report' : 'Send request'}</button>
          </div>
        </>
      )}
    </div>
  );
}

// ======================================================================= mine
function MyItem({ item, onChanged }) {
  const [answer, setAnswer] = useState('');
  const [err, setErr] = useState('');
  const open = OPEN_STATUSES.includes(item.status);
  const asked = item.comments.length > 0 && item.comments[item.comments.length - 1].from_admin && open;
  const reply = async () => {
    setErr('');
    try { await api(`/feedback/${item.id}/reply`, { method: 'POST', body: { body: answer } }); setAnswer(''); onChanged(); } catch (e) { setErr(e.message); }
  };
  const withdraw = async () => { if (window.confirm('Withdraw this?')) { await api(`/feedback/${item.id}/withdraw`, { method: 'POST' }); onChanged(); } };
  return (
    <div className={`card fb-item${item.seen ? '' : ' unseen'}`} data-testid="fb-mine-item">
      <div className="inline-row wrap">
        <span className="grow"><b>#{item.ref} {item.title}</b></span>
        <KindPill kind={item.kind} /><StatusPill item={item} />{!item.seen && <Pill level="info">Updated</Pill>}
      </div>
      <p className="small muted">Sent {fmtWhen(item.created_at)}{item.team_name ? ` · ${item.team_name}` : ''}{item.release ? ` · in release ${item.release}` : ''}</p>
      {item.description && <p className="fb-desc">{item.description}</p>}
      {item.status === 'duplicate' && item.duplicate_title && <p className="small">Already requested as <b>#{item.duplicate_ref} {item.duplicate_title}</b> — your vote has been added to it.</p>}
      <Thumbs files={item.files} />
      <Thread comments={item.comments} />
      {asked && (
        <div className="fb-answer">
          <textarea aria-label="Your answer" rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" />
          <button type="button" className="btn small primary" disabled={!answer.trim()} onClick={reply}>Send answer</button>
        </div>
      )}
      {err && <div className="notice error small">{err}</div>}
      {item.status === 'new' && <button type="button" className="btn small ghost" onClick={withdraw}>Withdraw</button>}
    </div>
  );
}

function Mine({ items, onChanged }) {
  if (!items) return null;
  if (!items.length) return <Empty>You haven’t sent anything yet. Use <b>Send feedback</b> to report a problem or ask for something.</Empty>;
  return <div className="fb-list" data-testid="fb-mine">{items.map((i) => <MyItem key={i.id} item={i} onChanged={onChanged} />)}</div>;
}

// ======================================================================= roadmap
function Roadmap() {
  const [items, setItems] = useState(null);
  const load = () => api('/feedback/roadmap').then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  const vote = async (it) => {
    const r = await api(`/feedback/${it.id}/vote`, { method: 'POST', body: { on: !it.voted } });
    setItems((list) => list.map((x) => (x.id === it.id ? { ...x, ...r } : x)));
  };
  if (!items) return null;
  const byVotes = (a, b) => b.votes - a.votes || a.ref - b.ref;
  const cols = [
    ...LANES.map((l) => ({ key: l.key, label: l.label, blurb: l.blurb, list: items.filter((i) => i.status !== 'done' && (i.lane === l.key || (l.key === 'now' && i.status === 'in_progress' && !i.lane))).sort(byVotes) })),
    { key: 'done', label: 'Recently done', blurb: 'Shipped in the last few months', list: items.filter((i) => i.status === 'done').sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))) },
  ];
  return (
    <>
      <p className="muted small">What’s planned for RaceOps. <b>Vote</b> for the things that matter most to you — it helps decide what comes next.</p>
      <div className="fb-board" data-testid="fb-roadmap">
        {cols.map((c) => (
          <section key={c.key} className="fb-col">
            <h3>{c.label} <span className="muted small">{c.list.length}</span></h3>
            <p className="small muted">{c.blurb}</p>
            {c.list.length === 0 && <p className="small muted">Nothing here yet.</p>}
            {c.list.map((i) => (
              <div key={i.id} className="card fb-card" data-testid="fb-road-item">
                <div className="inline-row"><KindPill kind={i.kind} />{i.status === 'in_progress' && <Pill level="warn">In progress</Pill>}{i.mine && <Pill level="muted">Yours</Pill>}</div>
                <b>#{i.ref} {i.title}</b>
                {i.public_summary && <p className="small">{i.public_summary}</p>}
                {i.release && <p className="small muted">Release {i.release}</p>}
                {i.status !== 'done' ? (
                  <button type="button" className={`btn small ${i.voted ? '' : 'ghost'}`} aria-pressed={i.voted} onClick={() => vote(i)}>{i.voted ? `✓ Voted · ${i.votes}` : `Vote · ${i.votes}`}</button>
                ) : <span className="small muted">{i.votes} vote{i.votes === 1 ? '' : 's'}</span>}
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

// ======================================================================= page
export function FeedbackPage() {
  const { refresh, notices } = useSession();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'send';
  const [mine, setMine] = useState(null);
  const [sent, setSent] = useState(null);
  const setTab = (t) => { const p = new URLSearchParams(params); p.set('tab', t); setParams(p, { replace: true }); };
  const loadMine = () => api('/feedback/mine').then((r) => setMine(r.items)).catch(() => setMine([]));
  useEffect(() => { if (online) loadMine(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab === 'mine' && notices?.feedback_updates) api('/feedback/seen', { method: 'POST' }).then(refresh).catch(() => {});
  }, [tab, notices?.feedback_updates]); // eslint-disable-line react-hooks/exhaustive-deps
  const updates = notices?.feedback_updates || 0;
  const count = useMemo(() => (mine || []).filter((i) => OPEN_STATUSES.includes(i.status)).length, [mine]);

  return (
    <div>
      <PageHeader title="Feedback & roadmap" sub="Report a problem, ask for an improvement or a new feature, and see what’s coming" />
      <div className="tabs">
        {[['send', 'Send feedback'], ['mine', `My submissions${count ? ` (${count})` : ''}`], ['roadmap', 'Roadmap']].map(([k, l]) => (
          <button key={k} type="button" className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}{k === 'mine' && updates ? <span className="nav-badge">{updates}</span> : null}</button>
        ))}
      </div>
      {!online ? <div className="notice">Feedback needs an internet connection. Note it down and send it when you’re back online.</div> : (
        <>
          {tab === 'send' && (
            <>
              {sent && <div className="notice info" role="status">Thanks — <b>#{sent.ref} {sent.title}</b> has been sent for review. You’ll see what happens to it under <b>My submissions</b>.</div>}
              <SendForm onSent={(item) => { setSent(item); loadMine(); }} />
            </>
          )}
          {tab === 'mine' && <Mine items={mine} onChanged={loadMine} />}
          {tab === 'roadmap' && <Roadmap />}
        </>
      )}
    </div>
  );
}
