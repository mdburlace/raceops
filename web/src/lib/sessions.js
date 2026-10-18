// Running order of the sessions (setup sheets) for one car at an event.
// A sheet may carry an explicit `order` (set when it was added or reordered); older sheets
// fall back to the standard session order, then to when they were created.
import { num, v } from './data.js';

export const dayOf = (s) => num(v(s, 'day')) || 1;

/** Map of sheet id → sort key. */
export function sessionKeys(sheets, presets = []) {
  const byCreated = sheets.slice().sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  return new Map(byCreated.map((s, i) => {
    const o = num(v(s, 'order'));
    if (o !== null) return [s.id, o];
    const idx = presets.indexOf(v(s, 'session'));
    return [s.id, idx >= 0 ? (idx + 1) * 10 : 1000 + i];
  }));
}

/** Sheets in running order: by day, then position. */
export function orderSessions(sheets, presets = []) {
  const key = sessionKeys(sheets, presets);
  return sheets.slice().sort((a, b) => dayOf(a) - dayOf(b) || key.get(a.id) - key.get(b.id)
    || (a.created_at || '').localeCompare(b.created_at || ''));
}

/**
 * Position for a new session on a day. A standard session slots in before the first later
 * standard session (so a missed Qualifying lands before Heat 1); anything else goes last.
 */
export function orderForNew(daySheets, presets, session) {
  const ordered = orderSessions(daySheets, presets);
  const key = sessionKeys(daySheets, presets);
  const idx = presets.indexOf(session);
  const at = idx < 0 ? -1 : ordered.findIndex((s) => presets.indexOf(v(s, 'session')) > idx);
  if (at < 0) return ordered.length ? key.get(ordered[ordered.length - 1].id) + 10 : 10;
  const next = key.get(ordered[at].id);
  const prev = at > 0 ? key.get(ordered[at - 1].id) : next - 20;
  return (prev + next) / 2;
}

/** The session just before `values` (a sheet being created or edited) at the same event. */
export function previousSession(all, values, presets, selfId) {
  const mine = all.filter((s) => s.id !== selfId && v(s, 'event') === values.event && v(s, 'car') === values.car);
  if (!mine.length) return null;
  const key = sessionKeys(mine, presets);
  const myDay = num(values.day) || 1;
  const myKey = num(values.order) ?? Infinity;
  const before = orderSessions(mine, presets).filter((s) => dayOf(s) < myDay || (dayOf(s) === myDay && key.get(s.id) < myKey));
  return before[before.length - 1] || null;
}
