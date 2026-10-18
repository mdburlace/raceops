import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Empty, PageHeader } from '../components/ui.jsx';
import { CAR_BEHAVIOUR, TRACK_CONDITIONS } from '@shared/baseForms3.js';
import { display, evalFormula, fmtDate, formFor, titleOf, useTeamData, v } from '../lib/data.js';

const evDate = (s, data) => v(data.byId[v(s, 'event')], 'date') || '';

export function SetupList() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'all';
  return (
    <div>
      <PageHeader title="Setups" sub="Every setup sheet, baselines, and searchable track conditions & feedback" />
      <div className="tabs">
        <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setParams({})}>All sheets</button>
        <button type="button" className={tab === 'baselines' ? 'active' : ''} onClick={() => setParams({ tab: 'baselines' })}>Baselines</button>
        <button type="button" className={tab === 'search' ? 'active' : ''} onClick={() => setParams({ tab: 'search' })}>Search conditions & feedback</button>
      </div>
      {tab === 'all' && <AllSheets />}
      {tab === 'baselines' && <AllSheets baselinesOnly />}
      {tab === 'search' && <SetupSearch />}
    </div>
  );
}

function AllSheets({ baselinesOnly }) {
  const data = useTeamData();
  const nav = useNavigate();
  const [car, setCar] = useState('');
  const [track, setTrack] = useState('');
  const [session, setSession] = useState('');
  const [sel, setSel] = useState([]);
  const rows = useMemo(() => (data ? data.list('setup')
    .filter((s) => !baselinesOnly || v(s, 'baseline'))
    .filter((s) => !car || v(s, 'car') === car)
    .filter((s) => !track || v(data.byId[v(s, 'event')], 'track') === track)
    .filter((s) => !session || v(s, 'session') === session)
    .sort((a, b) => evDate(b, data).localeCompare(evDate(a, data)) || b.created_at.localeCompare(a.created_at)) : []), [data, car, track, session, baselinesOnly]);
  if (!data) return null;
  const tracks = [...new Set(data.list('event').map((e) => v(e, 'track')).filter(Boolean))].sort();
  const sessions = formFor(data, 'setup')?.data.sessions || [];
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-4)));
  return (
    <>
      <div className="toolbar">
        <select value={car} onChange={(e) => setCar(e.target.value)} aria-label="Car">
          <option value="">All cars</option>{data.list('car').map((c) => <option key={c.id} value={c.id}>{titleOf(c)}</option>)}
        </select>
        <select value={track} onChange={(e) => setTrack(e.target.value)} aria-label="Track">
          <option value="">All tracks</option>{tracks.map((t) => <option key={t}>{t}</option>)}
        </select>
        {!baselinesOnly && (
          <select value={session} onChange={(e) => setSession(e.target.value)} aria-label="Session">
            <option value="">All sessions</option>{sessions.map((t) => <option key={t}>{t}</option>)}
          </select>
        )}
        <button type="button" className="btn primary" disabled={sel.length < 2} onClick={() => nav(`/compare?ids=${sel.join(',')}`)}>Compare{sel.length ? ` (${sel.length})` : ''}</button>
      </div>
      <p className="muted small">{baselinesOnly
        ? 'Tick “Save as a baseline setup” on any sheet to add it here. Recall a baseline when you start a sheet, or from an event with “Start from baseline…”.'
        : 'Tick up to four sheets to compare them side by side. New sheets are added from an event.'}</p>
      {rows.length === 0 ? <Empty>{baselinesOnly ? 'No baselines yet.' : 'No setup sheets yet. Open an event and add a sheet for a session.'}</Empty> : (
        <div className="card list">
          {rows.map((s) => {
            const ev = data.byId[v(s, 'event')];
            return (
              <div key={s.id} className={`list-row selectable${sel.includes(s.id) ? ' selected' : ''}`}>
                <input type="checkbox" aria-label="Select for comparison" checked={sel.includes(s.id)} onChange={() => toggle(s.id)} />
                <Link to={`/r/setup/${s.id}`} className="grow">
                  <span className="row-title">{v(s, 'baseline') ? <span className="pill pill-ok">baseline</span> : null} {baselinesOnly && v(s, 'baseline_name') ? v(s, 'baseline_name') : `${v(s, 'session')} · ${titleOf(ev)}`}</span>
                  <span className="row-sub">{titleOf(data.byId[v(s, 'car')])} · {v(ev, 'track')} · {fmtDate(v(ev, 'date'))}{baselinesOnly ? ` · ${v(s, 'session')}` : ''}</span>
                </Link>
                <span className="row-meta">{v(s, 'finish') ? `P${v(s, 'finish')}` : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const asList = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const lc = (x) => String(x || '').toLowerCase();

function Highlight({ text, q }) {
  if (!q || !text) return <>{text}</>;
  const i = lc(text).indexOf(lc(q));
  if (i < 0) return <>{text}</>;
  const start = Math.max(0, i - 60);
  return <>{start > 0 ? '…' : ''}{text.slice(start, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length, i + q.length + 80)}{i + q.length + 80 < text.length ? '…' : ''}</>;
}

function SetupSearch() {
  const data = useTeamData();
  const nav = useNavigate();
  const [conds, setConds] = useState([]);
  const [feels, setFeels] = useState([]);
  const [who, setWho] = useState('either');
  const [q, setQ] = useState('');
  const [car, setCar] = useState('');
  const [track, setTrack] = useState('');
  const [sel, setSel] = useState([]);
  const [more, setMore] = useState(false);
  if (!data) return null;
  const setups = data.list('setup');
  const used = (k) => setups.flatMap((s) => asList(v(s, k)));
  const condOptions = [...new Set([...used('track_conditions'), ...TRACK_CONDITIONS])];
  const feelOptions = [...new Set([...used('driver_feel'), ...used('crew_feel'), ...CAR_BEHAVIOUR])];
  const count = (k, x) => setups.filter((s) => asList(v(s, k)).includes(x)).length;
  const tracks = [...new Set(data.list('event').map((e) => v(e, 'track')).filter(Boolean))].sort();
  const TEXT_KEYS = ['driver_comments', 'crew_comments', 'conditions_notes', 'changes_next', 'notes'];
  const results = setups.filter((s) => {
    const ev = data.byId[v(s, 'event')];
    if (car && v(s, 'car') !== car) return false;
    if (track && v(ev, 'track') !== track) return false;
    if (conds.length && !conds.every((c) => asList(v(s, 'track_conditions')).includes(c))) return false;
    const fs = who === 'driver' ? asList(v(s, 'driver_feel')) : who === 'crew' ? asList(v(s, 'crew_feel')) : [...asList(v(s, 'driver_feel')), ...asList(v(s, 'crew_feel'))];
    if (feels.length && !feels.every((f) => fs.includes(f))) return false;
    if (q && !TEXT_KEYS.some((k) => lc(v(s, k)).includes(lc(q)))) return false;
    return conds.length || feels.length || q || car || track;
  }).sort((a, b) => evDate(b, data).localeCompare(evDate(a, data)));
  const toggle = (list, set, x) => set(list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const chips = (opts, list, set, key) => opts.slice(0, more ? 200 : 18).map((x) => {
    const n = key ? count(key, x) : setups.filter((s) => [...asList(v(s, 'driver_feel')), ...asList(v(s, 'crew_feel'))].includes(x)).length;
    return <button type="button" key={x} className={`chip${list.includes(x) ? ' active' : ''}${n ? '' : ' unused'}`} onClick={() => toggle(list, set, x)}>{x}{n ? <small> {n}</small> : null}</button>;
  });

  return (
    <>
      <section className="card">
        <h3>Track conditions</h3>
        <div className="chips">{chips(condOptions, conds, setConds, 'track_conditions')}</div>
        <div className="card-head"><h3>Car behaviour</h3>
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Described by">
            <option value="either">Driver or crew lead</option><option value="driver">Driver said</option><option value="crew">Crew lead said</option>
          </select>
        </div>
        <div className="chips">{chips(feelOptions, feels, setFeels, null)}</div>
        <button type="button" className="link small" onClick={() => setMore(!more)}>{more ? 'Fewer descriptions' : 'All descriptions'}</button>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <input type="search" placeholder="Search comments, notes and planned changes" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={track} onChange={(e) => setTrack(e.target.value)} aria-label="Track"><option value="">Any track</option>{tracks.map((t) => <option key={t}>{t}</option>)}</select>
          <select value={car} onChange={(e) => setCar(e.target.value)} aria-label="Car"><option value="">Any car</option>{data.list('car').map((c) => <option key={c.id} value={c.id}>{titleOf(c)}</option>)}</select>
          {(conds.length || feels.length || q || car || track) ? <button type="button" className="btn ghost small" onClick={() => { setConds([]); setFeels([]); setQ(''); setCar(''); setTrack(''); }}>Clear</button> : null}
          <button type="button" className="btn primary" disabled={sel.length < 2} onClick={() => nav(`/compare?ids=${sel.join(',')}`)}>Compare{sel.length ? ` (${sel.length})` : ''}</button>
        </div>
      </section>
      {!(conds.length || feels.length || q || car || track) ? <Empty>Pick conditions or behaviour (or type a word) to find past sessions that match — then compare what the setup was.</Empty>
        : results.length === 0 ? <Empty>No sessions match all of those.</Empty> : (
          <div className="card list">
            <p className="muted small pad-x">{results.length} matching session{results.length === 1 ? '' : 's'}</p>
            {results.map((s) => {
              const ev = data.byId[v(s, 'event')];
              const hit = q ? TEXT_KEYS.find((k) => lc(v(s, k)).includes(lc(q))) : null;
              return (
                <div key={s.id} className={`list-row selectable search-hit${sel.includes(s.id) ? ' selected' : ''}`}>
                  <input type="checkbox" aria-label="Select for comparison" checked={sel.includes(s.id)} onChange={() => toggle(sel, setSel, s.id)} />
                  <Link to={`/r/setup/${s.id}`} className="grow">
                    <span className="row-title">{v(s, 'session')} · {titleOf(ev)} <span className="muted">· {titleOf(data.byId[v(s, 'car')])} · {fmtDate(v(ev, 'date'))}</span></span>
                    <span className="tag-line">
                      {asList(v(s, 'track_conditions')).map((c) => <span key={`c${c}`} className={`tag cond${conds.includes(c) ? ' on' : ''}`}>{c}</span>)}
                      {asList(v(s, 'driver_feel')).map((c) => <span key={`d${c}`} className={`tag drv${feels.includes(c) ? ' on' : ''}`} title="Driver">D: {c}</span>)}
                      {asList(v(s, 'crew_feel')).map((c) => <span key={`w${c}`} className={`tag crw${feels.includes(c) ? ' on' : ''}`} title="Crew lead">C: {c}</span>)}
                    </span>
                    {hit && <span className="row-sub wrap"><Highlight text={String(v(s, hit))} q={q} /></span>}
                    {!hit && v(s, 'changes_next') && <span className="row-sub wrap">Next: {v(s, 'changes_next')}</span>}
                  </Link>
                  <span className="row-meta">{v(s, 'finish') ? `P${v(s, 'finish')}` : ''}</span>
                </div>
              );
            })}
          </div>
        )}
    </>
  );
}

const norm = (x) => (x === undefined || x === null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x));

export function Compare() {
  const data = useTeamData();
  const [params, setParams] = useSearchParams();
  const [onlyDiff, setOnlyDiff] = useState(false);
  if (!data) return null;
  const ids = (params.get('ids') || '').split(',').filter(Boolean);
  const setups = ids.map((id) => data.byId[id]).filter(Boolean);
  const type = setups[0]?.type || 'setup';
  const isSetup = type === 'setup';
  const form = formFor(data, type, setups[0]?.data.form_id);
  const setIds = (list) => setParams({ ids: list.join(',') });
  const candidates = data.list(type).filter((s) => !ids.includes(s.id))
    .sort((a, b) => evDate(b, data).localeCompare(evDate(a, data)));

  const cell = (f, s) => {
    const vals = s.data.values || {};
    if (f.type === 'calc') return evalFormula(f.formula, vals) ?? '';
    return display(f, vals[f.key], data);
  };
  const raw = (f, s) => (f.type === 'calc' ? evalFormula(f.formula, s.data.values) : s.data.values?.[f.key]);

  return (
    <div>
      <PageHeader title={isSetup ? 'Compare setups' : 'Compare builds'} sub="Differences are highlighted" back={isSetup ? '/setups' : -1}>
        <label className="toggle"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /><span>Only differences</span></label>
      </PageHeader>
      {setups.length < 4 && (
        <div className="toolbar">
          <select value="" onChange={(e) => e.target.value && setIds([...ids, e.target.value])}>
            <option value="">+ Add a sheet to compare…</option>
            {candidates.slice(0, 200).map((s) => (
              <option key={s.id} value={s.id}>{isSetup ? `${titleOf(data.byId[v(s, 'car')])} · ` : ''}{titleOf(s, data)} ({fmtDate(isSetup ? evDate(s, data) : v(s, 'date'))})</option>
            ))}
          </select>
        </div>
      )}
      {setups.length === 0 ? <Empty>Pick sheets to compare.</Empty> : (
        <div className="compare-wrap card">
          <table className="compare">
            <thead>
              <tr>
                <th />
                {setups.map((s) => (
                  <th key={s.id}>
                    <Link to={`/r/${type}/${s.id}`}>{isSetup ? v(s, 'session') : titleOf(s, data)}</Link>
                    <small>{isSetup ? <>{titleOf(data.byId[v(s, 'event')])}<br />{titleOf(data.byId[v(s, 'car')])} · {fmtDate(evDate(s, data))}</> : fmtDate(v(s, 'date'))}</small>
                    <button type="button" className="link small" onClick={() => setIds(ids.filter((x) => x !== s.id))}>remove</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {form?.data.sections.filter((sec) => !['session', 'build'].includes(sec.id)).map((sec) => {
                const rows = sec.fields.filter((f) => f.type !== 'heading').flatMap((f) => (f.type === 'corners'
                  ? (f.corners || []).map((c) => ({
                    key: `${f.key}.${c}`, label: `${f.label} ${c}`,
                    get: (s) => display({ type: f.input === 'asset' ? 'asset' : 'text' }, s.data.values?.[f.key]?.[c], data),
                    raw: (s) => s.data.values?.[f.key]?.[c],
                  }))
                  : [{ key: f.key, label: f.label, get: (s) => cell(f, s), raw: (s) => raw(f, s) }]))
                  .map((r) => ({ ...r, diff: new Set(setups.map((s) => norm(r.raw(s)))).size > 1 }))
                  .filter((r) => !onlyDiff || r.diff);
                if (!rows.length) return null;
                return [
                  <tr key={sec.id} className="sec-row"><td colSpan={setups.length + 1}>{sec.title}</td></tr>,
                  ...rows.map((r) => (
                    <tr key={r.key} className={r.diff ? 'diff' : ''}>
                      <th scope="row">{r.label}</th>
                      {setups.map((s) => <td key={s.id}>{String(r.get(s) ?? '')}</td>)}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
