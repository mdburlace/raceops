// Calendars: shared series and track dates ("fixtures"), each team's own calendar (its events,
// with intent and outcome), series entries (full or partial season), racing years, and iCal
// in and out. Used by the server (public page, .ics feed, import) and the app.

export const INTENTS = ['Planned', 'Tentative', 'Not going'];
export const OUTCOMES = ['Raced the feature', 'Did not make the feature', 'Withdrew during the event', 'Did not attend', 'Event cancelled'];
export const WITHDREW = 'Withdrew during the event';
export const WITHDRAW_REASONS = ['Mechanical failure', 'Engine', 'Crash damage', 'Driver unwell or injured', 'Weather', 'Track conditions',
  'Out of tyres or parts', 'Other'];
export const FIXTURE_STATUS = ['Scheduled', 'Postponed', 'Cancelled'];
export const PARTICIPATION = ['Full series', 'Partial series'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');
const lc = (s) => String(s ?? '').trim().toLowerCase();

// ---------------------------------------------------------------- racing years
/** Month the team's racing year starts (1 = January, 7 = July …). */
export const seasonStart = (settings) => {
  const m = Number(settings?.calendar_season_start);
  return m >= 1 && m <= 12 ? m : 1;
};
/** The racing year a date falls in, as the year it starts in. */
export function seasonOf(date, startMonth = 1) {
  const d = String(date || '');
  if (!/^\d{4}-\d{2}/.test(d)) return null;
  const y = Number(d.slice(0, 4)); const m = Number(d.slice(5, 7));
  return m >= startMonth ? y : y - 1;
}
/** "2026" for a calendar year, "2026-27" for a year that starts mid-year. */
export const seasonLabel = (y, startMonth = 1) => (startMonth === 1 ? `${y}` : `${y}-${pad((y + 1) % 100)}`);
/** First day and the day after the last day of a racing year. */
export const seasonRange = (y, startMonth = 1) => [`${y}-${pad(startMonth)}-01`, `${y + 1}-${pad(startMonth)}-01`];
/** Does a date range (end optional) overlap the racing year? */
export function inSeason(date, endDate, y, startMonth = 1) {
  if (!date) return false;
  const [from, to] = seasonRange(y, startMonth);
  return date < to && (endDate || date) >= from;
}
/** Does a series' season text ("2026", "2026-27", "2026/27") match the racing year? */
export function seasonMatches(text, y, startMonth = 1) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (s === seasonLabel(y, startMonth) || s === String(y)) return true;
  const m = s.match(/^(\d{4})\s*[-/–]\s*(\d{2,4})$/);
  return !!m && Number(m[1]) === y;
}

// ---------------------------------------------------------------- fixtures and cars
const classList = (x) => (Array.isArray(x) ? x : String(x || '').split(/[,;]/)).map((c) => String(c).trim()).filter(Boolean);
/** Classes running at a shared date: its own list, or its series' class. */
export const fixtureClasses = (fx, series) => [...new Set([...classList(fx?.classes), ...classList(series?.class)])];

/**
 * Cars that fit a shared date: active cars whose class is one of the classes running.
 * cars: [{ id, values }]. Returns { matches, others } — when no classes are listed every car matches.
 */
export function carsForFixture(fx, series, cars) {
  const active = cars.filter((c) => c.values?.active !== false);
  const classes = fixtureClasses(fx, series).map(lc);
  if (!classes.length) return { matches: active, others: [], classes: [] };
  const matches = active.filter((c) => classes.includes(lc(c.values?.class)));
  return { matches, others: active.filter((c) => !matches.includes(c)), classes: fixtureClasses(fx, series) };
}

/** Values for a new team event from a shared date. */
export function eventFromFixture(fx, fixtureId, carId, seriesId, series = null) {
  const v = fx || {};
  const out = { name: v.name, date: v.date, fixture: fixtureId, car: carId, intent: 'Planned', event_type: seriesId ? 'Series' : 'Points race' };
  if (v.end_date) out.end_date = v.end_date;
  if (v.multi_day && Array.isArray(v.days)) { out.multi_day = true; out.days = v.days.map((d) => ({ ...d })); }
  if (v.venue) out.venue = v.venue; else if (v.track) out.track = v.track;
  if (seriesId) out.series = seriesId;
  if (v.round) out.round = v.round;
  const sanctioning = v.sanctioning || series?.sanctioning;
  if (sanctioning) out.sanctioning = sanctioning;
  if (v.major) { out.major = true; out.event_type = 'Special event'; if (v.major_name) out.major_name = v.major_name; }
  return out;
}

