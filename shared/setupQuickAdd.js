// Setup sheet: the quick add screen and the October 2026 setup sheet changes.
//
// The quick add screen opens with a long press on a number box on a setup sheet (track or workshop). It's a
// big keypad, the values this team uses most for that box, and for some boxes:
//  - fractions (+1/16 … +15/16) for measurements taken in inches and fractions (block height, turns, ride height…);
//  - angles: pick from a list, or the angle finder, which reads the phone's tilt sensor laid against the wing,
//    the frame rail or the birdcage.
// QUICK_ADD says which kind each box gets; a form field can set `quick: 'fraction' | 'angle' | 'number'` itself.

/** Sixteenths, as the keypad's fraction buttons show them. Eighths are drawn bold. */
export const FRACTIONS = Array.from({ length: 15 }, (_, i) => {
  const n = i + 1; const g = gcd(n, 16);
  return { label: `${n / g}/${16 / g}`, value: n / 16, bold: n % 2 === 0 };
});
function gcd(a, b) { return b ? gcd(b, a % b) : a; }

/** Angle lists for Pick: from, to, step (degrees). */
const WING = { min: 0, max: 30, step: 0.5 };
export const QUICK_ADD = {
  blocked: { kind: 'fraction' },
  turns: { kind: 'fraction' },
  ride_height: { kind: 'fraction' },
  block_heights: { kind: 'fraction' },
  front_turns: { kind: 'fraction' },
  rear_turns: { kind: 'fraction' },
  front_ride_height: { kind: 'fraction' },
  rear_ride_height: { kind: 'fraction' },
  stagger_cold: { kind: 'fraction' },
  stagger_hot: { kind: 'fraction' },
  stagger_front: { kind: 'fraction' },
  target_stagger: { kind: 'fraction' },
  wheel_offset: { kind: 'fraction' },
  wheel_spacing: { kind: 'fraction' },
  wing_position: { kind: 'fraction' },
  jl_length: { kind: 'fraction' },
  jl_upper_strap: { kind: 'fraction' },
  jl_lower_strap: { kind: 'fraction' },
  arm_length: { kind: 'fraction' },
  axle_lead: { kind: 'fraction' },
  wing_angle: { kind: 'angle', ...WING },
  nose_wing: { kind: 'angle', ...WING },
  rake: { kind: 'angle', min: -2, max: 6, step: 0.25 },
  tilt: { kind: 'angle', min: -3, max: 3, step: 0.25 },
  birdcage_angle: { kind: 'angle', min: -10, max: 15, step: 0.5 },
  caster: { kind: 'angle', min: 0, max: 15, step: 0.5 },
  camber: { kind: 'angle', min: -5, max: 5, step: 0.25 },
};

/** The forms the quick add screen works on. */
export const QUICK_ADD_TARGETS = ['setup', 'shop_setup'];

/** What the quick add screen shows for a field: { kind, min, max, step }. */
export function quickAddFor(field) {
  const rule = QUICK_ADD[field?.key] || {};
  const kind = ['fraction', 'angle', 'number'].includes(field?.quick) ? field.quick : rule.kind || 'number';
  return { min: 0, max: 30, step: 0.5, ...rule, kind };
}

/** "1 3/8" for 1.375 when it's a whole number of sixteenths; '' otherwise. */
export function asFraction(x) {
  const v = Number(x);
  if (!Number.isFinite(v) || String(x ?? '').trim() === '') return '';
  const sign = v < 0 ? '−' : ''; const a = Math.abs(v);
  const whole = Math.floor(a + 1e-9); const six = Math.round((a - whole) * 16);
  if (Math.abs((a - whole) * 16 - six) > 1e-6 || six === 0 || six === 16) return '';
  const g = gcd(six, 16);
  return `${sign}${whole ? `${whole} ` : ''}${six / g}/${16 / g}`;
}

/** Keep the whole number typed so far and set its fraction: "1" + 3/8 → "1.375", "-2.5" + 1/4 → "-2.25". */
export function withFraction(text, frac) {
  const s = String(text ?? '').trim();
  const neg = s.startsWith('-');
  const whole = Math.floor(Math.abs(Number(s.replace(/^-/, '')) || 0) + 1e-9);
  const v = whole + frac;
  return `${neg ? '-' : ''}${tidy(v)}`;
}
const tidy = (v) => String(Math.round(v * 10000) / 10000);

/** One keypad press applied to the text in the box. */
export function keypad(text, key) {
  const s = String(text ?? '');
  if (key === 'back') return s.slice(0, -1);
  if (key === 'sign') return s.startsWith('-') ? s.slice(1) : `-${s}`;
  if (key === '.') return s.includes('.') ? s : `${s || '0'}.`;
  if (/^\d$/.test(key)) return s === '0' ? key : s === '-0' ? `-${key}` : s + key;
  return s;
}

