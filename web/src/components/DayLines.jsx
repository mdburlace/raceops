// The days of a multi-day event, as lines under its row in a list: each day's date, its name (or Day 2 of 3),
// start time, whether it ran and what happened, joined to the event by a rail so it's clear they're one meeting.
// Each line opens the event on that day's tab. Nothing for a one-day event.
import { Link } from 'react-router-dom';
import { eventDayList } from '@shared/calendar.js';
import { fmtDay, fmtTime, today } from '../lib/data.js';

export default function DayLines({ values, eventId = null, compact = false }) {
  const days = eventDayList(values);
  if (days.length < 2) return null;
  const t = today();
  const of = days.length;
  return (
    <ol className={`day-lines${compact ? ' compact' : ''}`} aria-label={`${of} days of ${values?.name || 'this event'}`} data-testid="day-lines">
      {days.map((d, i) => {
        const name = d.label || `Day ${i + 1} of ${of}`;
        const body = (
          <>
            <span className="dl-when">{fmtDay(d.date)}</span>
            <span className="dl-name">{name}</span>
            {(d.label || d.time) && <span className="dl-meta">{[d.label && `Day ${i + 1} of ${of}`, d.time && fmtTime(d.time)].filter(Boolean).join(' · ')}</span>}
            {d.off && <span className="pill pill-warn">{d.status}</span>}
            {!d.off && d.outcome && <span className={`pill pill-${d.outcome === 'Raced the feature' ? 'ok' : d.outcome === 'Did not race' ? 'muted' : 'warn'}`} data-testid="day-outcome">{d.outcome}</span>}
            {!d.off && d.result && <span className="dl-result">{d.result}</span>}
          </>
        );
        return (
          <li key={d.n} className={`day-line${d.off ? ' off' : ''}${d.date < t ? ' past' : ''}${d.date === t ? ' today' : ''}`} data-day={d.n}>
            {eventId ? <Link to={`/events/${eventId}?day=${d.n}`} className="dl-link">{body}</Link> : <span className="dl-link">{body}</span>}
          </li>
        );
      })}
    </ol>
  );
}
