// Tracks, contacts, suppliers, contact roles and race series.
import { SHOP_FORMS, SHOP_UPGRADES } from './baseForms4.js';

const t = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });

export const CONTACT_ROLES = ['Owner', 'Track promoter', 'Race director', 'Series manager', 'Manager', 'Sales', 'Accounts',
  'Technical / support', 'Media', 'Sponsor contact', 'Other'];
export const ENTITY_TYPES = { track: 'Track', supplier: 'Supplier', series: 'Series', event: 'Event', car: 'Car' };
const ADDRESS = [
  t('address1', 'Address'), t('address2', 'Address line 2'), t('city', 'Suburb / city', { suggest: true }),
  t('state', 'State / region', { suggest: true }), t('postcode', 'Postcode'), t('country', 'Country', { suggest: true }),
];

// Columns follow Tracks.xlsx; ext_id keeps the id from the imported directory JSON.
const trackForm = {
  target: 'track', name: 'Track', is_default: true,
  sections: [
    { id: 'track', title: 'Track', fields: [
      t('name', 'Track name', { core: true, required: true }),
      t('address', 'Address'),
      t('city', 'Location', { core: true, suggest: true }),
      t('region', 'State / region', { core: true, suggest: true }),
      t('country', 'Country', { core: true, required: true, suggest: true }),
      { key: 'status', label: 'Track status', type: 'select', core: true, options: ['Active', 'Inactive', 'Closed'], default: 'Active' },
    ] },
    { id: 'surface', title: 'Track details', fields: [
      t('length', 'Track size', { placeholder: 'e.g. 3/8 mi or 420 m' }),
      t('surface', 'Surface type', { suggest: true }),
      t('dirt_type', 'Dirt type', { suggest: true }),
      t('radius', 'Radius'), t('banking', 'Banking'), t('cushion', 'Cushion'),
      t('typical', 'Typical conditions / layout'),
    ] },
    { id: 'contact', title: 'Location & contact', fields: [
      { key: 'lat', label: 'Latitude', type: 'number' }, { key: 'lon', label: 'Longitude', type: 'number' },
      t('website', 'Website'), t('phone', 'Contact number'),
    ] },
    { id: 'classes', title: 'Classes', fields: [
      { key: 'classes', label: 'Classes raced', type: 'tags', core: true, help: 'Used to link tracks to teams that race these classes.' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      t('ext_id', 'Directory id', { core: true, help: 'From the imported track list — keeps re-imports matched.' }),
    ] },
  ],
};

const teamTrackForm = {
  target: 'team_track', name: 'Team Track', is_default: true,
  sections: [
    { id: 'link', title: 'Team track', fields: [
      { key: 'track', label: 'Track', type: 'ref', ref: 'track', core: true, required: true },
      { key: 'link', label: 'Link', type: 'select', core: true, options: ['Linked', 'Hidden'], default: 'Linked',
        help: 'Hidden removes a track that was matched by class.' },
      { key: 'home', label: 'Home track', type: 'checkbox' },
      { key: 'notes', label: 'Team notes about this track', type: 'textarea' },
    ] },
  ],
};

const contactForm = {
  target: 'contact', name: 'Contact', is_default: true,
  sections: [
    { id: 'person', title: 'Contact', fields: [
      { key: 'salutation', label: 'Title', type: 'select', options: ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr'] },
      t('first_name', 'First name', { core: true }),
      t('last_name', 'Last name', { core: true }),
      t('organisation', 'Organisation', { suggest: true }),
      t('position', 'Position'),
    ] },
    { id: 'details', title: 'Contact details', fields: [
      t('mobile', 'Mobile'), t('phone', 'Phone'), t('email', 'Email', { core: true }), t('email2', 'Other email'), t('website', 'Website'),
    ] },
    { id: 'address', title: 'Address', fields: ADDRESS },
    { id: 'notes', title: 'Notes', fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }] },
  ],
};

const supplierForm = {
  target: 'supplier', name: 'Supplier', is_default: true,
  sections: [
    { id: 'supplier', title: 'Supplier', fields: [
      t('name', 'Business name', { core: true, required: true }),
      { key: 'category', label: 'Category', type: 'select', core: true,
        options: ['Parts', 'Tires', 'Fuel & oil', 'Engines', 'Shocks & suspension', 'Chassis', 'Safety gear', 'Services', 'Other'] },
      t('account_no', 'Our account #'), t('phone', 'Phone'), t('email', 'Email'), t('website', 'Website'),
    ] },
    { id: 'address', title: 'Address', fields: ADDRESS },
    { id: 'notes', title: 'Notes', fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }] },
  ],
};

