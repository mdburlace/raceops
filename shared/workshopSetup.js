// Workshop setup sheets (In the Workshop): the car as it's set up on the shop floor, measured on the setup
// pad — reference conditions, front and rear suspension, tyres and wheels, wings, drivetrain and weights.
// No weather, nothing measured after a session, no race result and no track feedback.
//
// A workshop setup is linked to an event as its baseline (the event's "Workshop setup"), and an At the Track
// setup sheet can start from it. Fields share the track sheet's keys where they mean the same thing, so they
// copy across as they are; fields split front/rear here (`maps`) are merged into the track sheet's four-corner
// field. Fields only measured in the shop stay with the workshop setup.

const CORNERS = ['LF', 'RF', 'LR', 'RR'];
const FRONT = ['LF', 'RF'];
const REAR = ['LR', 'RR'];
const h = (key, label) => ({ key, label, type: 'heading' });
const corners = (key, label, cs, input = 'number', extra = {}) => ({ key, label, type: 'corners', input, corners: cs, ...extra });
const num = (key, label, extra = {}) => ({ key, label, type: 'number', ...extra });
const text = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });

export const shopSetupForm = {
  target: 'shop_setup', name: 'Workshop Setup Sheet', is_default: true,
  title_template: '{name}',
  sections: [
    { id: 'sheet', title: 'Workshop setup', fields: [
      { key: 'car', label: 'Car', type: 'ref', ref: 'car', core: true, required: true },
      text('name', 'Name', { core: true, required: true, placeholder: 'e.g. Valley tacky baseline' }),
      { key: 'date', label: 'Set up on', type: 'date', core: true },
      { key: 'set_by', label: 'Set up by', type: 'member', defaultSelf: true },
      { key: 'purpose', label: 'Use it for', type: 'text', placeholder: 'e.g. tacky 1/3-mile tracks' },
    ] },
    { id: 'reference', title: 'Baseline & reference conditions', fields: [
      num('fuel_load', 'Fuel load'),
      { key: 'fuel_load_unit', label: 'Fuel in', type: 'select', options: ['US gal', 'L'] },
      text('driver_weight', 'Driver weight / ballast', { placeholder: 'e.g. 78 kg driver, or 80 kg ballast in the seat' }),
      { key: 'chassis_type', label: 'Chassis type', type: 'select', options: ['Standard rail', 'Raised rail'] },
      corners('block_heights', 'Setup block heights', CORNERS, 'number', { unit: 'in' }),
    ] },
    { id: 'front', title: 'Front suspension & geometry', fields: [
      corners('front_bars', 'Torsion bars', FRONT, 'asset', { category: 'Torsion Bar', maps: 'bars', filterByCorner: true }),
      corners('front_bar_spec', 'Bar material / diameter / brand', FRONT, 'text'),
      corners('arm_length', 'Torsion arm length', FRONT, 'number', { unit: 'in' }),
      corners('front_turns', 'Bar stops / turns', FRONT, 'number', { maps: 'blocked' }),
      corners('front_ride_height', 'Ride height', FRONT, 'number', { unit: 'in', maps: 'ride_height' }),
      text('toe', 'Toe', { placeholder: 'e.g. 1/16 out (across the tyre faces)' }),
      corners('caster', 'Caster', FRONT, 'number', { unit: '°' }),
      corners('camber', 'Camber', FRONT, 'number', { unit: '°' }),
      num('axle_lead', 'Axle lead', { unit: 'in' }),
      corners('front_square', 'Front axle squaring', FRONT, 'number', { unit: 'in' }),
      corners('front_shocks', 'Shocks', FRONT, 'asset', { category: 'Shock', maps: 'shocks', filterByCorner: true }),
      corners('front_valving', 'Valving (compression / rebound)', FRONT, 'text'),
      corners('front_clicks', 'Adjuster clicks', FRONT, 'text', { maps: 'shock_adjust' }),
    ] },
    { id: 'rear', title: 'Rear suspension & linkage', fields: [
      corners('rear_bars', 'Torsion bars', REAR, 'asset', { category: 'Torsion Bar', maps: 'bars', filterByCorner: true }),
      corners('rear_bar_spec', 'Bar material / diameter', REAR, 'text'),
      corners('rear_turns', 'Bar stops / turns', REAR, 'number', { maps: 'blocked' }),
      corners('rear_ride_height', 'Ride height / block clearance', REAR, 'number', { unit: 'in', maps: 'ride_height' }),
      corners('rear_square', 'Rear axle squaring', REAR, 'number', { unit: 'in' }),
      { key: 'radius_rods', label: 'Radius rods & pick-up points', type: 'textarea', placeholder: 'Rod lengths, and the holes used on the frame and the birdcages' },
      text('lr_radius_rod', 'LR radius rod (front mount)'),
      text('jacobs_ladder', 'Jacob’s ladder', { placeholder: 'Frame hole / strap hole' }),
      corners('rear_shocks', 'Shocks', REAR, 'asset', { category: 'Shock', maps: 'shocks', filterByCorner: true }),
      corners('rear_valving', 'Valving (compression / rebound)', REAR, 'text'),
      corners('rear_clicks', 'Adjuster clicks', REAR, 'text', { maps: 'shock_adjust' }),
      corners('tie_downs', 'Tie-downs', REAR, 'text'),
      corners('bump_type', 'Bump rubber type', CORNERS, 'text'),
      corners('bump_packers', 'Packers', CORNERS, 'number'),
    ] },
    { id: 'tires', title: 'Tyres & wheels', fields: [
      corners('tires', 'Tyres', CORNERS, 'asset', { ref: 'tire', filterByCorner: true }),
      corners('tire_spec', 'Compound / brand / size', CORNERS, 'text'),
      corners('pressure_cold', 'Pressure cold', CORNERS, 'number', { unit: 'psi' }),
      num('stagger_front', 'Front stagger', { unit: 'in' }),
      num('stagger_cold', 'Rear stagger', { unit: 'in' }),
      corners('wheels', 'Wheels', CORNERS, 'asset', { category: 'Wheel', filterByCorner: true }),
      corners('wheel_spacing', 'Rear wheel spacing (frame to inner lip)', REAR, 'number', { unit: 'in' }),
      corners('front_spacers', 'Front spindle spacer stack', FRONT, 'text'),
    ] },
    { id: 'wing', title: 'Wings', fields: [
      h('h_top_wing', 'Top wing'),
      { key: 'top_wing', label: 'Top wing', type: 'asset', category: 'Wing', scopePosition: 'Top' },
      num('wing_angle', 'Top wing angle', { unit: '°' }),
      num('wing_position', 'Top wing position (slider)', { unit: 'in' }),
      text('wing_offset', 'Side-to-side offset', { placeholder: 'e.g. 2 in left' }),
      text('wicker', 'Top wing wicker'),
      h('h_front_wing', 'Front wing'),
      { key: 'front_wing', label: 'Front wing', type: 'asset', category: 'Wing', scopePosition: 'Front' },
      num('nose_wing', 'Front wing angle', { unit: '°' }),
      text('front_wicker', 'Front wing wicker'),
    ] },
    { id: 'engine', title: 'Drivetrain & engine', fields: [
      { key: 'engine', label: 'Motor', type: 'asset', category: 'Engine' },
      { key: 'gear', label: 'Quick-change gear', type: 'ref', ref: 'gear' },
      { key: 'gear_orientation', label: 'Gear position', type: 'select', options: ['Low', 'High'] },
      text('timing', 'Ignition timing'),
      text('nozzles', 'Nozzles'),
      text('main_jet', 'Main', { unit: '#' }),
      text('ls_bypass', 'LS'),
      text('hs_bypass', 'HS'),
    ] },
    { id: 'weights', title: 'Weights', fields: [
      corners('corner_weights', 'Corner weights', CORNERS, 'number'),
      num('total_weight', 'Total weight'),
      num('left_pct', 'Left side', { unit: '%' }),
      num('rear_pct', 'Rear', { unit: '%' }),
      num('cross_pct', 'Cross', { unit: '%' }),
    ] },
    { id: 'notes', title: 'Notes', carry: false, fields: [
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

export const WORKSHOP_FORMS = [shopSetupForm];

/** Fields a workshop setup never passes to anything (who, when, what it's called). */
const OWN = ['car', 'name', 'date', 'set_by', 'purpose', 'notes'];

/**
 * The values an At the Track setup sheet (`trackForm`) takes from a workshop setup: fields with the same key,
 * plus front/rear fields merged into the track sheet's four-corner field. Only keys the track form has.
 */
export function toTrackValues(shopForm, shopValues, trackForm) {
  const sv = shopValues || {};
  const trackKeys = new Set((trackForm?.data?.sections || trackForm?.sections || []).flatMap((s) => (s.fields || []).map((f) => f.key)));
  const out = {};
  for (const sec of shopForm?.data?.sections || shopForm?.sections || []) {
    for (const f of sec.fields || []) {
      if (!f.key || OWN.includes(f.key) || f.type === 'heading') continue;
      const val = sv[f.key];
      if (val === undefined || val === null || val === '') continue;
      if (f.maps) {
        if (!trackKeys.has(f.maps) || typeof val !== 'object') continue;
        out[f.maps] = { ...(out[f.maps] || {}), ...val };
      } else if (trackKeys.has(f.key)) {
        out[f.key] = val;
      }
    }
  }
  // the track sheet records fuel in its own unit field
  if (out.fuel_load !== undefined) delete out.fuel_load;
  return out;
}

/** Copy one workshop setup's values to start another (everything but the name, date and notes). */
export const SHOP_SETUP_SKIP = ['name', 'date', 'set_by', 'notes'];
