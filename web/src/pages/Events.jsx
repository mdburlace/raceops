import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ContactLinks from '../components/ContactLinks.jsx';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { eventTrack, fmtDays, fmtDay, fmtTime, roundAndTrack, formFor, num, titleOf, today, useTeamData, v } from '../lib/data.js';
import { DAY_OUTCOMES, WITHDRAW_REASONS, eventDayList, setDayResult } from '@shared/calendar.js';
import { useSession } from '../lib/session.jsx';
import { saveRecord } from '../lib/store.js';
import { orderForNew, orderSessions } from '../lib/sessions.js';
import { EntryResult } from './Calendar.jsx';
import DayLines from '../components/DayLines.jsx';
import { EventBusiness } from './Business.jsx';

/** Number of days an event runs (1 for single-day). */
export const eventDays = (ev) => Math.max(1, eventDayList(ev?.data?.values).length);
/** When the event runs, in words ("Thu 4 & Sat 6 Dec 2026" when the days have gaps). */
export const dateRange = (ev) => fmtDays(ev?.data?.values);

/**
 * The tabs for an event's days: its days in date order, plus any day number a sheet is on that the event
 * no longer has (so no sheet is ever out of sight). [{ n, date, label, time, status, off, pos }]
 */
export function dayTabs(ev, sheets) {
  const days = eventDayList(ev?.data?.values);
  const known = new Set(days.map((d) => d.n));
  const stray = [...new Set(sheets.map((s) => num(v(s, 'day')) || 1))].filter((n) => !known.has(n)).sort((a, b) => a - b)
    .map((n) => ({ n, date: '', stray: true }));
  return [...days, ...stray].map((d, i) => ({ ...d, pos: i + 1 }));
}

/** The day to open on: today's day while the event is on, the last day once it's over, else the first. */
export function currentDay(tabs, t = today()) {
  const dated = tabs.filter((d) => d.date);
  if (!dated.length) return tabs[0]?.n || 1;
  const on = dated.filter((d) => d.date <= t);
  return (on.length ? on[on.length - 1] : dated[0]).n;
}

