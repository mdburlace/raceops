// Phase 5: team roles and the business modules — parts orders, finance, transport, partnerships and
// marketing — plus the race-night workflow added to existing forms (the setup sheet's change list and
// tyre targets, the event's crew list, the tyre work log, contact tags and vehicles as assets).
//
// Table columns can be text (text: true), numbers (default), a tick box (check: true, with stamp: true
// recording who ticked it and when), a pick-list (options: [...]), a team member (member: true) or a
// date (date: true).
import { FINANCE_CATEGORIES, INCOME_KINDS } from './accounting.js';
import { ALL_LICENCE_CLASSES, CURRENCIES } from './regions.js';

const CORNERS = ['LF', 'RF', 'LR', 'RR'];
const REARS = ['LR', 'RR'];
const t = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const n = (key, label, unit, extra = {}) => ({ key, label, type: 'number', unit, ...extra });
const d = (key, label, extra = {}) => ({ key, label, type: 'date', ...extra });
const sel = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });
const ta = (key, label, extra = {}) => ({ key, label, type: 'textarea', ...extra });
const ck = (key, label, extra = {}) => ({ key, label, type: 'check', ...extra });
const cb = (key, label, extra = {}) => ({ key, label, type: 'checkbox', ...extra });

export const PURCHASE_STATUSES = ['Requested', 'Approved', 'Ordered', 'Received', 'Declined'];
export const SPONSOR_STAGES = ['Prospect', 'Pitched', 'Signed', 'Renewal due', 'Ended'];
export const DELIVERABLE_KINDS = ['Logo on car', 'Posts per event', 'Hospitality passes', 'Appearance', 'Other'];
export const POST_STATUSES = ['Draft', 'Approved', 'Posted'];
export const CONTACT_TAGS = ['Sponsor', 'Supplier', 'Engine customer', 'Promoter', 'Hospitality guest', 'Transport driver', 'Media', 'Official'];
export const VEHICLE_TYPES = ['Hauler / truck', 'Toterhome / motorhome', 'Trailer', 'Tow vehicle', 'Other'];

// ---------------- parts orders ----------------
const purchaseForm = {
  target: 'purchase', name: 'Parts order', is_default: true,
  sections: [
    { id: 'order', title: 'Parts order', fields: [
      t('item', 'What’s needed', { core: true, required: true }),
      t('part_no', 'Part #'),
      n('qty', 'Quantity', '', { default: '1' }),
      { key: 'supplier', label: 'Supplier', type: 'ref', ref: 'supplier' },
      { key: 'car', label: 'Car', type: 'ref', ref: 'car' },
      { key: 'event', label: 'For event', type: 'ref', ref: 'event' },
      d('needed_by', 'Needed by'),
      { key: 'requested_by', label: 'Requested by', type: 'member', core: true, defaultSelf: true },
    ] },
    { id: 'cost', title: 'Cost', fields: [
      n('unit_cost', 'Unit cost', '$', { money: true }),
      n('cost', 'Total cost', '$', { money: true, help: 'Quantity × unit cost if left blank.' }),
    ] },
    { id: 'approval', title: 'Approval', fields: [
      sel('status', 'Status', PURCHASE_STATUSES, { core: true, default: 'Requested' }),
      { key: 'approved_by', label: 'Approved / declined by', type: 'member', core: true },
      d('approved_on', 'Decided on', { core: true }),
      t('order_ref', 'Order / invoice #'),
      { key: 'expense', label: 'Expense', type: 'ref', ref: 'expense', core: true },
      ta('notes', 'Notes'),
    ] },
  ],
};