/** Angles for Pick, from the field's range. */
export function angleList({ min, max, step }) {
  const out = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/**
 * The values a team uses most for one box, most used first (ties: most recent), from its setup sheets.
 * `records` are setup records (newest first is best); `corner` for a four-corner field.
 */
export function commonValues(records, key, corner, limit = 6) {
  const count = new Map();
  (records || []).forEach((r, i) => {
    const v = r?.data?.values?.[key];
    const x = corner ? (v && typeof v === 'object' ? v[corner] : undefined) : v;
    const s = String(x ?? '').trim();
    if (!s || !Number.isFinite(Number(s))) return;
    const c = count.get(s) || { n: 0, first: i };
    c.n += 1; count.set(s, c);
  });
  return [...count.entries()].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first).slice(0, limit).map(([s]) => s);
}

/**
 * The tilt of the phone's long side from level, in degrees, from a deviceorientation event: beta when the
 * phone lies along a surface (top towards the front), from −90 to 90. Null if the event has no reading.
 */
export function tiltOf(e) {
  const b = Number(e?.beta);
  if (!Number.isFinite(b) || e?.beta == null) return null;
  return b > 90 ? 180 - b : b < -90 ? -180 - b : b;
}

// ---------------------------------------------------------------- the setup sheet changes (form upgrades)
const CORNERS = ['LF', 'RF', 'LR', 'RR'];
const REARS = ['LR', 'RR'];
const JACOBS = [
  { key: 'h_jacobs', label: 'Jacobs ladder', type: 'heading' },
  { key: 'jl_length', label: 'Jacobs ladder length', type: 'number', unit: 'in' },
  { key: 'jl_upper_strap', label: 'Upper strap length', type: 'number', unit: 'in' },
  { key: 'jl_lower_strap', label: 'Lower strap length', type: 'number', unit: 'in' },
  { key: 'jl_mount_upper', label: 'Chassis mount (upper)', type: 'text', placeholder: 'e.g. hole 2' },
  { key: 'jl_mount_lower', label: 'Chassis mount (lower)', type: 'text', placeholder: 'e.g. hole 4' },
  { key: 'jl_birdcage_mount', label: 'Birdcage mount', type: 'text', placeholder: 'e.g. top hole' },
];
const chain = (fields, target, section, after) => fields.map((field, i) => ({ target, section, after: i ? fields[i - 1].key : after, field }));

export const SETUP_SHEET_UPGRADES = [
  // Blocked is the height of the block at each corner; Turns is the torsion stop adjuster turns
  { target: 'setup', key: 'blocked', patch: { label: 'Block height', unit: 'in', quick: 'fraction' } },
  { target: 'setup', section: 'chassis', after: 'blocked', field: { key: 'turns', label: 'Turns', type: 'corners', input: 'number', corners: CORNERS, help: 'Torsion stop adjuster turns set at each corner.' } },
  { target: 'setup', section: 'chassis', after: 'ride_height', field: { key: 'rake', label: 'Chassis rake', type: 'number', unit: '°' } },
  { target: 'setup', section: 'chassis', after: 'rake', field: { key: 'tilt', label: 'Chassis tilt', type: 'number', unit: '°' } },
  { target: 'setup', section: 'chassis', after: 'lr_radius_rod', field: { key: 'rr_radius_rod', label: 'RR radius rod (front mount)', type: 'text', placeholder: 'e.g. hole 3' } },
  { target: 'setup', section: 'chassis', after: 'rear_steer', field: { key: 'birdcage_angle', label: 'Birdcage angle', type: 'corners', input: 'number', corners: REARS, unit: '°' } },
  ...chain(JACOBS, 'setup', 'chassis', 'birdcage_angle'),
  // engine rpm: the overall highest, the highs on the straights and the lows in the corners
  { target: 'setup', key: 'tach_high', patch: { label: 'High RPM (straights)', help: 'The highest readings on the straights.' } },
  { target: 'setup', key: 'tach_low', patch: { label: 'Low RPM (corners)', help: 'The lowest readings in the corners.' } },
  { target: 'setup', section: 'race', after: 'tach_high', field: { key: 'rpm_max', label: 'Highest RPM (overall)', type: 'number', unit: 'rpm', stage: 'after' } },
  // the workshop setup: the same measurements, so a track sheet started from it takes them
  { target: 'shop_setup', key: 'block_heights', patch: { maps: 'blocked' } },
  { target: 'shop_setup', key: 'front_turns', patch: { label: 'Turns', maps: 'turns' } },
  { target: 'shop_setup', key: 'rear_turns', patch: { label: 'Turns', maps: 'turns' } },
  { target: 'shop_setup', section: 'reference', after: 'block_heights', field: { key: 'rake', label: 'Chassis rake', type: 'number', unit: '°' } },
  { target: 'shop_setup', section: 'reference', after: 'rake', field: { key: 'tilt', label: 'Chassis tilt', type: 'number', unit: '°' } },
  { target: 'shop_setup', section: 'rear', after: 'lr_radius_rod', field: { key: 'rr_radius_rod', label: 'RR radius rod (front mount)', type: 'text' } },
  { target: 'shop_setup', key: 'jacobs_ladder', patch: { label: 'Jacobs ladder notes' } },
  ...chain(JACOBS.slice(1), 'shop_setup', 'rear', 'jacobs_ladder'),
  { target: 'shop_setup', section: 'rear', after: 'jl_birdcage_mount', field: { key: 'birdcage_angle', label: 'Birdcage angle', type: 'corners', input: 'number', corners: REARS, unit: '°' } },
];
