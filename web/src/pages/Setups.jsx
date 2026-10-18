import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Empty, PageHeader } from '../components/ui.jsx';
import { display, evalFormula, fmtDate, formFor, titleOf, useTeamData, v } from '../lib/data.js';

const evDate = (s, data) => v(data.byId[v(s, 'event')], 'date') || '';

export function SetupList() {
  const data = useTeamData();
  const nav = useNavigate();
  const [car, setCar] = useState('');
  const [track, setTrack] = useState('');
  const [session, setSession] = useState('');
  const [sel, setSel] = useState([]);
  const rows = useMemo(() => (data ? data.list('setup')
    .filter((s) => !car || v(s, 'car') === car)
    .filter((s) => !track || v(data.byId[v(s, 'event')], 'track') === track)
    .filter((s) => !session || v(s, 'session') === session)
    .sort((a, b) => evDate(b, data).localeCompare(evDate(a, data)) || b.created_at.localeCompare(a.created_at)) : []), [data, car, track, session]);
  if (!data) return null;
  const tracks = [...new Set(data.list('event').map((e) => v(e, 'track')).filter(Boolean))].sort();
  const sessions = formFor(data, 'setup')?.data.sessions || [];
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-4)));

  return (
    <div>
      <PageHeader title="Setups" sub="Every setup sheet, across all events">
        <button type="button" className="btn primary" disabled={sel.length < 2} onClick={() => nav(`/compare?ids=${sel.join(',')}`)}>
          Compare{sel.length ? ` (${sel.length})` : ''}
        </button>
      </PageHeader>
      <div className="toolbar">
        <select value={car} onChange={(e) => setCar(e.target.value)}>
          <option value="">All cars</option>{data.list('car').map((c) => <option key={c.id} value={c.id}>{titleOf(c)}</option>)}
        </select>
        <select value={track} onChange={(e) => setTrack(e.target.value)}>
          <option value="">All tracks</option>{tracks.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={session} onChange={(e) => setSession(e.target.value)}>
          <option value="">All sessions</option>{sessions.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <p className="muted small">Tick up to four sheets to compare them side by side. New sheets are added from an event.</p>
      {rows.length === 0 ? <Empty>No setup sheets yet. Open an event and add a sheet for a session.</Empty> : (
        <div className="card list">
          {rows.map((s) => {
            const ev = data.byId[v(s, 'event')];
            return (
              <div key={s.id} className={`list-row selectable${sel.includes(s.id) ? ' selected' : ''}`}>
                <input type="checkbox" aria-label="Select for comparison" checked={sel.includes(s.id)} onChange={() => toggle(s.id)} />
                <Link to={`/r/setup/${s.id}`} className="grow">
                  <span className="row-title">{v(s, 'session')} · {titleOf(ev)}</span>
                  <span className="row-sub">{titleOf(data.byId[v(s, 'car')])} · {v(ev, 'track')} · {fmtDate(v(ev, 'date'))}</span>
                </Link>
                <span className="row-meta">{v(s, 'finish') ? `P${v(s, 'finish')}` : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
  const form = formFor(data, 'setup', setups[0]?.data.form_id);
  const setIds = (list) => setParams({ ids: list.join(',') });
  const candidates = data.list('setup').filter((s) => !ids.includes(s.id))
    .sort((a, b) => evDate(b, data).localeCompare(evDate(a, data)));

  const cell = (f, s) => {
    const vals = s.data.values || {};
    if (f.type === 'calc') return evalFormula(f.formula, vals) ?? '';
    return display(f, vals[f.key], data);
  };
  const raw = (f, s) => (f.type === 'calc' ? evalFormula(f.formula, s.data.values) : s.data.values?.[f.key]);

  return (
    <div>
      <PageHeader title="Compare setups" sub="Differences are highlighted" back="/setups">
        <label className="toggle"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /><span>Only differences</span></label>
      </PageHeader>
      {setups.length < 4 && (
        <div className="toolbar">
          <select value="" onChange={(e) => e.target.value && setIds([...ids, e.target.value])}>
            <option value="">+ Add a sheet to compare…</option>
            {candidates.slice(0, 200).map((s) => (
              <option key={s.id} value={s.id}>{titleOf(data.byId[v(s, 'car')])} · {titleOf(s, data)} ({fmtDate(evDate(s, data))})</option>
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
                    <Link to={`/r/setup/${s.id}`}>{v(s, 'session')}</Link>
                    <small>{titleOf(data.byId[v(s, 'event')])}<br />{titleOf(data.byId[v(s, 'car')])} · {fmtDate(evDate(s, data))}</small>
                    <button type="button" className="link small" onClick={() => setIds(ids.filter((x) => x !== s.id))}>remove</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {form?.data.sections.filter((sec) => sec.id !== 'session').map((sec) => {
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
