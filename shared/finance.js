// Profit and loss for an event or a season, worked out on the device from records the team already
// keeps: expenses and income tagged to the event, plus estimated wear on tyres, engines and other
// parts from the laps run there. Used by Finance, the event page and the sponsor proposal.
//
// `data` is { list(type), byId } (as useTeamData gives). `usage` maps an asset or tyre id to the setup
// sheets that used it (compute.js setupsByAsset). Amounts are in the team's currency: records in
// another currency are converted at their own rate.
import { regionOf } from './regions.js';

const num = (x) => { const v = Number(String(x ?? '').replace(/,/g, '')); return Number.isFinite(v) ? v : 0; };
const vals = (r) => r?.data?.values || {};
const round = (x) => Math.round(x * 100) / 100;
const eventDate = (data, setup) => vals(data.byId[vals(setup).event]).date || '';

/** The amount of an expense or income record in the team's currency. */
export function baseAmount(rec, settings) {
  const v = vals(rec);
  const team = regionOf(settings).currency;
  const rate = !v.currency || v.currency === team ? 1 : num(v.rate) || 1;
  return num(v.amount) * rate;
}

/** A parts order's total: the cost, or quantity × unit cost. */
export const purchaseTotal = (p) => num(vals(p).cost) || num(vals(p).qty || 1) * num(vals(p).unit_cost);

function lapsOf(setups) { return setups.reduce((a, s) => a + num(vals(s).laps), 0); }

/**
 * Estimated wear for the setups of one event: each tyre's cost shared by the laps it has run; each
 * engine's latest rebuild cost spread over its laps until the next freshen (the life limit, or the laps
 * so far); other parts with a cost and a life in laps by cost ÷ life.
 */
export function wearFor(data, setups, usage = {}) {
  const ids = new Set(setups.map((s) => s.id));
  const lines = [];
  for (const [id, used] of Object.entries(usage)) {
    const here = used.filter((s) => ids.has(s.id));
    if (!here.length) continue;
    const item = data.byId[id];
    if (!item) continue;
    const v = vals(item);
    const laps = lapsOf(here);
    if (!laps) continue;
    if (item.type === 'tire') {
      const cost = num(v.cost);
      const total = Math.max(lapsOf(used), num(v.laps), laps);
      if (cost && total) lines.push({ kind: 'Tyres', id, label: v.name || 'Tyre', amount: (cost * laps) / total, note: `${laps} of ${total} laps` });
      continue;
    }
    if (v.category === 'Engine') {
      const date = eventDate(data, here[0]);
      const builds = data.list('engine_build').filter((b) => vals(b).engine === id && num(vals(b).rebuild_cost) && (vals(b).date || '') <= (date || '9999'))
        .sort((a, b) => String(vals(b).date || '').localeCompare(String(vals(a).date || '')));
      const build = builds[0];
      if (!build) continue;
      const since = used.filter((s) => eventDate(data, s) >= (vals(build).date || ''));
      const life = v.life_unit === 'Laps' && num(v.life_limit) ? num(v.life_limit) : Math.max(lapsOf(since), laps);
      lines.push({ kind: 'Engine', id, label: v.name || 'Engine', amount: (num(vals(build).rebuild_cost) * laps) / life, note: `${laps} laps of a ${life}-lap freshen` });
      continue;
    }
    if (num(v.cost) && v.life_unit === 'Laps' && num(v.life_limit)) {
      lines.push({ kind: 'Parts wear', id, label: v.name || 'Part', amount: (num(v.cost) * laps) / num(v.life_limit), note: `${laps} of ${num(v.life_limit)} laps` });
    }
  }
  return lines.map((l) => ({ ...l, amount: round(l.amount) }));
}