export function EventRow({ e, data, n }) {
  const s = data.byId[v(e, 'series')];
  return (
    <Link to={`/events/${e.id}`} className="list-row event-row" data-event={e.id}>
      <span className="date-block">
        <b>{new Date(`${v(e, 'date')}T00:00:00`).getDate() || '–'}</b>
        <small>{v(e, 'date') ? new Date(`${v(e, 'date')}T00:00:00`).toLocaleString(undefined, { month: 'short', year: '2-digit' }) : ''}</small>
      </span>
      <span className="grow">
        <span className="row-title">{v(e, 'name')}{eventDays(e) > 1 ? <span className="pill pill-info days-pill">{eventDays(e)} days</span> : null}</span>
        <span className="row-sub">{[roundAndTrack(v(e, 'round'), eventTrack(e, data)), s && titleOf(s), !s && v(e, 'event_type'), data.byId[v(e, 'car')] && titleOf(data.byId[v(e, 'car')])].filter(Boolean).join(' · ')}</span>
        <DayLines values={e.data?.values} />
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
        {canType('fixture', 'view') && <Link className="btn ghost" to="/calendar">Calendar</Link>}
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
  const dayOf = (s) => num(v(s, 'day')) || 1;
  const setups = data.list('setup').filter((s) => v(s, 'event') === id);
  const tabs = dayTabs(ev, setups);
  const days = tabs.length;
  const day = tabs.some((d) => d.n === dayState) ? dayState : currentDay(tabs);
  const thisDay = tabs.find((d) => d.n === day) || tabs[0];
  const rank = (s) => tabs.find((d) => d.n === dayOf(s))?.pos || dayOf(s);
  const daySetups = orderSessions(setups.filter((s) => days === 1 || dayOf(s) === day), presets, rank);
  const car = data.byId[v(ev, 'car')];
  // sheets recorded for other cars (before the event had a car) stay reachable
  const otherCars = [...new Set(setups.map((s) => v(s, 'car')))].filter((c) => c && c !== car?.id).map((c) => data.byId[c]).filter(Boolean);
  const canEdit = canType('setup', 'edit');
  const back = encodeURIComponent(`/events/${id}${days > 1 ? `?day=${day}` : ''}`);
  const venue = data.byId[v(ev, 'venue')];
  const baselines = data.list('setup').filter((s) => v(s, 'baseline'));
  const shop = data.byId[v(ev, 'shop_setup')];
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
    const all = orderSessions(setups.filter((s) => v(s, 'car') === c.id), presets, rank);
    const nextSession = presets.find((p) => !used.includes(p)) || 'Practice';
    return (
      <Section key={c.id} title={primary ? `${titleOf(c)} — sessions${days > 1 ? ` · Day ${thisDay?.pos || day}${thisDay?.label ? ` · ${thisDay.label}` : ''}` : ''}` : `${titleOf(c)} (earlier sheets)`} className={`event-car${primary ? '' : ' other-car'}`}
        actions={(
          <span className="row-actions">
            {primary && canEdit && !reorder && shop && v(shop, 'car') === c.id && (
              <button type="button" className="btn small" onClick={() => newSheet(c.id, nextSession, shop.id)} title="A new sheet for the next session, starting from the car's workshop setup">Start from workshop setup</button>
            )}
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
        {shop && <Link className="chip" to={`/r/shop_setup/${shop.id}`} data-testid="event-shop-setup">Workshop setup: {v(shop, 'name')}</Link>}
        {venue && <Link className="chip" to={`/tracks/${venue.id}`}>Track: {v(venue, 'name')}</Link>}
        {series && <Link className="chip" to={`/series/${series.id}`}>{titleOf(series)}{v(ev, 'round') ? ` · Round ${v(ev, 'round')}` : ''}</Link>}
        {!series && <span className="chip static">Stand-alone event</span>}
        {days > 1 && <span className="chip static">{days}-day event</span>}
      </div>
      {facts.length > 0 && <p className="muted small track-facts">{facts.join(' · ')}</p>}
      <div className="card entry-card" data-testid="entry-card">
        <b>Plan & result</b>
        <EntryResult ev={ev} />
        {days > 1 && v(ev, 'outcome_auto') && <span className="muted small" data-testid="overall-auto">Worked out from the days — pick another to change it.</span>}
        {v(ev, 'withdraw_session') && <span className="muted small">Withdrew after {v(ev, 'withdraw_session')}</span>}
        {v(ev, 'outcome_notes') && <span className="muted small pre">{v(ev, 'outcome_notes')}</span>}
      </div>
      {v(ev, 'track_notes') && <div className="card"><p className="pre">{v(ev, 'track_notes')}</p></div>}
      {days > 1 && (
        <div className="tabs scroll day-tabs" role="tablist" aria-label="Days">
          {tabs.map((d) => (
            <button type="button" key={d.n} role="tab" aria-selected={d.n === day} className={`${d.n === day ? 'active' : ''}${d.off ? ' off' : ''}`} onClick={() => setDay(d.n)} data-day={d.n}>
              {d.label || `Day ${d.pos}`} <small className="muted">{d.stray ? 'not one of the days' : fmtDay(d.date)}</small> <span className="tab-count">{setups.filter((s) => dayOf(s) === d.n && (!car || v(s, 'car') === car.id)).length || ''}</span>
            </button>
          ))}
        </div>
      )}
      {days > 1 && thisDay && (thisDay.time || thisDay.off || thisDay.stray) && (
        <p className={`day-note small${thisDay.off ? ' notice' : ' muted'}`} data-testid="day-note">
          {thisDay.stray ? 'The event no longer has this day. Open each sheet and pick one of the event’s days.'
            : [thisDay.off && `${thisDay.status} — this day didn’t run.`, thisDay.time && `Starts ${fmtTime(thisDay.time)}.`].filter(Boolean).join(' ')}
        </p>
      )}
      {days > 1 && thisDay && !thisDay.stray && !thisDay.off && <DayResult ev={ev} day={thisDay} days={tabs} />}
      {days > 1 && <DaysSummary ev={ev} onPick={setDay} />}
      {car ? carBlock(car, true) : <ChooseCar ev={ev} data={data} />}
      {otherCars.map((c) => carBlock(c, false))}
      <EventBusiness ev={ev} />
      <ContactLinks data={data} entity={ev} />
    </div>
  );
}

export const dayOutcomeLevel = (o) => (o === 'Raced the feature' ? 'ok' : o === 'Withdrew' || o === 'Did not make the feature' ? 'warn' : 'muted');

/** What happened on one day of a multi-day meeting: the outcome, why we withdrew, the result in a few words, notes. */
function DayResult({ ev, day, days }) {
  const { tid, user, canType } = useSession();
  const x = ev.data?.values || {};
  const d = eventDayList(x).find((r) => r.n === day.n) || {};
  const [text, setText] = useState({ result: d.result || '', notes: d.notes || '' });
  useEffect(() => { setText({ result: d.result || '', notes: d.notes || '' }); }, [ev.id, day.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const canEdit = canType('event', 'edit');
  const pos = days.find((t) => t.n === day.n)?.pos || 1;
  const save = (patch) => saveRecord(tid, 'event', ev.id, { ...ev.data, values: setDayResult(x, day.n, patch) }, user.id);
  const label = `Day ${pos}${day.label ? ` · ${day.label}` : ''}`;
  if (!canEdit) {
    if (!d.outcome && !d.result && !d.notes) return null;
    return (
      <div className="card day-result" data-testid="day-result">
        <b>{label}</b>
        {d.outcome && <Pill level={dayOutcomeLevel(d.outcome)}>{d.outcome}{d.withdraw_reason ? ` — ${d.withdraw_reason}` : ''}</Pill>}
        {d.result && <span>{d.result}</span>}
        {d.notes && <span className="muted small pre">{d.notes}</span>}
      </div>
    );
  }
  const future = d.date > today();
  return (
    <div className="card day-result" data-testid="day-result">
      <b>{label} — what happened</b>
      <select aria-label={`What happened on ${label}`} className={d.outcome || future ? '' : 'needs'} value={d.outcome || ''} onChange={(e) => save({ outcome: e.target.value, ...(e.target.value === 'Withdrew' ? {} : { withdraw_reason: '' }) })}>
        <option value="">{future ? 'Still to come' : 'What happened?'}</option>
        {DAY_OUTCOMES.map((o) => <option key={o}>{o}</option>)}
      </select>
      {d.outcome === 'Withdrew' && (
        <select aria-label={`Why we withdrew on ${label}`} value={d.withdraw_reason || ''} onChange={(e) => save({ withdraw_reason: e.target.value })}>
          <option value="">Reason…</option>
          {[...new Set([...WITHDRAW_REASONS, ...(d.withdraw_reason ? [d.withdraw_reason] : [])])].map((o) => <option key={o}>{o}</option>)}
        </select>
      )}
      <input aria-label={`Result on ${label}`} placeholder="Result, e.g. Prelim feature 5th" value={text.result}
        onChange={(e) => setText({ ...text, result: e.target.value })} onBlur={() => text.result !== (d.result || '') && save({ result: text.result })} />
      <textarea aria-label={`Notes on ${label}`} placeholder="Notes for the day" rows={1} value={text.notes}
        onChange={(e) => setText({ ...text, notes: e.target.value })} onBlur={() => text.notes !== (d.notes || '') && save({ notes: text.notes })} />
    </div>
  );
}

/** Every day's result at a glance, under the event's overall result. */
function DaysSummary({ ev, onPick }) {
  const days = eventDayList(ev.data?.values);
  if (!days.some((d) => d.outcome || d.result)) return null;
  return (
    <div className="days-summary" data-testid="days-summary">
      {days.map((d, i) => (
        <button type="button" key={d.n} className="chip" onClick={() => onPick(d.n)}>
          {d.label || `Day ${i + 1}`}: {d.off ? d.status : d.outcome || 'not recorded'}{d.result ? ` · ${d.result}` : ''}
        </button>
      ))}
    </div>
  );
}
