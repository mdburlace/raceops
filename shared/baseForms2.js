import { PHASE3_UPGRADES } from './baseForms3.js';
// Phase 2 base forms. Seeded into every team; existing teams receive any that are
// missing on the next server start.

const CYL = ['#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8'];
const MAINS = ['#1', '#2', '#3', '#4', '#5'];
const PAIRS = ['#1 & #2', '#3 & #4', '#5 & #6', '#7 & #8'];
const IE = ['Int', 'Exh'];
const SESSIONS = ['Hot Laps', 'Qualifying', 'Heat 1', 'Heat 2', 'Dash', 'B-Main', 'Feature', 'Practice'];

const cyl = (key, label, unit, input = 'number') => ({ key, label, type: 'corners', input, corners: CYL, unit });
const ie = (key, label, unit, input = 'number') => ({ key, label, type: 'corners', input, corners: IE, unit });
const t = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const n = (key, label, unit, extra = {}) => ({ key, label, type: 'number', unit, ...extra });
const ck = (key, label, extra = {}) => ({ key, label, type: 'check', ...extra });

// ---------------- At the track: between-round checks ----------------
const trackCheckForm = {
  target: 'track_check', name: 'Between-Rounds Check', is_default: true, sessions: SESSIONS,
  sections: [
    { id: 'when', title: 'Session', fields: [
      { key: 'event', label: 'Event', type: 'ref', ref: 'event', core: true, required: true },
      { key: 'car', label: 'Car', type: 'ref', ref: 'car', core: true, required: true },
      { key: 'after_session', label: 'After session', type: 'select', core: true, optionsFrom: 'sessions' },
      { key: 'done_by', label: 'Done by', type: 'member', defaultSelf: true },
    ] },
    { id: 'wheels', title: 'Wheels & tires', fields: [
      ck('c_pressures', 'Set tire pressures to plan'), ck('c_lugs', 'Torque wheel nuts / check bead locks'),
      ck('c_tire_wear', 'Inspect tires for cuts & wear'), ck('c_stagger', 'Measure stagger', { measure: 'in' }),
    ] },
    { id: 'fluids', title: 'Fuel & fluids', fields: [
      ck('c_fuel', 'Fuel added', { measure: 'gal' }), ck('c_oil', 'Check oil level'), ck('c_water', 'Check water / clean radiator screen'),
      ck('c_leaks', 'Check for fuel, oil & water leaks'),
    ] },
    { id: 'chassis', title: 'Chassis & safety', fields: [
      ck('c_shocks', 'Inspect shocks for leaks / damage'), ck('c_bars', 'Check torsion bars, arms & stops'),
      ck('c_front', 'Check steering & front end for damage'), ck('c_brakes', 'Check brake pedal & lines'),
      ck('c_driveline', 'Check torque ball / driveline'), ck('c_wing', 'Check wing, mounts & slider'),
      ck('c_heims', 'Check heims & bolts after contact'), ck('c_belts', 'Check belts & safety gear'),
      ck('c_tearoffs', 'Fit tear-offs'), ck('c_clean', 'Clean car / mud off'),
    ] },
    { id: 'issues', title: 'Issues', carry: false, fields: [
      { key: 'issues', label: 'Issues found', type: 'textarea' },
      { key: 'parts', label: 'Parts replaced', type: 'textarea' },
      n('minutes', 'Time taken', 'min'),
    ] },
  ],
};

