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
  if (v.venue) out.venue = v.venue; else if (v.track) out.track = v.track;
  if (seriesId) out.series = seriesId;
  if (v.round) out.round = v.round;
  const sanctioning = v.sanctioning || series?.sanctioning;
  if (sanctioning) out.sanctioning = sanctioning;
  if (v.major) { out.major = true; out.event_type = 'Special event'; if (v.major_name) out.major_name = v.major_name; }
  return out;
}

/** Fields that differ between a team event and the shared date it came from (date moved etc). */
export function fixtureChanges(ev, fx) {
  if (!ev || !fx) return [];
  const out = [];
  if ((fx.date || '') !== (ev.date || '')) out.push({ key: 'date', label: 'Date', was: ev.date, now: fx.date });
  if ((fx.end_date || '') !== (ev.end_date || '') && fx.end_date) out.push({ key: 'end_date', label: 'End date', was: ev.end_date, now: fx.end_date });
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
 * An iCalendar feed of all-day events. items: [{ uid, date, end_date, summary, location, description, url, status }].
 */
export function toICS({ name, items, stamp = new Date() }) {
  const dt = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RaceOps//Team calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`];
  for (const it of items) {
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