// ---------------- finance ----------------
const money = (key, label, extra = {}) => n(key, label, '$', { money: true, ...extra });
const expenseForm = {
  target: 'expense', name: 'Expense', is_default: true,
  sections: [
    { id: 'expense', title: 'Expense', fields: [
      d('date', 'Date', { core: true, required: true }),
      sel('category', 'Category', FINANCE_CATEGORIES, { core: true, required: true, allowCustom: true }),
      t('description', 'Description', { core: true }),
      { key: 'supplier', label: 'Supplier', type: 'ref', ref: 'supplier' },
      t('supplier_name', 'Supplier name (on the receipt)', { suggest: true }),
      t('business_no', 'Supplier business number'),
      t('reference', 'Receipt / invoice #'),
      { key: 'event', label: 'Event', type: 'ref', ref: 'event', core: true },
      { key: 'car', label: 'Car', type: 'ref', ref: 'car' },
    ] },
    { id: 'amount', title: 'Amount', fields: [
      money('amount', 'Amount (incl. tax)', { core: true, required: true }),
      money('tax_amount', 'Tax included', { help: 'GST, VAT or sales tax in the amount. Leave blank to work it out from the team’s tax rate.' }),
      sel('currency', 'Currency', CURRENCIES, { core: true, help: 'Leave blank for the team’s currency.' }),
      n('rate', 'Rate to team currency', '', { money: true, showIf: 'currency!=', help: '1 of this currency in the team’s currency on the day (e.g. 0.65).' }),
    ] },
    { id: 'payment', title: 'Payment', fields: [
      cb('paid', 'Paid', { core: true, default: true }),
      d('due_date', 'Due by', { core: true, showIf: 'paid!=true', help: 'Bills not yet paid show in Reminders.' }),
      t('paid_by', 'Paid by / card'),
      t('exported', 'Exported to accounting', { core: true, help: 'Set when it is exported, so it isn’t exported twice.' }),
      ta('notes', 'Notes'),
    ] },
  ],
};

const incomeForm = {
  target: 'income', name: 'Income', is_default: true,
  sections: [
    { id: 'income', title: 'Income', fields: [
      d('date', 'Date', { core: true, required: true }),
      sel('kind', 'Kind', INCOME_KINDS, { core: true, required: true, allowCustom: true }),
      t('description', 'Description', { core: true }),
      t('payer', 'From (promoter, sponsor, customer)', { suggest: true }),
      { key: 'event', label: 'Event', type: 'ref', ref: 'event', core: true },
      { key: 'sponsor', label: 'Sponsor deal', type: 'ref', ref: 'sponsor', showIf: 'kind=Sponsorship' },
      { key: 'job', label: 'Shop job', type: 'ref', ref: 'job', showIf: 'kind=Engine jobs' },
      t('reference', 'Reference'),
    ] },
    { id: 'amount', title: 'Amount', fields: [
      money('amount', 'Amount (incl. tax)', { core: true, required: true }),
      money('tax_amount', 'Tax included'),
      sel('currency', 'Currency', CURRENCIES, { core: true }),
      n('rate', 'Rate to team currency', '', { money: true, showIf: 'currency!=' }),
      cb('paid', 'Received', { core: true, default: true }),
      t('exported', 'Exported to accounting', { core: true }),
      ta('notes', 'Notes'),
    ] },
  ],
};

const budgetForm = {
  target: 'budget', name: 'Season budget', is_default: true,
  sections: [
    { id: 'budget', title: 'Budget', fields: [
      t('season', 'Season', { core: true, required: true, placeholder: 'e.g. 2026-27' }),
      d('start', 'Season starts', { core: true, required: true }),
      d('end', 'Season ends', { core: true, required: true }),
      sel('currency', 'Currency', CURRENCIES),
      n('alert_pct', 'Warn me at', '%', { default: '80', help: 'A category shows in Reminders when its spend reaches this share of its budget.' }),
    ] },
    { id: 'lines', title: 'By category', fields: [
      { key: 'lines', label: 'Budget by category', type: 'table', core: true, money: true,
        columns: [{ key: 'category', label: 'Category', options: FINANCE_CATEGORIES }, { key: 'amount', label: 'Budget' }, { key: 'note', label: 'Note', text: true }],
        defaultRows: FINANCE_CATEGORIES.slice(0, 6).map((category) => ({ category })) },
    ] },
    { id: 'notes', title: 'Notes', fields: [ta('notes', 'Notes')] },
  ],
};

