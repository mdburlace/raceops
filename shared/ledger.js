// Phase C of the team budget: towards a ledger, worked out on the device from the records the team keeps.
//  - Depreciation and disposal: an asset's book value (straight line over years, or by laps run), the
//    depreciation in a period, and the gain or loss when it's sold, scrapped or returned.
//  - Season forecast: spent so far + parts on order + the remaining meetings × what a meeting has cost so
//    far, by category, against the budget — and the income side the same way.
//  - Receivables and payables: what sponsors and others owe the team and what the team owes, by age.
//  - Cash flow: money in and out by week for the next few weeks, from what's due and the meetings coming up.
// Amounts are in the team's currency (baseAmount). Nothing here is stored; nothing is sent anywhere.
import { baseAmount, purchaseTotal } from './finance.js';
import { regionOf } from './regions.js';
import { paymentStatus } from './budgetSponsors.js';
import { eventDayList } from './calendar.js';

const vals = (r) => r?.data?.values || {};
const num = (x) => { const v = Number(String(x ?? '').replace(/[, ]/g, '')); return Number.isFinite(v) ? v : 0; };
const round = (x) => Math.round(x * 100) / 100;
const DAY = 86400000;
const toDays = (d) => { const [y, m, dd] = String(d || '').split('-').map(Number); return y ? Date.UTC(y, m - 1, dd) / DAY : null; };
const fromDays = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (d, n) => fromDays(toDays(d) + n);

export const DEPRECIATION_METHODS = ['None', 'Straight line', 'Per lap'];
export const DISPOSALS = ['Sold', 'Scrapped', 'Returned', 'Written off'];
export const AGE_BUCKETS = ['Not due', '1–30 days', '31–60 days', '61–90 days', 'Over 90 days'];

// ---------------------------------------------------------------- form upgrades
export const LEDGER_UPGRADES = [
  { target: 'asset', before: 'life', insertSection: { id: 'value', title: 'Value & depreciation', fields: [
    { key: 'depreciation', label: 'Depreciation', type: 'select', options: DEPRECIATION_METHODS, core: true,
      help: 'How its value runs down: evenly over the years you expect to use it, or by the laps it runs against its life limit.' },
    { key: 'useful_life', label: 'Useful life', type: 'number', unit: 'years', core: true, showIf: 'depreciation=Straight line' },
    { key: 'residual', label: 'Value at the end of its life', type: 'number', unit: '$', money: true, core: true, showIf: 'depreciation=Straight line|Per lap',
      help: 'What you expect to get for it at the end (resale or scrap). Leave blank for nothing.' },
    { key: 'disposed_on', label: 'Sold or scrapped on', type: 'date', core: true },
    { key: 'disposal', label: 'How it went', type: 'select', options: DISPOSALS, core: true, showIf: 'disposed_on!=' },
    { key: 'disposal_value', label: 'Sale or scrap value', type: 'number', unit: '$', money: true, core: true, showIf: 'disposed_on!=' },
  ] } },
  { target: 'budget', section: 'budget', after: 'contingency_pct', field: { key: 'cash_on_hand', label: 'Cash in the bank', type: 'number', unit: '$', money: true, core: true,
    help: 'Optional. The cash flow on Finance → Forecast starts from it.' } },
  { target: 'budget', section: 'budget', after: 'cash_on_hand', field: { key: 'cash_date', label: 'Cash as of', type: 'date', core: true, showIf: 'cash_on_hand!=' } },
];

// ---------------------------------------------------------------- depreciation and disposal
/** Laps an asset ran up to a date (its setup sheets, by the event's date) plus any laps before tracking. */
function lapsTo(data, setups, asOf) {
  const dateOf = (s) => vals(data.byId[vals(s).event]).date || '';
  return (setups || []).filter((s) => !asOf || (dateOf(s) && dateOf(s) <= asOf)).reduce((a, s) => a + num(vals(s).laps), 0);
}

/**
 * One asset's value at a date: { method, cost, residual, accumulated, book, disposed, gain, perYear }.
 * `setups` are the setup sheets that used it (setupsByAsset) — for depreciation by laps.
 */
