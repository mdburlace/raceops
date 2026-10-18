// Setup advisor: the team's own history for a handling problem + reference tuning guides.
// Runs on the device (offline) from local records; "Talk it through" asks the AI to weigh both.
import { useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CORNER_GROUPS, EFFECT, PROBLEMS, TUNING_FIELD, TUNING_FIELDS, advise, problemsFromTags } from '@shared/advisor.js';
import { TRACK_CONDITIONS } from '@shared/baseForms3.js';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { I, Icon } from '../components/Layout.jsx';
import { api } from '../lib/api.js';
import { aiChanged, fileToPart, useAiStatus } from '../lib/ai.js';
import { eventTrack, fmtDate, formFor, platformList, titleOf, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { deleteRecord, saveRecord } from '../lib/store.js';

const ARROW = { '+': '↑', '-': '↓', '': '' };
const DIR_WORD = { '+': 'up', '-': 'down', '': 'changed' };
const OUTCOME = { fixed: ['ok', 'gone next session'], still: ['warn', 'still there'], unknown: ['muted', 'no feedback next session'], 'no-next': ['muted', 'no later session'] };
const isGlobal = (r) => !!(r?.global || r?.data?.scope === 'global');

function Chips({ options, value, onChange, label }) {
  const toggle = (o) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="chips multi" role="group" aria-label={label}>
      {options.map((o) => <button key={o} type="button" className={`chip${value.includes(o) ? ' active' : ''}`} aria-pressed={value.includes(o)} onClick={() => toggle(o)}>{o}</button>)}
    </div>
  );
}

export function AdvisorPage() {
  const data = useTeamData();
  const [params] = useSearchParams();
  const sheetId = params.get('setup');
  if (!data) return null;
  return <Advisor key={sheetId || 'none'} data={data} sheet={sheetId ? data.byId[sheetId] : null} />;
}

