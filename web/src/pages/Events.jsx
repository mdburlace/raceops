import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ContactLinks from '../components/ContactLinks.jsx';
import { Empty, PageHeader, Section } from '../components/ui.jsx';
import { eventTrack, fmtDate, formFor, num, titleOf, today, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { saveRecord } from '../lib/store.js';
import { orderForNew, orderSessions } from '../lib/sessions.js';

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
        <span className="row-sub">{[data.byId[v(e, 'car')] && titleOf(data.byId[v(e, 'car')]), eventTrack(e, data), s && `${titleOf(s)}${v(e, 'round') ? ` · Rd ${v(e, 'round')}` : ''}`, !s && v(e, 'event_type')].filter(Boolean).join(' · ')}</span>
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

/** Add one session at a time: pick a preset name or type your own. */
function AddSession({ presets, used, onAdd, carLabel }) {
  const next = presets.find((p) => !used.includes(p)) || '__other';
  const [pick, setPick] = useState(next);
  const [custom, setCustom] = useState('');
  useEffect(() => { setPick(next); }, [next]);
  const name = pick === '__other' ? custom.trim() : pick;
  const add = () => { if (name) { onAdd(name); setCustom(''); } };
  return (
    <form className="add-session" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <select aria-label={`Session to add for ${carLabel}`} value={pick} onChange={(e) => setPick(e.target.value)}>
        {presets.map((p) => <option key={p} value={p}>{p}{used.includes(p) ? ' — added' : ''}</option>)}
        <option value="__other">Other — type a name…</option>
      </select>
      {pick === '__other' && (
        <input autoFocus aria-label="Session name" placeholder="e.g. Heat 3, Last chance, Test & tune" value={custom} onChange={(e) => setCustom(e.target.value)} />
      )}
      <button className="btn primary" disabled={!name}>+ Add session</button>
    </form>
  );
}

function SessionCell({ s, back, label, reorder, onMove, first, last }) {
  if (reorder) {
    return (
      <div className="session-cell has reordering">
        <span className="sn">{label || v(s, 'session') || 'Session'}</span>
        <span className="move">
          <button type="button" className="icon-btn" disabled={first} aria-label={`Move ${v(s, 'session')} earlier`} onClick={() => onMove(-1)}>▲</button>
          <button type="button" className="icon-btn" disabled={last} aria-label={`Move ${v(s, 'session')} later`} onClick={() => onMove(1)}>▼</button>
        </span>
      </div>
    );
  }
  return (
    <Link to={`/r/setup/${s.id}?back=${back}`} className={`session-cell has${s.dirty ? ' pending' : ''}`}>
      <span className="sn">{label || v(s, 'session') || 'Session'}</span>
      <span className="sd">{[v(s, 'start') && `Start ${v(s, 'start')}`, v(s, 'finish') && `Fin ${v(s, 'finish')}`].filter(Boolean).join(' → ') || 'Recorded'}</span>
    </Link>
  );
}

/** Pick the car for an event that doesn't have one yet (events made before the Car field). */
function ChooseCar({ ev, data }) {
  const { tid, user, canType } = useSession();
  const cars = data.list('car').filter((c) => v(c, 'active') !== false);
  const [car, setCar] = useState(cars.length === 1 ? cars[0].id : '');
  if (!canType('event', 'edit')) return <div className="notice">No car has been set for this event yet.</div>;
  return (
    <Section title="Which car is racing at this event?">
      {cars.length === 0 ? <Empty>Add a car first (Team → Cars).</Empty> : (
        <div className="inline-row wrap">
          <select aria-label="Car for this event" value={car} onChange={(e) => setCar(e.target.value)}>
            <option value="">Choose a car…</option>
            {cars.map((c) => <option key={c.id} value={c.id}>{titleOf(c)}</option>)}
          </select>
          <button type="button" className="btn primary" disabled={!car}
            onClick={() => saveRecord(tid, 'event', ev.id, { ...ev.data, values: { ...ev.data.values, car } }, user.id)}>Set car</button>
        </div>
      )}
    </Section>
  );
}

export function EventDetail() {
  const { id } = useParams();
  const data = useTeamData();
  const { canType, tid, user } = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [reorder, setReorder] = useState(false);
  const dayState = num(params.get('day'));
  const setDay = (d) => setParams({ day: String(d) }, { replace: true });
  if (!data) return null;
  const ev = data.byId[id];
  if (!ev) return <><PageHeader title="Event not found" back="/events" /></>;
  const form = formFor(data, 'setup');
  const presets = form?.data.sessions || [];
  const days = eventDays(ev);
  const day = dayState || (days > 1 ? Math.min(days, Math.max(1, Math.round((new Date(`${today()}T00:00:00`) - new Date(`${v(ev, 'date')}T00:00:00`)) / 864e5) + 1)) : 1);
  const dayOf = (s) => num(v(s, 'day')) || 1;
  const setups = data.list('setup').filter((s) => v(s, 'event') === id);
  const daySetups = orderSessions(setups.filter((s) => days === 1 || dayOf(s) === day), presets);
  const car = data.byId[v(ev, 'car')];
  // sheets recorded for other cars (before the event had a car) stay reachable
  const otherCars = [...new Set(setups.map((s) => v(s, 'car')))].filter((c) => c && c !== car?.id).map((c) => data.byId[c]).filter(Boolean);
  const canEdit = canType('setup', 'edit');
  const back = encodeURIComponent(`/events/${id}${days > 1 ? `?day=${day}` : ''}`);
  const venue = data.byId[v(ev, 'venue')];
  const baselines = data.list('setup').filter((s) => v(s, 'baseline'));
  const series = data.byId[v(ev, 'series')];
  const newSheet = (carId, session, from) => {
    const order = orderForNew(daySetups.filter((s) => v(s, 'car') === carId), presets, session);
    nav(`/r/setup/new?event=${id}&car=${carId}&session=${encodeURIComponent(session)}${days > 1 ? `&day=${day}` : ''}&order=${order}${from ? `&from=${from}` : ''}&back=${back}`);
  };
  // move a session up or down; the day's sessions are renumbered 10, 20, 30…
  const move = async (list, i, dir) => {
    const next = list.slice();
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    for (const [n, s] of next.entries()) {
      const order = (n + 1) * 10;
      if (num(v(s, 'order')) !== order) await saveRecord(tid, 'setup', s.id, { ...s.data, values: { ...s.data.values, order } }, user.id);
    }
  };
  const facts = [v(ev, 'location'), v(ev, 'track_length'), v(ev, 'surface'), v(ev, 'banking') && `Banking ${v(ev, 'banking')}`].filter(Boolean);

  const carBlock = (c, primary) => {
    const mine = daySetups.filter((s) => v(s, 'car') === c.id);
    const used = mine.map((s) => v(s, 'session'));
    const all = orderSessions(setups.filter((s) => v(s, 'car') === c.id), presets);
    const nextSession = presets.find((p) => !used.includes(p)) || 'Practice';
    return (
      <Section key={c.id} title={primary ? `${titleOf(c)} — sessions${days > 1 ? ` · Day ${day}` : ''}` : `${titleOf(c)} (earlier sheets)`} className={`event-car${primary ? '' : ' other-car'}`}
        actions={(
          <span className="row-actions">
            {primary && canEdit && !reorder && baselines.length > 0 && (
              <select className="baseline-pick" aria-label={`Start ${titleOf(c)} from a baseline`} value=""
                onChange={(e) => e.target.value && newSheet(c.id, nextSession, e.target.value)}>
                <option value="">Start from baseline…</option>
                {baselines.map((b) => <option key={b.id} value={b.id}>{v(b, 'baseline_name') || titleOf(b, data)}{v(b, 'car') !== c.id ? ` (${titleOf(data.byId[v(b, 'car')])})` : ''}</option>)}
              </select>
            )}
            {primary && canEdit && mine.length > 1 && (
              <button type="button" className={`btn small${reorder ? ' primary' : ' ghost'}`} onClick={() => setReorder(!reorder)}>{reorder ? 'Done' : 'Reorder'}</button>
            )}
            {all.length > 1 && !reorder && <Link className="btn ghost small" to={`/compare?ids=${all.map((s) => s.id).join(',')}`}>Compare sessions</Link>}
          </span>
        )}>
        {mine.length > 0 ? (
          <div className={`session-grid${primary && reorder ? ' reorder' : ''}`}>
            {mine.map((s, i) => (
              <SessionCell key={s.id} s={s} back={back} reorder={primary && reorder} first={i === 0} last={i === mine.length - 1}
                onMove={(dir) => move(mine, i, dir)} />
            ))}
          </div>
        ) : <p className="muted">{primary ? 'No sessions yet — add the first one below.' : 'No sheets on this day.'}</p>}
        {primary && reorder && <p className="muted small">Use ▲ ▼ to put the sessions in the order they ran — for example after adding one that was missed.</p>}
        {primary && canEdit && !reorder && <AddSession presets={presets} used={used} carLabel={titleOf(c)} onAdd={(name) => newSheet(c.id, name)} />}
      </Section>
    );
  };

  return (
    <div>
      <PageHeader title={v(ev, 'name')} sub={[eventTrack(ev, data), dateRange(ev)].filter(Boolean).join(' · ')} back="/events">
        <Link className="btn ghost" to={`/r/event/${id}`}>{canType('event', 'edit') ? 'Edit event' : 'Details'}</Link>
      </PageHeader>
      <div className="event-meta">
        {car && <span className="chip static car-chip">Car: {titleOf(car)}</span>}
        {venue && <Link className="chip" to={`/tracks/${venue.id}`}>Track: {v(venue, 'name')}</Link>}
        {series && <Link className="chip" to={`/series/${series.id}`}>{titleOf(series)}{v(ev, 'round') ? ` · Round ${v(ev, 'round')}` : ''}</Link>}
        {!series && <span className="chip static">Stand-alone event</span>}
        {days > 1 && <span className="chip static">{days}-day event</span>}
      </div>
      {facts.length > 0 && <p className="muted small track-facts">{facts.join(' · ')}</p>}
      {v(ev, 'track_notes') && <div className="card"><p className="pre">{v(ev, 'track_notes')}</p></div>}
      {days > 1 && (
        <div className="tabs scroll">
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
            <button type="button" key={d} className={d === day ? 'active' : ''} onClick={() => setDay(d)}>
              Day {d} <small className="muted">{dayDate(ev, d)}</small> <span className="tab-count">{setups.filter((s) => dayOf(s) === d && (!car || v(s, 'car') === car.id)).length || ''}</span>
            </button>
          ))}
        </div>
      )}
      {car ? carBlock(car, true) : <ChooseCar ev={ev} data={data} />}
      {otherCars.map((c) => carBlock(c, false))}
      <ContactLinks data={data} entity={ev} />
    </div>
  );
}