const contactLinkForm = {
  target: 'contact_link', name: 'Contact Role', is_default: true,
  sections: [
    { id: 'link', title: 'Role', fields: [
      { key: 'contact', label: 'Contact', type: 'ref', ref: 'contact', core: true, required: true },
      { key: 'entity_type', label: 'Linked to', type: 'select', core: true, required: true,
        options: Object.entries(ENTITY_TYPES).map(([value, label]) => ({ value, label })) },
      { key: 'entity', label: 'Record', type: 'entityref', typeKey: 'entity_type', core: true, required: true },
      { key: 'role', label: 'Role', type: 'select', core: true, required: true, options: CONTACT_ROLES },
      { key: 'primary', label: 'Primary contact for this role', type: 'checkbox' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

const seriesForm = {
  target: 'series', name: 'Race Series', is_default: true,
  sections: [
    { id: 'series', title: 'Series', fields: [
      t('name', 'Series name', { core: true, required: true, placeholder: 'e.g. Queensland Sprintcar Championship' }),
      t('season', 'Season', { core: true, required: true, placeholder: 'e.g. 2026-27' }),
      t('class', 'Class', { suggest: true }),
      t('sanctioning', 'Sanctioning body', { suggest: true }),
      { key: 'start_date', label: 'Start', type: 'date' }, { key: 'end_date', label: 'End', type: 'date' },
      t('website', 'Website'),
      { key: 'points', label: 'Points system / rules notes', type: 'textarea' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

// Tuning guides for the setup advisor: rules are edited on the guide page (values.rules).
const tuningGuideForm = {
  target: 'tuning_guide', name: 'Tuning Guide', is_default: true,
  sections: [
    { id: 'guide', title: 'Guide', fields: [
      t('name', 'Guide name', { core: true, required: true }),
      t('publisher', 'From / publisher', { core: true, suggest: true }),
      t('applies_to', 'Applies to', { placeholder: 'e.g. Winged sprint cars' }),
      t('source', 'Source', { placeholder: 'Document name or web address' }),
      { key: 'notes', label: 'Notes & baseline', type: 'textarea' },
    ] },
  ],
};

export const PHASE3_FORMS = [trackForm, teamTrackForm, contactForm, supplierForm, contactLinkForm, seriesForm, tuningGuideForm, ...SHOP_FORMS];

// Optional chassis numbers on the setup sheet, so the advisor can learn from weight, wing and rod changes.
export const SETUP_CHASSIS_SECTION = {
  id: 'weights', title: 'Weights & chassis', fields: [
    { key: 'total_weight', label: 'Total weight', type: 'number', unit: 'lb' },
    { key: 'left_pct', label: 'Left side', type: 'number', unit: '%' },
    { key: 'rear_pct', label: 'Rear', type: 'number', unit: '%' },
    { key: 'cross_pct', label: 'Cross', type: 'number', unit: '%' },
    { key: 'wing_position', label: 'Wing position', type: 'number', unit: 'in', help: 'Slider position — higher number = further back.' },
    { key: 'nose_wing', label: 'Nose wing angle', type: 'number', unit: '°' },
    { key: 'lr_radius_rod', label: 'LR radius rod (front mount)', type: 'text', placeholder: 'e.g. hole 3' },
    { key: 'rear_steer', label: 'Rear steer', type: 'text', placeholder: 'e.g. lead RR 1/8"' },
  ],
};

export const TRACK_CONDITIONS = ['Wet', 'Heavy', 'Tacky', 'Moist', 'Grippy', 'Fast', 'Drying out', 'Slick', 'Dry slick', 'Black slick',
  'Rubbered up', 'Greasy', 'Dusty', 'Rough', 'Choppy', 'Rutted', 'Holes in turns', 'Cushion building', 'Big cushion', 'No cushion',
  'Ledge', 'Rim', 'Middle groove', 'Bottom groove', 'Multi-groove', 'One lane', 'Patchy', 'Hard packed', 'Loose top', 'Cold', 'Hot', 'Windy', 'Night (cooling)'];
export const CAR_BEHAVIOUR = ['Tight entry', 'Tight centre', 'Tight exit', 'Loose entry', 'Loose centre', 'Loose exit', 'Free', 'Pushes',
  'Snaps loose', 'Won\'t turn', 'Turns well', 'Good drive off', 'No drive off', 'Spins tyres', 'Wheel hop', 'Bound up', 'Bicycling',
  'Lifts LF', 'Bottoms out', 'Hits stops', 'Rolls too much', 'Flat / no roll', 'Unstable on brakes', 'Nervous', 'Stable', 'Too much wing',
  'Not enough wing', 'Loses forward bite', 'Good rotation', 'Engine flat', 'Over-revving', 'Lacks top speed'];
export const SETUP_FEEDBACK_SECTION = {
  id: 'feedback', title: 'Track conditions & car feedback', carry: false, fields: [
    { key: 'track_conditions', label: 'Track conditions', type: 'tags', core: true, options: TRACK_CONDITIONS, help: 'Pick common descriptions or type your own.' },
    { key: 'conditions_notes', label: 'Track notes', type: 'textarea' },
    { key: 'driver_feel', label: 'Driver — how the car behaved', type: 'tags', core: true, options: CAR_BEHAVIOUR },
    { key: 'driver_comments', label: 'Driver comments', type: 'textarea', core: true },
    { key: 'crew_feel', label: 'Crew lead — how the car behaved', type: 'tags', core: true, options: CAR_BEHAVIOUR },
    { key: 'crew_comments', label: 'Crew lead comments', type: 'textarea', core: true },
    { key: 'changes_next', label: 'Changes for next session', type: 'textarea' },
  ],
};

export const PHASE3_UPGRADES = [
  { target: 'event', section: 'event', after: 'name', field: { key: 'venue', label: 'Track', type: 'ref', ref: 'track', core: true } },
  { target: 'event', key: 'track', patch: { label: 'Track name (if not listed)', required: false } },
  { target: 'event', section: 'event', after: 'event_type', field: { key: 'series', label: 'Series', type: 'ref', ref: 'series', core: true, help: 'Leave empty for a stand-alone event.' } },
  { target: 'event', section: 'event', after: 'series', field: { key: 'round', label: 'Round', type: 'number', core: true } },
  { target: 'setup', section: 'session', after: 'session', field: { key: 'day', label: 'Day', type: 'number', core: true, placeholder: '1', help: 'For multi-day events.' } },
  // setup sheet: baseline flag, derived final drive, what is not copied, conditions & feedback
  { target: 'setup', section: 'session', after: 'day', field: { key: 'baseline', label: 'Save as a baseline setup', type: 'checkbox', core: true, nocopy: true } },
  { target: 'setup', section: 'session', after: 'baseline', field: { key: 'baseline_name', label: 'Baseline name', type: 'text', core: true, nocopy: true, showIf: 'baseline=true', placeholder: 'e.g. Archerfield tacky – heavy' } },
  { target: 'setup', key: 'final_drive', patch: { type: 'derived', help: 'Gear set × position × ring & pinion on the car' } },
  { target: 'setup', key: 'pressure_hot', patch: { nocopy: true } },
  { target: 'setup', key: 'stagger_hot', patch: { nocopy: true } },
  { target: 'setup', key: 'travel', patch: { nocopy: true } },
  { target: 'setup', section: 'weather', sectionPatch: { carry: true } },
  { target: 'setup', insertSection: SETUP_FEEDBACK_SECTION, before: 'notes' },
  { target: 'track_check', section: 'when', after: 'after_session', field: { key: 'day', label: 'Day', type: 'number', placeholder: '1' } },
  // events: the directory track drives the event's track details; one car per event; free-text session names
  { target: 'event', key: 'venue', patch: { label: 'Track', help: 'Search the track directory — location, length, surface and banking fill in from it.' } },
  { target: 'event', key: 'track', patch: { label: 'Track name (not in the directory)', showIf: 'venue=', required: true, help: 'Only needed if the track isn’t in the directory.' } },
  { target: 'event', section: 'event', after: 'track', field: { key: 'car', label: 'Car', type: 'ref', ref: 'car', core: true, required: true, help: 'The car being raced at this event.' } },
  { target: 'event', key: 'location', patch: { help: 'From the track — change it if needed.' } },
  { target: 'event', section: 'event', after: 'track_length', field: { key: 'surface', label: 'Surface', type: 'text' } },
  { target: 'event', section: 'event', after: 'surface', field: { key: 'banking', label: 'Banking', type: 'text' } },
  { target: 'setup', key: 'session', patch: { allowCustom: true } },
  { target: 'setup', insertSection: SETUP_CHASSIS_SECTION, before: 'feedback' },
  // weather: units follow the team's choice (set in the weather panel); more readings for pulled or manual weather
  { target: 'setup', key: 'baro', patch: { unit: '' } },
  { target: 'setup', section: 'weights', first: true, field: { key: 'corner_weights', label: 'Corner weights', type: 'corners', input: 'number', corners: ['LF', 'RF', 'LR', 'RR'], unit: 'lb', help: 'Enter all four and total, left, rear and cross fill in.' } },
  { target: 'setup', key: 'adr', patch: { unit: '%' } },
  { target: 'setup', section: 'weather', after: 'wb', field: { key: 'humidity', label: 'Humidity', type: 'number', unit: '%' } },
  { target: 'setup', section: 'weather', after: 'humidity', field: { key: 'dew_point', label: 'Dew point', type: 'number' } },
  { target: 'setup', section: 'weather', after: 'dew_point', field: { key: 'grains', label: 'Water grains', type: 'number', unit: 'gr' } },
  { target: 'setup', section: 'weather', after: 'grains', field: { key: 'wind', label: 'Wind', type: 'text', placeholder: 'e.g. 12 mph SE' } },
  { target: 'setup', section: 'weather', after: 'wind', field: { key: 'weather_source', label: 'Weather from', type: 'text', placeholder: 'e.g. own weather station' } },
  ...SHOP_UPGRADES,
];