export function assetValue(data, asset, asOf, setups = []) {
  const v = vals(asset);
  const method = DEPRECIATION_METHODS.includes(v.depreciation) ? v.depreciation : 'None';
  const cost = num(v.cost); const residual = Math.min(num(v.residual), cost);
  const depreciable = Math.max(0, cost - residual);
  const disposedOn = v.disposed_on || '';
  const accumulatedAt = (d) => {
    if (!d || method === 'None' || !depreciable) return 0;
    const end = disposedOn && disposedOn < d ? disposedOn : d;
    if (method === 'Straight line') {
      const years = num(v.useful_life); const start = toDays(v.purchase_date);
      if (!years || start === null || toDays(end) < start) return 0;
      return Math.min(depreciable, depreciable * (toDays(end) - start + 1) / (years * 365.25));
    }
    const limit = v.life_unit === 'Laps' ? num(v.life_limit) : 0;
    if (!limit) return 0;
    return Math.min(depreciable, depreciable * (lapsTo(data, setups, end) + num(v.usage_offset)) / limit);
  };
  const accumulated = round(accumulatedAt(asOf));
  const disposed = !!disposedOn && (!asOf || disposedOn <= asOf);
  const bookAtDisposal = disposedOn ? round(cost - accumulatedAt(disposedOn)) : null;
  return {
    method, cost: round(cost), residual: round(residual), accumulated, accumulatedAt,
    book: disposed ? 0 : round(cost - accumulated), disposed, disposedOn, disposal: v.disposal || '', disposalValue: round(num(v.disposal_value)),
    bookAtDisposal, gain: disposed ? round(num(v.disposal_value) - bookAtDisposal) : null,
    perYear: method === 'Straight line' && num(v.useful_life) ? round(depreciable / num(v.useful_life)) : null,
    perLap: method === 'Per lap' && v.life_unit === 'Laps' && num(v.life_limit) ? round(depreciable / num(v.life_limit)) : null,
  };
}

/**
 * The asset register: every asset that depreciates or was disposed of, with its value today, the depreciation
 * in a period, and disposals in the period. `usage` is setupsByAsset(data).
 */
export function assetRegister(data, { asOf, from = '', to = '', usage = {} } = {}) {
  const rows = [];
  for (const a of data.list('asset')) {
    const v = vals(a);
    const hasMethod = DEPRECIATION_METHODS.includes(v.depreciation) && v.depreciation !== 'None';
    if (!hasMethod && !v.disposed_on) continue;
    const val = assetValue(data, a, asOf, usage[a.id] || []);
    const pEnd = to && asOf && to > asOf ? asOf : to || asOf;
    const period = from || to ? round(val.accumulatedAt(pEnd) - (from ? val.accumulatedAt(addDays(from, -1)) : 0)) : null;
    const disposedInPeriod = !!val.disposedOn && (!from || val.disposedOn >= from) && (!to || val.disposedOn <= to);
    rows.push({ id: a.id, name: v.name || 'Asset', category: v.category || '', ...val, period, disposedInPeriod });
  }
  rows.sort((x, y) => Number(x.disposed) - Number(y.disposed) || y.book - x.book);
  const sum = (f) => round(rows.reduce((t, r) => t + (f(r) || 0), 0));
  return { rows, cost: sum((r) => (r.disposed ? 0 : r.cost)), book: sum((r) => r.book), period: sum((r) => r.period),
    gain: sum((r) => (r.disposedInPeriod ? r.gain : 0)), proceeds: sum((r) => (r.disposedInPeriod ? r.disposalValue : 0)) };
}

// ---------------------------------------------------------------- season forecast
const going = (e) => !['Not going'].includes(vals(e).intent) && !/cancel/i.test(vals(e).outcome || '');

/**
 * The season forecast for a budget: by category, spent + on order + remaining meetings × the average a meeting
 * has cost so far (from expenses tagged to past meetings), against the budget; income the same way.
 */