/**
 * Fields that differ between a team event and the shared date it came from (date moved etc).
 * Each change has { key, label, was, now }; `patch` (when set) is what to copy onto the event to match,
 * and a days change carries the days as rows (`was` / `now` are then date lists).
 */
export function fixtureChanges(ev, fx) {
  if (!ev || !fx) return [];
  const out = [];
  const dates = (v) => eventDayList(v).map((d) => `${d.date}${d.off ? '-' : ''}`).join(',');
  if (fx.multi_day && dates(fx) !== dates(ev)) {
    // the shared date's days changed (or were added): one change carries them all
    out.push({ key: 'days', label: 'Days', was: eventDayList(ev), now: eventDayList(fx),
      patch: { multi_day: true, days: fx.days, date: fx.date, end_date: fx.end_date } });
  } else if (!fx.multi_day) {
    if ((fx.date || '') !== (ev.date || '')) out.push({ key: 'date', label: 'Date', was: ev.date, now: fx.date });
    if ((fx.end_date || '') !== (ev.end_date || '') && fx.end_date) out.push({ key: 'end_date', label: 'End date', was: ev.end_date, now: fx.end_date });
  }
  if (fx.venue && fx.venue !== ev.venue) out.push({ key: 'venue', label: 'Track', was: ev.venue, now: fx.venue });
  if (fx.status && fx.status !== 'Scheduled') out.push({ key: 'status', label: 'Status', was: '', now: fx.status });
  return out;
}

/** Same date at the same place (for spotting duplicates when importing or suggesting). */
export function sameFixture(a, b) {
  if (!a || !b || a.date !== b.date) return false;
  if (a.venue && b.venue) return a.venue === b.venue && (!a.series || !b.series || a.series === b.series);
  return lc(a.track || a.name) === lc(b.track || b.name);
}

// ---------------------------------------------------------------- what's shown
export const isWithdrawn = (v) => v?.outcome === WITHDREW;
/** "★ Australian Sprintcar Title", or "★ Major event" when it has no name; '' if not a major event. */
export const majorLabel = (v) => (v?.major ? `★ ${v.major_name || 'Major event'}` : '');
/** Sanctioning body of a date or entry, falling back to its series'. */
export const sanctioningOf = (v, series) => v?.sanctioning || series?.sanctioning || '';

/** Short status for a team calendar entry. */
export function entryStatus(v, today) {
  if (v?.intent === 'Not going') return { label: 'Not going', level: 'muted' };
  if (v?.outcome) {
    const level = v.outcome === 'Raced the feature' ? 'ok' : v.outcome === WITHDREW || v.outcome === 'Did not make the feature' ? 'warn' : 'muted';
    return { label: v.outcome === WITHDREW && v.withdraw_reason ? `Withdrew — ${v.withdraw_reason}` : v.outcome, level };
  }
  const past = (v?.end_date || v?.date || '') < today;
  if (past) return { label: 'Result not recorded', level: 'warn' };
  return v?.intent === 'Tentative' ? { label: 'Tentative', level: 'info' } : { label: 'Planned', level: 'info' };
}

/** Season counts for a team: planned, ran, feature starts, withdrawals (with reasons). */
export function seasonSummary(entries) {
  const going = entries.filter((v) => v.intent !== 'Not going');
  const ran = going.filter((v) => ['Raced the feature', 'Did not make the feature', WITHDREW].includes(v.outcome));
  const reasons = {};
  for (const v of going.filter(isWithdrawn)) reasons[v.withdraw_reason || 'No reason given'] = (reasons[v.withdraw_reason || 'No reason given'] || 0) + 1;
  return {
    planned: going.length, tentative: going.filter((v) => v.intent === 'Tentative').length,
    ran: ran.length, features: going.filter((v) => v.outcome === 'Raced the feature').length,
    missedFeature: going.filter((v) => v.outcome === 'Did not make the feature').length,
    withdrew: going.filter(isWithdrawn).length, didNotAttend: going.filter((v) => v.outcome === 'Did not attend').length,
    cancelled: going.filter((v) => v.outcome === 'Event cancelled').length, reasons,
  };
}