/** Profit and loss for one event. */
export function eventPnl(data, eventId, { settings = {}, usage = {} } = {}) {
  const expenses = data.list('expense').filter((e) => vals(e).event === eventId);
  const income = data.list('income').filter((i) => vals(i).event === eventId);
  const setups = data.list('setup').filter((s) => vals(s).event === eventId);
  const costs = {};
  for (const e of expenses) { const k = vals(e).category || 'Other'; costs[k] = (costs[k] || 0) + baseAmount(e, settings); }
  // parts orders received for this event that haven't become expenses yet
  const orders = data.list('purchase').filter((p) => vals(p).event === eventId && ['Ordered', 'Received'].includes(vals(p).status) && !vals(p).expense);
  if (orders.length) costs['Parts orders (not yet an expense)'] = orders.reduce((a, p) => a + purchaseTotal(p), 0);
  const wear = wearFor(data, setups, usage);
  const earned = {};
  for (const i of income) { const k = vals(i).kind || 'Other'; earned[k] = (earned[k] || 0) + baseAmount(i, settings); }
  const totalCosts = Object.values(costs).reduce((a, x) => a + x, 0);
  const totalWear = wear.reduce((a, x) => a + x.amount, 0);
  const totalIncome = Object.values(earned).reduce((a, x) => a + x, 0);
  return {
    currency: regionOf(settings).currency,
    costs: Object.entries(costs).map(([k, x]) => ({ label: k, amount: round(x) })).sort((a, b) => b.amount - a.amount),
    wear, income: Object.entries(earned).map(([k, x]) => ({ label: k, amount: round(x) })).sort((a, b) => b.amount - a.amount),
    totalCosts: round(totalCosts), totalWear: round(totalWear), totalIncome: round(totalIncome),
    net: round(totalIncome - totalCosts - totalWear), laps: lapsOf(setups), count: expenses.length + income.length,
  };
}

/** Season (or any period) totals by category, against the budget when one covers the period. */
export function periodPnl(data, { from = '', to = '', settings = {} } = {}) {
  const inRange = (r) => { const d = vals(r).date || ''; return (!from || d >= from) && (!to || d <= to); };
  const spent = {}; const earned = {};
  for (const e of data.list('expense').filter(inRange)) { const k = vals(e).category || 'Other'; spent[k] = (spent[k] || 0) + baseAmount(e, settings); }
  for (const i of data.list('income').filter(inRange)) { const k = vals(i).kind || 'Other'; earned[k] = (earned[k] || 0) + baseAmount(i, settings); }
  const budget = budgetFor(data, from || to);
  const planned = {};
  for (const l of Array.isArray(vals(budget).lines) ? vals(budget).lines : []) if (l.category) planned[l.category] = (planned[l.category] || 0) + num(l.amount);
  const cats = [...new Set([...Object.keys(spent), ...Object.keys(planned)])].sort();
  const rows = cats.map((c) => ({ category: c, spent: round(spent[c] || 0), budget: planned[c] ? round(planned[c]) : null,
    pct: planned[c] ? Math.round(((spent[c] || 0) / planned[c]) * 100) : null }));
  const totalSpent = round(Object.values(spent).reduce((a, x) => a + x, 0));
  const totalIncome = round(Object.values(earned).reduce((a, x) => a + x, 0));
  return { rows, income: Object.entries(earned).map(([k, x]) => ({ label: k, amount: round(x) })), totalSpent, totalIncome, net: round(totalIncome - totalSpent),
    budget, totalBudget: round(Object.values(planned).reduce((a, x) => a + x, 0)), currency: regionOf(settings).currency };
}

/** The budget whose season covers a date (or the newest). */
export function budgetFor(data, date) {
  const list = data.list('budget').slice().sort((a, b) => String(vals(b).start || '').localeCompare(String(vals(a).start || '')));
  if (!date) return list[0] || null;
  return list.find((b) => (vals(b).start || '') <= date && (!vals(b).end || vals(b).end >= date)) || null;
}

/** Categories at or over the budget's warning level, for Reminders. */
export function budgetAlerts(data, { today, settings = {} } = {}) {
  const b = budgetFor(data, today);
  if (!b) return [];
  const pct = num(vals(b).alert_pct) || 80;
  const p = periodPnl(data, { from: vals(b).start, to: vals(b).end, settings });
  return p.rows.filter((r) => r.pct !== null && r.pct >= pct).map((r) => ({ ...r, season: vals(b).season, budgetId: b.id, threshold: pct }));
}
