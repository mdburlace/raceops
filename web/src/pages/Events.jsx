import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ContactLinks from '../components/ContactLinks.jsx';
import { Empty, PageHeader, Section } from '../components/ui.jsx';
import { eventTrack, fmtDate, formFor, num, titleOf, today, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

/** Number of days an event runs (1 for single-day). */
export function eventDays(ev) {
  const a = v(ev, 'date'); const b = v(ev, 'end_date');
  if (!a || !b || b <= a) return 1;
  return Math.min(14, Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5) + 1);
}
export function dayDate(ev, d) {
  const dt = new Date(`${v(ev, 'date')}T00:00:00`);
  dt.setDate(dt.getDate() + d - 1);
  return dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
export const dateRange = (ev) => (v(ev, 'end_date') && v(ev, 'end_date') !== v(ev, 'date')
  ? `${fmtDate(v(ev, 'date'))} – ${fmtDate(v(ev, 'end_date'))}` : fmtDate(v(ev, 'date')));

export function EventRow({ e, data, n }) {
  const s = data.byId[v(e, 'series')];
  return (
    <Link to={`/events/${e.id}`} className="list-row">
      <span className="date-block">
        <b>{new Date(`${v(e, 'date')}T00:00:00`).getDate() || '–'}</b>
        <small>{v(e, 'date') ? new Date(`${v(e, 'date')}T00:00:00`).toLocaleString(undefined, { month: 'short', year: '2-digit' }) : ''}</small>
      </span>
      <span className="grow">
        <span className="row-title">{v(e, 'name')}{eventDays(e) > 1 ? <span className="pill pill-info days-pill">{eventDays(e)} days</span> : null}</span>
        <span className="row-sub">{[eventTrack(e, data), s && `${titleOf(s)}${v(e, 'round') ? ` · Rd ${v(e, 'round')}` : ''}`, !s && v(e, 'event_type')].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="row-meta">{n ? `${n} sheet${n > 1 ? 's' : ''}` : ''}</span>
    </Link>
  );
}

export function EventList() {
  const data = useTeamData();
  const { canType } = useSession();
  const [params, setParams] = useSearchParams();
  const series = params.get('series') || '';
  const [q, setQ] = useState('');
  const [showPast, setShowPast] = useState(true);
  const rows = useMemo(() => {
    if (!data) return [];
    const setupCount = {};
    for (const s of data.list('setup')) setupCount[v(s, 'event')] = (setupCount[v(s, 'event')] || 0) + 1;
    return data.list('event')
      .filter((e) => !series || (series === 'none' ? !v(e, 'series') : v(e, 'series') === series))
      .filter((e) => !q || `${v(e, 'name')} ${eventTrack(e, data)}`.toLowerCase().includes(q.toLowerCase()))
      .map((e) => ({ e, n: setupCount[e.id] || 0 }))
      .sort((a, b) => (v(b.e, 'date') || '').localeCompare(v(a.e, 'date') || ''));
  }, [data, q, series]);
  if (!data) return null;
  const t = today();
  const upcoming = rows.filter((r) => (v(r.e, 'end_date') || v(r.e, 'date') || '') >= t).reverse();
  const past = rows.filter((r) => (v(r.e, 'end_date') || v(r.e, 'date') || '') < t);

  return (
    <div>
      <PageHeader title="Events" sub="Race meetings — stand-alone or rounds of a series">
        {canType('series', 'view') && <Link className="btn ghost" to="/series">Series</Link>}
        {canType('event', 'edit') && <Link className="btn primary" to={`/r/event/new${series && series !== 'none' ? `?series=${series}` : ''}`}>New event</Link>}
      </PageHeader>
      <div className="toolbar">
        <input type="search" placeholder="Search events or tracks" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={series} onChange={(e) => setParams(e.target.value ? { series: e.target.value } : {})}>
          <option value="">All events</option><option value="none">Stand-alone only</option>
          {data.list('series').map((s) => <option key={s.id} value={s.id}>{titleOf(s)}</option>)}
        </select>
      </div>
      {rows.length === 0 && <Empty>No events yet. Add your next race meeting to start recording setups.</Empty>}
      {upcoming.length > 0 && <Section title="Upcoming"><div className="list">{upcoming.map((r) => <EventRow key={r.e.id} data={data} {...r} />)}</div></Section>}
      {past.length > 0 && (
        <Section title="Past" actions={<button className="btn ghost small" type="button" onClick={() => setShowPast(!showPast)}>{showPast ? 'Hide' : 'Show'}</button>}>
          {showPast && <div className="list">{past.map((r) => <EventRow key={r.e.id} data={data} {...r} />)}</div>}
        </Section>
      )}
    </div>
  );
}

export function EventDetail() {
  const { id } = useParams();
  const data = useTeamData();
  const { canType } = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const dayState = num(params.get('day'));
  const setDay = (d) => setParams({ day: String(d) }, { replace: true });
  if (!data) return null;
  const ev = data.byId[id];
  if (!ev) return <><PageHeader title="Event not found" back="/events" /></>;
  const form = formFor(data, 'setup');
  const sessions = form?.data.sessions || [];
  const days = eventDays(ev);
  const day = dayState || (days > 1 ? Math.min(days, Math.max(1, Math.round((new Date(`${today()}T00:00:00`) - new Date(`${v(ev, 'date')}T00:00:00`)) / 864e5) + 1)) : 1);
  const dayOf = (s) => num(v(s, 'day')) || 1;
  const setups = data.list('setup').filter((s) => v(s, 'event') === id);
  const daySetups = setups.filter((s) => days === 1 || dayOf(s) === day);
  const carIds = new Set(setups.map((s) => v(s, 'car')));
  const cars = data.list('car').filter((c) => v(c, 'active') !== false || carIds.has(c.id))
    .sort((a, b) => String(v(a, 'number')).localeCompare(String(v(b, 'number')), undefined, { numeric: true }));
  const canEdit = canType('setup', 'edit');
  const back = encodeURIComponent(`/events/${id}${days > 1 ? `?day=${day}` : ''}`);
  const venue = data.byId[v(ev, 'venue')];
  const baselines = data.list('setup').filter((s) => v(s, 'baseline'));
  const series = data.byId[v(ev, 'series')];

  return (
    <div>
      <PageHeader title={v(ev, 'name')} sub={[eventTrack(ev, data), dateRange(ev)].filter(Boolean).join(' · ')} back="/events">
        <Link className="btn ghost" to={`/r/event/${id}`}>{canType('event', 'edit') ? 'Edit event' : 'Details'}</Link>
      </PageHeader>
      <div className="event-meta">
        {venue && <Link className="chip" to={`/tracks/${venue.id}`}>Track: {v(venue, 'name')}</Link>}
        {series && <Link className="chip" to={`/series/${series.id}`}>{titleOf(series)}{v(ev, 'round') ? ` · Round ${v(ev, 'round')}` : ''}</Link>}
        {!series && <span className="chip static">Stand-alone event</span>}
        {days > 1 && <span className="chip static">{days}-day event</span>}
      </div>
      {v(ev, 'track_notes') && <div className="card"><p className="pre">{v(ev, 'track_notes')}</p></div>}
      {days > 1 && (
        <div className="tabs scroll">
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
            <button type="button" key={d} className={d === day ? 'active' : ''} onClick={() => setDay(d)}>
              Day {d} <small className="muted">{dayDate(ev, d)}</small> <span className="tab-count">{setups.filter((s) => dayOf(s) === d).length || ''}</span>
            </button>
          ))}
        </div>
      )}
      {cars.length === 0 && <Empty>Add a car first (Team → Cars) to record setups.</Empty>}
      {cars.map((car) => {
        const mine = daySetups.filter((s) => v(s, 'car') === car.id);
        const extra = mine.filter((s) => !sessions.includes(v(s, 'session')));
        const ids = setups.filter((s) => v(s, 'car') === car.id).map((s) => s.id).join(',');
        return (
          <Section key={car.id} title={titleOf(car)} className="event-car"
            actions={(
              <span className="row-actions">
                {canEdit && baselines.length > 0 && (
                  <select className="baseline-pick" aria-label={`Start ${titleOf(car)} from a baseline`} value=""
                    onChange={(e) => e.target.value && nav(`/r/setup/new?event=${id}&car=${car.id}&session=${encodeURIComponent(sessions.find((sn) => !mine.some((x) => v(x, 'session') === sn)) || sessions[0] || '')}${days > 1 ? `&day=${day}` : ''}&from=${e.target.value}&back=${back}`)}>
                    <option value="">Start from baseline…</option>
                    {baselines.map((b) => <option key={b.id} value={b.id}>{v(b, 'baseline_name') || titleOf(b, data)}{v(b, 'car') !== car.id ? ` (${titleOf(data.byId[v(b, 'car')])})` : ''}</option>)}
                  </select>
                )}
                {setups.filter((s) => v(s, 'car') === car.id).length > 1 && <Link className="btn ghost small" to={`/compare?ids=${ids}`}>Compare sessions</Link>}
              </span>
            )}>
            <div className="session-grid">
              {sessions.map((sn) => {
                const list = mine.filter((s) => v(s, 'session') === sn);
                if (list.length) {
                  return list.map((s) => (
                    <Link key={s.id} to={`/r/setup/${s.id}?back=${back}`} className={`session-cell has${s.dirty ? ' pending' : ''}`}>
                      <span className="sn">{sn}</span>
                      <span className="sd">{[v(s, 'start') && `Start ${v(s, 'start')}`, v(s, 'finish') && `Fin ${v(s, 'finish')}`].filter(Boolean).join(' → ') || 'Recorded'}</span>
                    </Link>
                  ));
                }
                return canEdit ? (
                  <Link key={sn} to={`/r/setup/new?event=${id}&car=${car.id}&session=${encodeURIComponent(sn)}${days > 1 ? `&day=${day}` : ''}&back=${back}`} className="session-cell add">
                    <span className="sn">{sn}</span><span className="sd">+ Add sheet</span>
                  </Link>
                ) : <div key={sn} className="session-cell none"><span className="sn">{sn}</span><span className="sd">—</span></div>;
              })}
              {extra.map((s) => (
                <Link key={s.id} to={`/r/setup/${s.id}?back=${back}`} className="session-cell has">
                  <span className="sn">{v(s, 'session') || 'Session'}</span><span className="sd">Recorded</span>
                </Link>
              ))}
            </div>
          </Section>
        );
      })}
      <ContactLinks data={data} entity={ev} />
    </div>
  );
}