const contractForm = {
  target: 'contract', name: 'Contract', is_default: true,
  sections: [
    { id: 'contract', title: 'Contract', fields: [
      t('name', 'Contract', { core: true, required: true, placeholder: 'e.g. Tyre supply 2026' }),
      t('party', 'With', { core: true }),
      { key: 'contact', label: 'Contact', type: 'contact' },
      sel('kind', 'Kind', ['Sponsorship', 'Supply', 'Driver', 'Crew / contractor', 'Venue / promoter', 'Lease', 'Insurance', 'Other']),
      d('start', 'Starts'),
      d('end', 'Ends'),
      d('renewal_date', 'Renewal / notice date', { core: true, help: 'Shows in Reminders 60 days before.' }),
      money('value', 'Value'),
      sel('currency', 'Currency', CURRENCIES),
      ta('terms', 'Key terms'),
      ta('notes', 'Notes'),
    ] },
  ],
};

// ---------------- transport ----------------
const tripForm = {
  target: 'trip', name: 'Trip plan', is_default: true,
  sections: [
    { id: 'trip', title: 'Trip', fields: [
      { key: 'event', label: 'Event', type: 'ref', ref: 'event', core: true, required: true },
      { key: 'vehicle', label: 'Vehicle', type: 'asset', category: 'Vehicle', core: true },
      { key: 'trailer', label: 'Trailer', type: 'asset', category: 'Vehicle' },
      d('depart_date', 'Leave on', { core: true, required: true }),
      t('depart_time', 'Leave at', { placeholder: 'e.g. 5:30 am' }),
      t('from', 'From', { placeholder: 'Workshop' }),
      d('return_date', 'Back on'),
      n('distance', 'Distance (one way)', 'km'),
      ta('route', 'Route', { help: 'Roads, overnight stops, height or weight limits to avoid.' }),
    ] },
    { id: 'drivers', title: 'Drivers', fields: [
      { key: 'drivers', label: 'Drivers', type: 'table', core: true,
        columns: [{ key: 'member', label: 'Driver', member: true }, { key: 'licence', label: 'Licence class', text: true }, { key: 'legs', label: 'Legs / shifts', text: true }],
        defaultRows: [{}] },
    ] },
    { id: 'fuel', title: 'Fuel stops', fields: [
      { key: 'fuel_stops', label: 'Fuel stops', type: 'table',
        columns: [{ key: 'place', label: 'Where', text: true }, { key: 'planned', label: 'Planned', text: true }, { key: 'litres', label: 'Fuel' }, { key: 'cost', label: 'Cost' }, { key: 'done', label: 'Done', check: true }],
        defaultRows: [{}], help: 'Fuel cost here can be recorded as a travel expense for the event.' },
      n('tolls', 'Tolls', '$'),
    ] },
    { id: 'hours', title: 'Work & rest (planning aid)', fields: [
      { key: 'work_rest', label: 'Work and rest times', type: 'table',
        columns: [{ key: 'member', label: 'Driver', member: true }, { key: 'kind', label: 'Work / rest', options: ['Work', 'Rest'] }, { key: 'start', label: 'From', text: true }, { key: 'end', label: 'To', text: true }, { key: 'note', label: 'Note', text: true }],
        defaultRows: [{}], help: 'A planning aid only — not an official work diary, logbook, ELD or tachograph record.' },
    ] },
    { id: 'notes', title: 'Notes', fields: [ta('notes', 'Notes')] },
  ],
};