export function seasonForecast(data, budget, { today, settings = {} } = {}) {
  if (!budget) return null;
  const from = vals(budget).start || ''; const to = vals(budget).end || '';
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const events = data.list('event').filter((e) => inRange(vals(e).date || '') && going(e));
  const past = events.filter((e) => (vals(e).date || '') <= today);
  const planned = events.filter((e) => (vals(e).date || '') > today && (vals(e).intent || 'Planned') !== 'Tentative');
  const tentative = events.filter((e) => (vals(e).date || '') > today && vals(e).intent === 'Tentative');
  const expenses = data.list('expense').filter((e) => inRange(vals(e).date || ''));
  const spent = {}; const perEventTotal = {};
  for (const e of expenses) { const c = vals(e).category || 'Other'; spent[c] = (spent[c] || 0) + baseAmount(e, settings); }
  const pastIds = new Set(past.map((e) => e.id));
  const costedPast = past.filter((ev) => expenses.some((x) => vals(x).event === ev.id));
  for (const e of expenses.filter((x) => pastIds.has(vals(x).event))) { const c = vals(e).category || 'Other'; perEventTotal[c] = (perEventTotal[c] || 0) + baseAmount(e, settings); }
  const n = costedPast.length;
  const committed = data.list('purchase').filter((p) => ['Approved', 'Ordered', 'Received'].includes(vals(p).status) && !vals(p).expense)
    .reduce((t, p) => t + purchaseTotal(p), 0);
  const planned$ = {};
  for (const l of Array.isArray(vals(budget).lines) ? vals(budget).lines : []) if (l.category) planned$[l.category] = (planned$[l.category] || 0) + num(l.amount);
  const cats = [...new Set([...Object.keys(spent), ...Object.keys(planned$), ...Object.keys(perEventTotal), ...(committed ? ['Parts'] : [])])].sort();
  const rows = cats.map((c) => {
    const per = n ? (perEventTotal[c] || 0) / n : 0;
    const com = c === 'Parts' ? committed : 0;
    const f = (spent[c] || 0) + com + per * planned.length;
    return { category: c, spent: round(spent[c] || 0), committed: round(com), perEvent: round(per), forecast: round(f), budget: planned$[c] ? round(planned$[c]) : null,
      diff: planned$[c] ? round(planned$[c] - f) : null };
  });
  const perEvent = round(Object.values(perEventTotal).reduce((t, x) => t + x, 0) / (n || 1));
  const totalForecast = round(rows.reduce((t, r) => t + r.forecast, 0));
  const totalBudget = round(Object.values(planned$).reduce((t, x) => t + x, 0));
  // income: received + still to come (unreceived income, sponsor instalments) + prize money per meeting × remaining meetings
  const income = data.list('income').filter((i) => inRange(vals(i).date || ''));
  const received = income.filter((i) => vals(i).paid !== false).reduce((t, i) => t + baseAmount(i, settings), 0);
  const toCome = income.filter((i) => vals(i).paid === false).reduce((t, i) => t + baseAmount(i, settings), 0);
  const instalments = data.list('sponsor').filter((s) => vals(s).stage !== 'Ended')
    .flatMap((s) => paymentStatus(s, today).rows.filter((r) => r.state !== 'received' && (!r.due || inRange(r.due))).map((r) => num(r.amount))).reduce((t, x) => t + x, 0);
  const prizes = income.filter((i) => pastIds.has(vals(i).event) && ['Prize money', 'Appearance money'].includes(vals(i).kind)).reduce((t, i) => t + baseAmount(i, settings), 0);
  const prizePer = n ? prizes / n : (past.length ? prizes / past.length : 0);
  const incomeForecast = round(received + toCome + instalments + prizePer * planned.length);
  const expected = (Array.isArray(vals(budget).income_lines) ? vals(budget).income_lines : []).reduce((t, l) => t + num(l.amount), 0);
  return {
    from, to, rows, perEvent, costedPast: n, pastEvents: past.length, remaining: planned.length, tentative: tentative.length,
    tentativeCost: round(perEvent * tentative.length), committed: round(committed),
    totalSpent: round(Object.values(spent).reduce((t, x) => t + x, 0)), totalForecast, totalBudget, overBy: totalBudget ? round(totalForecast - totalBudget) : null,
    income: { received: round(received), toCome: round(toCome), instalments: round(instalments), prizePer: round(prizePer), forecast: incomeForecast, budget: round(expected) },
    net: round(incomeForecast - totalForecast), currency: regionOf(settings).currency,
  };
}

// ---------------------------------------------------------------- receivables and payables
export function ageOf(due, today) {
  if (!due) return AGE_BUCKETS[0];
  const late = toDays(today) - toDays(due);
  if (late <= 0) return AGE_BUCKETS[0];
  return late <= 30 ? AGE_BUCKETS[1] : late <= 60 ? AGE_BUCKETS[2] : late <= 90 ? AGE_BUCKETS[3] : AGE_BUCKETS[4];
}

/**
 * What's owed to the team (receivables) and what the team owes (payables), each line with its due date,
 * days late and age bucket, plus totals by bucket. Parts orders on order but not yet billed are listed apart.
 */
