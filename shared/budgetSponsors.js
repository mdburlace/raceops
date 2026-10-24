// Budget and sponsors, phase A (October 2026): the full race-team budget (categories in groups, an income
// budget, a contingency reserve) and a fuller sponsor record (billing contact, website and social links,
// renewal likelihood, activation notes, industry exclusivity, an interaction log, more kinds of promise and
// a status for each).
//
// The form changes are upgrades (applied once to every team's forms); the helpers run on the device and
// the server (Reminders, the sponsor page, the sponsor portal).
import { FINANCE_CATEGORIES, INCOME_KINDS, NEW_FINANCE_CATEGORIES, NEW_INCOME_KINDS } from './accounting.js';

const vals = (r) => r?.data?.values || {};

export const DELIVERABLE_STATUSES = ['Planned', 'Designed', 'Approved by sponsor', 'Deployed'];
export const NEW_DELIVERABLE_KINDS = ['Suit / helmet', 'Pit & trailer signage', 'Website', 'Newsletter', 'Social shout-out', 'PA announcement',
  'Podium / award', 'Car display'];
export const INTERACTION_KINDS = ['Meeting', 'Call', 'Email', 'Visit', 'At the track', 'Other'];
export const RENEWAL_LIKELIHOOD = ['Yes', 'Maybe', 'No', 'Not asked yet'];
const LIVE = ['Prospect', 'Pitched', 'Signed', 'Renewal due'];

// ---------------------------------------------------------------- form upgrades
export const BUDGET_SPONSOR_UPGRADES = [
  // expenses and income: the rest of a race team's categories and kinds
  { target: 'expense', key: 'category', addOptions: NEW_FINANCE_CATEGORIES },
  { target: 'expense', section: 'expense', after: 'category', field: { key: 'from_contingency', label: 'Paid from the contingency reserve', type: 'checkbox', core: true,
    help: 'Crash damage or a mechanical failure the reserve is for. Crash & failure repairs count anyway.' } },
  { target: 'income', key: 'kind', addOptions: NEW_INCOME_KINDS },
  // the season budget: new categories, a contingency reserve and an income budget
  { target: 'budget', key: 'lines', column: 'category', addColumnOptions: NEW_FINANCE_CATEGORIES },
  { target: 'budget', section: 'budget', after: 'alert_pct', field: { key: 'contingency_pct', label: 'Contingency reserve', type: 'number', unit: '%', core: true,
    placeholder: 'e.g. 15', help: 'Set aside for crash repairs and mechanical failures, as a share of the rest of the budget. 10–20% is usual.' } },
  { target: 'budget', before: 'notes', insertSection: { id: 'income_lines', title: 'Income budget', fields: [
    { key: 'income_lines', label: 'Income by kind', type: 'table', core: true, money: true,
      columns: [{ key: 'kind', label: 'Kind', options: INCOME_KINDS }, { key: 'amount', label: 'Expected' }, { key: 'note', label: 'Note', text: true }],
      defaultRows: [{ kind: 'Sponsorship' }, { kind: 'Prize money' }] },
  ] } },
  // the sponsor: billing contact, links, industry and exclusivity, renewal, activation, the interaction log
  { target: 'sponsor', section: 'deal', after: 'contact', field: { key: 'billing_contact', label: 'Billing contact', type: 'contact', help: 'Who to send invoices to (accounts payable), if not the main contact.' } },
  { target: 'sponsor', section: 'deal', after: 'billing_contact', field: { key: 'links', label: 'Website & social', type: 'textarea', placeholder: 'Website, Instagram, Facebook, LinkedIn — one per line' } },
  { target: 'sponsor', section: 'deal', after: 'level', field: { key: 'industry', label: 'Industry', type: 'text', suggest: true, placeholder: 'e.g. Tyres, Fuel, Fast food' } },
  { target: 'sponsor', before: 'pitch', insertSection: { id: 'relationship', title: 'Relationship', fields: [
    { key: 'renewal_likelihood', label: 'Open to renewing?', type: 'select', options: RENEWAL_LIKELIHOOD, core: true },
    { key: 'renewal_discussed', label: 'Renewal last discussed', type: 'date' },
    { key: 'exclusive', label: 'Exclusive in their industry', type: 'checkbox', core: true, help: 'No other sponsor in the same industry while this deal runs.' },
    { key: 'exclusivity', label: 'Exclusivity terms', type: 'textarea', showIf: 'exclusive=true', placeholder: 'e.g. Exclusive fuel sponsor; no other fuel or oil brands on the car or trailer' },
    { key: 'activation', label: 'Activation notes', type: 'textarea', placeholder: 'How they want to engage, e.g. a coupon code for fans, a car display at their store' },
    { key: 'interactions', label: 'Interaction history', type: 'table', core: true,
      columns: [{ key: 'date', label: 'Date', date: true }, { key: 'kind', label: 'How', options: INTERACTION_KINDS }, { key: 'who', label: 'Who', member: true },
        { key: 'note', label: 'What happened', text: true }, { key: 'follow_up', label: 'Follow up by', date: true }],
      defaultRows: [], help: 'Meetings, calls and emails. A follow-up date shows in Reminders until a later entry is added.' },
  ] } },
  // promises: more kinds, and where each one is up to
  { target: 'sponsor', key: 'deliverables', column: 'kind', addColumnOptions: NEW_DELIVERABLE_KINDS },
  { target: 'sponsor', key: 'deliverables', afterColumn: 'due', addColumn: { key: 'status', label: 'Status', options: DELIVERABLE_STATUSES } },
  { target: 'sponsor', key: 'deliverables', afterColumn: 'status', addColumn: { key: 'status_date', label: 'Status date', date: true } },
  { target: 'sponsor', key: 'deliverables', afterColumn: 'status_date', addColumn: { key: 'proof', label: 'Proof photo', ref: 'media' } },
];