const loadListForm = {
  target: 'load_list', name: 'Load list', is_default: true,
  sections: [
    { id: 'list', title: 'Load list', fields: [
      { key: 'event', label: 'Event', type: 'ref', ref: 'event', core: true, showIf: 'is_template!=true' },
      { key: 'vehicle', label: 'Vehicle', type: 'asset', category: 'Vehicle' },
      cb('is_template', 'Use as a template', { core: true, help: 'Templates (e.g. “Sprint car race weekend”) give new load lists their standard items.' }),
      t('name', 'Template name', { core: true, showIf: 'is_template=true' }),
    ] },
    { id: 'items', title: 'Items', fields: [
      { key: 'items', label: 'Items', type: 'table', core: true,
        columns: [{ key: 'item', label: 'Item', text: true }, { key: 'qty', label: 'Qty' }, { key: 'where', label: 'Where on the trailer', text: true },
          { key: 'loaded', label: 'Loaded', check: true, stamp: true }, { key: 'at_track', label: 'At track', check: true, stamp: true }, { key: 'home', label: 'Back home', check: true, stamp: true }],
        defaultRows: [{}] },
    ] },
    { id: 'notes', title: 'Notes', fields: [ta('notes', 'Notes')] },
  ],
};

const preTripForm = {
  target: 'pre_trip', name: 'Pre-trip check', is_default: true,
  sections: [
    { id: 'when', title: 'Check', fields: [
      { key: 'vehicle', label: 'Vehicle', type: 'asset', category: 'Vehicle', core: true, required: true },
      d('date', 'Date', { core: true, required: true }),
      { key: 'done_by', label: 'Checked by', type: 'member', core: true, defaultSelf: true },
      { key: 'trip', label: 'Trip', type: 'ref', ref: 'trip' },
      n('odometer', 'Odometer', 'km'),
    ] },
    { id: 'walkaround', title: 'Walk-around', fields: [
      ck('p_tyres', 'Tyres: pressure, tread, damage (truck and trailer)'), ck('p_wheels', 'Wheel nuts tight, no rust trails'),
      ck('p_lights', 'Lights, indicators, brake lights'), ck('p_brakes', 'Brakes and trailer brake controller'),
      ck('p_coupling', 'Coupling, safety chains, breakaway'), ck('p_tiedowns', 'Cars and spares tied down'),
      ck('p_fluids', 'Oil, coolant, fuel'), ck('p_doors', 'Doors, ramps and hatches locked'),
      ck('p_docs', 'Licence, registration and permits on board'), ck('p_kit', 'Fire extinguisher, first aid, triangles'),
    ] },
    { id: 'issues', title: 'Issues', fields: [ta('issues', 'Issues found'), cb('ok_to_go', 'OK to travel', { core: true })] },
  ],
};

const licenceForm = {
  target: 'licence', name: 'Driver licence', is_default: true,
  sections: [
    { id: 'licence', title: 'Licence', fields: [
      { key: 'member', label: 'Driver', type: 'member', core: true },
      t('holder', 'Name (if not a team member)'),
      sel('class', 'Licence class', ALL_LICENCE_CLASSES, { core: true, optionsFrom: 'region.licence_classes', allowCustom: true }),
      t('country', 'Issued in'),
      d('expiry', 'Expires', { core: true, required: true }),
      d('medical_expiry', 'Medical expires'),
      t('endorsements', 'Endorsements / conditions'),
      ta('notes', 'Notes', { help: 'Don’t store the licence number unless you need it.' }),
    ] },
  ],
};

