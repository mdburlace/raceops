// AI assistant UI: fill a form from photos, voice debrief on setup sheets, and Ask RaceOps.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiJob } from '../lib/api.js';
import { SpeechRecognition, fileToPart, useAiStatus, aiChanged } from '../lib/ai.js';
import { SHEET_ACCEPT } from '../lib/sheets.js';
import { allFields } from '../lib/data.js';
import { parseSweep, parseTable } from '../lib/parse.js';
import { useSession } from '../lib/session.jsx';
import { PageHeader } from './ui.jsx';
import { I, Icon } from './Layout.jsx';

const SPARK = I.spark;

// form inputs hold text, so numbers from the AI are stored as text too
const asText = (x) => (typeof x === 'number' ? String(x) : Array.isArray(x) ? x.map(asText)
  : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, asText(y)])) : x);
const same = (a, b) => JSON.stringify(asText(a) ?? '') === JSON.stringify(asText(b) ?? '');
const empty = (x) => x === undefined || x === null || x === '' || (Array.isArray(x) && !x.length) || (typeof x === 'object' && !Array.isArray(x) && !Object.values(x).some((y) => y !== '' && y !== null && y !== undefined));
function show(f, x) {
  if (empty(x)) return '—';
  if (f?.type === 'sweep') return `${x.length} setting${x.length === 1 ? '' : 's'}`;
  if (f?.type === 'table') return `${x.length} row${x.length === 1 ? '' : 's'}`;
  if (typeof x === 'boolean') return x ? 'Yes' : 'No';
  if (Array.isArray(x)) return x.join(', ');
  if (typeof x === 'object') {
    const keys = f?.corners || ['LF', 'RF', 'LR', 'RR'];
    return Object.entries(x).filter(([, y]) => !empty(y) && typeof y !== 'object')
      .sort(([a], [b]) => (keys.indexOf(a) + 1 || 99) - (keys.indexOf(b) + 1 || 99)).map(([k, y]) => `${k} ${y}`).join(' · ') || '—';
  }
  return String(x);
}

/** Review proposed values before they touch the form. */
function Review({ title, note, items, onApply, onCancel }) {
  const [on, setOn] = useState(() => Object.fromEntries(items.map((it) => [it.key, true])));
  const count = items.filter((it) => on[it.key]).length;
  return (
    <div className="ai-review" role="region" aria-label={title}>
      <div className="ai-review-head"><b>{title}</b><span className="muted small">Check each value — untick anything that's wrong.</span></div>
      {note && <div className="notice small">{note}</div>}
      {!items.length ? <p className="muted">Nothing readable was found.</p> : (
        <div className="ai-items">
          {items.map((it) => (
            <label key={it.key} className={`ai-item${on[it.key] ? '' : ' off'}`}>
              <input type="checkbox" checked={!!on[it.key]} onChange={(e) => setOn({ ...on, [it.key]: e.target.checked })} aria-label={`Use ${it.label}`} />
              <span className="ai-label">{it.label}</span>
              <span className="ai-vals">{it.from !== '—' && <s className="muted">{it.from}</s>}<b>{it.to}</b></span>
            </label>
          ))}
        </div>
      )}
      <div className="inline-row end">
        <button type="button" className="btn ghost small" onClick={onCancel}>Discard</button>
        <button type="button" className="btn primary small" disabled={!count} onClick={() => onApply(items.filter((it) => on[it.key]))}>Apply {count} value{count === 1 ? '' : 's'}</button>
      </div>
    </div>
  );
}