// ---------------- At the track: gear sets the team owns ----------------
const gearForm = {
  target: 'gear', name: 'Quick-Change Gear Set', is_default: true, version: 2,
  sections: [
    { id: 'gear', title: 'Gear set', fields: [
      { key: 'list', label: 'Gear list', type: 'ref', ref: 'gear_list', core: true },
      t('name', 'Set no.', { core: true, required: true, placeholder: 'e.g. 15A' }),
      n('small', 'Small gear (teeth)', '', { core: true, required: true }),
      n('large', 'Large gear (teeth)', '', { core: true, required: true }),
      n('qty', 'Quantity', '', { default: '1' }),
      { key: 'status', label: 'Status', type: 'select', core: true, options: ['Available', 'On car', 'Damaged', 'Retired'], default: 'Available' },
      { key: 'available_for', label: 'Available for cars', type: 'multiref', ref: 'car', core: true, help: 'Leave empty if any car can use it.' },
      t('location', 'Location', { placeholder: 'e.g. Trailer drawer 3' }),
      n('laps', 'Laps run', ''),
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

// ---------------- At the track: standard gear lists (10-spline, midget, ...) ----------------
const gearListForm = {
  target: 'gear_list', name: 'Gear List', is_default: true,
  sections: [
    { id: 'list', title: 'Gear list', fields: [
      t('name', 'Name', { core: true, required: true, placeholder: 'e.g. Midget quick change' }),
      { key: 'application', label: 'Application', type: 'select', core: true,
        options: ['Sprint car — 10-spline', 'Midget', 'Micro / mini sprint', 'Late model', 'Other'] },
      t('manufacturer', 'Manufacturer', { suggest: true }),
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
    { id: 'rps', title: 'Ring & pinion options', fields: [
      { key: 'rps', label: 'Ring & pinion', type: 'table', core: true,
        columns: [{ key: 'label', label: 'Name', text: true }, { key: 'pinion', label: 'Pinion teeth' }, { key: 'ring', label: 'Ring teeth' }],
        defaultRows: [{}], help: 'Ratio = ring ÷ pinion, e.g. 34 ÷ 7 = 4.86.' },
    ] },
    { id: 'sets', title: 'Gear sets', fields: [
      { key: 'sets', label: 'Sets', type: 'table', core: true, parse: 'gearsets',
        columns: [{ key: 'set', label: 'Set no.', text: true }, { key: 'small', label: 'Small' }, { key: 'large', label: 'Large' }, { key: 'note', label: 'Note', text: true }],
        defaultRows: [{}], help: 'Paste a chart: each line needs a set number and teeth like 21/22. Low ratio = small ÷ large, high = large ÷ small.' },
    ] },
  ],
};

// ---------------- At the track: tires ----------------
const tireForm = {
  target: 'tire', name: 'Tire', is_default: true,
  sections: [
    { id: 'tire', title: 'Tire', fields: [
      t('name', 'Tire ID', { core: true, required: true, placeholder: 'e.g. RR-12' }),
      t('brand', 'Brand', { suggest: true }), t('compound', 'Compound', { suggest: true }), t('size', 'Size', { suggest: true }),
      { key: 'position', label: 'Intended position', type: 'select', core: true, options: ['LF', 'RF', 'LR', 'RR', 'Any'] },
      { key: 'status', label: 'Status', type: 'select', core: true, options: ['New', 'Mounted', 'Used', 'Worn out'], default: 'New' },
      n('circumference', 'Circumference', 'in', { core: true }),
      n('durometer', 'Durometer', ''),
      t('wheel', 'Mounted on wheel'),
      n('laps', 'Laps run', ''), n('heat_cycles', 'Heat cycles', ''),
      { key: 'available_for', label: 'Available for cars', type: 'multiref', ref: 'car', core: true },
      { key: 'purchase_date', label: 'Purchase date', type: 'date' }, n('cost', 'Cost', '$'),
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

// ---------------- Workshop: shock dyno (Slade / Schatz / Kenco / Roehrig layouts) ----------------
export const ADJUST_TYPES = ['Non-adjustable', 'Single adjustable', 'Two-way', 'Three-way', 'Four-way'];
export const ADJUSTERS = {
  'Single adjustable': ['Adjuster'],
  'Two-way': ['Comp', 'Reb'],
  'Three-way': ['LS comp', 'HS comp', 'Reb'],
  'Four-way': ['LS comp', 'HS comp', 'LS reb', 'HS reb'],
};
const SHOCK_ADJUST_SECTIONS = [
  { id: 'adjust', title: 'Adjustment & test', fields: [
    { key: 'adjust_type', label: 'Adjustable', type: 'select', core: true, options: ADJUST_TYPES, default: 'Non-adjustable' },
    { key: 'adjust_unit', label: 'Adjuster measured in', type: 'select', options: ['Clicks open', 'Clicks closed', 'Turns', 'Set number'], showIf: 'adjust_type!=|Non-adjustable' },
    n('amplitude', 'Amplitude', 'in'), n('frequency', 'Frequency', 'Hz'), n('test_speed', 'Test speed', 'in/s'), n('rod_force', 'Rod force', 'lb'),
  ] },
];
const SHOCK_COLS = [
  { key: 'v', label: 'Velocity', unit: 'in/s' },
  { key: 'co', label: 'CO' }, { key: 'rc', label: 'RC' }, { key: 'cc', label: 'CC' },
  { key: 'ro', label: 'RO' }, { key: 'ca', label: 'CA' }, { key: 'ra', label: 'RA' },
];
const shockDynoForm = {
  target: 'dyno_run', name: 'Shock Dyno Run', is_default: true, dyno_kind: 'shock',
  sections: [
    { id: 'run', title: 'Run', fields: [
      { key: 'asset', label: 'Shock', type: 'ref', ref: 'asset', category: 'Shock', core: true, required: true },
      { key: 'date', label: 'Date', type: 'date', core: true, required: true },
      t('label', 'Valving / label', { core: true, placeholder: 'e.g. RF Wet-Heavy 87-125' }),
      t('model', 'Model', { suggest: true, placeholder: 'e.g. 650 PRO' }), t('serial', 'Dyno serial / file', { placeholder: 'e.g. 1511095B' }),
      { key: 'purpose', label: 'Purpose', type: 'select', options: ['Baseline', 'After rebuild', 'Re-valve', 'Post-race check', 'Development'] },
      n('gas', 'Gas pressure', 'psi'), n('temp', 'Shaft temp', '°'), n('stroke', 'Test stroke', 'in'),
      t('speeds', 'Test speeds', { placeholder: 'e.g. 3, 6, 10 in/s' }), { key: 'operator', label: 'Operator', type: 'member', defaultSelf: true },
    ] },
    ...SHOCK_ADJUST_SECTIONS,
    { id: 'data', title: 'Force vs velocity (lb)', fields: [
      { key: 'data', label: 'Readings', type: 'table', core: true, columns: SHOCK_COLS, xKey: 'v', showIf: 'adjust_type=|Non-adjustable',
        defaultRows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ v: String(v) })),
        help: 'C = compression, R = rebound; O = open, C = closed, A = average. Rebound forces are negative.' },
      { key: 'settings', label: 'Adjuster settings tested', type: 'sweep', core: true, columns: SHOCK_COLS, xKey: 'v', showIf: 'adjust_type!=|Non-adjustable',
        defaultRows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ v: String(v) })),
        help: 'One block per adjuster setting (e.g. fully closed, 1 click open … or set 10, 15, 20). Readings are optional — a setting can hold just a note.' },
    ] },
    { id: 'notes', title: 'Notes', fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }] },
  ],
};

// ---------------- Workshop: torsion bar rate test ----------------
const barDynoForm = {
  target: 'dyno_run', name: 'Torsion Bar Rate Test', is_default: false, dyno_kind: 'bar',
  sections: [
    { id: 'run', title: 'Test', fields: [
      { key: 'asset', label: 'Torsion bar', type: 'ref', ref: 'asset', category: 'Torsion Bar', core: true, required: true },
      { key: 'date', label: 'Date', type: 'date', core: true, required: true },
      t('label', 'Label', { core: true, placeholder: 'e.g. 1000 RF after season' }),
      n('nominal', 'Nominal rate', 'lb/in'), n('diameter', 'Diameter', 'in'), n('length', 'Active length', 'in'),
      n('arm', 'Arm length', 'in'), { key: 'operator', label: 'Operator', type: 'member', defaultSelf: true },
    ] },
    { id: 'data', title: 'Load vs deflection', fields: [
      { key: 'data', label: 'Readings', type: 'table', core: true, xKey: 'x',
        columns: [{ key: 'x', label: 'Deflection', unit: 'in' }, { key: 'load', label: 'Load', unit: 'lb' }],
        defaultRows: [0, 0.5, 1, 1.5, 2, 2.5, 3].map((x) => ({ x: String(x) })) },
      { key: 'rate', label: 'Measured rate', type: 'calc', core: true, formula: 'slope(data, x, load)', unit: 'lb/in' },
      { key: 'vs_nominal', label: 'Difference from nominal', type: 'calc', formula: 'slope(data, x, load) - nominal', unit: 'lb/in' },
    ] },
    { id: 'notes', title: 'Notes', fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }] },
  ],
};

