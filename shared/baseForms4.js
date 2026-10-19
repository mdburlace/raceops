// Engine shop forms: customers and jobs (parts & labour), plus links from engines and build sheets.
import { JOB_STATUSES, JOB_TYPES } from './shop.js';

const t = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });

export const customerForm = {
  name: 'Customer', target: 'customer',
  sections: [
    { id: 'customer', title: 'Customer', fields: [
      t('name', 'Customer / business name', { core: true, required: true }),
      t('contact_name', 'Contact person'), t('phone', 'Phone'), t('email', 'Email'),
      t('races', 'What they race', { suggest: true, placeholder: 'e.g. 410 Sprintcar' }),
      t('account_ref', 'Account # in your accounts'), t('business_no', 'ABN / business number'),
    ] },
    { id: 'address', title: 'Address', fields: [
      t('address1', 'Address'), t('city', 'Town / suburb'), t('state', 'State'), t('postcode', 'Postcode'), t('country', 'Country', { suggest: true }),
    ] },
    { id: 'notes', title: 'Notes', fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }] },
  ],
};

export const jobForm = {
  name: 'Shop job', target: 'job',
  sections: [
    { id: 'job', title: 'Job', fields: [
      t('job_no', 'Job / work order #', { core: true, required: true }),
      { key: 'customer', label: 'Customer', type: 'ref', ref: 'customer', core: true, required: true },
      { key: 'engine', label: 'Engine', type: 'ref', ref: 'asset', category: 'Engine', core: true, help: 'The customer’s engine — add it under Customer engines (or from the customer’s page) if it’s new.' },
      { key: 'job_type', label: 'Job type', type: 'select', options: JOB_TYPES, core: true },
      { key: 'status', label: 'Status', type: 'select', options: JOB_STATUSES.map((s) => s.key), core: true, required: true },
      { key: 'assigned', label: 'Assigned to', type: 'member' },
      { key: 'date_in', label: 'Date in', type: 'date' },
      { key: 'date_promised', label: 'Promised by', type: 'date' },
      { key: 'date_out', label: 'Date collected', type: 'date' },
      { key: 'engine_laps', label: 'Laps / hours on engine when it came in', type: 'number' },
    ] },
    { id: 'work', title: 'Work', fields: [
      { key: 'request', label: 'What the customer asked for', type: 'textarea' },
      { key: 'findings', label: 'Findings', type: 'textarea' },
      { key: 'work_done', label: 'Work done', type: 'textarea' },
      { key: 'recommendations', label: 'Recommendations / next service', type: 'textarea' },
    ] },
    { id: 'parts', title: 'Parts', fields: [
      { key: 'parts', label: 'Parts used', type: 'table', core: true,
        columns: [{ key: 'part_no', label: 'Part #', text: true }, { key: 'description', label: 'Description', text: true }, { key: 'qty', label: 'Qty' },
          { key: 'unit_cost', label: 'Unit cost' }, { key: 'unit_price', label: 'Unit price' }],
        defaultRows: [{}], help: 'Cost is what you paid; price is what you charge (ex tax). Leave price blank to charge cost.' },
    ] },
    { id: 'labour', title: 'Labour', fields: [
      { key: 'labour', label: 'Labour', type: 'table', core: true,
        columns: [{ key: 'date', label: 'Date', text: true }, { key: 'tech', label: 'Who', text: true }, { key: 'description', label: 'Work', text: true },
          { key: 'hours', label: 'Hours' }, { key: 'rate', label: 'Rate / hr' }],
        defaultRows: [{}], help: 'Leave the rate blank to use the shop’s labour rate (Team → Engine shop settings).' },
    ] },
    { id: 'billing', title: 'Billing', fields: [
      { key: 'discount', label: 'Discount', type: 'number', unit: '$' },
      { key: 'tax_rate', label: 'Tax rate', type: 'number', unit: '%' },
      t('invoice_ref', 'Invoice # (in your accounts)'),
      { key: 'paid', label: 'Paid', type: 'checkbox' },
      { key: 'notes', label: 'Internal notes', type: 'textarea', help: 'Not shown on the customer’s job sheet.' },
    ] },
  ],
};

export const SHOP_FORMS = [customerForm, jobForm];

export const SHOP_UPGRADES = [
  { target: 'asset', section: 'identity', after: 'car', field: { key: 'customer', label: 'Customer (owner)', type: 'ref', ref: 'customer', showIf: 'category=Engine', help: 'For engine shops: whose engine this is.' } },
  { target: 'engine_build', section: 'build', after: 'work_order', field: { key: 'job', label: 'Shop job', type: 'ref', ref: 'job', help: 'Links this build sheet to the customer’s job.' } },
];
