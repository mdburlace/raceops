// Base form definitions seeded into every new team. Admins can edit them in the
// app (Forms screen); fields marked core: true drive app logic and can be relabelled
// but not removed.
//
// Field types: text, number, textarea, select, date, checkbox, ref (link to another
// record type), asset (pick an asset of a category, or type free text), corners
// (LF/RF/LR/RR group; input: number|text|asset), calc (formula over other numeric
// keys), check (checklist item with freq), heading (sub-heading inside a section).

const CORNERS = ['LF', 'RF', 'LR', 'RR'];
const REARS = ['LR', 'RR'];

export const ASSET_CATEGORIES = [
  'Chassis', 'Engine', 'Shock', 'Torsion Bar', 'Rear End', 'Quick Change Gear', 'Tire', 'Wheel',
  'Wing', 'Front Axle', 'Rear Axle', 'Torque Tube', 'Radius Rod', 'Brakes', 'Fuel System',
  'Driveline', 'Steering', 'Safety Equipment', 'Electrical', 'Trailer / Tools', 'Other',
];

const carForm = {
  target: 'car', name: 'Car', is_default: true,
  title_template: '#{number} {name}',
  sections: [
    { id: 'car', title: 'Car', fields: [
      { key: 'number', label: 'Car number', type: 'text', core: true, required: true },
      { key: 'name', label: 'Name', type: 'text', core: true, placeholder: 'e.g. Primary car' },
      { key: 'class', label: 'Class', type: 'select', options: ['410 Winged Sprint', '360 Winged Sprint', '305 Winged Sprint', 'Other'] },
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'chassis_make', label: 'Chassis make', type: 'text' },
      { key: 'chassis_number', label: 'Chassis #', type: 'text' },
      { key: 'wheelbase', label: 'Wheelbase', type: 'number', unit: 'in' },
      { key: 'active', label: 'Active', type: 'checkbox', core: true, default: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

const eventForm = {
  target: 'event', name: 'Event', is_default: true,
  title_template: '{name}',
  sections: [
    { id: 'event', title: 'Event', fields: [
      { key: 'name', label: 'Event name', type: 'text', core: true, required: true },
      { key: 'track', label: 'Track', type: 'text', core: true, required: true, suggest: true },
      { key: 'date', label: 'Date', type: 'date', core: true, required: true },
      { key: 'end_date', label: 'End date', type: 'date' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'track_length', label: 'Track length', type: 'text', placeholder: 'e.g. 1/3 mile' },
      { key: 'track_shape', label: 'Shape', type: 'select', options: ['Oval', 'D-shape', 'Tri-oval', 'Egg', 'Other'] },
      { key: 'event_type', label: 'Event type', type: 'select', options: ['Practice', 'Points race', 'Series', 'Special event'] },
      { key: 'track_notes', label: 'Track conditions / notes', type: 'textarea' },
    ] },
  ],
};

// From "Sprint Set Up Sheet Collection": one sheet per session.
const setupForm = {
  target: 'setup', name: 'Winged Sprint Setup Sheet', is_default: true,
  sessions: ['Hot Laps', 'Qualifying', 'Heat 1', 'Heat 2', 'Dash', 'B-Main', 'Feature', 'Practice'],
  sections: [
    { id: 'session', title: 'Session', fields: [
      { key: 'event', label: 'Event', type: 'ref', ref: 'event', core: true, required: true },
      { key: 'car', label: 'Car', type: 'ref', ref: 'car', core: true, required: true },
      { key: 'session', label: 'Session', type: 'select', core: true, required: true, optionsFrom: 'sessions' },
    ] },
    { id: 'weather', title: 'Weather', carry: false, fields: [
      { key: 'temp', label: 'Temp', type: 'number', unit: '°' },
      { key: 'baro', label: 'Bar', type: 'number', unit: '%' },
      { key: 'corrected', label: 'Corrected', type: 'number' },
      { key: 'alt', label: 'ALT', type: 'number' },
      { key: 'adr', label: 'ADR', type: 'number' },
      { key: 'wb', label: 'WB', type: 'number' },
    ] },
    { id: 'engine', title: 'Engine', fields: [
      { key: 'engine', label: 'Motor', type: 'asset', category: 'Engine' },
      { key: 'headers', label: 'Headers', type: 'text' },
      { key: 'pump', label: 'Pump', type: 'text' },
      { key: 'nozzles', label: 'Nozzles', type: 'text' },
      { key: 'gear', label: 'Gear', type: 'asset', category: 'Quick Change Gear' },
      { key: 'main_jet', label: 'Main', type: 'text', unit: '#' },
      { key: 'ls_bypass', label: 'LS', type: 'text', placeholder: '/ #' },
      { key: 'hs_bypass', label: 'HS', type: 'text', placeholder: '/ #' },
    ] },
    { id: 'chassis', title: 'Setup', fields: [
      { key: 'bars', label: 'Bars', type: 'corners', input: 'asset', category: 'Torsion Bar', corners: CORNERS },
      { key: 'blocked', label: 'Blocked', type: 'corners', input: 'number', corners: CORNERS },
      { key: 'ride_height', label: 'Ride height', type: 'corners', input: 'number', corners: CORNERS, unit: 'in' },
      { key: 'wing_angle', label: 'Wing angle', type: 'number', unit: '°' },
      { key: 'wicker', label: 'Wicker', type: 'text' },
    ] },
    { id: 'shocks', title: 'Shocks', fields: [
      { key: 'shocks', label: 'Shocks', type: 'corners', input: 'asset', category: 'Shock', corners: CORNERS },
      { key: 'travel', label: 'Travel', type: 'corners', input: 'number', corners: CORNERS, unit: 'in' },
    ] },
    { id: 'tires', title: 'Tires', fields: [
      { key: 'pressure_cold', label: 'Pressure cold', type: 'corners', input: 'number', corners: CORNERS, unit: 'psi' },
      { key: 'pressure_hot', label: 'Pressure hot', type: 'corners', input: 'number', corners: CORNERS, unit: 'psi' },
      { key: 'tire_spec', label: 'Spec / size', type: 'corners', input: 'text', corners: CORNERS },
      { key: 'stagger_cold', label: 'Stagger cold', type: 'number', unit: 'in' },
      { key: 'stagger_hot', label: 'Stagger hot', type: 'number', unit: 'in' },
    ] },
    { id: 'wheels', title: 'Wheels', fields: [
      { key: 'wheel_width', label: 'Width', type: 'corners', input: 'number', corners: REARS, unit: 'in' },
      { key: 'wheel_offset', label: 'Offset', type: 'corners', input: 'number', corners: REARS, unit: 'in' },
      { key: 'wheel_spacing', label: 'Spacing', type: 'corners', input: 'number', corners: REARS, unit: 'in' },
    ] },
    { id: 'race', title: 'Race', carry: false, fields: [
      { key: 'laps', label: 'Laps', type: 'number', core: true },
      { key: 'start', label: 'Draw / start', type: 'number' },
      { key: 'finish', label: 'Finished', type: 'number' },
      { key: 'fuel_start', label: 'Fuel started', type: 'number', unit: 'gal' },
      { key: 'fuel_finish', label: 'Fuel finished', type: 'number', unit: 'gal' },
      { key: 'fuel_used', label: 'Fuel used', type: 'calc', formula: 'fuel_start - fuel_finish', unit: 'gal' },
      { key: 'tach_low', label: 'Tach low', type: 'number', unit: 'rpm' },
      { key: 'tach_high', label: 'Tach high', type: 'number', unit: 'rpm' },
    ] },
    { id: 'notes', title: 'Notes', carry: false, fields: [
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

// From "Maintenance Check list A3". freq: weekly | race2 (every 2nd race) | monthly (monthly / 4th race)
const W = 'weekly', R2 = 'race2', M = 'monthly';
const h = (label) => ({ type: 'heading', label });
let n = 0;
const c = (label, freq = W, extra = {}) => ({ key: `i${++n}`, label, type: 'check', freq, ...extra });

const maintenanceForm = {
  target: 'maintenance', name: 'Race Car Maintenance Checklist', is_default: true,
  levels: [
    { key: W, label: 'Weekly' },
    { key: R2, label: 'Every 2nd race' },
    { key: M, label: 'Monthly / 4th race' },
  ],
  sections: [
    { id: 'header', title: 'Service', fields: [
      { key: 'car', label: 'Car', type: 'ref', ref: 'car', core: true, required: true },
      { key: 'date', label: 'Date', type: 'date', core: true, required: true },
      { key: 'level', label: 'Service level', type: 'select', core: true, required: true, optionsFrom: 'levels' },
      { key: 'completed_by', label: 'Completed by', type: 'text' },
    ] },
    { id: 'engine', title: 'Engine', fields: [
      c('Flush fuel system'),
      h('Lube'), c('Fuel pump'), c('Barrel valve'), c('Throttle linkages'),
      h('Clean'), c('Air filter'), c('Fuel filter'), c('Injector nozzles'),
      c('Inspect oil filter (cut open)'), c('Change oil', R2), c('Adjust valves'),
      c('Inspect spark plugs'),
      h('Tighten'), c('All fittings'), c('All engine bolts'), c('All linkages'),
    ] },
    { id: 'chassis', title: 'Chassis', fields: [
      h('Clean'), c('Rod ends'),
      h('Check'), c('Torsion stops for wear'), c('Suspension for binding'), c('Bird cage timing'),
      h('Inspect'), c('Front hubs / spindles'), c('Brake pads / rotors', W, { measure: 'mm' }),
      c('Jacobs ladder'), c('All radius rods'), c('Shocks'),
      h('Lube'), c('Rod ends (lube)'),
      c('Install torsion bars for next track'), c('Square front end'), c('Square rear end'),
      c('Reset torsion stops to chosen setup'), c('Reset ride height'),
      c('Perform bolt check to torque specs'),
      c('Install wheels and tires to baseline spacing & stagger'),
    ] },
    { id: 'front', title: 'Front End', fields: [
      h('Check'), c('Toe out', W, { measure: 'in' }), c('Steering arm bolts'),
      h('Lube'), c('King pins', R2), c('Front hubs', R2),
      c('Repack wheel bearings', M),
    ] },
    { id: 'rear', title: 'Rear End', fields: [
      h('Check'), c('Side cover bolts'), c('Rear end oil level'),
      h('Lube'), c('Torque tube'), c('Bird cage bearings', R2),
    ] },
    { id: 'driveline', title: 'Driveline', fields: [
      h('Check'), c('U-joint bolts'), c('Torque tube bolts'),
      h('Lube'), c('Torque ball'), c('Torque tube (driveline)'), c('Drive shaft splines', M), c('Swivel coupler', R2),
    ] },
    { id: 'fluids', title: 'Fluids', fields: [
      c('Check / top off radiator'), c('Check brake fluid level'), c('Check power steering oil level'),
      c('Bleed brakes', R2),
    ] },
    { id: 'trailer', title: 'Trailer / Mule', fields: [
      c('Clean out entire trailer'),
      h('Restock'), c('Paper towels'), c('Brake clean'), c('Gear oil'), c('Glass cleaner'), c('Mud-off'), c('Helmet tear-offs'),
      c('Clean up / organise toolbox'), c('Fill fuel jugs'), c('Check tire inventory'),
    ] },
    { id: 'notes', title: 'Notes', fields: [{ key: 'notes', label: 'Notes / issues found', type: 'textarea' }] },
  ],
};

const assetForm = {
  target: 'asset', name: 'Asset', is_default: true,
  title_template: '{name}',
  sections: [
    { id: 'identity', title: 'Asset', fields: [
      { key: 'name', label: 'Name / ID', type: 'text', core: true, required: true, placeholder: 'e.g. LF Shock #4' },
      { key: 'category', label: 'Category', type: 'select', core: true, required: true, options: ASSET_CATEGORIES },
      { key: 'status', label: 'Status', type: 'select', core: true, required: true, default: 'In Service',
        options: ['In Service', 'Spare', 'Out for Service', 'On Order', 'Retired'] },
      { key: 'car', label: 'Assigned car', type: 'ref', ref: 'car', core: true },
      { key: 'position', label: 'Position', type: 'select', options: ['LF', 'RF', 'LR', 'RR', 'Front', 'Rear', 'N/A'] },
      { key: 'parent', label: 'Installed in (parent asset)', type: 'ref', ref: 'asset' },
    ] },
    { id: 'details', title: 'Details', fields: [
      { key: 'manufacturer', label: 'Manufacturer', type: 'text', suggest: true },
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'part_number', label: 'Part #', type: 'text' },
      { key: 'serial_number', label: 'Serial #', type: 'text' },
      { key: 'spec', label: 'Spec / rating', type: 'text', placeholder: 'e.g. 1000 lb/in, 4.86 ratio, valving' },
    ] },
    { id: 'purchase', title: 'Purchase', fields: [
      { key: 'purchase_date', label: 'Purchase date', type: 'date' },
      { key: 'vendor', label: 'Vendor', type: 'text', suggest: true },
      { key: 'cost', label: 'Cost', type: 'number', unit: '$' },
    ] },
    { id: 'life', title: 'Lifecycle', fields: [
      { key: 'life_unit', label: 'Life measured in', type: 'select', core: true, options: ['Laps', 'Races', 'Hours', 'None'], default: 'Laps' },
      { key: 'life_limit', label: 'Life limit', type: 'number', core: true },
      { key: 'usage_offset', label: 'Usage before tracking / manual adj.', type: 'number', core: true,
        help: 'Added to laps/races counted from setups that use this asset.' },
      { key: 'expiry_date', label: 'Expiry / recert date', type: 'date', core: true, help: 'e.g. SFI belts, helmet' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

const scheduleForm = {
  target: 'schedule', name: 'Maintenance Schedule', is_default: true,
  title_template: '{name}',
  sections: [
    { id: 'sched', title: 'Schedule', fields: [
      { key: 'name', label: 'Task', type: 'text', core: true, required: true, placeholder: 'e.g. Rebuild LF shock' },
      { key: 'applies_to', label: 'Applies to', type: 'select', core: true, required: true, options: ['Car', 'Asset'], default: 'Asset' },
      { key: 'car', label: 'Car', type: 'ref', ref: 'car', core: true, showIf: 'applies_to=Car' },
      { key: 'asset', label: 'Asset', type: 'ref', ref: 'asset', core: true, showIf: 'applies_to=Asset' },
      { key: 'interval', label: 'Every', type: 'number', core: true, required: true },
      { key: 'interval_unit', label: 'Interval unit', type: 'select', core: true, required: true, options: ['Races', 'Laps', 'Days'], default: 'Races' },
      { key: 'last_done', label: 'Last done', type: 'date', core: true },
      { key: 'instructions', label: 'Instructions', type: 'textarea' },
    ] },
  ],
};

const measurementForm = {
  target: 'measurement', name: 'Measurement', is_default: true,
  sections: [
    { id: 'm', title: 'Measurement', fields: [
      { key: 'asset', label: 'Asset', type: 'ref', ref: 'asset', core: true, required: true },
      { key: 'date', label: 'Date', type: 'date', core: true, required: true },
      { key: 'kind', label: 'Measurement', type: 'select', core: true, required: true, options: [
        'Torsion bar rate', 'Shock gas pressure', 'Shock shaft runout', 'Shock length', 'Rotor thickness',
        'Pad thickness', 'Axle runout', 'Gear backlash', 'Tire circumference', 'Tire durometer',
        'Wheel runout', 'Leak-down', 'Compression', 'Valve lash', 'Weight', 'Other'] },
      { key: 'value', label: 'Value', type: 'number', core: true, required: true },
      { key: 'unit', label: 'Unit', type: 'text', core: true, placeholder: 'lb/in, mm, psi, %' },
      { key: 'spec_min', label: 'Spec min', type: 'number', core: true },
      { key: 'spec_max', label: 'Spec max', type: 'number', core: true },
      { key: 'measured_by', label: 'Measured by', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

export const BASE_FORMS = [carForm, eventForm, setupForm, maintenanceForm, assetForm, scheduleForm, measurementForm];