// ---------------------------------------------------------------- multi-day events
// An event or shared date over more than one day keeps every day on the one record:
// values.multi_day = true and values.days = [{ n, date, label, time, status }]. `n` is the day's number
// for setup sheets and between-round checks (their `day` value); it is given once and never changes, so
// moving a day's date, or adding a day, keeps every sheet on its day. `date` and `end_date` always hold
// the first and last day, for everything that only needs the span (racing years, sorting, past or upcoming).
// Older records (and imports) only have a date and an end date: their days are every day in between.
export const MAX_DAYS = 14;
/** A day that didn't run. Anything else (blank) means the day is on. */
export const DAY_STATUS = ['Rained out', 'Cancelled'];
export const isIsoDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const spanOf = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1;
const short = (x, n) => String(x ?? '').trim().slice(0, n);

function cleanDay(d) {
  if (!d || !isIsoDate(d.date)) return null;
  const n = Number(d.n);
  const out = { n: Number.isInteger(n) && n > 0 ? n : 0, date: d.date };
  if (short(d.label, 60)) out.label = short(d.label, 60);
  if (/^\d{2}:\d{2}$/.test(String(d.time || ''))) out.time = d.time;
  if (DAY_STATUS.includes(d.status)) out.status = d.status;
  return out;
}
const sortDays = (rows) => rows.slice().sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n);
const withOff = (d) => ({ ...d, off: DAY_STATUS.includes(d.status) });

/** Consecutive days from the date to the end date (two days when there's no end date), numbered 1, 2, 3… */
export function seedDays(v) {
  if (!isIsoDate(v?.date)) return [];
  const end = isIsoDate(v.end_date) && v.end_date > v.date ? v.end_date : addDays(v.date, 1);
  return Array.from({ length: Math.min(MAX_DAYS, spanOf(v.date, end)) }, (_, i) => ({ n: i + 1, date: addDays(v.date, i) }));
}

/** The days of an event or shared date in date order: [{ n, date, label?, time?, status?, off }]. One row for a one-day event. */
export function eventDayList(v) {
  if (!v) return [];
  if (v.multi_day !== false) {
    const rows = Array.isArray(v.days) ? v.days.map(cleanDay).filter(Boolean) : [];
    if (rows.length) return sortDays(rows.map((d, i) => (d.n ? d : { ...d, n: 100 + i }))).map(withOff);
    if (v.multi_day === true || (isIsoDate(v.end_date) && v.end_date > v.date)) {
      const seeded = seedDays(v);
      if (seeded.length) return seeded.map(withOff);
    }
  }
  return isIsoDate(v.date) ? [{ n: 1, date: v.date, off: false }] : [];
}

/** Days that run (not rained out or cancelled). */
export const daysOn = (v) => eventDayList(v).filter((d) => !d.off);

/** True when the days follow one another with no gaps. */
export function consecutiveDays(days) {
  return days.every((d, i) => i === 0 || d.date === addDays(days[i - 1].date, 1));
}

/** Position (1, 2, 3…) of day number `n` in date order, or `n` itself when it isn't one of the days. */
export function dayPosition(days, n) {
  const i = days.findIndex((d) => d.n === (Number(n) || 1));
  return i >= 0 ? i + 1 : Number(n) || 1;
}

/** The date of day number `day` of an event (a setup sheet's date). Falls back to counting on from the first date. */
export function dayDateOf(ev, day) {
  const n = Number(day) || 1;
  const hit = eventDayList(ev).find((d) => d.n === n);
  if (hit) return hit.date;
  return isIsoDate(ev?.date) ? addDays(ev.date, n - 1) : '';
}

/**
 * Tidy an event's or shared date's values before saving, so the days and the date span always agree:
 * - multi-day on: days cleaned, numbered (new ones after the highest number in use), sorted, at most 14;
 *   date = first day, end_date = last day. Fewer than two days left makes it a one-day event again.
 * - multi-day off: days and end date go.
 * - not set either way (older records, imports, a quick edit of the end date): a date-to-end-date run of
 *   up to 14 days becomes multi-day with one row per day.
 */
export function normaliseDays(values) {
  const v = { ...(values || {}) };
  const legacy = v.multi_day === undefined && isIsoDate(v.date) && isIsoDate(v.end_date) && v.end_date > v.date && spanOf(v.date, v.end_date) <= MAX_DAYS;
  if (v.multi_day === true || legacy) {
    let rows = Array.isArray(v.days) ? v.days.map(cleanDay).filter(Boolean) : [];
    if (!rows.length) rows = seedDays(v);
    let top = Math.max(0, ...rows.map((r) => r.n));
    const seen = new Set();
    rows = rows.map((r) => {
      const out = !r.n || seen.has(r.n) ? { ...r, n: ++top } : r;
      seen.add(out.n);
      return out;
    });
    rows = sortDays(rows).slice(0, MAX_DAYS);
    if (rows.length >= 2) {
      v.multi_day = true;
      v.days = rows;
      v.date = rows[0].date;
      v.end_date = rows[rows.length - 1].date;
      if (v.end_date === v.date) delete v.end_date;
      return v;
    }
    if (rows.length === 1) v.date = rows[0].date;
    v.multi_day = false;
  }
  if (v.multi_day === false) { delete v.days; delete v.end_date; }
  return v;
}

