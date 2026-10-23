// One accounting export, available to every team in every region. A single export layer turns the
// team's expenses and income into rows with RaceOps categories, tax codes, currencies and cost
// centres (car and event), then each connector lays them out the way that system imports them.
//
// Today every connector is a file import (CSV) — they work in every region. Direct API connections
// and enterprise systems are listed with future: true so the screen can show them as coming later;
// the row layer already carries what they'll need (entity, currency and rate, cost centres, a journal
// side for each line).
import { regionOf } from './regions.js';

export const FINANCE_CATEGORIES = [
  'Tyres', 'Fuel & oil', 'Engine', 'Parts', 'Travel', 'Accommodation', 'Entry fees', 'Licences & memberships',
  'Insurance', 'Transport', 'Workshop', 'Marketing', 'Hospitality', 'Merchandise', 'Wages & contractors', 'Other',
];
export const INCOME_KINDS = ['Prize money', 'Sponsorship', 'Engine jobs', 'Merchandise', 'Appearance money', 'Other'];

export const CONNECTORS = [
  { key: 'xero', label: 'Xero', kind: 'file', note: 'Bills and sales invoices import (CSV).' },
  { key: 'quickbooks', label: 'QuickBooks Online', kind: 'file', note: 'Expenses and sales receipts import (CSV).' },
  { key: 'myob', label: 'MYOB Business', kind: 'file', note: 'Purchases and sales import (CSV).' },
  { key: 'sage', label: 'Sage Accounting', kind: 'file', note: 'Purchase and sales invoice import (CSV).' },
  { key: 'csv', label: 'Universal CSV', kind: 'file', note: 'Every field, for any other system or a spreadsheet.' },
  // future enhancements: the export layer is ready for them (multi-entity, multi-currency, cost centres, journals)
  { key: 'netsuite', label: 'Oracle NetSuite', kind: 'enterprise', future: true },
  { key: 'dynamics', label: 'Microsoft Dynamics 365 Business Central', kind: 'enterprise', future: true },
  { key: 'intacct', label: 'Sage Intacct', kind: 'enterprise', future: true },
  { key: 'sapb1', label: 'SAP Business One', kind: 'enterprise', future: true },
  { key: 'api', label: 'Direct connection (Xero, QuickBooks, MYOB)', kind: 'api', future: true },
];
export const CONNECTOR = Object.fromEntries(CONNECTORS.map((c) => [c.key, c]));

const n = (x) => { const v = Number(String(x ?? '').replace(/,/g, '')); return Number.isFinite(v) ? v : 0; };
const r2 = (x) => Math.round(x * 100) / 100;

/** The tax code a connector expects, from the region and whether tax was charged on the line. */
export function taxCode(connector, regionKey, side, taxed) {
  const exp = side === 'expense';
  const codes = {
    xero: {
      AU: taxed ? (exp ? 'GST on Expenses' : 'GST on Income') : (exp ? 'GST Free Expenses' : 'GST Free Income'),
      NZ: taxed ? (exp ? '15% GST on Expenses' : '15% GST on Income') : 'No GST',
      UK: taxed ? (exp ? '20% (VAT on Expenses)' : '20% (VAT on Income)') : 'No VAT',
      EU: taxed ? (exp ? 'VAT on Expenses' : 'VAT on Income') : 'No VAT',
      US: taxed ? 'Tax on Purchases' : 'Tax Exempt',
    },
    myob: { AU: taxed ? 'GST' : 'FRE', NZ: taxed ? 'S' : 'Z', UK: taxed ? 'S' : 'Z', EU: taxed ? 'S' : 'Z', US: taxed ? 'T' : 'N' },
    sage: { AU: taxed ? 'T1' : 'T0', NZ: taxed ? 'T1' : 'T0', UK: taxed ? 'T1' : 'T0', EU: taxed ? 'T1' : 'T0', US: taxed ? 'T1' : 'T0' },
    quickbooks: { AU: taxed ? 'GST' : 'GST free', NZ: taxed ? 'GST' : 'No GST', UK: taxed ? '20.0% S' : 'No VAT', EU: taxed ? 'VAT' : 'No VAT', US: taxed ? 'TAX' : 'NON' },
  };
  return codes[connector]?.[regionKey] || (taxed ? 'TAX' : 'NOTAX');
}

/**
 * The export rows: one per expense or income record (in the period, optionally only those not yet
 * exported). Amounts are as entered (tax inclusive) in the record's currency, with the rate to the
 * team's currency and the converted amount, so any connector — or a future journal API — can use them.
 */