// ---------------- partnerships ----------------
const sponsorForm = {
  target: 'sponsor', name: 'Sponsor', is_default: true,
  sections: [
    { id: 'deal', title: 'Sponsor', fields: [
      t('name', 'Sponsor', { core: true, required: true }),
      { key: 'contact', label: 'Contact', type: 'contact' },
      sel('stage', 'Stage', SPONSOR_STAGES, { core: true, required: true, default: 'Prospect' }),
      sel('level', 'Level', ['Naming', 'Major', 'Associate', 'Supporter', 'In kind'], { allowCustom: true }),
      money('value', 'Deal value'),
      sel('currency', 'Currency', CURRENCIES),
      d('start', 'Starts'),
      d('end', 'Ends / renewal', { core: true, help: 'Shows in Reminders 60 days before.' }),
      { key: 'contract', label: 'Contract', type: 'ref', ref: 'contract' },
      cb('public', 'Show on our public page', { core: true }),
    ] },
    { id: 'deliverables', title: 'What we promised', fields: [
      { key: 'deliverables', label: 'Deliverables', type: 'table', core: true,
        columns: [{ key: 'kind', label: 'Kind', options: DELIVERABLE_KINDS }, { key: 'detail', label: 'Detail', text: true }, { key: 'qty', label: 'How many' },
          { key: 'per', label: 'Per', options: ['Season', 'Event'] }, { key: 'due', label: 'Due', date: true }],
        defaultRows: [{ kind: 'Logo on car' }, { kind: 'Posts per event', per: 'Event' }, { kind: 'Hospitality passes' }],
        help: 'Progress fills in from the paint schemes, results posts, media and guests that name this sponsor.' },
    ] },
    { id: 'pitch', title: 'Pitch', fields: [
      t('pitch_crowd', 'Crowd per meeting', { help: 'Used by the proposal.' }),
      t('pitch_social', 'Social followers'),
      ta('pitch_notes', 'Why us'),
      ta('notes', 'Notes'),
    ] },
  ],
};

const liveryForm = {
  target: 'livery', name: 'Paint scheme / wrap', is_default: true,
  sections: [
    { id: 'livery', title: 'Paint scheme / wrap', fields: [
      t('name', 'Version', { core: true, required: true, placeholder: 'e.g. 2026 main' }),
      { key: 'car', label: 'Car', type: 'ref', ref: 'car', core: true, required: true },
      d('from', 'On the car from', { core: true }),
      d('to', 'Until', { core: true, help: 'Leave blank while it’s on the car.' }),
      { key: 'sponsors', label: 'Sponsors on it', type: 'multiref', ref: 'sponsor', core: true },
    ] },
    { id: 'positions', title: 'Logo positions', fields: [
      { key: 'positions', label: 'Logo positions', type: 'table',
        columns: [{ key: 'position', label: 'Position', text: true }, { key: 'sponsor', label: 'Sponsor', text: true }, { key: 'size', label: 'Size', text: true }], defaultRows: [{}] },
    ] },
    { id: 'decals', title: 'Decal stock', fields: [
      { key: 'decals', label: 'Decals', type: 'table', core: true,
        columns: [{ key: 'decal', label: 'Decal', text: true }, { key: 'stock', label: 'In stock' }, { key: 'reorder', label: 'Reorder at' }, { key: 'supplier', label: 'Printer', text: true }],
        defaultRows: [{}], help: 'Shows in Reminders when stock is at or below the reorder level.' },
      ta('notes', 'Notes'),
    ] },
  ],
};

const guestForm = {
  target: 'guest', name: 'Hospitality guest', is_default: true,
  sections: [
    { id: 'guest', title: 'Guest', fields: [
      { key: 'event', label: 'Event', type: 'ref', ref: 'event', core: true, required: true },
      t('name', 'Guest', { core: true, required: true }),
      { key: 'contact', label: 'Contact', type: 'contact' },
      { key: 'sponsor', label: 'Sponsor', type: 'ref', ref: 'sponsor', core: true },
      n('passes', 'Passes', '', { core: true, default: '1' }),
      sel('pass_type', 'Pass', ['Pit', 'Grandstand', 'Hospitality', 'VIP'], { allowCustom: true }),
      cb('checked_in', 'Checked in', { core: true }),
      t('checked_in_at', 'Checked in at', { core: true }),
      cb('consent', 'Agreed to be contacted / photographed', { help: 'Record consent where privacy law needs it (for example GDPR in the UK and EU).' }),
      ta('notes', 'Notes (dietary, access)'),
    ] },
  ],
};