/**
 * A new date or end date for an event whose days run one after another (a quick edit): the days move with it.
 * Each day keeps its number, name and start time by position; extra days get new numbers. A new date alone
 * keeps the number of days. An end date on or before the date makes it a one-day event.
 */
export function respanDays(v, date, end) {
  const old = eventDayList(v);
  if (!isIsoDate(date)) return { ...v, date };
  const last = end === undefined ? (old.length > 1 ? addDays(date, old.length - 1) : '') : end;
  if (!isIsoDate(last) || last <= date) {
    const out = { ...v, date, multi_day: false };
    delete out.days; delete out.end_date;
    return out;
  }
  let top = Math.max(0, ...old.map((d) => d.n));
  const days = Array.from({ length: Math.min(MAX_DAYS, spanOf(date, last)) }, (_, i) => {
    const { off, ...keep } = old[i] || {}; // eslint-disable-line no-unused-vars
    return old[i] ? { ...keep, date: addDays(date, i) } : { n: ++top, date: addDays(date, i) };
  });
  return { ...v, multi_day: true, days, date, end_date: days[days.length - 1].date };
}

/** The days moved by `by` days: gaps, names, start times and day numbers all kept. */
function shiftDays(v, by) {
  const days = eventDayList({ multi_day: true, days: v.days }).map(({ off, ...d }) => ({ ...d, date: addDays(d.date, by) })); // eslint-disable-line no-unused-vars
  return { ...v, multi_day: true, days, date: days[0].date, end_date: days[days.length - 1].date };
}

/**
 * New values for a record that had `before` (a multi-day event or shared date), from a change that may not
 * know about its days: an older app, an API call, a calendar request that doesn't carry them, or a feed.
 * - The change has no days (or not as a list): the record keeps its days.
 * - The days are the same as before but the date moved: every day moves by the same number of days, so
 *   gaps, names and day numbers (which setup sheets point at) are kept.
 * - Only the end date moved, on days that run one after another: days are added or taken off the end.
 *   On days with gaps an end date alone changes nothing (the days are changed in the app).
 * - The change edits the days themselves, or switches multi-day off: it wins.
 */
export function moveDays(before, after) {
  if (!after || !before || after.multi_day === false) return after;
  const had = before.multi_day !== false && Array.isArray(before.days) && before.days.some((d) => isIsoDate(d?.date)) ? before.days : null;
  if (!had) return after;
  let v = after;
  if (!Array.isArray(after.days)) v = { ...after, multi_day: true, days: had };
  const key = (days) => JSON.stringify(eventDayList({ multi_day: true, days }).map((d) => [d.n, d.date]));
  if (key(v.days) !== key(had)) return v;
  const first = eventDayList({ multi_day: true, days: had })[0].date;
  if (isIsoDate(v.date) && v.date !== first) return shiftDays(v, spanOf(first, v.date) - 1);
  const last = eventDayList({ multi_day: true, days: had }).slice(-1)[0].date;
  if (isIsoDate(v.end_date) && v.end_date !== last && consecutiveDays(eventDayList({ multi_day: true, days: had }))) {
    return respanDays({ ...v, date: first }, first, v.end_date);
  }
  return { ...v, date: first, end_date: last };
}

/**
 * New shared-date values for a team's event, keeping the event's own days that have setup sheets
 * (a practice day the team added, or a day the shared date no longer has). usedDays: the day numbers
 * the event's sheets are on.
 */
export function keepUsedDays(teamBefore, next, usedDays) {
  const coming = eventDayList(next);
  const kept = eventDayList(teamBefore).filter((d) => usedDays.has(d.n) && !coming.some((c) => c.n === d.n));
  if (!kept.length) return next;
  const strip = ({ off, ...d }) => d; // eslint-disable-line no-unused-vars
  return normaliseDays({ ...next, multi_day: true, days: [...coming.map(strip), ...kept.map(strip)] });
}

