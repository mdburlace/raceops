// Tracks, contacts, suppliers, contact roles and race series.
import { SHOP_FORMS, SHOP_UPGRADES } from './baseForms4.js';
import { AFTER_KEYS, STEPS } from './setupLayout.js';
import { FUEL_UNIT_OPTIONS } from './fuel.js';
import { TEST_SPEEDS } from './dyno.js';
import { BAR_TYPES, CORNERS } from './bars.js';
import { FIXTURE_STATUS, INTENTS, OUTCOMES, PARTICIPATION, WITHDREW, WITHDRAW_REASONS } from './calendar.js';

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

// A date on a shared series or track calendar. Global (approved) dates are seen by every team;
// a team's own fixture records are suggestions waiting for a platform admin (values.review).
const fixtureForm = {
  target: 'fixture', name: 'Calendar date', is_default: true,
  sections: [
    { id: 'fixture', title: 'Calendar date', fields: [
      t('name', 'Event name', { core: true, required: true, placeholder: 'e.g. Round 3 — Spring Classic' }),
      { key: 'date', label: 'Date', type: 'date', core: true, required: true },
      { key: 'end_date', label: 'End date', type: 'date', help: 'For meetings over more than one day.' },
      { key: 'series', label: 'Series', type: 'ref', ref: 'series', core: true, help: 'Leave empty for a track-only date.' },
      { key: 'round', label: 'Round', type: 'number', core: true },
      { key: 'venue', label: 'Track', type: 'ref', ref: 'track', core: true },
      t('track', 'Track name (not in the directory)', { showIf: 'venue=' }),
      { key: 'classes', label: 'Classes running', type: 'tags', core: true, help: 'Teams with a car in one of these classes see this date as a match.' },
      { key: 'status', label: 'Status', type: 'select', core: true, options: FIXTURE_STATUS, default: 'Scheduled' },
      t('start_time', 'Times', { placeholder: 'e.g. Gates 4 pm, racing 7 pm' }),
      t('website', 'Link / more info'),
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

// A team's entry in a series for one season: which car, which class, all rounds or some.
const seasonPlanForm = {
  target: 'season_plan', name: 'Series entry', is_default: true,
  sections: [
    { id: 'entry', title: 'Series entry', fields: [
      { key: 'series', label: 'Series', type: 'ref', ref: 'series', core: true, required: true },
      t('season', 'Racing year', { core: true, required: true, placeholder: 'e.g. 2026 or 2026-27' }),
      { key: 'car', label: 'Car', type: 'ref', ref: 'car', core: true, required: true },
      { key: 'class', label: 'Class', type: 'select', allowCustom: true, core: true, options: [] },
      { key: 'participation', label: 'Running', type: 'select', core: true, required: true, options: PARTICIPATION, default: 'Full series',
        help: 'Full series adds every round to your calendar; partial lets you pick the rounds.' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

// A team's own notes about a shared series, track or calendar date (only that team sees them).
const localNoteForm = {
  target: 'local_note', name: 'Team note', is_default: true,
  sections: [
    { id: 'note', title: 'Team note', fields: [
      { key: 'entity_type', label: 'About a', type: 'select', core: true, options: [{ value: 'series', label: 'Series' }, { value: 'track', label: 'Track' }, { value: 'fixture', label: 'Calendar date' }] },
      { key: 'entity', label: 'Record', type: 'entityref', typeKey: 'entity_type', core: true },
      { key: 'notes', label: 'Our notes', type: 'textarea', core: true },
    ] },
  ],
};

export const PHASE3_FORMS = [trackForm, teamTrackForm, contactForm, supplierForm, contactLinkForm, seriesForm, tuningGuideForm, fixtureForm, seasonPlanForm, localNoteForm, ...SHOP_FORMS];

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
  // bump rubbers (per corner) and fuel planning
  { target: 'setup', section: 'shocks', after: 'travel', field: { key: 'bump_type', label: 'Bump rubber type', type: 'corners', input: 'text', corners: ['LF', 'RF', 'LR', 'RR'], placeholder: 'e.g. Penske' } },
  { target: 'setup', section: 'shocks', after: 'bump_type', field: { key: 'bump_spec', label: 'Bump rubber spec', type: 'corners', input: 'text', corners: ['LF', 'RF', 'LR', 'RR'], placeholder: 'e.g. 70A / red' } },
  { target: 'setup', section: 'shocks', after: 'bump_spec', field: { key: 'bump_height', label: 'Bump rubber height', type: 'corners', input: 'number', corners: ['LF', 'RF', 'LR', 'RR'], unit: 'in' } },
  { target: 'setup', section: 'shocks', after: 'bump_height', field: { key: 'bump_packers', label: 'Packers', type: 'corners', input: 'number', corners: ['LF', 'RF', 'LR', 'RR'] } },
  { target: 'setup', section: 'shocks', after: 'bump_packers', field: { key: 'bump_gap', label: 'Bump rubber gap', type: 'corners', input: 'number', corners: ['LF', 'RF', 'LR', 'RR'], unit: 'in' } },
  { target: 'setup', section: 'race', first: true, field: { key: 'planned_laps', label: 'Planned laps', type: 'number', placeholder: 'race laps' } },
  { target: 'car', section: 'car', after: 'rp_ratio', field: { key: 'fuel_min', label: 'Minimum fuel (pickup)', type: 'number', unit: 'gal', placeholder: 'e.g. 1.5' } },
  // setup sheet layout: wing gets its own section; chassis items together; post-session readings marked "after";
  // −/+ steps on the values changed most often
  { target: 'setup', before: 'shocks', insertSection: { id: 'wing', title: 'Wing', fields: [] } },
  { target: 'setup', move: 'wing_angle', to: 'wing' },
  { target: 'setup', move: 'wicker', to: 'wing', after: 'wing_angle' },
  { target: 'setup', move: 'wing_position', to: 'wing', after: 'wicker' },
  { target: 'setup', move: 'nose_wing', to: 'wing', after: 'wing_position' },
  { target: 'setup', move: 'lr_radius_rod', to: 'chassis' },
  { target: 'setup', move: 'rear_steer', to: 'chassis', after: 'lr_radius_rod' },
  { target: 'setup', section: 'chassis', ifTitle: 'Setup', sectionPatch: { title: 'Chassis' } },
  { target: 'setup', section: 'weights', ifTitle: 'Weights & chassis', sectionPatch: { title: 'Weights' } },
  ...AFTER_KEYS.map((key) => ({ target: 'setup', key, patch: { stage: 'after' } })),
  ...Object.entries(STEPS).map(([key, step]) => ({ target: 'setup', key, patch: { step } })),
  // car class picks from the shared class list (team classes + platform Race classes); typing a new one still works
  { target: 'car', key: 'class', patch: { allowCustom: true, placeholder: 'Choose or type a class' } },
  // shock dyno: one or more test speeds per run, readings entered at each
  { target: 'dyno_run', kind: 'shock', section: 'run', after: 'stroke', field: { key: 'test_speeds', label: 'Test speeds', type: 'tags', unit: 'in/s', core: true, required: true,
    options: TEST_SPEEDS, default: TEST_SPEEDS, normalize: 'speed', help: 'One or more — readings are entered for each speed. Type another speed to add it.' } },
  { target: 'dyno_run', kind: 'shock', key: 'speeds', patch: { showIf: 'speeds!=' } },
  { target: 'dyno_run', kind: 'shock', key: 'test_speed', patch: { showIf: 'test_speed!=' } },
  { target: 'dyno_run', kind: 'shock', key: 'data', patch: { bySpeed: true } },
  { target: 'dyno_run', kind: 'shock', key: 'settings', patch: { bySpeed: true } },
  // torsion bar tests: identification, rate at a standard arm travel, compression & rebound, split, baselines
  { target: 'dyno_run', kind: 'bar', section: 'run', after: 'label', field: { key: 'serial', label: 'Serial #', type: 'text' } },
  { target: 'dyno_run', kind: 'bar', section: 'run', after: 'serial', field: { key: 'manufacturer', label: 'Manufacturer', type: 'text', suggest: true } },
  { target: 'dyno_run', kind: 'bar', section: 'run', after: 'manufacturer', field: { key: 'model', label: 'Model', type: 'text', suggest: true } },
  { target: 'dyno_run', kind: 'bar', section: 'run', after: 'model', field: { key: 'bar_type', label: 'Bar type', type: 'select', options: BAR_TYPES } },
  { target: 'dyno_run', kind: 'bar', section: 'run', after: 'bar_type', field: { key: 'corner', label: 'Target corner', type: 'select', options: CORNERS } },
  { target: 'dyno_run', kind: 'bar', key: 'diameter', patch: { label: 'Bar size (diameter)' } },
  { target: 'dyno_run', kind: 'bar', key: 'arm', patch: { default: '15', placeholder: '15' } },
  { target: 'dyno_run', kind: 'bar', section: 'run', after: 'arm', field: { key: 'rate_travel', label: 'Rate measured at (arm travel)', type: 'number', unit: 'in', default: '3', placeholder: '3' } },
  { target: 'dyno_run', kind: 'bar', before: 'data', insertSection: { id: 'rate', title: 'Spring rate & split', fields: [
    { key: 'comp_at', label: 'Compression at test travel', type: 'number', unit: 'lb', help: 'Leave blank to read it from the readings below.' },
    { key: 'reb_at', label: 'Rebound at test travel', type: 'number', unit: 'lb', help: 'Leave blank to read it from the readings below.' },
    { key: 'in_baseline', label: 'Use in baseline averages', type: 'checkbox', help: 'Average rates for this size and type are worked out from tests ticked here.' },
  ] } },
  { target: 'dyno_run', kind: 'bar', section: 'data', ifTitle: 'Load vs deflection', sectionPatch: { title: 'Compression & rebound readings' } },
  { target: 'dyno_run', kind: 'bar', key: 'data', patch: { columns: [{ key: 'x', label: 'Arm travel', unit: 'in' }, { key: 'load', label: 'Compression', unit: 'lb' }, { key: 'unload', label: 'Rebound', unit: 'lb' }],
    defaultRows: [0, 0.5, 1, 1.5, 2, 2.5, 3].map((x) => ({ x: String(x) })), help: 'Force as the bar winds up (compression) and as it releases (rebound) at each arm travel.' } },
  { target: 'dyno_run', kind: 'bar', key: 'rate', patch: { label: 'Rate (slope of compression readings)' } },
  // the first test of a shock or bar, at purchase or first build: later tests are compared with it
  ...['shock', 'bar'].map((kind) => ({ target: 'dyno_run', kind, section: 'run', after: 'date', field: { key: 'initial', label: 'Initial measurement (at purchase or first build)', type: 'checkbox', core: true,
    help: `The first test of this ${kind === 'bar' ? 'bar' : 'shock'} — later tests are compared with it. One per ${kind === 'bar' ? 'bar' : 'shock'}.` } })),
  // fuel: recorded in US gallons or litres (per sheet / per car); units follow the sheet
  { target: 'setup', key: 'fuel_start', patch: { unit: '' } },
  { target: 'setup', key: 'fuel_finish', patch: { unit: '' } },
  { target: 'setup', key: 'fuel_used', patch: { unit: '' } },
  { target: 'car', key: 'fuel_min', patch: { unit: '' } },
  { target: 'car', section: 'car', after: 'fuel_min', field: { key: 'fuel_min_unit', label: 'Minimum fuel in', type: 'select', options: FUEL_UNIT_OPTIONS } },
  // calendars: each event is an entry on the team calendar — the shared date it came from, whether
  // the team plans to go, and what happened (raced the feature, withdrew and why)
  { target: 'event', section: 'event', after: 'round', field: { key: 'fixture', label: 'Calendar date', type: 'ref', ref: 'fixture', showIf: 'fixture!=',
    help: 'The shared series or track date this entry came from.' } },
  { target: 'event', before: '__end', insertSection: { id: 'plan', title: 'Plan & result', fields: [
    { key: 'intent', label: 'Going?', type: 'select', core: true, options: INTENTS, default: 'Planned' },
    { key: 'outcome', label: 'What happened', type: 'select', core: true, options: OUTCOMES, help: 'Fill in after the event.' },
    { key: 'withdraw_reason', label: 'Reason for withdrawing', type: 'select', allowCustom: true, options: WITHDRAW_REASONS, showIf: `outcome=${WITHDREW}` },
    { key: 'withdraw_session', label: 'Withdrew after', type: 'text', showIf: `outcome=${WITHDREW}`, placeholder: 'e.g. Heat 2' },
    { key: 'outcome_notes', label: 'Result notes', type: 'textarea' },
    { key: 'public_note', label: 'Note on the public calendar', type: 'text', help: 'Shown on your published calendar, if you publish one.' },
  ] } },
  // major events (titles, classics) get their own calendar view
  { target: 'fixture', section: 'fixture', after: 'classes', field: { key: 'major', label: 'Major event', type: 'checkbox', core: true,
    help: 'A title or big one-off meeting, e.g. the Australian Sprintcar Title — listed under Major events.' } },
  // sanctioning body on series, events and calendar dates (shared pick-list); major events get a name
  { target: 'series', key: 'sanctioning', patch: { type: 'select', allowCustom: true, options: [], suggest: false, placeholder: 'Choose or type' } },
  { target: 'fixture', section: 'fixture', after: 'round', field: { key: 'sanctioning', label: 'Sanctioning body', type: 'select', allowCustom: true, options: [],
    help: 'Leave empty to use the series’ sanctioning body.' } },
  { target: 'fixture', section: 'fixture', after: 'major', field: { key: 'major_name', label: 'Major event name', type: 'text', suggest: true, showIf: 'major=true',
    placeholder: 'e.g. Australian Sprintcar Title' } },
  { target: 'event', section: 'event', after: 'round', field: { key: 'sanctioning', label: 'Sanctioning body', type: 'select', allowCustom: true, options: [] } },
  { target: 'event', section: 'event', after: 'sanctioning', field: { key: 'major', label: 'Major event', type: 'checkbox',
    help: 'A title or big one-off meeting, e.g. the Australian Sprintcar Title.' } },
  { target: 'event', section: 'event', after: 'major', field: { key: 'major_name', label: 'Major event name', type: 'text', suggest: true, showIf: 'major=true',
    placeholder: 'e.g. Australian Sprintcar Title' } },
  ...SHOP_UPGRADES,
];