// ---------------------------------------------------------------- helpers
const overlaps = (a, b) => (!vals(a).start || !vals(b).end || vals(a).start <= vals(b).end) && (!vals(b).start || !vals(a).end || vals(b).start <= vals(a).end);
const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Other sponsors this deal clashes with on exclusivity: the same industry, deals that overlap in time and
 * aren't ended, where either has industry exclusivity. [{ id, name, why }]
 */
export function exclusivityClashes(list, sponsor) {
  const me = vals(sponsor);
  if (!norm(me.industry) || me.stage === 'Ended') return [];
  return list('sponsor').filter((o) => o.id !== sponsor.id && LIVE.includes(vals(o).stage) && norm(vals(o).industry) === norm(me.industry) && (me.exclusive || vals(o).exclusive) && overlaps(sponsor, o))
    .map((o) => ({ id: o.id, name: vals(o).name || 'Sponsor', why: me.exclusive ? `${me.name || 'This sponsor'} is exclusive in ${me.industry}` : `${vals(o).name || 'They'} are exclusive in ${vals(o).industry}` }));
}

/** The follow-up still open on a sponsor: the newest entry with a follow-up date, unless a later entry was added. */
export function openFollowUp(sponsor) {
  const rows = (Array.isArray(vals(sponsor).interactions) ? vals(sponsor).interactions : []).filter((r) => r && (r.date || r.note || r.follow_up));
  if (!rows.length) return null;
  const sorted = rows.map((r, i) => ({ ...r, i })).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.i - b.i);
  const last = sorted[sorted.length - 1];
  return last.follow_up ? { date: last.follow_up, note: last.note || '', kind: last.kind || '', from: last.date || '' } : null;
}

