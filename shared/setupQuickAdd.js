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

/**
 * The sheet a value is "last session" from: the sheet this one was copied from, else the newest other sheet for
 * the same car (by event date, then running order). `records` are records of the form's type.
 */
export function previousSheet(records, values, recordId, eventDate = () => '') {
  const all = records || [];
  if (values?.copied_from) { const c = all.find((r) => r.id === values.copied_from); if (c) return c; }
  const car = values?.car;
  const key = (r) => `${eventDate(r) || String(r?.data?.values?.date || '')}|${String(r?.data?.values?.order ?? '').padStart(6, '0')}|${r?.updated_at || ''}`;
  const mine = key({ data: { values: values || {} }, updated_at: '9' });
  return all.filter((r) => r.id !== recordId && !r.deleted && (!car || r.data?.values?.car === car) && key(r) < mine)
    .sort((a, b) => key(b).localeCompare(key(a)))[0] || null;
}

/** A value of one box on a record ('' when there isn't one). */
export function valueOn(record, key, corner) {
  const v = record?.data?.values?.[key];
  const x = corner ? (v && typeof v === 'object' ? v[corner] : '') : v;
  return x == null || typeof x === 'object' ? '' : String(x).trim();
}

// ---------------------------------------------------------------- say the number
const ONES = { zero: 0, oh: 0, nought: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
// "three eighths", "one quarter": a numerator; "five (a) half": a whole number then a fraction
const isNumerator = (w, next) => !!DENOMS[next] && (/s$/.test(next) || w === 'one' || w === '1');
const DENOMS = { half: 2, halves: 2, quarter: 4, quarters: 4, eighth: 8, eighths: 8, sixteenth: 16, sixteenths: 16 };

/**
 * A number from what someone said: "14.5", "fourteen point five", "minus two", "1 and 3/8", "one and three
 * eighths", "five and a half", "three quarters", "8 thousand 750". Null when it isn't a number.
 */
export function parseSpokenNumber(said) {
  let t = String(said ?? '').toLowerCase().replace(/[−–]/g, '-').replace(/,(?=\d{3}\b)/g, '').replace(/(\d)\s*\/\s*(\d)/g, '$1/$2')
    .replace(/[^a-z0-9./\- ]+/g, ' ').replace(/-/g, (m, i, str) => (/\d/.test(str[i + 1] || '') && (i === 0 || str[i - 1] === ' ') ? ' minus ' : ' ')).trim();
  if (!t) return null;
  const words = t.split(/\s+/).filter((w) => !['and', 'a', 'an', 'degrees', 'degree', 'inches', 'inch', 'turns', 'turn', 'psi', 'rpm', 'is', 'it\'s', 'its'].includes(w));
  let neg = false;
  if (['minus', 'negative'].includes(words[0])) { neg = true; words.shift(); }
  if (!words.length) return null;
  // whole part: digits or number words, up to "point" or a fraction
  let whole = null; let cur = 0; let seen = false; let i = 0;
  const flush = () => { if (seen) { whole = (whole || 0) + cur; cur = 0; } };
  for (; i < words.length; i++) {
    const w = words[i];
    if (/^\d+(\.\d+)?$/.test(w)) {
      if (isNumerator(w, words[i + 1])) break;   // "3 eighths"
      cur += Number(w); seen = true;
    } else if (w in ONES) {
      if (isNumerator(w, words[i + 1])) break;   // "three eighths"
      cur += ONES[w]; seen = true;
    } else if (w in TENS) { cur += TENS[w]; seen = true;
    } else if (w === 'hundred') { cur = (cur || 1) * 100; seen = true;
    } else if (w === 'thousand') { whole = ((whole || 0) + (cur || 1)) * 1000; cur = 0; seen = true;
    } else break;
  }
  flush();
  let v = whole;
  const rest = words.slice(i);
  if (rest[0] === 'point' || rest[0] === 'dot') {
    const digits = rest.slice(1).map((w) => (/^\d+$/.test(w) ? w : w in ONES && ONES[w] < 10 ? String(ONES[w]) : null));
    if (!digits.length || digits.some((d) => d == null)) return null;
    v = Number(`${whole || 0}.${digits.join('')}`);
  } else if (rest.length) {
    let num; let den;
    if (rest.length === 1 && /^\d+\/\d+$/.test(rest[0])) [num, den] = rest[0].split('/').map(Number);
    else if (rest.length === 1 && DENOMS[rest[0]]) { num = 1; den = DENOMS[rest[0]]; }
    else if (rest.length === 2 && DENOMS[rest[1]]) { num = /^\d+$/.test(rest[0]) ? Number(rest[0]) : ONES[rest[0]]; den = DENOMS[rest[1]]; }
    if (!den || num == null || !Number.isFinite(num)) return null;
    v = (whole || 0) + num / den;
  }
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round((neg ? -v : v) * 10000) / 10000;
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
  { target: 'setup', key: 'turns', patch: { step: 0.5 } },   // − and + by half a turn
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