/** A shared date's or event's iCal entries: one per day for a multi-day meeting (the first keeps the meeting's id). */
function icsParts(it) {
  if (!Array.isArray(it.days) || it.days.length < 2) return [it];
  const [local, host] = String(it.uid).split('@');
  return it.days.map((d, i) => ({
    ...it,
    uid: i === 0 ? it.uid : `${local}-d${d.n}@${host || 'raceops'}`,
    date: d.date,
    end_date: '',
    summary: `${d.off ? `${d.status === 'Cancelled' ? 'CANCELLED' : d.status.toUpperCase()}: ` : ''}${it.summary} — ${d.label || `Day ${i + 1}`}`,
    description: [d.time && `Starts ${d.time}`, it.description].filter(Boolean).join('\n'),
    status: d.off ? 'CANCELLED' : it.status,
  }));
}

// ---------------------------------------------------------------- iCal out
const icsEscape = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const fold = (line) => {
  const out = []; let s = line;
  while (s.length > 73) { out.push(s.slice(0, 73)); s = ` ${s.slice(73)}`; }
  out.push(s);
  return out.join('\r\n');
};
const icsDate = (d) => String(d).replace(/-/g, '');
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/**
 * An iCalendar feed of all-day events. items: [{ uid, date, end_date, summary, location, description, url, status, days? }].
 * An item with `days` (from eventDayList, two or more) becomes one entry per day.
 */
export function toICS({ name, items, stamp = new Date() }) {
  const dt = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RaceOps//Team calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`];
  for (const it of items.flatMap(icsParts)) {
    if (!it.date) continue;
    lines.push('BEGIN:VEVENT', `UID:${it.uid}`, `DTSTAMP:${dt}`, `DTSTART;VALUE=DATE:${icsDate(it.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(it.end_date && it.end_date >= it.date ? it.end_date : it.date, 1))}`,
      `SUMMARY:${icsEscape(it.summary)}`);
    if (it.location) lines.push(`LOCATION:${icsEscape(it.location)}`);
    if (it.description) lines.push(`DESCRIPTION:${icsEscape(it.description)}`);
    if (it.url) lines.push(`URL:${icsEscape(it.url)}`);
    if (it.status) lines.push(`STATUS:${it.status}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------- iCal in
export const looksLikeICS = (text) => /BEGIN:VCALENDAR/i.test(String(text || '').slice(0, 2000));
const unescapeICS = (s) => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
function icsDay(value) {
  const m = String(value || '').match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
/** Events in an iCalendar file: [{ name, date, end_date, location, notes, website }] (end date inclusive). */
export function parseICS(text) {
  const lines = String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let cur = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; continue; }
    if (/^END:VEVENT/i.test(line)) {
      if (cur?.date) {
        const allDay = cur._allDay;
        let end = cur._end || null;
        if (end && allDay) end = addDays(end, -1); // all-day DTEND is the day after
        out.push({ name: cur.name || 'Event', date: cur.date, end_date: end && end > cur.date ? end : '', location: cur.location || '',
          notes: cur.notes || '', website: cur.website || '', status: cur.status || '', uid: cur.uid || '' });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const head = line.slice(0, i).toUpperCase(); const val = line.slice(i + 1);
    const key = head.split(';')[0];
    if (key === 'SUMMARY') cur.name = unescapeICS(val).trim();
    else if (key === 'UID') cur.uid = val.trim().slice(0, 300);
    else if (key === 'DTSTART') { cur.date = icsDay(val); cur._allDay = /VALUE=DATE(?!-)/.test(head) || /^\d{8}$/.test(val.trim()); }
    else if (key === 'DTEND') cur._end = icsDay(val);
    else if (key === 'LOCATION') cur.location = unescapeICS(val).trim();
    else if (key === 'DESCRIPTION') cur.notes = unescapeICS(val).trim().slice(0, 1000);
    else if (key === 'URL') cur.website = val.trim();
    else if (key === 'STATUS') cur.status = /CANCEL/i.test(val) ? 'Cancelled' : '';
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Best directory track for a name or location typed on a calendar ("Archerfield Speedway, Brisbane"). */
export function matchTrack(text, tracks) {
  const t = lc(text);
  if (!t) return null;
  const words = (s) => lc(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['speedway', 'raceway', 'motorplex', 'park', 'the', 'and', 'international'].includes(w));
  let best = null; let bestScore = 0;
  for (const tr of tracks) {
    const name = lc(tr.values?.name);
    if (!name) continue;
    if (t === name || t.includes(name) || name.includes(t)) return tr;
    const tw = new Set(words(t));
    const nw = words(name);
    const hits = nw.filter((w) => tw.has(w)).length;
    const score = nw.length ? hits / nw.length : 0;
    if (score > bestScore) { best = tr; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}