export function exportRows(data, { settings = {}, from = '', to = '', accounts = {} } = {}) {
  const region = regionOf(settings);
  const out = [];
  for (const side of ['expense', 'income']) {
    for (const r of data.list(side)) {
      const vals = r.data.values || {};
      const date = vals.date || '';
      if ((from && date < from) || (to && date > to)) continue;
      const cur = vals.currency || region.currency;
      const rate = cur === region.currency ? 1 : n(vals.rate) || 1;
      const amount = n(vals.amount);
      const tax = vals.tax_amount !== undefined && vals.tax_amount !== '' ? n(vals.tax_amount) : 0;
      const category = side === 'expense' ? vals.category || 'Other' : vals.kind || 'Other';
      const ev = data.byId[vals.event];
      const car = data.byId[vals.car] || (ev && data.byId[ev.data?.values?.car]);
      out.push({
        id: r.id, side, date, due: vals.due_date || '', party: vals.supplier_name || vals.payer || data.byId[vals.supplier]?.data?.values?.name || '',
        reference: vals.reference || '', description: vals.description || category, category, account: accounts[category] || '',
        currency: cur, rate, amount: r2(amount), tax: r2(tax), net: r2(amount - tax), base_amount: r2(amount * rate),
        business_no: vals.business_no || '', taxed: tax > 0, event: ev ? ev.data.values.name || '' : '', car: car ? `#${car.data.values.number || ''}` : '',
        paid: !!vals.paid, entity: settings.entity_name || '', exported: vals.exported || '',
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const csvCell = (x) => { const s = String(x ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (head, rows) => [head.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');

/** The file a connector imports: { filename, text }. */
export function buildExport(connector, rows, settings = {}) {
  const region = regionOf(settings);
  const code = (row) => taxCode(connector, region.key, row.side, row.taxed);
  const stamp = new Date().toISOString().slice(0, 10);
  switch (connector) {
    case 'xero':
      return { filename: `xero-${stamp}.csv`, text: csv(
        ['*ContactName', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate', 'Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType', 'TrackingName1', 'TrackingOption1', 'Currency', 'Type'],
        rows.map((x) => [x.party || 'Unknown', x.reference || x.id.slice(0, 8), x.event, x.date, x.due || x.date, x.description, 1, x.amount, x.account, code(x), x.car ? 'Car' : '', x.car, x.currency, x.side === 'expense' ? 'Bill' : 'Sales invoice'])) };
    case 'quickbooks':
      return { filename: `quickbooks-${stamp}.csv`, text: csv(
        ['Date', 'Type', 'Payee', 'Ref no', 'Category', 'Description', 'Amount', 'Tax code', 'Tax amount', 'Class', 'Location', 'Currency', 'Exchange rate'],
        rows.map((x) => [x.date, x.side === 'expense' ? 'Expense' : 'Sales receipt', x.party, x.reference, x.account || x.category, x.description, x.side === 'expense' ? -x.amount : x.amount, code(x), x.tax, x.car, x.event, x.currency, x.rate])) };
    case 'myob':
      return { filename: `myob-${stamp}.csv`, text: csv(
        ['Co./Last Name', 'Date', 'Supplier/Customer Invoice No.', 'Description', 'Account Number', 'Amount', 'Tax Code', 'Tax Amount', 'Job', 'Currency Code', 'Exchange Rate', 'Sale/Purchase'],
        rows.map((x) => [x.party, x.date, x.reference, x.description, x.account, x.amount, code(x), x.tax, x.event, x.currency, x.rate, x.side === 'expense' ? 'Purchase' : 'Sale'])) };
    case 'sage':
      return { filename: `sage-${stamp}.csv`, text: csv(
        ['Type', 'Account Reference', 'Nominal A/C Ref', 'Date', 'Reference', 'Details', 'Net Amount', 'Tax Code', 'Tax Amount', 'Exchange Rate', 'Department'],
        rows.map((x) => [x.side === 'expense' ? 'PI' : 'SI', x.party, x.account, x.date, x.reference, x.description, x.net, code(x), x.tax, x.rate, x.car])) };
    default:
      return { filename: `raceops-finance-${stamp}.csv`, text: csv(
        ['Type', 'Date', 'Due', 'Party', 'Business number', 'Reference', 'Description', 'Category', 'Account', 'Currency', 'Amount (incl tax)', 'Tax', 'Net', 'Rate to team currency', `Amount (${region.currency})`, 'Event', 'Car', 'Paid', 'Entity', 'RaceOps id'],
        rows.map((x) => [x.side, x.date, x.due, x.party, x.business_no, x.reference, x.description, x.category, x.account, x.currency, x.amount, x.tax, x.net, x.rate, x.base_amount, x.event, x.car, x.paid ? 'yes' : 'no', x.entity, x.id])) };
  }
}
