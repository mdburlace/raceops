import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Empty, PageHeader, Section } from '../components/ui.jsx';
import { fmtDate, formFor, titleOf, today, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

export function EventList() {
  const data = useTeamData();
  const { canType } = useSession();
  const [q, setQ] = useState('');
  const [showPast, setShowPast] = useState(true);
  const rows = useMemo(() => {
    if (!data) return [];
    const setupCount = {};
    for (const s of data.list('setup')) setupCount[v(s, 'event')] = (setupCount[v(s, 'event')] || 0) + 1;
    return data.list('event')
      .filter((e) => !q || `${v(e, 'name')} ${v(e, 'track')}`.toLowerCase().includes(q.toLowerCase()))
      .map((e) => ({ e, n: setupCount[e.id] || 0 }))
      .sort((a, b) => (v(b.e, 'date') || '').localeCompare(v(a.e, 'date') || ''));
  }, [data, q]);
  if (!data) return null;
  const t = today();
  const upcoming = rows.filter((r) => (v(r.e, 'end_date') || v(r.e, 'date') || '') >= t).reverse();
  const past = rows.filter((r) => (v(r.e, 'end_date') || v(r.e, 'date') || '') < t);

  const Row = ({ e, n }) => (
    <Link to={`/events/${e.id}`} className="list-row">
      <span className="date-block">
        <b>{new Date(`${v(e, 'date')}T00:00:00`).getDate() || '–'}</b>
        <small>{v(e, 'date') ? new Date(`${v(e, 'date')}T00:00:00`).toLocaleString(undefined, { month: 'short', year: '2-digit' }) : ''}</small>
      </span>
      <span className="grow">
        <span className="row-title">{v(e, 'name')}</span>
        <span className="row-sub">{v(e, 'track')}{v(e, 'event_type') ? ` · ${v(e, 'event_type')}` : ''}</span>
      </span>
      <span className="row-meta">{n ? `${n} sheet${n > 1 ? 's' : ''}` : ''}</span>
    </Link>
  );

  return (
    <div>
      <PageHeader title="Events" sub="Race meetings and test days">
        {canType('event', 'edit') && <Link className="btn primary" to="/r/event/new">New event</Link>}
      </PageHeader>
      <div className="toolbar">
        <input type="search" placeholder="Search events or tracks" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {rows.length === 0 && <Empty>No events yet. Add your next race meeting to start recording setups.</Empty>}
      {upcoming.length > 0 && <Section title="Upcoming"><div className="list">{upcoming.map((r) => <Row key={r.e.id} {...r} />)}</div></Section>}
      {past.length > 0 && (
        <Section title="Past" actions={<button className="btn ghost small" type="button" onClick={() => setShowPast(!showPast)}>{showPast ? 'Hide' : 'Show'}</button>}>
          {showPast && <div className="list">{past.map((r) => <Row key={r.e.id} {...r} />)}</div>}
        </Section>
      )}
    </div>
  );
}

export function EventDetail() {
  const { id } = useParams();
  const data = useTeamData();
  const { canType } = useSession();
  if (!data) return null;
  const ev = data.byId[id];
  if (!ev) return <><PageHeader title="Event not found" back="/events" /></>;
  const form = formFor(data, 'setup');
  const sessions = form?.data.sessions || [];
  const setups = data.list('setup').filter((s) => v(s, 'event') === id);
  const carIds = new Set(setups.map((s) => v(s, 'car')));
  const cars = data.list('car').filter((c) => v(c, 'active') !== false || carIds.has(c.id))
    .sort((a, b) => String(v(a, 'number')).localeCompare(String(v(b, 'number')), undefined, { numeric: true }));
  const canEdit = canType('setup', 'edit');
  const back = encodeURIComponent(`/events/${id}`);

  return (
    <div>
      <PageHeader title={v(ev, 'name')} sub={`${v(ev, 'track') || ''} · ${fmtDate(v(ev, 'date'))}${v(ev, 'end_date') ? ` – ${fmtDate(v(ev, 'end_date'))}` : ''}`} back="/events">
        <Link className="btn ghost" to={`/r/event/${id}`}>{canType('event', 'edit') ? 'Edit event' : 'Details'}</Link>
      </PageHeader>
      {v(ev, 'track_notes') && <div className="card"><p className="pre">{v(ev, 'track_notes')}</p></div>}
      {cars.length === 0 && <Empty>Add a car first (More → Cars) to record setups.</Empty>}
      {cars.map((car) => {
        const mine = setups.filter((s) => v(s, 'car') === car.id);
        const extra = mine.filter((s) => !sessions.includes(v(s, 'session')));
        const ids = mine.map((s) => s.id).join(',');
        return (
          <Section key={car.id} title={titleOf(car)} className="event-car"
            actions={mine.length > 1 && <Link className="btn ghost small" to={`/compare?ids=${ids}`}>Compare sessions</Link>}>
            <div className="session-grid">
              {sessions.map((sn) => {
                const list = mine.filter((s) => v(s, 'session') === sn);
                if (list.length) {
                  return list.map((s) => (
                    <Link key={s.id} to={`/r/setup/${s.id}`} className={`session-cell has${s.dirty ? ' pending' : ''}`}>
                      <span className="sn">{sn}</span>
                      <span className="sd">
                        {[v(s, 'start') && `Start ${v(s, 'start')}`, v(s, 'finish') && `Fin ${v(s, 'finish')}`].filter(Boolean).join(' → ') || 'Recorded'}
                      </span>
                    </Link>
                  ));
                }
                return canEdit ? (
                  <Link key={sn} to={`/r/setup/new?event=${id}&car=${car.id}&session=${encodeURIComponent(sn)}&back=${back}`} className="session-cell add">
                    <span className="sn">{sn}</span><span className="sd">+ Add sheet</span>
                  </Link>
                ) : <div key={sn} className="session-cell none"><span className="sn">{sn}</span><span className="sd">—</span></div>;
              })}
              {extra.map((s) => (
                <Link key={s.id} to={`/r/setup/${s.id}`} className="session-cell has">
                  <span className="sn">{v(s, 'session') || 'Session'}</span><span className="sd">Recorded</span>
                </Link>
              ))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}