function Advisor({ data, sheet }) {
  const { tid, user, canType } = useSession();
  const st = useAiStatus();
  const sv = sheet?.data?.values || {};
  const sheetEvent = data.byId[sv.event];
  const [problems, setProblems] = useState(() => problemsFromTags([...(sv.driver_feel || []), ...(sv.crew_feel || [])]));
  const [conditions, setConditions] = useState(() => sv.track_conditions || []);
  const [car, setCar] = useState(sv.car || '');
  const [track, setTrack] = useState(() => (sheetEvent ? eventTrack(sheetEvent, data) : ''));
  const [added, setAdded] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [ai, setAi] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');

  const presets = formFor(data, 'setup')?.data.sessions || [];
  const result = useMemo(() => (problems.length ? advise({
    setups: data.list('setup'), events: data.list('event'), forms: data.list('form'), assets: data.list('asset'),
    tracks: data.list('track'), guides: data.list('tuning_guide'), presets,
  }, { problems, conditions, car, track, excludeId: sheet?.id }, sv) : null), [data, problems, conditions, car, track, sheet]); // eslint-disable-line react-hooks/exhaustive-deps

  const tracks = [...new Set(data.list('event').map((e) => eventTrack(e, data)).filter(Boolean))].sort();
  const condOptions = [...new Set([...(platformList('track_conditions') || TRACK_CONDITIONS), ...conditions])];
  const canAdd = sheet && canType('setup', 'edit');
  const addToSheet = async (text) => {
    const cur = data.byId[sheet.id];
    const now = String(v(cur, 'changes_next') || '').trimEnd();
    const line = `• ${text}`;
    if (now.split('\n').includes(line)) return;
    await saveRecord(tid, 'setup', cur.id, { ...cur.data, values: { ...cur.data.values, changes_next: now ? `${now}\n${line}` : line } }, user.id);
    setAdded((a) => [...a, text]);
  };
  const AddBtn = ({ text }) => (canAdd ? (
    added.includes(text) ? <span className="pill pill-ok">added</span>
      : <button type="button" className="btn small ghost" onClick={() => addToSheet(text)}>+ Add to changes</button>
  ) : null);

  const talk = async () => {
    setAiBusy(true); setAiErr(''); setAi(null);
    try {
      setAi(await api(`/t/${tid}/ai/advise`, { method: 'POST', body: { problems, conditions, car, track, setup_id: sheet?.id } }));
    } catch (e) { setAiErr(e.message); } finally { setAiBusy(false); aiChanged(); }
  };

  const hist = result?.history;
  const rules = result?.rules || [];
  const shown = showAll ? rules : rules.filter((r) => r.fit === 1).slice(0, 12);
  const guides = data.list('tuning_guide');

  return (
    <div className="advisor">
      <PageHeader title="Setup advisor" back={sheet ? `/r/setup/${sheet.id}` : undefined}
        sub={sheet ? `For ${titleOf(sheet, data)}${sheetEvent ? ` · ${fmtDate(v(sheetEvent, 'date'))}` : ''}` : 'What to change for a handling problem — from your own sheets and the tuning guides'}>
        <Link className="btn ghost" to="/track/advisor/guides">Tuning guides ({guides.length})</Link>
      </PageHeader>

      <div className="card">
        <h3 className="adv-h">What is the car doing?</h3>
        <Chips label="Handling problem" options={PROBLEMS.map((p) => p.key)} value={problems} onChange={(x) => { setProblems(x); setAi(null); }} />
        <details className="adv-conds">
          <summary><b>Track conditions</b> <span className="muted small">{conditions.length ? conditions.join(', ') : 'any'} — sessions in the same conditions count for more</span></summary>
          <Chips label="Track conditions" options={condOptions} value={conditions} onChange={(x) => { setConditions(x); setAi(null); }} />
        </details>
        <div className="toolbar">
          <select value={car} onChange={(e) => setCar(e.target.value)} aria-label="Car">
            <option value="">Any car</option>{data.list('car').map((c) => <option key={c.id} value={c.id}>{titleOf(c)}</option>)}
          </select>
          <select value={track} onChange={(e) => setTrack(e.target.value)} aria-label="Track">
            <option value="">Any track</option>{tracks.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        {sheet && !problems.length && <p className="muted small">No handling problem was ticked in this sheet’s driver or crew feedback — pick one above.</p>}
      </div>

      {!problems.length ? <Empty>Pick a handling problem to see what has worked for your team and what the guides suggest.</Empty> : (
        <>
          {st.allowed && (
            <div className="card ai-bar">
              <div className="inline-row wrap">
                <span className="ai-tag"><Icon d={I.spark} size={16} />AI</span>
                <button type="button" className="btn small ai-btn" disabled={!st.available || aiBusy} onClick={talk}>{aiBusy ? 'Thinking…' : 'Talk it through'}</button>
                <span className="muted small">{st.available ? 'Weighs your history against the guides and suggests what to try first.' : st.reason}</span>
              </div>
              {aiErr && <div className="notice error small">{aiErr}</div>}
              {ai && (
                <div className="advice">
                  <p>{ai.summary}</p>
                  <ol>
                    {ai.suggestions.map((s, i) => (
                      <li key={i}>
                        <div className="adv-line"><b className="adv-title">{s.change}</b><Pill level={s.confidence === 'high' ? 'ok' : s.confidence === 'medium' ? 'info' : 'warn'}>{s.confidence} confidence</Pill><AddBtn text={s.change} /></div>
                        <div className="muted small">{s.why}</div>
                        {s.based_on?.length > 0 && (
                          <div className="chips tight">{s.based_on.map((r) => { const l = ai.links?.[r]; return l ? <Link key={r} className="chip" to={l.url} title={l.guide || ''}>{l.type === 'rule' ? `Guide: ${l.guide}` : l.title}</Link> : null; })}</div>
                        )}
                      </li>
                    ))}
                  </ol>
                  {ai.watch_out && <div className="notice small"><b>Watch out:</b> {ai.watch_out}</div>}
                  <p className="muted small">Suggestions only — check them against what you see in the car.</p>
                </div>
              )}
            </div>
          )}

          <Section title="What’s worked for you">
            {!hist.occurrences.length ? <p className="muted">No sheets yet where the driver or crew reported {problems.join(' / ').toLowerCase()}. As you record feedback and what you changed, this fills in.</p> : (
              <>
                <p className="muted small">{hist.occurrences.length} session{hist.occurrences.length === 1 ? '' : 's'} reported this. Below: what the next sheet changed, and whether the complaint was gone in that session’s feedback.</p>
                {hist.changes.length === 0 ? <p className="muted">No setting changes recorded between those sessions and the next ones.</p> : (
                  <div className="list">
                    {hist.changes.slice(0, 12).map((c) => <HistoryChange key={c.key} c={c} addBtn={<AddBtn text={`${c.label}${c.corner ? ` ${c.corner}` : ''} ${DIR_WORD[c.dir]}`} />} />)}
                  </div>
                )}
                <details className="sessions-found">
                  <summary>Sessions that reported it</summary>
                  <div className="list">
                    {hist.occurrences.slice(0, 20).map((o) => (
                      <Link key={o.id} to={`/r/setup/${o.id}`} className="list-row">
                        <span className="grow"><span className="row-title">{o.session} · {o.event}</span>
                          <span className="row-sub">{[o.track, fmtDate(o.date), o.tags.join(', '), o.shared_conditions.length ? `same conditions: ${o.shared_conditions.join(', ')}` : ''].filter(Boolean).join(' · ')}</span></span>
                        <span className={`pill pill-${OUTCOME[o.outcome][0]}`}>{OUTCOME[o.outcome][1]}</span>
                      </Link>
                    ))}
                  </div>
                </details>
              </>
            )}
          </Section>

          <Section title="Guide recommendations" actions={rules.length > shown.length || showAll ? <button type="button" className="btn ghost small" onClick={() => setShowAll(!showAll)}>{showAll ? 'Fewer' : `All ${rules.length}`}</button> : null}>
            {!guides.length ? <p className="muted">No tuning guides yet. <Link to="/track/advisor/guides">Add one</Link>.</p> : !rules.length ? <p className="muted">The guides have nothing for this problem.</p> : (
              <div className="list">
                {shown.map((r) => <RuleRow key={`${r.guide}:${r.index}`} r={r} addBtn={<AddBtn text={r.rule.remedy} />} />)}
              </div>
            )}
            <p className="muted small">Make one change at a time. Where guides disagree it’s flagged — your own results above are the tie-breaker.</p>
          </Section>
        </>
      )}
    </div>
  );
}

function HistoryChange({ c, addBtn }) {
  const [open, setOpen] = useState(false);
  const rate = c.fixed + c.still ? Math.round((c.fixed / (c.fixed + c.still)) * 100) : null;
  return (
    <div className="advisor-row">
      <div className="adv-line">
        <b className="adv-title">{c.label}{c.corner ? ` ${c.corner}` : ''} {ARROW[c.dir]}</b>
        <span className="small">tried {c.tried}×</span>
        {c.fixed > 0 && <Pill level="ok">gone next session {c.fixed}×</Pill>}
        {c.still > 0 && <Pill level="warn">still there {c.still}×</Pill>}
        {rate !== null && <span className="muted small">{rate}%</span>}
        {addBtn}
        <button type="button" className="btn ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide' : 'Examples'}</button>
      </div>
      {open && (
        <ul className="small examples">
          {c.examples.slice(0, 8).map((e, i) => (
            <li key={i}><Link to={`/r/setup/${e.occurrence}`}>{e.session} · {e.event}</Link>{e.date ? ` (${fmtDate(e.date)})` : ''}: {e.text}{' '}
              <span className={`pill pill-${OUTCOME[e.outcome][0]}`}>{OUTCOME[e.outcome][1]}</span>{e.next && <> · <Link to={`/r/setup/${e.next}`}>next sheet</Link></>}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RuleRow({ r, addBtn }) {
  const e = r.evidence;
  const eff = EFFECT[r.rule.effect || '']?.label;
  return (
    <div className="advisor-row">
      <div className="adv-line">
        <b className="adv-title">{r.rule.remedy}</b>
        {eff && <Pill level={r.rule.effect === 'high' ? 'ok' : r.rule.effect === 'least' ? 'muted' : 'info'}>{eff}</Pill>}
        {e.tried > 0 && (e.fixed > e.still
          ? <Pill level="ok">worked for you {e.fixed}/{e.tried}</Pill>
          : <Pill level="warn">you tried it {e.tried}× — fixed {e.fixed}</Pill>)}
        {r.conflict && <Pill level="warn">guides disagree</Pill>}
        {addBtn}
      </div>
      <div className="muted small">
        {r.publisher ? `${r.publisher} — ` : ''}{r.guide_name} · for {r.rule.problem.toLowerCase()}{r.fit < 1 ? ' (related)' : ''}
        {r.now ? <> · now: <b>{r.now}</b></> : null}
        {r.rule.note ? <> · {r.rule.note}</> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tuning guides
export function GuideList() {
  const data = useTeamData();
  const { tid, user, canType } = useSession();
  const st = useAiStatus();
  const nav = useNavigate();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!data) return null;
  const guides = data.list('tuning_guide').sort((a, b) => String(v(a, 'name')).localeCompare(String(v(b, 'name'))));
  const canEdit = canType('tuning_guide', 'edit') || user?.is_platform_admin;
  const importFile = async (files) => {
    setErr(''); setBusy(true);
    try {
      const parts = [];
      for (const f of [...files].slice(0, 6)) parts.push(await fileToPart(f));
      const out = await api(`/t/${tid}/ai/guide-import`, { method: 'POST', body: { files: parts } });
      nav('/track/advisor/guides/new', { state: { imported: out } });
    } catch (e) { setErr(e.message); } finally { setBusy(false); aiChanged(); }
  };
  return (
    <div>
      <PageHeader title="Tuning guides" back="/track/advisor" sub="Reference remedies the setup advisor draws on — shared guides for every team, plus your own">
        {canEdit && <Link className="btn primary" to="/track/advisor/guides/new">New guide</Link>}
      </PageHeader>
      {canEdit && st.allowed && (
        <div className="card ai-bar">
          <div className="inline-row wrap">
            <span className="ai-tag"><Icon d={I.spark} size={16} />AI</span>
            <input ref={input} type="file" hidden multiple accept="image/*,application/pdf" aria-label="Guide file"
              onChange={(e) => { if (e.target.files.length) importFile(e.target.files); e.target.value = ''; }} />
            <button type="button" className="btn small ai-btn" disabled={!st.available || busy} onClick={() => input.current?.click()}>{busy ? 'Reading…' : 'Import a guide from PDF or photo'}</button>
            <span className="muted small">{st.available ? 'You check every rule before it’s saved.' : st.reason}</span>
          </div>
          {err && <div className="notice error small">{err}</div>}
        </div>
      )}
      {!guides.length ? <Empty>No tuning guides yet.</Empty> : (
        <div className="card list">
          {guides.map((g) => (
            <Link key={g.id} to={`/track/advisor/guides/${g.id}`} className="list-row">
              <span className="grow"><span className="row-title">{v(g, 'name')} {isGlobal(g) && <span className="pill pill-info">shared</span>}</span>
                <span className="row-sub">{[v(g, 'publisher'), v(g, 'applies_to')].filter(Boolean).join(' · ')}</span></span>
              <span className="row-meta">{(v(g, 'rules') || []).length} rules</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const BLANK_RULE = { problem: PROBLEMS[0].key, remedy: '', field: '', corner: '', dir: '', effect: '', note: '' };
const CORNERS = ['', 'LF', 'RF', 'LR', 'RR', ...Object.keys(CORNER_GROUPS)];

export function GuideEdit() {
  const { id } = useParams();
  const data = useTeamData();
  if (!data) return null;
  const rec = id === 'new' ? null : data.byId[id];
  if (id !== 'new' && !rec) return <Empty>Guide not found.</Empty>;
  return <GuideEditor key={id} data={data} rec={rec} />;
}

function GuideEditor({ data, rec }) {
  const { tid, user, canType } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const imported = loc.state?.imported;
  const admin = !!user?.is_platform_admin;
  const global = rec ? isGlobal(rec) : false;
  const readOnly = rec ? (global ? !admin : !canType('tuning_guide', 'edit')) : !(canType('tuning_guide', 'edit') || admin);
  const [vals, setVals] = useState(() => {
    if (rec) return { ...rec.data.values, rules: (rec.data.values.rules || []).map((r) => ({ ...BLANK_RULE, ...r })) };
    if (imported) return { name: imported.name || 'Imported guide', publisher: imported.publisher || '', notes: imported.notes || '', source: 'Imported with AI — checked by the team', rules: (imported.rules || []).map((r) => ({ ...BLANK_RULE, ...r })) };
    return { name: '', publisher: '', applies_to: '', source: '', notes: '', rules: [] };
  });
  const [share, setShare] = useState(false);
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState(loc.state?.saved ? 'Saved.' : '');
  const set = (k, x) => setVals((s) => ({ ...s, [k]: x }));
  const setRule = (i, k, x) => setVals((s) => ({ ...s, rules: s.rules.map((r, j) => (j === i ? { ...r, [k]: x } : r)) }));
  const rules = vals.rules || [];

  const save = async () => {
    if (!String(vals.name || '').trim()) { setMsg('Give the guide a name.'); return; }
    const clean = rules.filter((r) => String(r.remedy || '').trim()).map((r) => Object.fromEntries(Object.entries(r).filter(([, x]) => x !== '' && x !== undefined)));
    const form = formFor(data, 'tuning_guide');
    const scope = (rec ? global : admin && share) ? { scope: 'global' } : {};
    const saved = await saveRecord(tid, 'tuning_guide', rec?.id || null, { ...(rec?.data || {}), ...scope, form_id: form?.id, values: { ...vals, rules: clean } }, user.id);
    nav(`/track/advisor/guides/${saved.id}`, { replace: true, state: { saved: true } });
    setMsg('Saved.');
  };
  const remove = async () => {
    if (!window.confirm('Delete this guide?')) return;
    await deleteRecord(rec.id);
    nav('/track/advisor/guides', { replace: true });
  };

  const rows = rules.map((r, i) => [r, i]).filter(([r]) => !filter || r.problem === filter);
  return (
    <div>
      <PageHeader title={rec ? vals.name || 'Tuning guide' : 'New tuning guide'} back="/track/advisor/guides"
        sub={global ? 'Shared with every team' : 'Your team’s guide'}>
        {!readOnly && <button type="button" className="btn primary" onClick={save}>Save</button>}
      </PageHeader>
      {imported && !rec && <div className="notice">Read by AI from your file — check every rule, especially the setting and direction, before saving.</div>}
      {readOnly && global && <div className="notice info">Shared guides are managed by the platform admin. You can add your own guide for your team.</div>}
      {msg && <div className="notice small">{msg}</div>}
      <div className="card field-grid guide-head">
        {[['name', 'Name'], ['publisher', 'Publisher'], ['applies_to', 'Applies to'], ['source', 'Source']].map(([k, label]) => (
          <div key={k} className="field"><label htmlFor={`g-${k}`}>{label}</label>
            <input id={`g-${k}`} value={vals[k] || ''} onChange={(e) => set(k, e.target.value)} readOnly={readOnly} /></div>
        ))}
        <div className="field span-all"><label htmlFor="g-notes">Notes / baseline</label>
          <textarea id="g-notes" rows={3} value={vals.notes || ''} onChange={(e) => set('notes', e.target.value)} readOnly={readOnly} /></div>
        {!rec && admin && <label className="inline-row span-all"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Share with every team</label>}
      </div>

      <Section title={`Rules (${rules.length})`} actions={
        <div className="inline-row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by problem"><option value="">All problems</option>{PROBLEMS.map((p) => <option key={p.key}>{p.key}</option>)}</select>
          {!readOnly && <button type="button" className="btn small" onClick={() => setVals((s) => ({ ...s, rules: [...s.rules, { ...BLANK_RULE, problem: filter || BLANK_RULE.problem }] }))}>Add rule</button>}
        </div>}>
        <p className="muted small">Link a rule to a setup setting and direction so the advisor can show your team’s results for it and the current value on the sheet.</p>
        <div className="table-scroll">
          <table className="table rules-table">
            <thead><tr><th>Problem</th><th>Remedy</th><th>Setting</th><th>Corner</th><th>Direction</th><th>Effect</th><th>Note</th>{!readOnly && <th />}</tr></thead>
            <tbody>
              {rows.map(([r, i]) => (
                <tr key={i}>
                  <td><select value={r.problem} disabled={readOnly} aria-label="Problem" onChange={(e) => setRule(i, 'problem', e.target.value)}>{PROBLEMS.map((p) => <option key={p.key}>{p.key}</option>)}</select></td>
                  <td><input value={r.remedy} readOnly={readOnly} aria-label="Remedy" onChange={(e) => setRule(i, 'remedy', e.target.value)} /></td>
                  <td><select value={r.field || ''} disabled={readOnly} aria-label="Setting" onChange={(e) => setRule(i, 'field', e.target.value)}>
                    <option value="">—</option>{TUNING_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    {r.field && !TUNING_FIELD[r.field] && <option value={r.field}>{r.field}</option>}</select></td>
                  <td><select value={r.corner || ''} disabled={readOnly} aria-label="Corner" onChange={(e) => setRule(i, 'corner', e.target.value)}>{CORNERS.map((c) => <option key={c} value={c}>{c || '—'}</option>)}</select></td>
                  <td><select value={r.dir || ''} disabled={readOnly} aria-label="Direction" onChange={(e) => setRule(i, 'dir', e.target.value)}><option value="">—</option><option value="+">↑ increase</option><option value="-">↓ decrease</option></select></td>
                  <td><select value={r.effect || ''} disabled={readOnly} aria-label="Effect" onChange={(e) => setRule(i, 'effect', e.target.value)}><option value="">—</option>{['high', 'effective', 'least'].map((k) => <option key={k} value={k}>{EFFECT[k].label}</option>)}</select></td>
                  <td><input value={r.note || ''} readOnly={readOnly} aria-label="Note" onChange={(e) => setRule(i, 'note', e.target.value)} /></td>
                  {!readOnly && <td><button type="button" className="btn ghost small" aria-label="Remove rule" onClick={() => setVals((s) => ({ ...s, rules: s.rules.filter((_, j) => j !== i) }))}>✕</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      {rec && !readOnly && <button type="button" className="btn danger ghost" onClick={remove}>Delete guide</button>}
    </div>
  );
}