// ---------------- marketing ----------------
const mediaForm = {
  target: 'media', name: 'Media', is_default: true,
  sections: [
    { id: 'media', title: 'Photo or video', fields: [
      t('caption', 'Caption', { core: true, required: true }),
      d('date', 'Date', { core: true }),
      { key: 'event', label: 'Event', type: 'ref', ref: 'event', core: true },
      { key: 'car', label: 'Car', type: 'ref', ref: 'car', core: true },
      { key: 'driver', label: 'Driver', type: 'member' },
      { key: 'sponsors', label: 'Sponsors shown', type: 'multiref', ref: 'sponsor', core: true },
      t('logo_position', 'Logo position shown', { help: 'e.g. Top wing side panel — counts towards that sponsor’s logo deliverable.' }),
      t('credit', 'Photo credit'),
      cb('approved', 'OK to publish', { core: true }),
    ] },
  ],
};

const socialPostForm = {
  target: 'social_post', name: 'Results post', is_default: true,
  sections: [
    { id: 'post', title: 'Post', fields: [
      { key: 'event', label: 'Event', type: 'ref', ref: 'event', core: true, required: true },
      sel('status', 'Status', POST_STATUSES, { core: true, default: 'Draft' }),
      ta('text', 'Post', { core: true, required: true }),
      t('hashtags', 'Hashtags'),
      { key: 'sponsors', label: 'Sponsors tagged', type: 'multiref', ref: 'sponsor', core: true },
      { key: 'media', label: 'Photo', type: 'ref', ref: 'media' },
      { key: 'approved_by', label: 'Approved by', type: 'member', core: true },
      d('posted_on', 'Posted on', { core: true }),
      t('link', 'Link to the post'),
    ] },
  ],
};

const merchForm = {
  target: 'merch', name: 'Merchandise', is_default: true,
  sections: [
    { id: 'item', title: 'Item', fields: [
      t('name', 'Item', { core: true, required: true }),
      t('variant', 'Size / colour'),
      n('stock', 'In stock', '', { core: true }),
      n('reorder_at', 'Reorder at', '', { core: true, help: 'Shows in Reminders at or below this.' }),
      n('price', 'Sell price', '$'),
      money('cost', 'Cost each'),
      t('shop_link', 'Shop link (Square, Shopify…)', { help: 'Sell through your online shop; keep the stock count here.' }),
      ta('notes', 'Notes'),
    ] },
  ],
};

export const PHASE5_FORMS = [purchaseForm, expenseForm, incomeForm, budgetForm, contractForm, tripForm, loadListForm, preTripForm, licenceForm,
  sponsorForm, liveryForm, guestForm, mediaForm, socialPostForm, merchForm];

// ---------------- additions to existing forms ----------------
export const SETUP_CHANGES_SECTION = {
  id: 'changes', title: 'Change list', carry: false, fields: [
    { key: 'change_list', label: 'Changes called', type: 'table', core: true, nocopy: true,
      columns: [{ key: 'change', label: 'Change', text: true }, { key: 'was', label: 'Was', text: true }, { key: 'now', label: 'Now', text: true }, { key: 'done', label: 'Done', check: true, stamp: true }],
      defaultRows: [], help: 'The crew chief lists each change (e.g. RR rebound −1); the car chief ticks it off when it’s done on the car.' },
  ],
};
export const SETUP_TIRE_TARGETS_SECTION = {
  id: 'tire_sheet', title: 'Tyre targets', fields: [
    { key: 'target_pressure', label: 'Target pressure', type: 'corners', input: 'number', corners: CORNERS, unit: 'psi', core: true },
    n('target_stagger', 'Target stagger', 'in', { core: true }),
    { key: 'target_spacing', label: 'Target wheel spacing', type: 'corners', input: 'number', corners: REARS, unit: 'in', core: true },
  ],
};
export const EVENT_CREW_SECTION = {
  id: 'crew', title: 'Crew', carry: false, fields: [
    { key: 'crew', label: 'Who’s going', type: 'table', core: true,
      columns: [{ key: 'member', label: 'Who', member: true }, { key: 'role', label: 'Role', text: true }, { key: 'note', label: 'Note', text: true }],
      defaultRows: [], help: 'Each person sees their own race-night jobs on Home.' },
  ],
};