export function owed(data, { today, settings = {} } = {}) {
  const line = (o) => ({ ...o, amount: round(o.amount), late: o.due ? Math.max(0, toDays(today) - toDays(o.due)) : 0, age: ageOf(o.due, today) });
  const receivables = [
    ...data.list('sponsor').flatMap((s) => paymentStatus(s, today).rows.filter((r) => r.state !== 'received')
      .map((r) => line({ kind: 'Sponsor', who: vals(s).name || 'Sponsor', what: r.invoice_no ? `Invoice ${r.invoice_no}` : 'Instalment', due: r.due || '', amount: num(r.amount), link: `/partners/sponsors/${s.id}`, invoiced: !!r.invoiced }))),
    ...data.list('income').filter((i) => vals(i).paid === false)
      .map((i) => line({ kind: vals(i).kind || 'Income', who: vals(i).payer || '', what: vals(i).description || vals(i).kind || 'Income', due: vals(i).date || '', amount: baseAmount(i, settings), link: `/r/income/${i.id}` })),
  ];
  const payables = data.list('expense').filter((e) => vals(e).paid === false)
    .map((e) => line({ kind: vals(e).category || 'Expense', who: vals(e).supplier_name || '', what: vals(e).description || vals(e).category || 'Bill', due: vals(e).due_date || vals(e).date || '', amount: baseAmount(e, settings), link: `/r/expense/${e.id}` }));
  const onOrder = data.list('purchase').filter((p) => ['Approved', 'Ordered', 'Received'].includes(vals(p).status) && !vals(p).expense)
    .map((p) => ({ what: vals(p).item || 'Parts order', status: vals(p).status, amount: round(purchaseTotal(p)), link: `/r/purchase/${p.id}` }));
  const byAge = (list) => Object.fromEntries(AGE_BUCKETS.map((b) => [b, round(list.filter((x) => x.age === b).reduce((t, x) => t + x.amount, 0))]));
  const sortLate = (a, b) => b.late - a.late || String(a.due).localeCompare(String(b.due));
  return {
    receivables: receivables.sort(sortLate), payables: payables.sort(sortLate), onOrder,
    receivableByAge: byAge(receivables), payableByAge: byAge(payables),
    totalReceivable: round(receivables.reduce((t, x) => t + x.amount, 0)), totalPayable: round(payables.reduce((t, x) => t + x.amount, 0)),
    totalOnOrder: round(onOrder.reduce((t, x) => t + x.amount, 0)), currency: regionOf(settings).currency,
  };
}

// ---------------------------------------------------------------- cash flow
/**
 * Money in and out by week for the next `weeks` weeks (anything overdue counts in the first week): what's
 * owed both ways by due date, plus an estimate for each planned meeting (the forecast's cost per meeting).
 * With cash in the bank on the budget, a running balance.
 */
export function cashFlow(data, budget, { today, weeks = 8, settings = {} } = {}) {
  const o = owed(data, { today, settings });
  const f = seasonForecast(data, budget, { today, settings });
  const start = toDays(today);
  const weekOf = (d) => { if (!d) return 0; const k = Math.floor((toDays(d) - start) / 7); return k < 0 ? 0 : k; };
  const rows = Array.from({ length: weeks }, (_, i) => ({ week: i, from: fromDays(start + i * 7), to: fromDays(start + i * 7 + 6), in: 0, out: 0, meetings: 0, lines: [] }));
  for (const r of o.receivables) { const k = weekOf(r.due); if (k < weeks) { rows[k].in += r.amount; rows[k].lines.push({ dir: 'in', what: `${r.who} — ${r.what}`, amount: r.amount }); } }
  for (const p of o.payables) { const k = weekOf(p.due); if (k < weeks) { rows[k].out += p.amount; rows[k].lines.push({ dir: 'out', what: `${p.what}${p.who ? ` (${p.who})` : ''}`, amount: p.amount }); } }
  if (f && f.perEvent) {
    for (const e of data.list('event').filter((x) => (vals(x).date || '') > today && going(x) && (vals(x).intent || 'Planned') !== 'Tentative')) {
      const k = weekOf(vals(e).date); if (k >= weeks) continue;
      const days = Math.max(1, eventDayList(vals(e)).filter((d) => !d.off).length);
      rows[k].out += f.perEvent; rows[k].meetings += 1; rows[k].lines.push({ dir: 'out', what: `${vals(e).name || 'Meeting'} (estimate${days > 1 ? `, ${days} days` : ''})`, amount: f.perEvent, estimate: true });
    }
  }
  const cash = budget && String(vals(budget).cash_on_hand ?? '').trim() !== '' ? num(vals(budget).cash_on_hand) : null;
  let bal = cash;
  for (const r of rows) {
    r.in = round(r.in); r.out = round(r.out); r.net = round(r.in - r.out);
    if (bal !== null) { bal = round(bal + r.net); r.balance = bal; }
  }
  return { rows, cash, cashDate: vals(budget).cash_date || '', lowest: bal === null ? null : Math.min(...rows.map((r) => r.balance)), currency: regionOf(settings).currency };
}
