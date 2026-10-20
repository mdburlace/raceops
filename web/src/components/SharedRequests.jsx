// Teams and the shared calendars: send the team's own series, track, dates and major events to the
// shared calendars, ask for changes to shared records, see what happened to each request, and keep
// the team's own notes about shared series, tracks and dates. Platform admins moderate the requests.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import FormRenderer from './FormRenderer.jsx';
import { Empty, Pill, Section } from './ui.jsx';
import { api } from '../lib/api.js';
import { fmtDate, formFor, titleOf, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { saveRecord } from '../lib/store.js';

const isGlobal = (r) => !!(r?.global || r?.data?.scope === 'global');
const vals = (r) => r?.data?.values || {};
const fmtWhen = (t) => (t ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
export const STATUS = {
  pending: ['Waiting for approval', 'info'], approved: ['Approved', 'ok'], partly_approved: ['Partly approved', 'warn'],
  rejected: ['Not approved', 'over'], withdrawn: ['Withdrawn', 'muted'],
};
const KIND_LABEL = { series: 'Series', track: 'Track', dates: 'Dates', fixture: 'Date' };

/** The team's requests to the shared calendars (reloads on demand). */
export function useCalendarRequests() {
  const { tid } = useSession();
  const [list, setList] = useState(null);
  const load = useCallback(() => (tid && navigator.onLine
    ? api(`/t/${tid}/calendar/requests`).then((r) => setList(r.requests)).catch(() => setList((x) => x || []))
    : Promise.resolve()), [tid]);
  useEffect(() => { load(); }, [load]);
  return { list: list || [], loaded: !!list, reload: load };
}

/** Send a request to the shared calendars. body: { kind, subject_type, subject_id, events, dates, values, note, title } */
export async function sendRequest(tid, body) {
  return api(`/t/${tid}/calendar/requests`, { method: 'POST', body });
}

// ======================================================================= team notes
/** The team's own notes about a shared series, track or date — only the team sees them. */
export function TeamNotes({ data, entityType, entity, compact = false }) {
  const { tid, user, canType } = useSession();
  const note = data.list('local_note').find((n) => vals(n).entity === entity);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const form = formFor(data, 'local_note');
  const canEdit = canType('local_note', 'edit');
  const start = () => { setText(vals(note).notes || ''); setEditing(true); };
  const save = async () => {
    await saveRecord(tid, 'local_note', note?.id || null, { ...(note?.data || {}), form_id: form?.id, values: { ...vals(note), entity_type: entityType, entity, notes: text } }, user.id);
    setEditing(false);
  };
  const body = editing ? (
    <div className="team-notes-edit">
      <textarea rows={4} aria-label="Our notes" value={text} onChange={(e) => setText(e.target.value)} placeholder="Only your team sees these — e.g. where to park, pit gate times, what worked last time" />
      <div className="row-actions"><button type="button" className="btn primary small" onClick={save}>Save notes</button><button type="button" className="btn ghost small" onClick={() => setEditing(false)}>Cancel</button></div>
    </div>
  ) : (
    <>
      {vals(note).notes ? <p className="pre">{vals(note).notes}</p> : <p className="muted small">No team notes yet.</p>}
      {canEdit && <button type="button" className="btn ghost small" onClick={start}>{vals(note).notes ? 'Edit our notes' : 'Add our notes'}</button>}
    </>
  );
  if (compact) return <div className="team-notes compact" data-testid="team-notes"><b className="small">Our notes</b> <span className="muted small">(only your team sees these)</span>{body}</div>;
  return <Section title="Our notes" className="team-notes"><div data-testid="team-notes"><p className="muted small">Only your team sees these. The shared record is kept by the RaceOps admin.</p>{body}</div></Section>;
}

// ======================================================================= request a change
/** Ask for a change to a shared series, track or date — opens in place, goes to the admin. */
export function RequestChange({ data, type, rec, onDone }) {
  const { tid } = useSession();
  const form = formFor(data, type);
  const [values, setValues] = useState(() => ({ ...vals(rec) }));
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setErr('');
    try { await sendRequest(tid, { kind: 'change', subject_type: type, subject_id: rec.id, values, note }); onDone(true); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card fx-editor inline-editor" data-testid="request-change">
      <h3>Request a change to {vals(rec).name}</h3>
      <p className="muted small">Change what’s wrong and send it. A RaceOps admin checks it, then it updates for every team.</p>
      <FormRenderer form={form} values={values} onChange={(k, x) => setValues((s) => ({ ...s, [k]: x }))} data={data} recordType={type}
        hideKeys={type === 'track' ? ['ext_id', 'notes'] : type === 'series' ? ['notes'] : []} />
      <label className="field"><span className="label">Note for the admin (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Source: series website, posted 3 Oct" /></label>
      {err && <div className="notice error">{err}</div>}
      <div className="row-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={send}>Send for approval</button>
        <button type="button" className="btn ghost" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </div>
  );
}

// ======================================================================= send to the shared calendars
/** The team's own series and tracks, and events not yet on the shared calendars. */
function sendables(data) {
  const sharedFx = (e) => { const f = data.byId[v(e, 'fixture')]; return !!f && isGlobal(f); };
  const events = data.list('event').filter((e) => !sharedFx(e)).sort((a, b) => (v(a, 'date') || '').localeCompare(v(b, 'date') || ''));
  return {
    series: data.list('series').filter((s) => !isGlobal(s) && !vals(s).shared_as),
    tracks: data.list('track').filter((t) => !isGlobal(t)),
    events,
  };
}

export function SendPanel({ data, initial = '', onDone }) {
  const { tid } = useSession();
  const s = useMemo(() => sendables(data), [data]);
  const [kindIn, idIn] = initial.split(':');
  const [kind, setKind] = useState(['series', 'track', 'events'].includes(kindIn) ? kindIn : s.series.length ? 'series' : s.tracks.length ? 'track' : 'events');
  const [subject, setSubject] = useState(kindIn === 'series' || kindIn === 'track' ? idIn : '');
  const [majorOnly, setMajorOnly] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const eventsFor = () => (kind === 'series' ? s.events.filter((e) => v(e, 'series') === subject)
    : kind === 'track' ? s.events.filter((e) => v(e, 'venue') === subject)
      : s.events.filter((e) => !majorOnly || v(e, 'major')));
  const list = subject || kind === 'events' ? eventsFor() : [];
  const [picked, setPicked] = useState(() => (kindIn === 'events' && idIn ? [idIn] : null));
  useEffect(() => { if (kindIn !== 'events') setPicked(null); }, [kind, subject]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = picked ?? (kind === 'events' ? [] : list.map((e) => e.id));
  const toggle = (id) => setPicked((cur) => { const c = cur ?? chosen; return c.includes(id) ? c.filter((x) => x !== id) : [...c, id]; });
  const send = async () => {
    setBusy(true); setErr('');
    try {
      await sendRequest(tid, { kind: 'share', subject_type: kind === 'events' ? 'dates' : kind, subject_id: kind === 'events' ? null : subject, events: chosen, note });
      onDone(true);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const can = kind === 'events' ? chosen.length > 0 : !!subject;
  return (
    <div className="card send-panel" data-testid="send-panel">
      <h3>Send to the shared calendars</h3>
      <p className="muted small">Share a series or track your team set up, with its dates, or individual dates and major events, so every team can use them.
        A RaceOps admin checks each request for duplicates first. Once approved, the shared records replace your own copies and your events link to them.</p>
      <div className="seg" role="group" aria-label="What to send">
        {[['series', `A series (${s.series.length})`], ['track', `A track (${s.tracks.length})`], ['events', 'Dates & major events']].map(([k, l]) => (
          <button key={k} type="button" className={kind === k ? 'active' : ''} onClick={() => { setKind(k); setSubject(''); }}>{l}</button>
        ))}
      </div>
      {kind === 'series' && (s.series.length ? (
        <label className="field"><span className="label">Series</span>
          <select aria-label="Series to send" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Choose…</option>
            {s.series.map((x) => <option key={x.id} value={x.id}>{vals(x).name}{vals(x).season ? ` (${vals(x).season})` : ''}</option>)}
          </select></label>
      ) : <p className="muted small">Your team hasn’t set up any series of its own — they’re all shared already.</p>)}
      {kind === 'track' && (s.tracks.length ? (
        <label className="field"><span className="label">Track</span>
          <select aria-label="Track to send" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Choose…</option>
            {s.tracks.map((x) => <option key={x.id} value={x.id}>{vals(x).name}{vals(x).city ? ` (${vals(x).city})` : ''}</option>)}
          </select></label>
      ) : <p className="muted small">Your team hasn’t added any tracks of its own — they’re all in the shared directory.</p>)}
      {kind === 'events' && <label className="check-row"><input type="checkbox" checked={majorOnly} onChange={(e) => setMajorOnly(e.target.checked)} /> Major events only</label>}
      {(subject || kind === 'events') && (
        list.length ? (
          <div className="send-events">
            <b className="small">{kind === 'events' ? 'Dates to send' : 'Its dates to send too'}</b>
            {list.map((e) => (
              <label key={e.id} className="check-row">
                <input type="checkbox" checked={chosen.includes(e.id)} onChange={() => toggle(e.id)} />
                {fmtDate(v(e, 'date'))} — {v(e, 'name')}{v(e, 'major') ? ` ★ ${v(e, 'major_name') || 'Major event'}` : ''}
                <span className="muted small">{[data.byId[v(e, 'venue')] ? titleOf(data.byId[v(e, 'venue')]) : v(e, 'track'), data.byId[v(e, 'series')] && `${titleOf(data.byId[v(e, 'series')])}${v(e, 'round') ? ` Rd ${v(e, 'round')}` : ''}`].filter(Boolean).join(' · ')}</span>
              </label>
            ))}
          </div>
        ) : <p className="muted small">{kind === 'events' ? 'No dates on your calendar that aren’t already shared.' : 'No dates of yours to send with it — it can be sent on its own.'}</p>
      )}
      <label className="field"><span className="label">Note for the admin (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Dates from the club’s 2026-27 fixture list" /></label>
      {err && <div className="notice error">{err}</div>}
      <div className="row-actions">
        <button type="button" className="btn primary" disabled={!can || busy} onClick={send}>Send for approval</button>
        <button type="button" className="btn ghost" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </div>
  );
}

// ======================================================================= the team's requests
function RequestItems({ r }) {
  const items = r.payload?.items || [];
  const dec = Object.fromEntries((r.decision?.items || []).map((d) => [d.key, d]));
  if (r.kind === 'change') {
    const cur = r.payload?.current || {}; const nv = r.payload?.values || {};
    const keys = [...new Set([...Object.keys(cur), ...Object.keys(nv)])].filter((k) => JSON.stringify(cur[k] ?? '') !== JSON.stringify(nv[k] ?? ''));
    return keys.length ? <p className="small muted">Changes: {keys.map((k) => `${k.replace(/_/g, ' ')} → ${Array.isArray(nv[k]) ? nv[k].join(', ') : nv[k] ?? '(blank)'}`).join('; ')}</p> : null;
  }
  return (
    <>
      {r.decision?.series && <p className="small">Series {r.decision.series.action === 'link' ? 'matched to one already shared' : 'added to the shared calendars'}.</p>}
      {r.decision?.track && <p className="small">Track {r.decision.track.action === 'link' ? 'matched to one already in the directory' : 'added to the shared directory'}.</p>}
      {items.length > 0 && (
        <ul className="req-items">
          {items.map((it) => {
            const d = dec[it.key];
            return (
              <li key={it.key} className={d?.action === 'refuse' ? 'refused' : ''}>
                <span>{fmtDate(it.values.date)} — {it.values.name}{it.values.major ? ` ★ ${it.values.major_name || 'Major event'}` : ''}</span>
                {d && (d.action === 'refuse'
                  ? <Pill level="over">Refused{d.reason ? `: ${d.reason}` : ''}</Pill>
                  : <Pill level="ok">{d.action === 'link' ? 'Already shared — linked' : 'Added'}</Pill>)}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function RequestsTab({ data, requests }) {
  const { tid, refresh, membership, canType } = useSession();
  const [params, setParams] = useSearchParams();
  const send = params.get('send') || '';
  const [sending, setSending] = useState(!!send);
  const [msg, setMsg] = useState('');
  const { list, loaded, reload } = requests;
  // seeing the decisions clears the badge
  useEffect(() => {
    if (membership?.calendar_notices) api(`/t/${tid}/calendar/requests/seen`, { method: 'POST' }).then(refresh).catch(() => {});
  }, [tid]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (sent) => {
    setSending(false);
    if (params.get('send')) { const p = new URLSearchParams(params); p.delete('send'); setParams(p, { replace: true }); }
    if (sent) { setMsg('Sent — a RaceOps admin will check it. You’ll see the outcome here.'); reload(); }
  };
  const withdraw = async (r) => { await api(`/t/${tid}/calendar/requests/${r.id}/withdraw`, { method: 'POST' }); reload(); };
  const canSend = canType('fixture', 'edit');
  return (
    <>
      <p className="muted small">What your team has sent to the shared calendars, and what happened to it. Shared series, tracks and dates are kept by the RaceOps admin, so every team sees the same ones.</p>
      {canSend && !sending && <div className="toolbar"><button type="button" className="btn primary" onClick={() => setSending(true)}>Send to the shared calendars</button></div>}
      {msg && <div className="notice info small">{msg}</div>}
      {sending && <SendPanel data={data} initial={send} onDone={done} />}
      {loaded && list.length === 0 && <Empty>No requests yet. Send a series, track or dates your team set up — or use <b>Suggest a change</b> on a shared one.</Empty>}
      <div className="list req-list" data-testid="requests">
        {list.map((r) => {
          const [label, level] = STATUS[r.status] || [r.status, 'muted'];
          return (
            <div key={r.id} className={`list-row req-row${r.seen ? '' : ' unseen'}`} data-request={r.id}>
              <span className="grow">
                <span className="row-title">{r.title} <Pill level={level}>{label}</Pill>{!r.seen && <span className="pill pill-info">New</span>}</span>
                <span className="row-sub">{r.kind === 'change' ? `Change to a shared ${KIND_LABEL[r.subject_type]?.toLowerCase()}` : `Send ${KIND_LABEL[r.subject_type]?.toLowerCase()}`} · sent {fmtWhen(r.created_at)}{r.by_name ? ` by ${r.by_name}` : ''}{r.decided_at ? ` · decided ${fmtWhen(r.decided_at)}` : ''}</span>
                {r.note && <span className="small">Your note: {r.note}</span>}
                {r.decision?.reason && <span className="small"><b>Admin:</b> {r.decision.reason}</span>}
                <RequestItems r={r} />
              </span>
              {r.status === 'pending' && canSend && <span className="row-actions"><button type="button" className="btn small ghost" onClick={() => withdraw(r)}>Withdraw</button></span>}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ======================================================================= platform admin moderation
function CheckList({ checks }) {
  if (!checks?.length) return <span className="pill pill-ok">No duplicates</span>;
  return <span className="req-checks">{checks.map((c, i) => <span key={i} className={`pill ${c.type === 'duplicate' ? 'pill-warn' : 'pill-over'}`}>{c.type === 'duplicate' ? '⚠ ' : '⛔ '}{c.text}</span>)}</span>;
}

function RootChoice({ kind, part, matches, choice, setChoice }) {
  const values = part.values || {};
  return (
    <div className="req-root" data-testid={`root-${kind}`}>
      <b>{kind === 'series' ? 'Series' : 'Track'}: {values.name}{kind === 'series' && values.season ? ` (${values.season})` : ''}</b>
      <span className="muted small"> {kind === 'series' ? [values.class, values.sanctioning].filter(Boolean).join(' · ') : [values.city, values.region, values.country].filter(Boolean).join(', ')}</span>
      {matches.length > 0 && <div className="small">{matches.map((m) => <span key={m.id} className="pill pill-warn">⚠ {m.match === 'same' ? 'Same as' : 'Looks like'} {m.name}{m.season ? ` ${m.season}` : ''}{m.place ? ` (${m.place})` : ''}</span>)}</div>}
      <div className="req-root-opts">
        <label className="check-row"><input type="radio" name={`${kind}-${part.id}`} checked={choice.action !== 'link'} onChange={() => setChoice({ action: 'create' })} /> Add as a new shared {kind}</label>
        {matches.map((m) => (
          <label key={m.id} className="check-row"><input type="radio" name={`${kind}-${part.id}`} checked={choice.action === 'link' && choice.id === m.id} onChange={() => setChoice({ action: 'link', id: m.id })} />
            Use the shared {m.name}{m.season ? ` ${m.season}` : ''}{m.place ? ` (${m.place})` : ''} instead</label>
        ))}
      </div>
    </div>
  );
}

function ReviewRequest({ r, refs, onDone }) {
  const p = r.payload || {};
  const c = r.checks || {};
  const sameOf = (list) => list?.find((m) => m.match === 'same');
  const [series, setSeries] = useState(() => (sameOf(c.series) ? { action: 'link', id: sameOf(c.series).id } : { action: 'create' }));
  const [track, setTrack] = useState(() => (sameOf(c.track) ? { action: 'link', id: sameOf(c.track).id } : { action: 'create' }));
  const [items, setItems] = useState(() => Object.fromEntries((p.items || []).map((it) => {
    const dup = (c.items?.[it.key] || []).find((x) => x.type === 'duplicate');
    return [it.key, dup ? { action: 'link', id: dup.id } : { action: 'add' }];
  })));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setItem = (k, patch) => setItems((x) => ({ ...x, [k]: { ...x[k], ...patch } }));
  const decide = async (action) => {
    setBusy(true); setErr('');
    try { await api(`/admin/calendar/requests/${r.id}/decide`, { method: 'POST', body: { action, reason, series, track, items } }); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const name = (id) => refs[id]?.name || '';
  const nRefused = Object.values(items).filter((x) => x.action === 'refuse').length;
  return (
    <Section title={r.title} className="cal-sugg req-review">
      <div data-request={r.id}>
        <p className="muted small">From {r.team}{r.by_name ? ` (${r.by_name})` : ''} · {fmtWhen(r.created_at)}</p>
        {r.note && <p className="small"><b>Note:</b> {r.note}</p>}
        {r.kind === 'change' ? (
          <>
            <table className="table compact">
              <thead><tr><th /><th>Requested</th><th>Now</th></tr></thead>
              <tbody>{[...new Set([...Object.keys(p.current || {}), ...Object.keys(p.values || {})])].map((k) => {
                const show = (x) => (Array.isArray(x) ? x.join(', ') : ['venue', 'series'].includes(k) ? name(x) || x || '' : ['date', 'end_date', 'start_date'].includes(k) ? fmtDate(x) : x === true ? 'Yes' : x ?? '');
                const diff = JSON.stringify(p.current?.[k] ?? '') !== JSON.stringify(p.values?.[k] ?? '');
                return <tr key={k} className={diff ? 'diff' : ''}><th scope="row">{k.replace(/_/g, ' ')}</th><td>{show(p.values?.[k])}</td><td className="muted">{show(p.current?.[k])}</td></tr>;
              })}</tbody>
            </table>
            <CheckList checks={c.change} />
          </>
        ) : (
          <>
            {p.series && <RootChoice kind="series" part={p.series} matches={c.series || []} choice={series} setChoice={setSeries} />}
            {p.track && <RootChoice kind="track" part={p.track} matches={c.track || []} choice={track} setChoice={setTrack} />}
            {(p.items || []).length > 0 && (
              <div className="table-scroll">
                <table className="table compact req-items-table">
                  <thead><tr><th>Date</th><th>Event</th><th>Track · series</th><th>Checks</th><th>Decision</th></tr></thead>
                  <tbody>{p.items.map((it) => {
                    const x = it.values; const ch = c.items?.[it.key] || []; const d = items[it.key] || {};
                    const links = ch.filter((k) => k.id);
                    return (
                      <tr key={it.key} data-item={it.key}>
                        <td>{fmtDate(x.date)}{x.end_date ? ` – ${fmtDate(x.end_date)}` : ''}</td>
                        <td>{x.name}{x.major && <div className="small">★ {x.major_name || 'Major event'}</div>}</td>
                        <td className="small">{[x.track_name || name(x.venue) || x.track, (x.series_name || name(x.series)) && `${x.series_name || name(x.series)}${x.round ? ` Rd ${x.round}` : ''}`, x.sanctioning, (x.classes || []).join(', ')].filter(Boolean).join(' · ')}</td>
                        <td><CheckList checks={ch} /></td>
                        <td>
                          <select aria-label={`Decision for ${x.name}`} value={d.action === 'link' ? `link:${d.id}` : d.action || 'add'}
                            onChange={(e) => { const [a, id] = e.target.value.split(':'); setItem(it.key, { action: a, id }); }}>
                            <option value="add">Add</option>
                            {links.map((k) => <option key={k.id} value={`link:${k.id}`}>Link to {name(k.id) || 'existing'}{refs[k.id]?.date ? ` (${fmtDate(refs[k.id].date)})` : ''}</option>)}
                            <option value="refuse">Refuse</option>
                          </select>
                          {d.action === 'refuse' && <input aria-label={`Why ${x.name} is refused`} placeholder="Reason (the team sees it)" value={d.reason || ''} onChange={(e) => setItem(it.key, { reason: e.target.value })} />}
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </>
        )}
        <label className="field"><span className="label">Note to the team (optional; needed when rejecting)</span><input aria-label="Note to the team" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        {err && <div className="notice error">{err}</div>}
        <div className="row-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => decide('approve')}>{nRefused ? `Approve the rest (${nRefused} refused)` : 'Approve'}</button>
          <button type="button" className="btn ghost danger" disabled={busy || !reason.trim()} onClick={() => decide('reject')}>Reject all</button>
        </div>
      </div>
    </Section>
  );
}

/** Platform admin → Shared calendars → Requests. */
export function AdminRequests({ onChange }) {
  const { refresh } = useSession();
  const [show, setShow] = useState('pending');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api(`/admin/calendar/requests?status=${show}`).then(setD).catch((e) => setErr(e.message)), [show]);
  useEffect(() => { load(); }, [load]);
  const after = () => { load(); onChange?.(); refresh(); };
  const list = d?.requests || [];
  return (
    <div data-testid="cal-requests">
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Requests to show">
          {[['pending', 'Waiting'], ['all', 'All']].map(([k, l]) => <button key={k} type="button" className={show === k ? 'active' : ''} onClick={() => setShow(k)}>{l}</button>)}
        </div>
      </div>
      <p className="muted small">Teams’ requests to add their series, tracks and dates to the shared calendars, or to change shared ones. Each is checked for duplicates and clashes. Approving makes the shared record the one every team uses — the team’s own copies are replaced and its events linked.</p>
      {err && <div className="notice error">{err}</div>}
      {d && list.length === 0 && <Empty>{show === 'pending' ? 'Nothing waiting for review.' : 'No requests yet.'}</Empty>}
      <div className="cards">
        {list.map((r) => (r.status === 'pending'
          ? <ReviewRequest key={r.id} r={r} refs={d.refs || {}} onDone={after} />
          : (
            <div key={r.id} className="list-row req-row">
              <span className="grow">
                <span className="row-title">{r.title} <Pill level={(STATUS[r.status] || [])[1] || 'muted'}>{(STATUS[r.status] || [r.status])[0]}</Pill></span>
                <span className="row-sub">{r.team}{r.by_name ? ` (${r.by_name})` : ''} · {fmtWhen(r.created_at)}{r.decided_by_name ? ` · decided by ${r.decided_by_name} ${fmtWhen(r.decided_at)}` : ''}</span>
                {r.decision?.reason && <span className="small">Note: {r.decision.reason}</span>}
                <RequestItems r={r} />
              </span>
            </div>
          )))}
      </div>
    </div>
  );
}

/** "N of your requests have been decided" — for Home. */
export function RequestNotice() {
  const { membership, canModule, notices, user } = useSession();
  const n = canModule('calendar', 'edit') ? membership?.calendar_notices || 0 : 0;
  const a = user?.is_platform_admin ? notices?.calendar_requests || 0 : 0;
  if (!n && !a) return null;
  return (
    <div className="notice info req-notice" data-testid="request-notice">
      {n > 0 && <span>{n === 1 ? 'A request' : `${n} requests`} your team sent to the shared calendars {n === 1 ? 'has' : 'have'} been reviewed. <Link to="/calendar?tab=requests">See the outcome</Link></span>}
      {a > 0 && <span>{a === 1 ? 'One shared-calendar request is' : `${a} shared-calendar requests are`} waiting for you. <Link to="/admin/calendar?tab=requests">Review</Link></span>}
    </div>
  );
}

