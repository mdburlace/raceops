// Engine tune sheets and workshop engine checks.
//
// An engine tune is how an engine should be run: the fuel settings for the weather (main jet and high-speed
// by ADR % or density altitude), the "ending" tune (plugs, lash, springs, timing, ram tubes, oil) and the fuel
// system. Each engine can have several versions; one is marked active (normally the newest). A tune can come
// from the engine builder (shared through an engine link) or be the team's own.
//
// A workshop engine check is the between-race service of an engine: leak-down, lash, spring seat pressure and
// plugs per cylinder, and checklists for the fuel system, oil, cooling, cam drive, ignition and torque. Its
// readings are compared with the engine's tune and with the engine's previous check.

const CYL = ['#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8'];
// on the form, by bank like a paper check sheet: 1-3-5-7 on the top row, 2-4-6-8 below
const BANKS = ['#1', '#3', '#5', '#7', '#2', '#4', '#6', '#8'];
const cyl = (key, label, unit, input = 'number', extra = {}) => ({ key, label, type: 'corners', input, corners: BANKS, unit, ...extra });
const t = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const n = (key, label, unit, extra = {}) => ({ key, label, type: 'number', unit, ...extra });
const ck = (key, label, extra = {}) => ({ key, label, type: 'check', ...extra });
const engineField = { key: 'engine', label: 'Engine', type: 'ref', ref: 'asset', category: 'Engine', core: true, required: true };

export const FUEL_COLUMNS = [
  { key: 'from', label: 'From' }, { key: 'to', label: 'To' },
  { key: 'main', label: 'Main pill', text: true }, { key: 'hs_psi', label: 'H/S pressure (psi)', text: true }, { key: 'hs', label: 'H/S pill', text: true },
  { key: 'note', label: 'Note', text: true },
];

const VALVE_STEPS = '1. Turn the engine until the exhaust rocker starts to open the exhaust valve. Set the intake lash.\n'
  + '2. Turn the engine until the intake rocker starts to come back from full lift. Set the exhaust lash.\n'
  + 'Don’t loosen rocker shaft bolts under spring load.';