export const PHASE5_UPGRADES = [
  { target: 'setup', insertSection: SETUP_TIRE_TARGETS_SECTION, before: 'tires' },
  { target: 'setup', insertSection: SETUP_CHANGES_SECTION, before: 'feedback' },
  { target: 'event', insertSection: EVENT_CREW_SECTION },
  { target: 'tire', section: 'tire', after: 'notes', field: { key: 'work_log', label: 'Work log', type: 'table',
    columns: [{ key: 'date', label: 'Date', date: true }, { key: 'work', label: 'Work', options: ['Mounted', 'Cut', 'Siped', 'Grooved', 'Ground', 'Measured', 'Other'] },
      { key: 'circumference', label: 'Circumference' }, { key: 'durometer', label: 'Durometer' }, { key: 'by', label: 'By', member: true }, { key: 'note', label: 'Note', text: true }],
    defaultRows: [] } },
  { target: 'contact', section: 'person', after: 'position', field: { key: 'tags', label: 'Tags', type: 'tags', options: CONTACT_TAGS, core: true } },
  { target: 'contact', section: 'notes', after: 'notes', field: { key: 'consent', label: 'Agreed to be contacted', type: 'checkbox' } },
  { target: 'contact', section: 'notes', after: 'consent', field: { key: 'consent_date', label: 'Consent recorded on', type: 'date', showIf: 'consent=true' } },
  { target: 'asset', key: 'category', addOptions: ['Vehicle'] },
  { target: 'asset', section: 'identity', after: 'category', field: { key: 'vehicle_type', label: 'Vehicle type', type: 'select', options: VEHICLE_TYPES, showIf: 'category=Vehicle' } },
  { target: 'asset', section: 'life', after: 'expiry_date', field: { key: 'rego_due', label: 'Registration due', type: 'date', showIf: 'category=Vehicle' } },
  { target: 'asset', section: 'life', after: 'rego_due', field: { key: 'inspection_due', label: 'Inspection due', type: 'date', showIf: 'category=Vehicle' } },
  // more than one series per event or shared date, and a prefix for the round (Round, Night, Prelude…)
  { target: 'event', section: 'event', after: 'series', field: { key: 'round_prefix', label: 'Round prefix', type: 'select', options: ['Round', 'Night', 'Prelude'], allowCustom: true, core: true, showIf: 'series!=' } },
  { target: 'event', key: 'round', patch: { showIf: 'series!=' } },
  { target: 'event', section: 'event', after: 'round', field: { key: 'more_series', label: 'Also counts towards', type: 'table', core: true,
    columns: [{ key: 'series', label: 'Series', ref: 'series' }, { key: 'prefix', label: 'Prefix', options: ['Round', 'Night', 'Prelude'], list: 'round_prefixes' }, { key: 'round', label: 'Round' }],
    defaultRows: [], showIf: 'series!=', help: 'Other series running at this meeting — each with its own round.' } },
  { target: 'fixture', section: 'fixture', after: 'series', field: { key: 'round_prefix', label: 'Round prefix', type: 'select', options: ['Round', 'Night', 'Prelude'], allowCustom: true, core: true, showIf: 'series!=' } },
  { target: 'fixture', section: 'fixture', after: 'round', field: { key: 'more_series', label: 'Also counts towards', type: 'table', core: true,
    columns: [{ key: 'series', label: 'Series', ref: 'series' }, { key: 'prefix', label: 'Prefix', options: ['Round', 'Night', 'Prelude'], list: 'round_prefixes' }, { key: 'round', label: 'Round' }],
    defaultRows: [], showIf: 'series!=', help: 'Other series running at this meeting — each with its own round.' } },
  { target: 'engine_build', section: 'build', after: 'engine_laps', field: { key: 'rebuild_cost', label: 'Rebuild cost', type: 'number', unit: '$', money: true } },
];