/** The latest interaction, for lists ("Call · 12 Oct"). */
export function lastInteraction(sponsor) {
  const rows = (Array.isArray(vals(sponsor).interactions) ? vals(sponsor).interactions : []).filter((r) => r?.date);
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

// ---------------------------------------------------------------- phase B: money in and out, linked up
// Sponsor payment schedule and in-kind contributions; expenses and parts orders linked to the inventory
// item they bought; crew rates on Crew / contractor and Driver contracts; trip costs straight into Finance.
export const BUDGET_SPONSOR_UPGRADES_B = [
  { target: 'sponsor', before: 'deliverables', insertSection: { id: 'payments', title: 'Payments', fields: [
    { key: 'payments', label: 'Payment schedule', type: 'table', core: true, money: true,
      columns: [{ key: 'due', label: 'Due', date: true }, { key: 'amount', label: 'Amount' }, { key: 'invoice_no', label: 'Invoice #', text: true },
        { key: 'invoiced', label: 'Invoiced on', date: true }, { key: 'received', label: 'Received on', date: true }, { key: 'income', label: 'Income', ref: 'income' }],
      defaultRows: [], help: 'Each instalment: when it’s due, the amount and the invoice. Mark it received on the sponsor’s page to record the income.' },
  ] } },
  { target: 'sponsor', before: 'deliverables', insertSection: { id: 'in_kind', title: 'In-kind contributions', fields: [
    { key: 'in_kind', label: 'Goods and services given', type: 'table', core: true, money: true,
      columns: [{ key: 'item', label: 'What', text: true }, { key: 'qty', label: 'How many' }, { key: 'value', label: 'Fair value' },
        { key: 'category', label: 'Instead of', options: FINANCE_CATEGORIES }, { key: 'received', label: 'Received on', date: true },
        { key: 'income', label: 'Income', ref: 'income' }, { key: 'expense', label: 'Expense', ref: 'expense' }],
      defaultRows: [], help: 'E.g. 8 tyres a season, or the team shirts. Record each one in Finance from the sponsor’s page: it adds the fair value as income and as a cost, so the budget shows what the season really costs.' },
  ] } },
  // what an expense or parts order bought, in the inventory (or which item it was spent on — a service on the hauler)
  { target: 'expense', section: 'expense', after: 'car', field: { key: 'inventory_item', label: 'Inventory item', type: 'asset', core: true,
    help: 'The part, engine, vehicle or other item this paid for. Add to inventory makes a new one from the expense.' } },
  { target: 'expense', section: 'expense', after: 'inventory_item', field: { key: 'member', label: 'For (crew member)', type: 'member', core: true } },
  { target: 'purchase', section: 'approval', after: 'expense', field: { key: 'inventory_item', label: 'Inventory item', type: 'asset', core: true,
    help: 'The item in the inventory once it’s received. Add to inventory makes it from the order.' } },
  // crew rates on contracts
  { target: 'contract', section: 'contract', after: 'kind', field: { key: 'member', label: 'Team member', type: 'member', core: true, showIf: 'kind=Crew / contractor|Driver' } },
  { target: 'contract', section: 'contract', after: 'value', field: { key: 'per_diem', label: 'Per diem (each day)', type: 'number', unit: '$', money: true, core: true, showIf: 'kind=Crew / contractor|Driver' } },
  { target: 'contract', section: 'contract', after: 'per_diem', field: { key: 'pay_per_event', label: 'Pay per meeting', type: 'number', unit: '$', money: true, core: true, showIf: 'kind=Crew / contractor|Driver' } },
];

const n2 = (x) => { const v = Number(String(x ?? '').replace(/[, ]/g, '')); return Number.isFinite(v) ? v : 0; };
const r2 = (x) => Math.round(x * 100) / 100;

/** The payment schedule: { rows: [...{ i, state: received|overdue|invoiced|due|planned }], scheduled, received, outstanding, overdue }. */
export function paymentStatus(sponsor, today = '') {
  const rows = (Array.isArray(vals(sponsor).payments) ? vals(sponsor).payments : []).map((r, i) => ({ ...r, i })).filter((r) => r.due || n2(r.amount));
  const state = (r) => (r.received ? 'received' : r.due && today && r.due < today ? 'overdue' : r.invoiced ? 'invoiced' : r.due ? 'due' : 'planned');
  const out = rows.map((r) => ({ ...r, state: state(r) }));
  const sum = (f) => r2(out.filter(f).reduce((a, r) => a + n2(r.amount), 0));
  return { rows: out, scheduled: sum(() => true), received: sum((r) => r.state === 'received'), outstanding: sum((r) => r.state !== 'received'),
    overdue: sum((r) => r.state === 'overdue'), overdueCount: out.filter((r) => r.state === 'overdue').length };
}

/** In-kind contributions: { rows, total, received, recorded }. */
export function inKindStatus(sponsor) {
  const rows = (Array.isArray(vals(sponsor).in_kind) ? vals(sponsor).in_kind : []).map((r, i) => ({ ...r, i })).filter((r) => r.item || n2(r.value));
  return { rows, total: r2(rows.reduce((a, r) => a + n2(r.value), 0)), received: r2(rows.filter((r) => r.received).reduce((a, r) => a + n2(r.value), 0)),
    recorded: rows.filter((r) => r.income).length };
}

/** The income record for a received payment (the sponsor page saves it and links it to the row). */
export function paymentIncome(sponsor, row, date) {
  const v = vals(sponsor);
  return { date, kind: 'Sponsorship', description: `${v.name || 'Sponsor'}${row.invoice_no ? ` — invoice ${row.invoice_no}` : ' — payment'}`, payer: v.name || '', sponsor: sponsor.id,
    amount: String(n2(row.amount)), reference: row.invoice_no || '', currency: v.currency || '', paid: true };
}

/** In kind, in Finance: the fair value as income and the same as a cost, so they cancel out but both show. */
export function inKindRecords(sponsor, row, date) {
  const v = vals(sponsor); const what = `${row.item || 'Goods'}${n2(row.qty) > 1 ? ` × ${n2(row.qty)}` : ''}`;
  const common = { date: row.received || date, amount: String(n2(row.value)), currency: v.currency || '', paid: true };
  return {
    income: { ...common, kind: 'In-kind sponsorship', description: `In kind from ${v.name || 'sponsor'}: ${what}`, payer: v.name || '', sponsor: sponsor.id },
    expense: { ...common, category: row.category || 'Other', description: `In kind from ${v.name || 'sponsor'}: ${what}`, supplier_name: v.name || '', notes: 'Given in kind by a sponsor — matches the in-kind income.' },
  };
}

/**
 * Crew costs for an event: for each person on the crew list with a Crew / contractor or Driver contract that
 * covers the event's date and has rates — per diem × days, and pay per meeting. Skips anything already
 * recorded (an expense for the event, the person and the category). [{ member, contract, category, amount, days, description }]
 */
export function crewCosts(list, event, days) {
  const ev = vals(event); const date = ev.date || '';
  const crew = (Array.isArray(ev.crew) ? ev.crew : []).filter((r) => r.member);
  const have = list('expense').filter((e) => vals(e).event === event.id);
  const out = [];
  for (const m of [...new Set(crew.map((r) => r.member))]) {
    const c = list('contract').find((x) => vals(x).member === m && ['Crew / contractor', 'Driver'].includes(vals(x).kind)
      && (!vals(x).start || !date || vals(x).start <= date) && (!vals(x).end || !date || vals(x).end >= date));
    if (!c) continue;
    const add = (category, amount, what) => {
      if (!amount || have.some((e) => vals(e).member === m && vals(e).category === category)) return;
      out.push({ member: m, contract: c.id, category, amount: r2(amount), days, description: what, currency: vals(c).currency || '' });
    };
    add('Per diems & catering', n2(vals(c).per_diem) * Math.max(1, days || 1), `Per diem × ${Math.max(1, days || 1)} day${Math.max(1, days || 1) === 1 ? '' : 's'}`);
    add('Wages & contractors', n2(vals(c).pay_per_event), 'Pay for the meeting');
  }
  return out;
}

/** Trip costs: fuel stops and tolls, and whether the expense recorded for them still matches. */
export function tripCosts(trip, list) {
  const v = vals(trip);
  const fuel = (Array.isArray(v.fuel_stops) ? v.fuel_stops : []).reduce((a, r) => a + n2(r.cost), 0);
  const total = r2(fuel + n2(v.tolls));
  const exp = v.expense ? list('expense').find((e) => e.id === v.expense) : null;
  return { fuel: r2(fuel), tolls: r2(n2(v.tolls)), total, expense: exp, matches: !!exp && Math.abs(n2(vals(exp).amount) - total) < 0.005 };
}