/** "Fill from photo" for any form: photos or a PDF → proposed values → review → apply. */
function PhotoFill({ form, values, onReview, onError }) {
  const { tid } = useSession();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const fields = new Map(allFields(form).map((f) => [f.key, f]));

  const read = async (files) => {
    onError(''); setBusy(true);
    try {
      const parts = [];
      for (const f of [...files].slice(0, 6)) parts.push(await fileToPart(f));
      const res = await apiJob(`/t/${tid}/ai/extract`, { form_id: form.id, files: parts, values });
      const items = [];
      for (const [k, raw] of Object.entries(res.values || {})) {
        const f = fields.get(k);
        if (!f) continue;
        let to = asText(raw);
        if (f.type === 'sweep') to = parseSweep(raw, f.columns || [], f.xKey);
        else if (f.type === 'table') to = f.parse === 'gearsets' ? null : parseTable(raw, f.columns || [], f.xKey);
        else if (f.type === 'corners') to = { ...(values[k] || {}), ...asText(raw) };
        else if (f.type === 'tags') to = [...new Set([...(values[k] || []), ...raw])];
        if (empty(to) || same(to, values[k])) continue;
        items.push({ key: k, label: f.label, from: show(f, values[k]), to: show(f, to), value: to });
      }
      onReview({ title: 'Read from your photo', items, note: res.unclear });
      aiChanged();
    } catch (e) { onError(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <input ref={input} type="file" hidden multiple accept={`image/*,application/pdf,${SHEET_ACCEPT}`} aria-label="Photos to read"
        onChange={(e) => { if (e.target.files.length) read(e.target.files); e.target.value = ''; }} />
      <button type="button" className="btn small ai-btn" disabled={busy} onClick={() => input.current?.click()}>
        <Icon d={SPARK} size={16} />{busy ? 'Reading…' : 'Fill from photo, PDF or Excel'}
      </button>
    </>
  );
}

/** Voice debrief on a setup sheet: speak (or type) → tags, comments and next changes. */
function VoiceDebrief({ values, setValues, available, onDone }) {
  const { tid } = useSession();
  const [who, setWho] = useState('driver');
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [review, setReview] = useState(null);
  const rec = useRef(null);
  const base = useRef('');
  useEffect(() => () => rec.current?.abort?.(), []);

  const feelKey = who === 'crew' ? 'crew_feel' : 'driver_feel';
  const commentKey = who === 'crew' ? 'crew_comments' : 'driver_comments';
  const join = (a, b) => (a ? `${a.trim()}\n${b}` : b);

  const listen = () => {
    if (listening) { rec.current?.stop(); return; }
    const r = new SpeechRecognition();
    r.lang = navigator.language || 'en-AU'; r.continuous = true; r.interimResults = true;
    base.current = text ? `${text.trim()} ` : '';
    r.onresult = (e) => {
      let said = '';
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      setText(base.current + said);
    };
    r.onerror = (e) => { setErr(e.error === 'not-allowed' ? 'Allow the microphone for this site to dictate.' : `Microphone: ${e.error}`); };
    r.onend = () => setListening(false);
    rec.current = r; setErr(''); r.start(); setListening(true);
  };

  const fill = async () => {
    rec.current?.stop();
    setErr(''); setBusy(true);
    try {
      const out = await api(`/t/${tid}/ai/debrief`, { method: 'POST', body: { transcript: text, who } });
      const items = [];
      const tags = (k, add) => {
        const next = [...new Set([...(values[k] || []), ...add])];
        if (next.length !== (values[k] || []).length) items.push({ key: k, label: k === 'track_conditions' ? 'Track conditions' : who === 'crew' ? 'Crew lead — car behaviour' : 'Driver — car behaviour', from: (values[k] || []).join(', ') || '—', to: next.join(', '), value: next });
      };
      tags('track_conditions', [...out.track_conditions, ...out.other_conditions]);
      tags(feelKey, [...out.behaviour, ...out.other_behaviour]);
      const add = (k, label, t) => { if (t?.trim()) items.push({ key: k, label, from: values[k] ? '(kept)' : '—', to: t.trim(), value: join(values[k], t.trim()) }); };
      add(commentKey, who === 'crew' ? 'Crew lead comments' : 'Driver comments', out.comments);
      add('conditions_notes', 'Track notes', out.conditions_notes);
      add('changes_next', 'Changes for next session', out.changes_next);
      setReview(items);
      aiChanged();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="ai-panel">
      <div className="inline-row wrap ai-debrief-top">
        <div className="seg" role="group" aria-label="Who is speaking">
          <button type="button" className={who === 'driver' ? 'active' : ''} onClick={() => setWho('driver')}>Driver</button>
          <button type="button" className={who === 'crew' ? 'active' : ''} onClick={() => setWho('crew')}>Crew lead</button>
        </div>
        {SpeechRecognition ? (
          <button type="button" className={`btn mic${listening ? ' live' : ''}`} onClick={listen} aria-pressed={listening}>
            <span className="mic-dot" />{listening ? 'Stop' : 'Talk'}
          </button>
        ) : <span className="muted small">Tap the microphone on your keyboard to dictate.</span>}
      </div>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label="Debrief"
        placeholder="e.g. Track went slick on top, car was loose off two and wouldn't drive off. Try a softer right rear bar." />
      {err && <div className="notice error small">{err}</div>}
      <div className="inline-row end">
        {!available && text.trim() && (
          <button type="button" className="btn ghost small" onClick={() => { setValues((v) => ({ ...v, [commentKey]: join(v[commentKey], text.trim()) })); setText(''); onDone?.(true); }}>Save to comments as is</button>
        )}
        <button type="button" className="btn primary small" disabled={!available || busy || text.trim().length < 3} onClick={fill}>{busy ? 'Working…' : 'Fill feedback'}</button>
      </div>
      {!available && <p className="muted small">Offline or AI unavailable — you can save the words to the comments now and tidy them later.</p>}
      {review && (
        <Review title="From the debrief" items={review} onCancel={() => setReview(null)}
          onApply={(chosen) => { setValues((v) => ({ ...v, ...Object.fromEntries(chosen.map((it) => [it.key, it.value])) })); setReview(null); setText(''); onDone?.(true); }} />
      )}
    </div>
  );
}

/** AI toolbar shown on record forms. */
export function AiTools({ type, form, values, setValues, onApplied }) {
  const st = useAiStatus();
  const [open, setOpen] = useState('');
  const [review, setReview] = useState(null);
  const [err, setErr] = useState('');
  if (!st.allowed || !form) return null;
  const hasFeedback = type === 'setup' && allFields(form).some((f) => f.key === 'driver_feel');
  const done = (applied) => { if (applied) onApplied?.(); };
  return (
    <div className="card ai-bar">
      <div className="inline-row wrap">
        <span className="ai-tag"><Icon d={SPARK} size={16} />AI</span>
        {st.available ? <PhotoFill form={form} values={values} onReview={(r) => { setReview(r); setOpen(''); }} onError={setErr} /> : null}
        {hasFeedback && (
          <button type="button" className={`btn small ai-btn${open === 'debrief' ? ' primary' : ''}`} onClick={() => setOpen(open === 'debrief' ? '' : 'debrief')}>
            <Icon d={I.user} size={16} />Voice debrief
          </button>
        )}
        {!st.available && !st.loading && <span className="muted small">{st.reason}</span>}
      </div>
      {err && <div className="notice error small">{err}</div>}
      {review && (
        <Review title={review.title} note={review.note} items={review.items} onCancel={() => setReview(null)}
          onApply={(chosen) => { setValues((v) => ({ ...v, ...Object.fromEntries(chosen.map((it) => [it.key, it.value])) })); setReview(null); done(true); }} />
      )}
      {open === 'debrief' && <VoiceDebrief values={values} setValues={setValues} available={st.available} onDone={(a) => { done(a); if (a) setOpen(''); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- Ask RaceOps
function Inline({ text, sources }) {
  const out = [];
  const re = /\*\*(.+?)\*\*|\[(R\d+)\]/g;
  let last = 0; let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<b key={m.index}>{m[1]}</b>);
    else {
      const s = sources.find((x) => x.ref === m[2]);
      out.push(s ? <Link key={m.index} className="cite" to={s.url} title={s.title}>{s.title}</Link> : <span key={m.index} className="cite muted">{m[2]}</span>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Answer({ text, sources = [] }) {
  const blocks = [];
  let list = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bullet) { if (!list) { list = []; blocks.push(list); } list.push(bullet[1]); continue; }
    list = null;
    if (line.trim()) blocks.push(line.replace(/^#+\s*/, ''));
  }
  return (
    <div className="answer">
      {blocks.map((b, i) => (Array.isArray(b)
        ? <ul key={i}>{b.map((li, j) => <li key={j}><Inline text={li} sources={sources} /></li>)}</ul>
        : <p key={i}><Inline text={b} sources={sources} /></p>))}
    </div>
  );
}

const SUGGESTIONS = [
  'What did we run last time the track was slick?',
  'Which sessions had the car loose on exit, and what did we change?',
  'What changes did we make at our last event?',
  'Which shocks are due for service?',
];

export function AskPage() {
  const { tid } = useSession();
  const st = useAiStatus();
  const key = `raceops.ask.${tid}`;
  const [msgs, setMsgs] = useState(() => { try { return JSON.parse(sessionStorage.getItem(key)) || []; } catch { return []; } });
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(msgs.slice(-30))); } catch { /* private mode */ } end.current?.scrollIntoView?.({ block: 'end' }); }, [msgs]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = async (question) => {
    const text = question.trim();
    if (!text || busy) return;
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: 'user', text }]); setQ(''); setBusy(true);
    try {
      const r = await api(`/t/${tid}/ai/ask`, { method: 'POST', body: { question: text, history } });
      setMsgs((m) => [...m, { role: 'assistant', text: r.answer, sources: r.sources }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', text: e.message, error: true }]);
    } finally { setBusy(false); aiChanged(); }
  };

  return (
    <div className="ask-page">
      <PageHeader title="Ask RaceOps" sub="Questions about your team's setups, events, assets and history — answers link to the records they came from">
        {msgs.length > 0 && <button type="button" className="btn ghost" onClick={() => setMsgs([])}>New chat</button>}
      </PageHeader>
      {!st.loading && !st.available && <div className="notice">{st.reason || 'The AI assistant isn’t available.'}</div>}
      <div className="chat">
        {!msgs.length && (
          <div className="ask-empty">
            <Icon d={SPARK} size={28} />
            <p className="muted">Ask about anything your team has recorded. It can only read your records — it never changes them.</p>
            <div className="ask-suggest">
              {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" disabled={!st.available} onClick={() => ask(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}${m.error ? ' error' : ''}`}>
            {m.role === 'user' ? <p>{m.text}</p> : (
              <>
                <Answer text={m.text} sources={m.sources} />
                {m.sources?.length > 0 && (
                  <div className="msg-sources">
                    {m.sources.map((s) => <Link key={s.ref} className="chip" to={s.url}>{s.title}</Link>)}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant thinking"><span className="dots"><i /><i /><i /></span> Looking through your records…</div>}
        <div ref={end} />
      </div>
      <form className="ask-box" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <textarea rows={2} value={q} placeholder="e.g. What stagger did we run at Lismore last season?" aria-label="Question"
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q); } }} />
        <button className="btn primary" disabled={!st.available || busy || !q.trim()}>Ask</button>
      </form>
    </div>
  );
}

/** Team page: switch AI on/off for the team and show this month's use. */
export function TeamAiSection({ Section }) {
  const { tid, membership, can, refresh, licensed } = useSession();
  const st = useAiStatus();
  const [busy, setBusy] = useState(false);
  if (!licensed('ai')) return null;
  const off = !!membership?.settings?.ai_off;
  const toggle = async () => {
    setBusy(true);
    try { await api(`/t/${tid}`, { method: 'PATCH', body: { settings: { ...(membership.settings || {}), ai_off: !off } } }); await refresh(); aiChanged(); } finally { setBusy(false); }
  };
  return (
    <Section title="AI assistant">
      <p className="muted small">Fill forms from photos, voice debriefs and Ask RaceOps. Only the photo, debrief or question being worked on — and, for Ask, the records it looks up — are sent to the AI service.</p>
      <dl className="kv">
        <dt>Status</dt><dd>{off ? 'Off for this team' : st.available ? 'On' : st.reason || 'Unavailable'}</dd>
        {st.budget !== undefined && <><dt>This month</dt><dd>US${(st.spent || 0).toFixed(2)} of US${Number(st.budget).toFixed(2)} allowance</dd></>}
      </dl>
      {can('team.manage') && (
        <button type="button" className="btn small" disabled={busy} onClick={toggle}>{off ? 'Turn AI on for this team' : 'Turn AI off for this team'}</button>
      )}
    </Section>
  );
}