export const engineTuneForm = {
  target: 'engine_tune', name: 'Engine Tune Sheet', is_default: true,
  title_template: '{name}',
  sections: [
    { id: 'tune', title: 'Tune', fields: [
      engineField,
      t('name', 'Version', { core: true, required: true, placeholder: 'e.g. 2026 v2' }),
      { key: 'date', label: 'Date', type: 'date', core: true },
      { key: 'active', label: 'Active version', type: 'checkbox', core: true, default: true },
      { key: 'source', label: 'From', type: 'select', options: ['Engine builder', 'Our team'], default: 'Our team' },
      t('builder', 'Engine builder', { suggest: true }),
      { key: 'build', label: 'For build', type: 'ref', ref: 'engine_build', match: 'engine' },
      { key: 'shared', label: 'Share with the engine’s owner', type: 'checkbox', default: true, shopOnly: true },
      t('induction', 'Injection / induction', { placeholder: 'e.g. Engler 2.9' }),
      t('prepared_by', 'Prepared by'),
    ] },
    { id: 'fuel', title: 'Fuel settings by weather', fields: [
      { key: 'fuel_by', label: 'Chart by', type: 'select', options: ['ADR %', 'Density altitude'], default: 'ADR %' },
      { key: 'da_unit', label: 'Density altitude in', type: 'select', options: ['ft', 'm'], default: 'ft', showIf: 'fuel_by=Density altitude' },
      { key: 'fuel_chart', label: 'Pill settings', type: 'table', core: true, columns: FUEL_COLUMNS, defaultRows: [{}],
        help: 'One row per weather band: ADR % (or density altitude) from and to, then the main pill, high-speed pressure and high-speed pill for it.' },
    ] },
    { id: 'ending', title: 'Ending tune', fields: [
      t('plugs', 'Spark plugs', { placeholder: 'e.g. NGK R5671A-10' }),
      n('plug_gap', 'Plug gap', 'in'),
      n('lash_int', 'Valve lash — intake', 'in'),
      n('lash_exh', 'Valve lash — exhaust', 'in'),
      { key: 'lash_when', label: 'Lash set', type: 'select', options: ['Cold', 'Hot'] },
      n('spring_int', 'Spring seat pressure — intake', 'lb'),
      n('spring_exh', 'Spring seat pressure — exhaust', 'lb'),
      t('springs', 'Valve springs used', { placeholder: 'Maker, part number' }),
      t('timing', 'Ignition timing', { placeholder: 'e.g. 30° BTDC' }),
      t('ram_tube', 'Ram tube length', { placeholder: 'e.g. 3.750 in' }),
      t('oil_level', 'Oil level', { placeholder: 'e.g. 12 qt, 2 in below the tank fill' }),
      t('oil_type', 'Recommended oil', { suggest: true }),
    ] },
    { id: 'fuel_system', title: 'Fuel system', fields: [
      t('fuel_pump', 'Fuel pump', { suggest: true }),
      t('metering_block', 'Metering block', { unit: '%', placeholder: 'e.g. 20–22' }),
      t('ls_psi', 'Low speed — pressure', { unit: 'psi', placeholder: 'e.g. 40–50' }),
      t('ls_pill', 'Low speed — pill'),
      t('hs_type', 'High-speed type', { placeholder: 'e.g. IRL' }),
      t('nozzles_down', 'Nozzles — down'),
      t('nozzles_up', 'Nozzles — up'),
    ] },
    { id: 'reference', title: 'Adjustment reference', fields: [
      { key: 'valve_procedure', label: 'Valve adjustment', type: 'textarea', default: VALVE_STEPS },
      t('rocker_stud', 'Rocker stud size', { placeholder: 'e.g. 5/16 in' }),
      n('rocker_stud_torque', 'Rocker stud torque', 'lb-ft'),
      t('rocker_stand', 'Rocker stand bolt size', { placeholder: 'e.g. 7/16 in' }),
      n('rocker_stand_torque', 'Rocker stand bolt torque', 'lb-ft'),
    ] },
    { id: 'notes', title: 'Notes / changes / run results', carry: false, fields: [
      { key: 'notes', label: 'Notes', type: 'textarea' },
      t('run_ref', 'Session / run reference'),
    ] },
  ],
};

