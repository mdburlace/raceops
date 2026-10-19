// Engine shop: team types, job statuses, shop settings and job totals (parts & labour).
// Shared by the server (validation) and the app (screens, totals, printouts).

export const TEAM_TYPES = {
  race: { label: 'Race team', blurb: 'Runs its own car(s): events, setups, workshop and engines.' },
  engine_shop: { label: 'Engine shop', blurb: 'Builds and services engines for customers: jobs, customers, build sheets and dyno.' },
  both: { label: 'Race team & engine shop', blurb: 'Races its own car and also builds engines for customers.' },
};
export const teamType = (m) => (TEAM_TYPES[m?.settings?.team_type] ? m.settings.team_type : 'race');
export const isShop = (m) => teamType(m) !== 'race';
export const isRaceTeam = (m) => teamType(m) !== 'engine_shop';

export const JOB_STATUSES = [
  { key: 'Quote', open: true, level: 'muted' },
  { key: 'Booked in', open: true, level: 'info' },
  { key: 'In progress', open: true, level: 'info' },
  { key: 'Waiting on parts', open: true, level: 'warn' },
  { key: 'Ready for pickup', open: true, level: 'ok' },
  { key: 'Collected', open: false, level: 'muted' },
  { key: 'Cancelled', open: false, level: 'muted' },
];
export const JOB_STATUS = Object.fromEntries(JOB_STATUSES.map((s) => [s.key, s]));
export const isOpen = (status) => JOB_STATUS[status]?.open ?? true;
export const JOB_TYPES = ['Fresh build', 'Freshen / refresh', 'Repair', 'Inspection / teardown', 'Dyno test & tune', 'Parts only', 'Other'];

export const DEFAULT_SHOP = {
  labour_rate: 120, // per hour, ex tax
  tax_rate: 10, // %
  tax_label: 'GST',
  prices_include_tax: false,
  job_prefix: 'J',
  terms: '',
};
export const shopSettings = (m) => ({ ...DEFAULT_SHOP, ...(m?.settings?.shop || {}) });

/** Clean shop settings from a client. */
export function cleanShop(s = {}) {
  const n = (x, d) => { const v = Number(x); return Number.isFinite(v) && v >= 0 ? v : d; };
  return {
    labour_rate: n(s.labour_rate, DEFAULT_SHOP.labour_rate),
    tax_rate: Math.min(100, n(s.tax_rate, DEFAULT_SHOP.tax_rate)),
    tax_label: String(s.tax_label ?? DEFAULT_SHOP.tax_label).slice(0, 20),
    prices_include_tax: !!s.prices_include_tax,
    job_prefix: String(s.job_prefix ?? DEFAULT_SHOP.job_prefix).replace(/[^A-Za-z0-9-]/g, '').slice(0, 8),
    terms: String(s.terms ?? '').slice(0, 4000),
  };
}

const num = (x) => { if (x === null || x === undefined || x === '') return null; const v = parseFloat(String(x).replace(/[$,\s]/g, '')); return Number.isFinite(v) ? v : null; };
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * Totals for a job. Parts rows: { qty, unit_cost, unit_price }. Labour rows: { hours, rate }.
 * A labour row without a rate uses the shop rate. Tax applies to the total after discount.
 */
export function jobTotals(values = {}, shop = DEFAULT_SHOP) {
  const parts = (Array.isArray(values.parts) ? values.parts : []).map((p) => {
    const qty = num(p.qty) ?? (num(p.unit_price) !== null || num(p.unit_cost) !== null ? 1 : 0);
    return { qty, cost: (num(p.unit_cost) ?? 0) * qty, sell: (num(p.unit_price) ?? num(p.unit_cost) ?? 0) * qty };
  });
  const labour = (Array.isArray(values.labour) ? values.labour : []).map((l) => {
    const hours = num(l.hours) ?? 0;
    const rate = num(l.rate) ?? num(shop.labour_rate) ?? 0;
    return { hours, rate, amount: hours * rate, defaultRate: num(l.rate) === null };
  });
  const partsCost = r2(parts.reduce((s, p) => s + p.cost, 0));
  const partsSell = r2(parts.reduce((s, p) => s + p.sell, 0));
  const hours = r2(labour.reduce((s, l) => s + l.hours, 0));
  const labourTotal = r2(labour.reduce((s, l) => s + l.amount, 0));
  const discount = r2(num(values.discount) ?? 0);
  const subtotal = r2(partsSell + labourTotal - discount);
  const taxRate = num(values.tax_rate) ?? num(shop.tax_rate) ?? 0;
  let tax; let total;
  if (shop.prices_include_tax) { total = subtotal; tax = r2(subtotal - subtotal / (1 + taxRate / 100)); } else { tax = r2(subtotal * (taxRate / 100)); total = r2(subtotal + tax); }
  return { partsCost, partsSell, partsMargin: r2(partsSell - partsCost), hours, labourTotal, discount, subtotal, taxRate, tax, total, labour, parts };
}

/** Next job number after the highest one used, e.g. J-0042 → J-0043. */
export function nextJobNo(existing = [], prefix = DEFAULT_SHOP.job_prefix) {
  let max = 0;
  for (const n of existing) { const m = String(n || '').match(/(\d+)\s*$/); if (m) max = Math.max(max, Number(m[1])); }
  return `${prefix ? `${prefix}-` : ''}${String(max + 1).padStart(4, '0')}`;
}

export const money = (x, symbol = '$') => (Number.isFinite(x) ? `${x < 0 ? '−' : ''}${symbol}${Math.abs(x).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '');