// ---------------- Engines: build sheet (from Engine_Buildsheet_v5) ----------------
const B = 'avg(bore_max)';
const gasketCc = 'pi / 4 * gasket_bore * gasket_bore * gasket_thickness * 16.387';
const deckCc = `pi / 4 * ${B} * ${B} * avg(deck_clearance) * 16.387`;
const sweptCc = `pi / 4 * ${B} * ${B} * stroke * 16.387`;
const clearanceCc = `(avg(chamber_cc) + ${gasketCc} + ${deckCc} + avg(piston_volume))`;

const engineBuildForm = {
  target: 'engine_build', name: 'Engine Build Sheet', is_default: true,
  sections: [
    { id: 'build', title: 'Build', fields: [
      { key: 'engine', label: 'Engine', type: 'ref', ref: 'asset', category: 'Engine', core: true, required: true },
      { key: 'date', label: 'Date', type: 'date', core: true, required: true },
      { key: 'build_type', label: 'Build type', type: 'select', core: true, options: ['Fresh build', 'Freshen', 'Rebuild', 'Repair', 'Inspection'] },
      { key: 'builder', label: 'Builder', type: 'member', defaultSelf: true },
      t('customer', "Customer's name"), t('work_order', 'Work order #'), t('engine_type', 'Engine brand / type', { suggest: true }),
      n('engine_laps', 'Engine laps at build', ''), n('cylinders', 'Cylinders', '', { default: '8' }),
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
    { id: 'summary', title: 'Summary', carry: false, fields: [
      { key: 'bore', label: 'Bore (avg max)', type: 'calc', formula: B, unit: 'in' },
      { key: 'cid', label: 'C.I.D.', type: 'calc', formula: `pi / 4 * ${B} * ${B} * stroke * cylinders`, unit: 'ci' },
      { key: 'cr', label: 'Average compression ratio', type: 'calc', formula: `(${sweptCc} + ${clearanceCc}) / ${clearanceCc}`, unit: ':1' },
      n('hp', 'Dyno HP', 'hp'), n('torque', 'Dyno torque', 'lb-ft'), n('peak_rpm', 'Peak HP rpm', 'rpm'),
    ] },
    { id: 'ids', title: 'Components', fields: [
      t('block_id', 'Block I.D.'), t('crank_id', 'Crankshaft I.D.'), t('cam_id', 'Cam I.D.'),
      t('head_type', 'Cylinder head type'), t('head1_id', 'Cylinder head 1 I.D.'), t('head2_id', 'Cylinder head 2 I.D.'),
      t('piston_mfr', 'Piston MFR'), t('piston_pn', 'Piston P/N'), t('pin_pn', 'Pin P/N'), t('ring_pn', 'Ring set P/N'),
      t('rod_mfr', 'Con rod MFR'), t('rod_pn', 'Con rod P/N'), t('rod_type', 'Con rod type'), n('rod_length', 'C/C length', 'in'),
      t('main_brg_mfr', 'Main bearing MFR'), t('rod_brg_mfr', 'Rod bearing MFR'), t('head_gasket_pn', 'Head gasket P/N'),
    ] },
    { id: 'block', title: 'Block', fields: [
      t('block_brand', 'Brand', { suggest: true }), t('block_pn', 'P/N'), n('main_bore_size', 'Main bore size', 'in'), n('cam_bore_size', 'Cam bore size', 'in'),
      t('cam_location', 'Cam location'), t('cam_brg_type', 'Cam bearing type'), t('cam_brg_pn', 'Cam bearing P/N'),
      t('main_cap_pn', 'Main cap P/N'), t('main_stud_pn', 'Main bolt / stud P/N'), n('deck_height', 'Deck height', 'in'),
      { key: 'main_bore', label: 'Main bore dia', type: 'corners', input: 'number', corners: MAINS, unit: 'in' },
      { key: 'cam_bore', label: 'Cam bore dia', type: 'corners', input: 'number', corners: MAINS, unit: 'in' },
      cyl('lifter_bore_int', 'Lifter bore dia — intake', 'in'), cyl('lifter_bore_exh', 'Lifter bore dia — exhaust', 'in'),
      cyl('lifter_dia_int', 'Lifter dia — intake', 'in'), cyl('lifter_dia_exh', 'Lifter dia — exhaust', 'in'),
    ] },
    { id: 'bores', title: 'Cylinder bores', fields: [
      cyl('bore_min', 'Bore dia — min', 'in'), cyl('bore_max', 'Bore dia — max', 'in'),
    ] },
    { id: 'crank', title: 'Crankshaft', fields: [
      n('stroke', 'Stroke', 'in', { core: true }), n('crank_endplay', 'Crank end play', 'in'),
      { key: 'main_brg_id', label: 'Main bearing I.D.', type: 'corners', input: 'number', corners: MAINS, unit: 'in' },
      { key: 'main_journal', label: 'Main journal dia', type: 'corners', input: 'number', corners: MAINS, unit: 'in' },
      cyl('rod_bore', 'Rod bore dia', 'in'), cyl('rod_brg_id', 'Rod bearing I.D.', 'in'), cyl('rod_journal', 'Rod journal dia', 'in'),
      { key: 'rod_side_clr', label: 'Rod side clearance', type: 'corners', input: 'number', corners: PAIRS, unit: 'in' },
      n('rod_wt_big', 'Rod weight — big end', 'g'), n('rod_wt_small', 'Rod weight — small end', 'g'),
    ] },
    { id: 'cam', title: 'Camshaft', fields: [
      t('cam_mfr', 'MFR', { suggest: true }), t('cam_pn', 'Cam P/N'), t('cam_type', 'Type'), t('grind_no', 'Grind #'),
      { key: 'timing_at', label: 'Events timed at', type: 'select', options: ['.020', '.050'] },
      { key: 'lash_type', label: 'Lash', type: 'select', options: ['Hot', 'Cold'] },
      n('int_open', 'Intake opens', '° BTDC'), n('int_close', 'Intake closes', '° ABDC'),
      n('exh_open', 'Exhaust opens', '° BBDC'), n('exh_close', 'Exhaust closes', '° ATDC'),
      { key: 'int_duration', label: 'Intake duration', type: 'calc', formula: 'int_open + int_close + 180', unit: '°' },
      { key: 'exh_duration', label: 'Exhaust duration', type: 'calc', formula: 'exh_open + exh_close + 180', unit: '°' },
      { key: 'int_cl', label: 'Intake centreline', type: 'calc', formula: '(int_open + int_close + 180) / 2 - int_open', unit: '°' },
      { key: 'lsa', label: 'Lobe separation', type: 'calc', formula: '((int_open + int_close + 180) / 2 - int_open + (exh_open + exh_close + 180) / 2 - exh_close) / 2', unit: '°' },
      { key: 'overlap', label: 'Overlap', type: 'calc', formula: 'int_open + exh_close', unit: '°' },
      ie('lobe_lift', 'Lobe lift', 'in'), ie('rocker_ratio', 'Rocker ratio', ''), ie('lash', 'Lash', 'in'),
      { key: 'valve_lift_int', label: 'Valve lift — intake', type: 'calc', formula: 'lobe_lift.Int * rocker_ratio.Int', unit: 'in' },
      { key: 'valve_lift_exh', label: 'Valve lift — exhaust', type: 'calc', formula: 'lobe_lift.Exh * rocker_ratio.Exh', unit: 'in' },
      n('cam_installed_cl', 'Installed centreline', '°'), n('cam_endplay', 'Cam end play', 'in'),
      { key: 'cam_brg_id', label: 'Cam bearing I.D.', type: 'corners', input: 'number', corners: MAINS, unit: 'in' },
      { key: 'cam_journal', label: 'Cam journal dia', type: 'corners', input: 'number', corners: MAINS, unit: 'in' },
      cyl('cyl_lobe_int', 'Lobe lift per cyl — intake', 'in'), cyl('cyl_lobe_exh', 'Lobe lift per cyl — exhaust', 'in'),
    ] },
    { id: 'pistons', title: 'Pistons & rings', fields: [
      cyl('piston_size', 'Piston size', 'in'),
      cyl('ring1_gap', 'Top ring end gap', 'in'), cyl('ring2_gap', '2nd ring end gap', 'in'), cyl('oil_gap', 'Oil ring end gap', 'in'),
      t('groove_widths', 'Ring groove widths (1st / 2nd / oil)'), t('back_clearance', 'Ring back clearance (1st / 2nd / oil)'),
      n('pin_size', 'Pin size', 'in'), n('pin_length', 'Pin length', 'in'), n('pin_endplay', 'Pin end play', 'in'),
      t('pin_fit', 'Pin fit (rod / piston)'),
      cyl('piston_volume', 'Piston volume (dish +, dome −)', 'cc'), cyl('deck_clearance', 'Deck clearance', 'in'),
      n('piston_weight', 'Piston weight', 'g'),
    ] },
    { id: 'heads', title: 'Cylinder heads', fields: [
      t('head_brand', 'Brand', { suggest: true }), t('head_pn', 'P/N'),
      ie('valve', 'Valves (mfr / P/N / dia / material / stem / length)', '', 'text'),
      ie('spring', 'Springs (mfr / P/N)', '', 'text'), ie('retainer', 'Retainers', '', 'text'),
      t('cups', 'Cup mfr / P/N / material'), t('seals', 'Seal mfr / P/N / material'), t('locks', 'Lock mfr / P/N / material'),
      cyl('chamber_cc', 'Combustion chamber volume', 'cc'),
      n('gasket_bore', 'Head gasket bore', 'in'), n('gasket_thickness', 'Head gasket thickness', 'in'),
      ie('runner_vol', 'Runner volume', 'cc'), ie('flow', 'Flow', 'cfm'), ie('guide_clr', 'Valve guide clearance', 'in'),
    ] },
    { id: 'valvetrain', title: 'Valve train', fields: [
      cyl('ptv_int', 'Piston-to-valve — intake', 'in'), cyl('ptv_exh', 'Piston-to-valve — exhaust', 'in'),
      ie('coil_bind', 'Spring coil bind', 'in'), ie('installed_height', 'Installed height', 'in'),
      ie('seat_pressure', 'Spring seat pressure', 'lb'), ie('shim', 'Installed shim thickness', 'in'),
      ie('pushrod_length', 'Push rod length', 'in'), t('pushrod_mfr', 'Pushrod mfr / dia / wall'),
      t('rocker_pn', 'Rocker arm P/N'), t('lash_cap_pn', 'Lash cap P/N'),
    ] },
    { id: 'misc', title: 'Misc & fastener torque', fields: [
      t('timing_pn', 'Timing gear / chain P/N'), t('pan_pn', 'Pan P/N'), t('oil_pump_pn', 'Oil pump P/N'),
      n('main_tq_inner', 'Mains torque — inner', 'ft-lb'), n('main_tq_outer', 'Mains torque — outer', 'ft-lb'),
      n('head_tq', 'Head torque', 'ft-lb'), n('rod_tq', 'Rod torque', 'ft-lb'),
      cyl('rod_stretch', 'Rod bolt stretch', 'in'), n('rod_bolt_uses', 'Rod bolt — times used', ''),
      n('rotating_wt', 'Rotating weight', 'g'), n('recip_wt', 'Reciprocating weight', 'g'),
    ] },
  ],
};

// ---------------- Team: performance reviews ----------------
const R = ['1', '2', '3', '4', '5'];
const rating = (key, label) => ({ key, label, type: 'select', options: R, help: '1 = needs work, 5 = outstanding' });
const reviewForm = {
  target: 'review', name: 'Performance Review', is_default: true,
  sections: [
    { id: 'who', title: 'Review', fields: [
      { key: 'member', label: 'Team member', type: 'member', core: true, required: true },
      { key: 'reviewer', label: 'Reviewer', type: 'member', defaultSelf: true, core: true },
      { key: 'date', label: 'Date', type: 'date', core: true, required: true },
      t('period', 'Period', { placeholder: 'e.g. 2026 season, first half' }),
      { key: 'role_reviewed', label: 'Role', type: 'select', options: ['Crew Chief', 'Mechanic', 'Driver', 'Tire specialist', 'Engine builder', 'Other'] },
    ] },
    { id: 'ratings', title: 'Ratings', fields: [
      rating('r_prep', 'Preparation'), rating('r_setup', 'Setup decisions'), rating('r_comm', 'Communication'),
      rating('r_team', 'Teamwork'), rating('r_reliability', 'Reliability'), rating('r_safety', 'Safety'),
      { key: 'overall', label: 'Overall', type: 'calc', core: true, formula: '(r_prep + r_setup + r_comm + r_team + r_reliability + r_safety) / 6', unit: '/ 5' },
    ] },
    { id: 'comments', title: 'Comments', fields: [
      { key: 'strengths', label: 'Strengths', type: 'textarea' },
      { key: 'improve', label: 'Areas to improve', type: 'textarea' },
      { key: 'goals', label: 'Goals for next period', type: 'textarea' },
    ] },
  ],
};

export const PHASE2_FORMS = [trackCheckForm, gearForm, gearListForm, tireForm, shockDynoForm, barDynoForm, engineBuildForm, reviewForm];

// Fields added to existing teams' base forms on server start (only if the key is missing).
export const FORM_UPGRADES = [
  { target: 'setup', section: 'engine', after: 'gear', field: { key: 'gear_orientation', label: 'Gear position', type: 'select', options: ['Low', 'High'] } },
  { target: 'setup', section: 'engine', after: 'gear_orientation', field: { key: 'final_drive', label: 'Final drive', type: 'number', placeholder: 'from gear calculator' } },
  { target: 'setup', section: 'shocks', after: 'shocks', field: { key: 'shock_adjust', label: 'Adjuster settings', type: 'corners', input: 'text', corners: ['LF', 'RF', 'LR', 'RR'], placeholder: 'e.g. 3 clicks' } },
  { target: 'car', section: 'car', after: 'wheelbase', field: { key: 'gear_list', label: 'Gear list', type: 'ref', ref: 'gear_list', core: true } },
  { target: 'car', section: 'car', after: 'gear_list', field: { key: 'rp_ratio', label: 'Ring & pinion ratio', type: 'number', core: true, placeholder: 'e.g. 4.86' } },
  { target: 'asset', section: 'details', after: 'spec', field: { key: 'adjust_type', label: 'Shock adjustable', type: 'select', options: ADJUST_TYPES, showIf: 'category=Shock' } },
];

// Base forms whose structure changed: an existing team's copy is replaced by the shipped
// version when it lacks the marker field (user-added sections are kept at the end).
export const FORM_REPLACE = { 'gear:default': 'small', 'dyno_run:shock': 'adjust_type' };

/** Apply FORM_UPGRADES to a form definition (returns true if anything changed). */
export function applyUpgrades(form) {
  let changed = false;
  const has = (k) => form.sections.some((s) => s.fields.some((f) => f.key === k));
  for (const u of [...FORM_UPGRADES, ...PHASE3_UPGRADES]) {
    if (u.target !== form.target) continue;
    if (u.insertSection) {
      if (!form.sections.some((x) => x.id === u.insertSection.id)) {
        const i = form.sections.findIndex((x) => x.id === u.before);
        form.sections.splice(i >= 0 ? i : form.sections.length, 0, structuredClone(u.insertSection));
        changed = true;
      }
      continue;
    }
    if (u.sectionPatch) {
      const sec = form.sections.find((x) => x.id === u.section);
      const mark = `_patched_${Object.keys(u.sectionPatch).join('_')}`;
      // ifTitle: only when the team hasn't renamed the section themselves
      if (sec && !sec[mark] && (!u.ifTitle || sec.title === u.ifTitle)) { Object.assign(sec, u.sectionPatch, { [mark]: true }); changed = true; }
      continue;
    }
    if (u.move) { // move a field to another section, once (a team that moves it back keeps their choice)
      const from = form.sections.find((x) => x.fields.some((f) => f.key === u.move));
      const to = form.sections.find((x) => x.id === u.to);
      const f = from?.fields.find((x) => x.key === u.move);
      if (f && to && from !== to && !f[`_moved_${u.to}`]) {
        from.fields.splice(from.fields.indexOf(f), 1);
        const i = u.after ? to.fields.findIndex((x) => x.key === u.after) : -1;
        to.fields.splice(i >= 0 ? i + 1 : to.fields.length, 0, f);
        f[`_moved_${u.to}`] = true;
        changed = true;
      } else if (f && from === to && !f[`_moved_${u.to}`]) { f[`_moved_${u.to}`] = true; changed = true; }
      continue;
    }
    if (u.patch) {
      const f = form.sections.flatMap((s) => s.fields).find((x) => x.key === u.key);
      if (f && Object.entries(u.patch).some(([k, val]) => f[k] !== val) && !f[`_patched_${Object.keys(u.patch).join('_')}`]) {
        Object.assign(f, u.patch, { [`_patched_${Object.keys(u.patch).join('_')}`]: true });
        changed = true;
      }
      continue;
    }
    if (has(u.field.key)) continue;
    const sec = form.sections.find((s) => s.id === u.section) || form.sections.find((s) => s.fields.some((f) => f.key === u.after));
    if (!sec) continue;
    const i = u.first ? -1 : sec.fields.findIndex((f) => f.key === u.after);
    sec.fields.splice(u.first ? 0 : i >= 0 ? i + 1 : sec.fields.length, 0, { ...u.field });
    changed = true;
  }
  return changed;
}