const PLUG_READS = ['Good', 'Lean', 'Rich', 'Oily', 'Detonation'];
export const engineCheckForm = {
  target: 'engine_check', name: 'Workshop Engine Check', is_default: true,
  sections: [
    { id: 'check', title: 'Engine check', fields: [
      engineField,
      { key: 'date', label: 'Date', type: 'date', core: true, required: true },
      { key: 'car', label: 'Car', type: 'ref', ref: 'car' },
      { key: 'checked_by', label: 'Checked by', type: 'member', defaultSelf: true },
      { key: 'engine_tune', label: 'Compare with tune', type: 'ref', ref: 'engine_tune', match: 'engine' },
      { key: 'leakdown_temp', label: 'Leak-down done', type: 'select', options: ['Warm', 'Cold'] },
    ] },
    { id: 'health', title: 'Engine health', fields: [
      cyl('leakdown', 'Leak-down', '%'),
      cyl('lash_int', 'Valve lash — intake', 'in'),
      cyl('lash_exh', 'Valve lash — exhaust', 'in'),
      cyl('spring_int', 'Spring seat pressure — intake', 'lb'),
      cyl('spring_exh', 'Spring seat pressure — exhaust', 'lb'),
      cyl('plug_read', 'Plug reading', '', 'select', { options: PLUG_READS }),
      n('plug_gap', 'Plug gap set at', 'in'),
    ] },
    { id: 'fuel', title: 'Fuel system & injectors', fields: [
      ck('c_flush', 'Flush the methanol system with top-lube / after-run oil'),
      ck('c_nozzles', 'Nozzles out, cleaned in brake clean, blown out; no blockages; seals OK'),
      ck('c_filters', 'Main & secondary fuel filters opened: no debris or paper breakdown; flushed or replaced'),
      t('bypass_pill', 'Main bypass pill fitted'),
      t('hs_pill', 'High-speed lean-out pill fitted'),
      ck('c_valves', 'High-speed & secondary valves seat and seal'),
      ck('c_throttle', 'Throttle linkage smooth, no binding, reaches full throttle'),
      ck('c_return', 'Primary & backup throttle return springs crisp'),
      ck('c_fuel_lines', 'Fuel lines: no chassis or motor-plate rub, heat damage or kinked fittings'),
    ] },
    { id: 'oil', title: 'Oil, lubrication & filtration', fields: [
      ck('c_oil_level', 'Oil level at the baseline mark (sight glass / dry-sump tank)'),
      { key: 'oil_changed', label: 'Oil changed this time', type: 'select', options: ['Yes', 'No'] },
      ck('c_filter_cut', 'Old oil filter cut open and inspected'),
      { key: 'filter_status', label: 'Oil filter', type: 'select', options: ['Clean', 'Minor specks', 'Metal found — action needed'] },
      ck('c_tank', 'Dry-sump tank vent / breather cleaned'),
      ck('c_air', 'Air filter & pre-filter serviced'),
      ck('c_hat_seal', 'Injector hat / throttle body seals: no grit getting past the filter'),
    ] },
    { id: 'cooling', title: 'Cooling & exhaust', fields: [
      ck('c_radiator', 'Radiator: no rock damage or leaks'),
      ck('c_pressure', 'Cooling system pressure tested'),
      ck('c_water', 'Water level topped up'),
      ck('c_headers', 'Header primaries & collectors: no weld cracks'),
      ck('c_gaskets', 'Exhaust gaskets: no soot or blow-by'),
    ] },
    { id: 'cam_drive', title: 'Cam drive (power steering & wing)', fields: [
      ck('c_cam_hex', 'Cam spud & 3/8" drive hex: no rounding or wear'),
      ck('c_wing_lines', 'Wing adjuster lines (-10 & -6) to the wing valve: no leaks, swelling or chafing'),
    ] },
    { id: 'ignition', title: 'Ignition, electrical & mounting', fields: [
      ck('c_mag', 'Mag / ignition box covered, dry and mounts tight'),
      ck('c_harness', 'Wiring harness: no heat damage, fraying or loose plugs'),
      ck('c_motor_plates', 'Front & rear motor plate bolts torqued'),
      ck('c_header_bolts', 'Header flange bolts checked'),
      ck('c_ujoint', 'U-joint / torque ball: alignment bolts checked, housing greased'),
    ] },
    { id: 'signoff', title: 'Sign-off', carry: false, fields: [
      { key: 'signed_off', label: 'Signed off by', type: 'member' },
      { key: 'parts_needed', label: 'Parts needed for the next race', type: 'textarea' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

export const ENGINE_TUNE_FORMS = [engineTuneForm, engineCheckForm];

// ---------------------------------------------------------------- helpers
const vals = (r) => r?.data?.values || {};
const num = (x) => { const v = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(v) ? v : null; };

/** An engine picked on a form: a ref field stores the id, an asset picker stores { asset }. */
export const engineIdOf = (x) => (x && typeof x === 'object' ? x.asset || null : x || null);

const newest = (a, b) => String(vals(b).date || b.created_at || '').localeCompare(String(vals(a).date || a.created_at || ''));

/** The engine's tunes, newest first. */
export const tunesFor = (tunes, engineId) => tunes.filter((r) => vals(r).engine === engineId).sort(newest);

/** The tune to run: the version marked active, or the newest if none is. */
export function activeTune(tunes, engineId) {
  const mine = tunesFor(tunes, engineId);
  return mine.find((r) => vals(r).active) || mine[0] || null;
}

const M_PER_FT = 0.3048;
/**
 * The jetting chart row for the weather on a setup sheet. weather: { adr, alt, altUnit: 'ft'|'m' }.
 * Returns { row, value, unit, exact } or null when the chart or the reading is missing. A row matches when
 * the reading is between its From and To, or in a gap between two rows (the nearest); a reading off
 * either end of the chart gets the nearest row with exact: false.
 */
export function fuelRowFor(tuneValues, weather = {}) {
  const tv = tuneValues || {};
  const byDa = tv.fuel_by === 'Density altitude';
  const unit = byDa ? (tv.da_unit === 'm' ? 'm' : 'ft') : '%';
  let value = byDa ? num(weather.alt) : num(weather.adr);
  if (value === null) return null;
  if (byDa && weather.altUnit && weather.altUnit !== unit) value = weather.altUnit === 'm' ? value / M_PER_FT : value * M_PER_FT;
  const rows = (Array.isArray(tv.fuel_chart) ? tv.fuel_chart : []).map((r) => ({ r, a: num(r.from), b: num(r.to) }))
    .filter((x) => (x.a !== null || x.b !== null) && (x.r.main || x.r.hs || x.r.hs_psi));
  if (!rows.length) return null;
  const lo = (x) => Math.min(x.a ?? x.b, x.b ?? x.a);
  const hi = (x) => Math.max(x.a ?? x.b, x.b ?? x.a);
  const hit = rows.find((x) => value >= lo(x) && value <= hi(x));
  if (hit) return { row: hit.r, value, unit, exact: true };
  const dist = (x) => (value < lo(x) ? lo(x) - value : value - hi(x));
  const near = rows.slice().sort((x, y) => dist(x) - dist(y))[0];
  // a reading in the gap between two bands (89.5 between 87–89 and 90–93) takes the nearest band
  const inside = value >= Math.min(...rows.map(lo)) && value <= Math.max(...rows.map(hi));
  return { row: near.r, value, unit, exact: inside };
}

/** Setup-sheet values from a tune (and the chart row for the weather, when there is one). */
export function tuneToSheet(tuneValues, row) {
  const tv = tuneValues || {};
  const out = {};
  if (row?.main) out.main_jet = String(row.main);
  const hs = [row?.hs_psi && `${row.hs_psi} psi`, row?.hs].filter(Boolean).join(' / ');
  if (hs) out.hs_bypass = hs;
  const ls = [tv.ls_psi && `${tv.ls_psi} psi`, tv.ls_pill].filter(Boolean).join(' / ');
  if (ls) out.ls_bypass = ls;
  const nz = [tv.nozzles_down && `${tv.nozzles_down} down`, tv.nozzles_up && `${tv.nozzles_up} up`].filter(Boolean).join(', ');
  if (nz) out.nozzles = nz;
  if (tv.fuel_pump) out.pump = String(tv.fuel_pump);
  if (tv.timing) out.timing = String(tv.timing);
  return out;
}

/** How far a check's readings can drift before they're flagged. */
export const CHECK_LIMITS = { lash: 0.002, springDropPct: 10, springBelowSpecPct: 10, leakRise: 3, leakHigh: 10 };

/**
 * Compare an engine check with the tune and the engine's previous check.
 * Returns { cylinders: [...], flags: [{ level, text }] } where each cylinder row holds
 * { cyl, leak:{now,was,level}, lash_int:{now,spec,level}, lash_exh, spring_int:{now,was,spec,drop,level}, spring_exh, plug }.
 */
export function compareCheck(cv, tune, prev) {
  const c = cv || {}; const tv = tune || {}; const pv = prev || {};
  const L = CHECK_LIMITS;
  const flags = [];
  const cylinders = CYL.map((cy) => {
    const row = { cyl: cy };
    const leak = num(c.leakdown?.[cy]); const leakWas = num(pv.leakdown?.[cy]);
    row.leak = { now: leak, was: leakWas, level: '' };
    if (leak !== null) {
      if (leak >= L.leakHigh) { row.leak.level = 'over'; flags.push({ level: 'over', text: `Cylinder ${cy}: leak-down ${leak}% (${L.leakHigh}% or more).` }); }
      else if (leakWas !== null && leak - leakWas >= L.leakRise) { row.leak.level = 'warn'; flags.push({ level: 'warn', text: `Cylinder ${cy}: leak-down up from ${leakWas}% to ${leak}% since the last check.` }); }
    }
    for (const [k, label] of [['lash_int', 'intake lash'], ['lash_exh', 'exhaust lash']]) {
      const now = num(c[k]?.[cy]); const spec = num(tv[k]);
      row[k] = { now, spec, level: '' };
      if (now !== null && spec !== null && Math.abs(now - spec) > L.lash + 1e-9) {
        row[k].level = 'warn';
        flags.push({ level: 'warn', text: `Cylinder ${cy}: ${label} ${now} in, tune says ${spec} in${tv.lash_when ? ` (${tv.lash_when.toLowerCase()})` : ''}.` });
      }
    }
    for (const [k, label] of [['spring_int', 'intake spring'], ['spring_exh', 'exhaust spring']]) {
      const now = num(c[k]?.[cy]); const was = num(pv[k]?.[cy]); const spec = num(tv[k]);
      const drop = now !== null && was ? ((was - now) / was) * 100 : null;
      row[k] = { now, was, spec, drop, level: '' };
      if (now === null) continue;
      if (drop !== null && drop >= L.springDropPct) {
        row[k].level = 'over';
        flags.push({ level: 'over', text: `Cylinder ${cy}: ${label} down ${drop.toFixed(0)}% since the last check (${was} → ${now} lb). It may be going weak.` });
      } else if (spec && ((spec - now) / spec) * 100 >= L.springBelowSpecPct) {
        row[k].level = 'warn';
        flags.push({ level: 'warn', text: `Cylinder ${cy}: ${label} ${now} lb, ${(((spec - now) / spec) * 100).toFixed(0)}% under the tune’s ${spec} lb.` });
      }
    }
    row.plug = c.plug_read?.[cy] || '';
    if (row.plug && row.plug !== 'Good') flags.push({ level: row.plug === 'Detonation' ? 'over' : 'warn', text: `Cylinder ${cy}: plug reads ${row.plug.toLowerCase()}.` });
    return row;
  });
  const gap = num(c.plug_gap); const gapSpec = num(tv.plug_gap);
  if (gap !== null && gapSpec !== null && Math.abs(gap - gapSpec) > 0.0005) flags.push({ level: 'warn', text: `Plugs gapped at ${gap} in, tune says ${gapSpec} in.` });
  if (c.bypass_pill && tv.ls_pill && String(c.bypass_pill).trim() !== String(tv.ls_pill).trim()) flags.push({ level: 'warn', text: `Main bypass pill ${c.bypass_pill}, tune says ${tv.ls_pill}.` });
  if (c.filter_status === 'Metal found — action needed') flags.push({ level: 'over', text: 'Metal found in the oil filter.' });
  return { cylinders, flags };
}

/** The engine's check before this one (by date). */
export function previousCheck(checks, engineId, current) {
  const key = (r, v) => `${v.date || ''}|${r?.created_at || '9999'}`;
  const me = key(current, vals(current));
  return checks.filter((r) => r.id !== current?.id && vals(r).engine === engineId && key(r, vals(r)) < me)
    .sort((a, b) => key(b, vals(b)).localeCompare(key(a, vals(a))))[0] || null;
}

/** Values of a tune as shared with the engine's owner (everything on the sheet). */
export function tuneForPack(r) {
  const v = vals(r);
  return { id: r.id, updated_at: r.updated_at || null, name: v.name || '', date: v.date || '', active: !!v.active, values: v };
}

/** A shared tune turned into the team's own: the team's engine, marked as from the builder. */
export function tuneFromPack(packTune, { engineId, shop }) {
  const v = { ...(packTune.values || {}) };
  delete v.build; delete v.shared; delete v.engine;
  return { ...v, engine: engineId, source: 'Engine builder', builder: shop || v.builder || '', active: true, builder_tune: packTune.id, builder_updated: packTune.updated_at || '' };
}
