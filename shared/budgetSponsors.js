// Budget and sponsors, phase A (October 2026): the full race-team budget (categories in groups, an income
// budget, a contingency reserve) and a fuller sponsor record (billing contact, website and social links,
// renewal likelihood, activation notes, industry exclusivity, an interaction log, more kinds of promise and
// a status for each).
//
// The form changes are upgrades (applied once to every team's forms); the helpers run on the device and
// the server (Reminders, the sponsor page, the sponsor portal).
import { INCOME_KINDS, NEW_FINANCE_CATEGORIES, NEW_INCOME_KINDS } from './accounting.js';

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
