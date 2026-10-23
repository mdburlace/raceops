// Platform admin → Feedback & ideas: capture ideas, review what people send, run the pipeline
// (Now / Next / Later → in progress → done), and send items to Claude (GitHub issue or a copied brief).
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, PageHeader, Pill } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { ARTICLES } from '../lib/guide.js';
import { useSession } from '../lib/session.jsx';
import {
  FEATURE_AREAS, FEATURE_AREA, KIND, KINDS, LANE, LANES, PRIORITIES, PRIORITY_LABEL, buildBrief, FILE_LIMITS,
} from '@shared/feedback.js';
import { AddFile, Attachments, KindPill, StatusPill, Thread, fmtWhen, uploadFiles } from './Feedback.jsx';

const VIEWS = [['inbox', 'Inbox'], ['ideas', 'Ideas'], ['pipeline', 'Pipeline'], ['done', 'Done'], ['closed', 'Closed'], ['all', 'All']];

function AreaPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => [...new Set(FEATURE_AREAS.map((a) => a.group))], []);
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="field fb-areas">
      <span className="label">Functionality areas</span>
      <div className="chips">
        {value.map((k) => <button key={k} type="button" className="chip active" onClick={() => toggle(k)} title="Remove">{FEATURE_AREA[k]?.label || k} ×</button>)}
        <button type="button" className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Done' : value.length ? 'Change…' : 'Link to areas…'}</button>
      </div>
      {open && (
        <div className="fb-area-list" data-testid="fb-area-list">
          {groups.map((g) => (
            <div key={g}>
              <b className="small">{g}</b>
              <div className="fb-area-grid">
                {FEATURE_AREAS.filter((a) => a.group === g).map((a) => (
                  <label key={a.key} className="check-row small"><input type="checkbox" checked={value.includes(a.key)} onChange={() => toggle(a.key)} /> {a.label}</label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemEditor({ item, onSaved, onCancel, isNew }) {
  const [v, setV] = useState(() => ({
    kind: item.kind || 'enhancement', title: item.title || '', description: item.description || '', steps: item.steps || '', expected: item.expected || '',
    acceptance: item.acceptance || '', areas: item.areas || [], priority: item.priority || 'normal', public: !!item.public, public_summary: item.public_summary || '',
  }));
  const [err, setErr] = useState('');
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    setErr('');
    try {
      const r = isNew ? await api('/admin/feedback', { method: 'POST', body: v }) : await api(`/admin/feedback/${item.id}`, { method: 'PATCH', body: v });
      onSaved(r.item);
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="fb-editor" data-testid="fb-editor">
      <div className="grid-2">
        <label className="field"><span className="label">Title</span><input aria-label="Title" value={v.title} onChange={set('title')} maxLength={140} /></label>
        <div className="inline-row wrap">
          <label className="field"><span className="label">Kind</span>
            <select aria-label="Kind" value={v.kind} onChange={set('kind')}>{KINDS.map((k) => <option key={k.key} value={k.key}>{k.short}</option>)}</select></label>
          <label className="field"><span className="label">Priority</span>
            <select aria-label="Priority" value={v.priority} onChange={set('priority')}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
        </div>
      </div>
      <label className="field"><span className="label">{v.kind === 'bug' ? 'What went wrong' : 'What and why'}</span>
        <textarea aria-label="Description" rows={4} value={v.description} onChange={set('description')} /></label>
      {v.kind === 'bug' && (
        <div className="grid-2">
          <label className="field"><span className="label">Steps to reproduce</span><textarea aria-label="Steps" rows={3} value={v.steps} onChange={set('steps')} /></label>
          <label className="field"><span className="label">Expected vs what happened</span><textarea aria-label="Expected" rows={3} value={v.expected} onChange={set('expected')} /></label>
        </div>
      )}
      <label className="field"><span className="label">Done when (acceptance criteria)</span>
        <textarea aria-label="Done when" rows={3} value={v.acceptance} onChange={set('acceptance')} placeholder={'- A crew chief can …\n- Works offline\n- Guide explains it'} /></label>
      <AreaPicker value={v.areas} onChange={(areas) => setV((s) => ({ ...s, areas }))} />
      <label className="check-row"><input type="checkbox" checked={v.public} onChange={set('public')} /> Show on the public roadmap (when approved)</label>
      {v.public && <label className="field"><span className="label">Roadmap summary (what everyone sees)</span>
        <input aria-label="Roadmap summary" value={v.public_summary} onChange={set('public_summary')} maxLength={600} placeholder="One line, no private details" /></label>}
      {err && <div className="notice error small">{err}</div>}
      <div className="row-actions">
        <button type="button" className="btn primary" disabled={!v.title.trim()} onClick={save}>{isNew ? 'Save idea' : 'Save changes'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function SendToClaude({ item, github, onDone }) {
  const appUrl = `${window.location.origin}/admin/feedback?item=${item.id}`;
  const [brief, setBrief] = useState(() => buildBrief(item, { articles: ARTICLES, appUrl }));
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const send = async (manual) => {
    setMsg(null); setBusy(true);
    try { const r = await api(`/admin/feedback/${item.id}/claude`, { method: 'POST', body: { brief, manual } }); onDone(r.item); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(brief); setMsg({ ok: true, text: 'Brief copied. Paste it into a Claude Code session in the RaceOps repository.' }); } catch { setMsg({ ok: false, text: 'Couldn’t copy — select the text and copy it instead.' }); } };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([brief], { type: 'text/markdown' }));
    a.download = `raceops-${item.ref}-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.md`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <div className="fb-claude" data-testid="fb-claude">
      <b>Send to Claude</b>
      <p className="small muted">{github.configured
        ? <>Creates an issue in <b>{github.repo}</b> that asks {github.mention} to action it and open a pull request. Edit the brief first if you like.</>
        : <>GitHub isn’t set up on this server, so copy or download the brief and paste it into a Claude Code session. Set <code>GITHUB_TOKEN</code> and <code>GITHUB_REPO</code> to send issues from here.</>}</p>
      <textarea aria-label="Brief for Claude" rows={14} value={brief} onChange={(e) => setBrief(e.target.value)} className="mono" />
      {msg && <div className={`notice small ${msg.ok ? 'info' : 'error'}`}>{msg.text}</div>}
      <div className="row-actions wrap">
        {github.configured && <button type="button" className="btn primary" disabled={busy} onClick={() => send(false)}>{item.github_issue ? 'Post updated brief to the issue' : 'Create GitHub issue'}</button>}
        <button type="button" className="btn ghost" onClick={copy}>Copy brief</button>
        <button type="button" className="btn ghost" onClick={download}>Download .md</button>
        {!item.sent_at && <button type="button" className="btn ghost" disabled={busy} onClick={() => send(true)}>Mark as sent</button>}
      </div>
    </div>
  );
}

function Decide({ item, open, onDone }) {
  const [note, setNote] = useState('');
  const [dup, setDup] = useState('');
  const [release, setRelease] = useState('');
  const [err, setErr] = useState('');
  const act = async (action, extra = {}) => {
    setErr('');
    try { const r = await api(`/admin/feedback/${item.id}/decide`, { method: 'POST', body: { action, note, ...extra } }); setNote(''); onDone(r.item); } catch (e) { setErr(e.message); }
  };
  const s = item.status;
  const fromUser = item.source === 'user';
  return (
    <div className="fb-decide" data-testid="fb-decide">
      <textarea aria-label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder={fromUser ? 'Note or question for the person who sent it (needed to decline or ask)' : 'Note (optional)'} />
      <div className="row-actions wrap">
        {['draft', 'new', 'declined', 'duplicate', 'withdrawn'].includes(s) && (
          <>
            {LANES.map((l) => <button key={l.key} type="button" className="btn small" onClick={() => act('approve', { lane: l.key })} title={l.blurb}>Approve → {l.label}</button>)}
            {s !== 'declined' && <button type="button" className="btn small ghost danger" onClick={() => act('decline')}>Decline</button>}
          </>
        )}
        {fromUser && ['new', 'approved', 'in_progress'].includes(s) && <button type="button" className="btn small ghost" onClick={() => act('ask')}>Ask the submitter</button>}
        {['approved', 'in_progress'].includes(s) && (
          <>
            <label className="inline-row small">Lane
              <select aria-label="Lane" value={item.lane || ''} onChange={(e) => act('move', { lane: e.target.value })}>
                {LANES.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select></label>
            {s === 'approved' && <button type="button" className="btn small ghost" onClick={() => act('start')}>Start</button>}
            <input aria-label="Release" className="narrow-input" value={release} onChange={(e) => setRelease(e.target.value)} placeholder="Release e.g. 1.6.0" />
            <button type="button" className="btn small" onClick={() => act('done', { release })}>Mark done</button>
          </>
        )}
        {['done', 'declined', 'duplicate', 'withdrawn'].includes(s) && <button type="button" className="btn small ghost" onClick={() => act('reopen')}>Reopen</button>}
      </div>
      {['draft', 'new'].includes(s) && (
        <div className="inline-row wrap small">
          <span>Already requested?</span>
          <select aria-label="Duplicate of" value={dup} onChange={(e) => setDup(e.target.value)}>
            <option value="">Choose the original…</option>
            {open.filter((o) => o.id !== item.id).map((o) => <option key={o.id} value={o.id}>#{o.ref} {o.title}</option>)}
          </select>
          <button type="button" className="btn small ghost" disabled={!dup} onClick={() => act('duplicate', { duplicate_of: dup })}>Mark as duplicate</button>
        </div>
      )}
      {err && <div className="notice error small">{err}</div>}
    </div>
  );
}

function ItemDetail({ id, github, open, onChanged }) {
  const [item, setItem] = useState(null);
  const [editing, setEditing] = useState(false);
  const [claude, setClaude] = useState(false);
  const [err, setErr] = useState('');
  const [fileErr, setFileErr] = useState('');
  const load = () => api(`/admin/feedback/${id}`).then((r) => setItem(r.item)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = (it) => { setItem(it); setEditing(false); setClaude(false); onChanged(); };
  if (err) return <div className="notice error small">{err}</div>;
  if (!item) return null;
  const c = item.context || {};
  const refresh = async () => { try { changed((await api(`/admin/feedback/${id}/github`, { method: 'POST' })).item); } catch (e) { setErr(e.message); } };
  const remove = async () => { if (window.confirm('Delete this idea?')) { await api(`/admin/feedback/${id}`, { method: 'DELETE' }); onChanged(true); } };
  const addFiles = async (fs) => { setFileErr(''); const p = await uploadFiles(`/admin/feedback/${id}/files`, fs, item.files.length); if (p.length) setFileErr(p.join(' ')); load(); };
  const removeFile = async (f) => { setFileErr(''); try { await api(`/admin/feedback/${id}/files/${f.id}`, { method: 'DELETE' }); load(); } catch (e) { setFileErr(e.message); } };
  return (
    <div className="card fb-detail" data-testid="fb-detail">
      {editing ? <ItemEditor item={item} onSaved={changed} onCancel={() => setEditing(false)} /> : (
        <>
          <p className="small muted">
            {item.source === 'user' ? <>From <b>{item.user_name}</b>{item.user_email ? ` (${item.user_email})` : ''}{item.team_name ? ` · ${item.team_name}` : ''}</> : <>Idea from <b>{item.user_name || 'a platform admin'}</b></>}
            {' · '}{fmtWhen(item.created_at)}{item.decided_by_name ? ` · decided by ${item.decided_by_name}` : ''}
          </p>
          {item.description && <p className="fb-desc">{item.description}</p>}
          {item.steps && <><b className="small">Steps</b><p className="fb-desc">{item.steps}</p></>}
          {item.expected && <><b className="small">Expected</b><p className="fb-desc">{item.expected}</p></>}
          {item.acceptance && <><b className="small">Done when</b><p className="fb-desc">{item.acceptance}</p></>}
          {item.areas?.length > 0 && <div className="chips">{item.areas.map((k) => <span key={k} className="chip">{FEATURE_AREA[k]?.label || k}</span>)}</div>}
          {(item.page || c.browser) && (
            <p className="small muted fb-context">{item.page && <>Page <code>{item.page}</code></>}{c.screen ? ` · screen ${c.screen}` : ''}{c.sync ? ` · sync ${c.sync}` : ''}
              {c.installed !== undefined ? ` · ${c.installed ? 'installed app' : 'browser'}` : ''}{c.online === false ? ' · offline' : ''}{c.browser ? <><br />{c.browser}</> : null}</p>
          )}
          <p className="small">
            {item.public ? <>On the roadmap as “{item.public_summary || item.title}”</> : 'Not on the public roadmap'}
            {item.votes ? ` · ${item.votes} vote${item.votes === 1 ? '' : 's'}` : ''}{item.duplicates ? ` · ${item.duplicates} duplicate${item.duplicates === 1 ? '' : 's'} merged in` : ''}
            {item.duplicate_title ? <> · duplicate of #{item.duplicate_ref} {item.duplicate_title}</> : null}
          </p>
          {item.sent_at && (
            <p className="small" data-testid="fb-sent">Sent to Claude {fmtWhen(item.sent_at)}{item.sent_by_name ? ` by ${item.sent_by_name}` : ''}
              {item.github_url && <> · <a href={item.github_url} target="_blank" rel="noreferrer">GitHub issue #{item.github_issue}</a> ({item.github_state || 'open'}) <button type="button" className="btn small ghost" onClick={refresh}>Check GitHub</button></>}</p>
          )}
          <Attachments files={item.files} onRemove={removeFile} />
          {fileErr && <div className="notice error small">{fileErr}</div>}
          <Thread comments={item.comments} />
          <div className="row-actions wrap">
            <button type="button" className="btn small ghost" onClick={() => setEditing(true)}>Edit</button>
            {['approved', 'in_progress'].includes(item.status) && <button type="button" className="btn small" aria-expanded={claude} onClick={() => setClaude(!claude)}>Send to Claude…</button>}
            {item.files.length < FILE_LIMITS.perItem && <AddFile onFiles={addFiles} />}
            {item.source === 'admin' && item.status === 'draft' && <button type="button" className="btn small ghost danger" onClick={remove}>Delete idea</button>}
          </div>
          {claude && <SendToClaude item={item} github={github} onDone={changed} />}
          <Decide item={item} open={open} onDone={changed} />
        </>
      )}
    </div>
  );
}

function Row({ item, selected, onPick, compact }) {
  return (
    <button type="button" className={`list-row fb-row${selected ? ' selected' : ''}`} aria-expanded={selected} onClick={onPick} data-testid="fb-row">
      <span className="grow">
        <span className="row-title">#{item.ref} {item.title}</span>
        <span className="row-sub">{item.source === 'user' ? `${item.user_name || 'Someone'}${item.team_name ? ` · ${item.team_name}` : ''}` : 'Idea'} · {fmtWhen(item.created_at)}
          {item.votes ? ` · ${item.votes} vote${item.votes === 1 ? '' : 's'}` : ''}{item.comment_count ? ` · ${item.comment_count} message${item.comment_count === 1 ? '' : 's'}` : ''}</span>
      </span>
      <span className="fb-pills"><KindPill kind={item.kind} />{item.priority !== 'normal' && <Pill level={['high', 'critical'].includes(item.priority) ? 'over' : 'muted'}>{PRIORITY_LABEL[item.priority]}</Pill>}
        {!compact && <StatusPill item={item} />}{item.sent_at && <Pill level="info">{item.github_issue ? `GitHub #${item.github_issue}` : 'Sent'}</Pill>}</span>
    </button>
  );
}

export function AdminFeedback() {
  const { refresh } = useSession();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') || 'inbox';
  const [d, setD] = useState(null);
  const [all, setAll] = useState([]);
  const [pick, setPick] = useState(params.get('item') || null);
  const [adding, setAdding] = useState(false);
  const setView = (k) => { const p = new URLSearchParams(params); p.set('view', k); p.delete('item'); setParams(p, { replace: true }); setPick(null); };
  const load = () => {
    api(`/admin/feedback?view=${view}`).then(setD).catch(() => setD({ items: [], counts: {}, github: {} }));
    api('/admin/feedback?view=pipeline').then((r) => setAll(r.items)).catch(() => {});
  };
  useEffect(() => { load(); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = (gone) => { load(); refresh(); if (gone === true) setPick(null); };
  const items = d?.items || [];
  const openItems = [...all, ...items.filter((i) => ['new', 'draft'].includes(i.status))].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
  const detail = (i) => pick === i.id && <ItemDetail key={i.id} id={i.id} github={d.github} open={openItems} onChanged={changed} />;

  return (
    <div>
      <PageHeader title="Feedback & ideas" sub="Ideas, bug reports and requests — review them into the pipeline, publish the roadmap, and send work to Claude" />
      <div className="toolbar">
        <button type="button" className="btn primary" onClick={() => { setAdding(true); setPick(null); }}>New idea</button>
        {d && <span className="small muted">{d.github?.configured ? <>Sends to GitHub: <b>{d.github.repo}</b></> : 'GitHub not set up — briefs are copied by hand'}</span>}
      </div>
      {adding && <div className="card"><h3>New idea</h3><ItemEditor isNew item={{}} onSaved={(it) => { setAdding(false); setView('ideas'); setPick(it.id); refresh(); }} onCancel={() => setAdding(false)} /></div>}
      <div className="tabs">
        {VIEWS.map(([k, l]) => <button key={k} type="button" className={view === k ? 'active' : ''} onClick={() => setView(k)}>{l}{d?.counts?.[k] ? ` (${d.counts[k]})` : ''}</button>)}
      </div>
      {d && pick && !items.some((i) => i.id === pick) && (
        <div className="fb-moved" data-testid="fb-moved">
          <p className="small muted">This item has moved out of <b>{VIEWS.find(([k]) => k === view)?.[1]}</b>. <button type="button" className="btn small ghost" onClick={() => setPick(null)}>Close</button></p>
          <ItemDetail key={pick} id={pick} github={d.github} open={openItems} onChanged={changed} />
        </div>
      )}
      {d && items.length === 0 && <Empty>{{ inbox: 'Nothing waiting for review.', ideas: 'No draft ideas. Press New idea to capture one.', pipeline: 'Nothing in the pipeline yet. Approve items into Now, Next or Later.' }[view] || 'Nothing here.'}</Empty>}
      {view === 'pipeline' ? (
        <div className="fb-board" data-testid="fb-pipeline">
          {LANES.map((l) => {
            const list = items.filter((i) => i.lane === l.key).sort((a, b) => (b.status === 'in_progress') - (a.status === 'in_progress') || b.votes - a.votes);
            return (
              <section key={l.key} className="fb-col">
                <h3>{l.label} <span className="muted small">{list.length}</span></h3>
                <p className="small muted">{l.blurb}</p>
                {list.map((i) => (
                  <div key={i.id}>
                    <Row item={i} compact selected={pick === i.id} onPick={() => setPick(pick === i.id ? null : i.id)} />
                    {i.status === 'in_progress' && <Pill level="warn">In progress</Pill>}
                  </div>
                ))}
              </section>
            );
          })}
          {items.filter((i) => i.id === pick).map((i) => <div key={i.id} className="fb-board-detail">{detail(i)}</div>)}
        </div>
      ) : (
        <div className="list" data-testid="fb-list">
          {items.map((i) => <div key={i.id}><Row item={i} selected={pick === i.id} onPick={() => setPick(pick === i.id ? null : i.id)} />{detail(i)}</div>)}
        </div>
      )}
      <p className="small muted">{KINDS.map((k) => `${k.short}: ${KIND[k.key].label.toLowerCase()}`).join(' · ')}. Lanes: {LANES.map((l) => `${l.label} — ${LANE[l.key].blurb.toLowerCase()}`).join('; ')}.</p>
    </div>
  );
}
