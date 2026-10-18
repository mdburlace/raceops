import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Empty, PageHeader, Pill } from '../components/ui.jsx';
import { scheduleStatus, setupsByAsset } from '../lib/compute.js';
import { allFields, fmtDate, formFor, LEVEL_INCLUDES, levelLabel, titleOf, today, useTeamData, v } from '../lib/data.js';
import { saveRecord } from '../lib/store.js';
import { useSession } from '../lib/session.jsx';

export function scheduleText(st) {
  if (!st.interval) return 'No interval set';
  const n = Math.abs(st.remaining);
  const u = n === 1 ? st.unit.toLowerCase().replace(/s$/, '') : st.unit.toLowerCase();
  if (st.remaining <= 0) return st.remaining === 0 ? 'Due now' : `Overdue by ${n} ${u}`;
  return `Due in ${st.remaining} ${u}`;
}

export function Maintenance() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'logs';
  return (
    <div>
      <PageHeader title="Maintenance" sub="Checklists between races and scheduled service intervals" />
      <div className="tabs">
        <button type="button" className={tab === 'logs' ? 'active' : ''} onClick={() => setParams({})}>Checklists</button>
        <button type="button" className={tab === 'schedules' ? 'active' : ''} onClick={() => setParams({ tab: 'schedules' })}>Schedules</button>
      </div>
      {tab === 'logs' ? <Logs /> : <Schedules />}
    </div>
  );
}

function Logs() {
  const data = useTeamData();
  const { canType } = useSession();
  const [car, setCar] = useState('');
  if (!data) return null;
  const cars = data.list('car').filter((c) => v(c, 'active') !== false);
  const pickCar = car || cars[0]?.id || '';
  const logs = data.list('maintenance').filter((m) => !car || v(m, 'car') === car)
    .sort((a, b) => (v(b, 'date') || '').localeCompare(v(a, 'date') || ''));
  const form = formFor(data, 'maintenance');
  const progress = (m) => {
    const f = formFor(data, 'maintenance', m.data.form_id);
    const inc = LEVEL_INCLUDES[v(m, 'level')] || LEVEL_INCLUDES.weekly;
    const items = allFields(f).filter((x) => x.type === 'check' && inc.includes(x.freq));
    const done = items.filter((x) => m.data.values?.[x.key]?.done).length;
    return { done, total: items.length };
  };
  const levels = form?.data.levels || [];

  return (
    <>
      <div className="toolbar">
        <select value={car} onChange={(e) => setCar(e.target.value)}>
          <option value="">All cars</option>{data.list('car').map((c) => <option key={c.id} value={c.id}>{titleOf(c)}</option>)}
        </select>
        {canType('maintenance', 'edit') && pickCar && (
          <div className="btn-group">
            {levels.map((l) => (
              <Link key={l.key} className="btn" to={`/r/maintenance/new?car=${pickCar}&level=${l.key}`}>+ {l.label}</Link>
            ))}
          </div>
        )}
      </div>
      {!cars.length && <Empty>Add a car first (More → Cars).</Empty>}
      {logs.length === 0 ? <Empty>No checklists recorded yet.</Empty> : (
        <div className="card list">
          {logs.map((m) => {
            const p = progress(m);
            return (
              <Link key={m.id} to={`/r/maintenance/${m.id}`} className="list-row">
                <span className="grow">
                  <span className="row-title">{levelLabel(v(m, 'level'))} · {titleOf(data.byId[v(m, 'car')])}</span>
                  <span className="row-sub">{fmtDate(v(m, 'date'))}{v(m, 'completed_by') ? ` · ${v(m, 'completed_by')}` : ''}</span>
                </span>
                <Pill level={p.done === p.total ? 'ok' : 'warn'}>{p.done}/{p.total}</Pill>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function Schedules() {
  const data = useTeamData();
  const { tid, user, canType } = useSession();
  const rows = useMemo(() => {
    if (!data) return [];
    const byAsset = setupsByAsset(data);
    const rank = { over: 0, warn: 1, ok: 2 };
    return data.list('schedule').map((s) => ({ s, st: scheduleStatus(s, data, byAsset) }))
      .sort((a, b) => rank[a.st.level] - rank[b.st.level] || a.st.remaining - b.st.remaining);
  }, [data]);
  if (!data) return null;
  const markDone = (s) => saveRecord(tid, 'schedule', s.id, { ...s.data, values: { ...s.data.values, last_done: today() } }, user.id);

  return (
    <>
      <div className="toolbar">
        {canType('schedule', 'edit') && <Link className="btn primary" to="/r/schedule/new">New schedule</Link>}
      </div>
      <p className="muted small">Races and laps are counted from setup sheets that use the car or asset after the last-done date.</p>
      {rows.length === 0 ? <Empty>No schedules yet. Example: “Rebuild shocks every 8 races” or “Freshen engine every 600 laps”.</Empty> : (
        <div className="card list">
          {rows.map(({ s, st }) => {
            const target = v(s, 'applies_to') === 'Car' ? data.byId[v(s, 'car')] : data.byId[v(s, 'asset')];
            return (
              <div key={s.id} className="list-row">
                <Link to={`/r/schedule/${s.id}`} className="grow">
                  <span className="row-title">{v(s, 'name')}</span>
                  <span className="row-sub">{titleOf(target, data)} · every {v(s, 'interval')} {String(v(s, 'interval_unit') || '').toLowerCase()} · last {v(s, 'last_done') ? fmtDate(v(s, 'last_done')) : 'never'}</span>
                </Link>
                <Pill level={st.level}>{scheduleText(st)}</Pill>
                {canType('schedule', 'edit') && <button type="button" className="btn small" onClick={() => markDone(s)}>Done today</button>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
