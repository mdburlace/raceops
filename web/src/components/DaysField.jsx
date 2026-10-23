// The days of a multi-day event or shared date: how many, and for each day its date, a name
// (Practice, Night 1…), a start time and whether it ran. One record holds them all, so the calendar,
// lists and the event's day tabs always show the same days. Day numbers (`n`) never change once given:
// setup sheets point at them, so a day that has sheets can't be removed until they're moved.
import { useState } from 'react';
import { DAY_STATUS, MAX_DAYS, addDays, seedDays } from '@shared/calendar.js';
import { fmtDay, fmtTime, v } from '../lib/data.js';

/** Setup sheets and between-round checks on each day of an event: { [n]: count }. */
export function sheetsByDay(data, eventId) {
  const out = {};
  if (!data || !eventId) return out;
  for (const t of ['setup', 'track_check']) {
    for (const s of data.list(t)) {
      if (v(s, 'event') !== eventId) continue;
      const n = Number(v(s, 'day')) || 1;
      out[n] = (out[n] || 0) + 1;
    }
  }
  return out;
}

/** The rows being edited: the saved days, or (just switched on) the date to the end date, at least two days. */
export function editingDays(values) {
  const rows = Array.isArray(values?.days) && values.days.length ? values.days : seedDays(values);
  return rows.map((d) => ({ ...d }));
}

export default function DaysField({ value, values, onChange, readOnly, data, recordId }) {
  const [note, setNote] = useState('');
  const rows = editingDays({ ...values, days: value });
  // in date order; a day whose date is being typed stays put at the end
  const sorted = rows.slice().sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.n - b.n);
  const used = sheetsByDay(data, recordId);
  const top = () => Math.max(0, ...rows.map((r) => Number(r.n) || 0));
  const set = (list) => { setNote(''); onChange(list.map(({ off, ...d }) => d)); }; // eslint-disable-line no-unused-vars
  const update = (n, patch) => set(rows.map((r) => (r.n === n ? { ...r, ...patch } : r)));
  const remove = (n) => set(rows.filter((r) => r.n !== n));
  const add = (count = 1) => {
    const list = rows.slice();
    let last = sorted.length ? sorted[sorted.length - 1].date : values?.date;
    let n = top();
    for (let i = 0; i < count && list.length < MAX_DAYS; i++) {
      last = last ? addDays(last, 1) : '';
      n += 1;
      list.push({ n, date: last });
    }
    set(list);
  };
  // fewer days: take days off the end, but never one that has sheets
  const shrinkTo = (count) => {
    let list = sorted.slice();
    while (list.length > count) {
      const lastDay = list[list.length - 1];
      if (used[lastDay.n]) break;
      list = list.slice(0, -1);
    }
    set(rows.filter((r) => list.some((d) => d.n === r.n)));
    if (list.length > count) setNote(`Day ${list.length} has setup sheets, so it stays. Move its sheets to another day first.`);
  };
  const setCount = (count) => (count > rows.length ? add(count - rows.length) : shrinkTo(count));
  const dates = sorted.map((d) => d.date).filter(Boolean);
  const repeated = dates.filter((d, i) => dates.indexOf(d) !== i);

  if (readOnly) {
    return (
      <ol className="days-ro">
        {sorted.map((d, i) => (
          <li key={d.n}><b>Day {i + 1}</b> {fmtDay(d.date)}{d.label ? ` · ${d.label}` : ''}{d.time ? ` · ${fmtTime(d.time)}` : ''}
            {d.status && <span className="pill pill-warn">{d.status}</span>}</li>
        ))}
      </ol>
    );
  }
  return (
    <div className="days-field" data-testid="days-field">
      <label className="days-count">
        <span>Number of days</span>
        <select aria-label="Number of days" value={rows.length} onChange={(e) => setCount(Number(e.target.value))}>
          {Array.from({ length: MAX_DAYS - 1 }, (_, i) => i + 2).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>
      <div className="days-rows" role="list">
        {sorted.map((d, i) => (
          <div key={d.n} className={`day-row${d.status ? ' off' : ''}`} role="listitem" data-day={d.n}>
            <b className="day-no">Day {i + 1}</b>
            <input type="date" aria-label={`Day ${i + 1} date`} value={d.date || ''} required onChange={(e) => update(d.n, { date: e.target.value })} />
            <input aria-label={`Day ${i + 1} name`} placeholder="Name, e.g. Practice" value={d.label || ''} maxLength={60} onChange={(e) => update(d.n, { label: e.target.value })} />
            <input type="time" aria-label={`Day ${i + 1} start time`} value={d.time || ''} onChange={(e) => update(d.n, { time: e.target.value })} />
            <select aria-label={`Day ${i + 1} status`} value={d.status || ''} onChange={(e) => update(d.n, { status: e.target.value })}>
              <option value="">On</option>
              {DAY_STATUS.map((s) => <option key={s}>{s}</option>)}
            </select>
            {used[d.n]
              ? <span className="day-used muted small" title="Move this day’s sheets to another day before removing it">{used[d.n]} sheet{used[d.n] > 1 ? 's' : ''}</span>
              : <button type="button" className="icon-btn danger" aria-label={`Remove day ${i + 1}`} disabled={rows.length <= 2} onClick={() => remove(d.n)}>✕</button>}
          </div>
        ))}
      </div>
      <div className="days-foot">
        {rows.length < MAX_DAYS && <button type="button" className="btn small ghost" onClick={() => add(1)}>+ Add a day</button>}
        <small className="muted">Days sort by date. Leave a gap for a day off. For one day only, untick <b>Runs over more than one day</b>.</small>
      </div>
      {repeated.length > 0 && <small className="error-text">Two days have the same date ({fmtDay(repeated[0])}).</small>}
      {note && <small className="notice small" role="status">{note}</small>}
    </div>
  );
}
