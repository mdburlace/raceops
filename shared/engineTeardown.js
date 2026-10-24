// Engine teardown & pre-check: the forensic inspection of an engine as it comes apart, before the rebuild.
//
// It records the engine's condition as found (the baseline for the rebuild), helps find the root cause of a
// failure, and decides for each part whether it's reused, machined or replaced. Four parts, like a teardown
// sheet: the forensic clean and visual log (plugs, chambers, oil filter, fuel in the oil), the high-stress
// valvetrain (springs against new, valve stretch, guides, retainers and keepers), the rotating assembly and
// block tolerances (bores with a torque plate, main housing bores, rods, ring lands, skirts and pins, crank
// snout) and crack testing and stress mapping (Magnaflux / dye penetrant, deck flatness, deck height parity).
//
// teardownFindings() turns the readings into findings against the limits on the sheet (and the build being
// torn down, for the new piston sizes and spring pressures), suggests a decision for each part and lists the
// likely causes the evidence points to. Nothing here is a hard rule: the limits are the builder's own.

export const CYL = ['#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8'];
export const MAINS = ['#1', '#2', '#3', '#4', '#5'];
export const DECKS = ['Left front', 'Left rear', 'Right front', 'Right rear'];
const IE = ['Int', 'Exh'];

const cyl = (key, label, unit, input = 'number', extra = {}) => ({ key, label, type: 'corners', input, corners: CYL, unit, ...extra });
const mains = (key, label, unit, input = 'number', extra = {}) => ({ key, label, type: 'corners', input, corners: MAINS, unit, ...extra });
const ie = (key, label, unit, extra = {}) => ({ key, label, type: 'corners', input: 'number', corners: IE, unit, ...extra });
const n = (key, label, unit, extra = {}) => ({ key, label, type: 'number', unit, ...extra });
const sel = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });

export const PLUG_READS = ['Good', 'Detonation / aluminium peppering', 'Lean (white / blistered)', 'Rich (sooty)', 'Oil pulling (wet / fouled)', 'Damaged'];
export const CHAMBER_READS = ['Even light tan', 'Dry dark carbon (rich)', 'Washed clean (lean)', 'Wet oily carbon', 'Peppered / eroded'];
export const DEBRIS_AMOUNTS = ['None', 'Fine', 'Heavy'];
export const DEBRIS_SOURCES = ['None', 'Bearing overlay (grey / silver flakes)', 'Bearing copper layer', 'Steel (crank / cam / lifters)',
  'Aluminium (pistons / block / heads)', 'Bronze or brass (guides / bushes / thrust)', 'Gasket or sealant', 'Mixed'];
export const ROOT_CAUSES = ['Normal wear — due for a rebuild', 'Detonation', 'Lean mixture', 'Oil starvation', 'Fuel in the oil',
  'Over-rev / valve float', 'Overheating', 'Coolant in the oil', 'Dirt or debris', 'Metal fatigue', 'Assembly or machining error', 'Not found yet'];
export const DECISIONS = ['Reuse', 'Machine', 'Replace'];
export const PARTS = ['Block', 'Crankshaft', 'Con rods', 'Rod bolts', 'Pistons', 'Rings', 'Wrist pins', 'Main bearings', 'Rod bearings',
  'Camshaft', 'Lifters', 'Valve springs', 'Valves', 'Retainers & keepers', 'Valve guides', 'Cylinder heads'];
export const NDT_ZONES = ['Block main webs', 'Head 1 combustion chambers', 'Head 2 combustion chambers', 'Crank fillets', 'Crank snout & keyways'];
const NDT_PART = { 'Block main webs': 'Block', 'Head 1 combustion chambers': 'Cylinder heads', 'Head 2 combustion chambers': 'Cylinder heads',
  'Crank fillets': 'Crankshaft', 'Crank snout & keyways': 'Crankshaft' };

export const BORE_COLUMNS = [
  { key: 'cyl', label: 'Cyl', text: true },
  { key: 'top_t', label: 'Top — thrust', unit: 'in' }, { key: 'top_p', label: 'Top — pin', unit: 'in' },
  { key: 'mid_t', label: 'Middle — thrust', unit: 'in' }, { key: 'mid_p', label: 'Middle — pin', unit: 'in' },
  { key: 'bot_t', label: 'Bottom — thrust', unit: 'in' }, { key: 'bot_p', label: 'Bottom — pin', unit: 'in' },
];

export const engineTeardownForm = {
  target: 'engine_teardown', name: 'Engine Teardown & Pre-check', is_default: true,
  sections: [
    { id: 'teardown', title: 'Teardown', carry: false, fields: [
      { key: 'engine', label: 'Engine', type: 'ref', ref: 'asset', category: 'Engine', core: true, required: true },
      { key: 'date', label: 'Date', type: 'date', core: true, required: true },
      { key: 'build', label: 'Build being torn down', type: 'ref', ref: 'engine_build', match: 'engine', core: true },
      { key: 'job', label: 'Shop job', type: 'ref', ref: 'job' },
      sel('reason', 'Why it came apart', ['Due for a rebuild', 'Failure', 'Down on power', 'Oil or water problem', 'Inspection'], { core: true }),
      n('engine_laps', 'Laps on the engine', ''),
      { key: 'symptoms', label: 'What happened', type: 'textarea', placeholder: 'e.g. lost oil pressure in the feature, knocking on the cool-down lap' },
      { key: 'torn_down_by', label: 'Torn down by', type: 'member', defaultSelf: true },
    ] },
    { id: 'limits', title: 'Limits & new-part baseline', fields: [
      ie('spring_new_seat', 'New spring — seat pressure', 'lb'),
      ie('spring_new_open', 'New spring — open pressure', 'lb'),
      n('spring_loss_max', 'Spring pressure loss — limit', '%', { default: '10' }),
      ie('valve_new_len', 'New valve length', 'in'),
      n('valve_stretch_max', 'Valve stretch — limit', 'in', { default: '0.002' }),
      ie('guide_max', 'Valve guide clearance — limit', 'in'),
      n('bore_taper_max', 'Bore taper — limit', 'in'),
      n('bore_oor_max', 'Bore out-of-round — limit', 'in'),
      n('main_oor_max', 'Main housing bore out-of-round — limit', 'in'),
      n('rod_oor_max', 'Rod big-end out-of-round — limit', 'in'),
      n('rod_bolt_new_len', 'New rod bolt length', 'in'),
      n('rod_bolt_stretch_max', 'Rod bolt permanent stretch — limit', 'in'),
      n('ring1_side_max', 'Top ring vertical clearance — limit', 'in'),
      n('ring2_side_max', '2nd ring vertical clearance — limit', 'in'),
      n('skirt_loss_max', 'Piston skirt collapse — limit', 'in'),
      n('pin_clr_max', 'Wrist pin clearance — limit', 'in'),
      n('snout_runout_max', 'Crank snout runout — limit', 'in'),
      n('deck_flat_max', 'Deck flatness — limit', 'in', { default: '0.001' }),
      n('deck_parity_max', 'Deck height side to side — limit', 'in', { default: '0.001' }),
      n('dilution_max', 'Fuel in the oil — limit', '%'),
    ] },
    { id: 'visual', title: '1. Forensic clean & visual log', carry: false, fields: [
      cyl('plug_read', 'Spark plug', '', 'select', { options: PLUG_READS }),
      cyl('chamber', 'Combustion chamber carbon & colour', '', 'select', { options: CHAMBER_READS }),
      { key: 'filter_cut', label: 'Oil filter cut open and the pleats checked under a light', type: 'checkbox' },
      sel('filter_ferrous', 'Ferrous metal (on the magnet)', DEBRIS_AMOUNTS),
      sel('filter_nonferrous', 'Non-ferrous metal (not on the magnet)', DEBRIS_AMOUNTS),
      sel('debris_source', 'What the metal looks like', DEBRIS_SOURCES),
      { key: 'debris_notes', label: 'Filter & debris notes', type: 'textarea' },
      sel('dilution_test', 'Fuel dilution test of the drained oil', ['Lab oil analysis', 'Flash / smell test', 'Viscosity check', 'Blotter spot test']),
      n('dilution_pct', 'Fuel in the oil', '%'),
      sel('oil_condition', 'Drained oil', ['Normal', 'Thin / smells of fuel', 'Milky (water or coolant)', 'Burnt / very dark']),
      { key: 'visual_notes', label: 'Visual notes', type: 'textarea' },
    ] },
    { id: 'valvetrain', title: '2. High-stress valvetrain', carry: false, fields: [
      cyl('spring_seat_int', 'Spring seat pressure — intake', 'lb'), cyl('spring_open_int', 'Spring open pressure — intake', 'lb'),
      cyl('spring_seat_exh', 'Spring seat pressure — exhaust', 'lb'), cyl('spring_open_exh', 'Spring open pressure — exhaust', 'lb'),
      sel('exh_valve_material', 'Exhaust valve material', ['Stainless', 'Titanium', 'Inconel', 'Other']),
      cyl('valve_len_int', 'Valve length — intake', 'in'), cyl('valve_len_exh', 'Valve length — exhaust', 'in'),
      cyl('guide_int', 'Guide clearance — intake', 'in'), cyl('guide_exh', 'Guide clearance — exhaust', 'in'),
      cyl('retainer', 'Retainers', '', 'select', { options: ['OK', 'Galling', 'Cracked', 'Worn seat'] }),
      cyl('keeper', 'Keepers (locks)', '', 'select', { options: ['OK', 'Indented', 'Lock crush', 'Fretting'] }),
    ] },
    { id: 'rotating', title: '3. Rotating assembly & block tolerances', carry: false, fields: [
      { key: 'torque_plate', label: 'Bores measured with a torque plate fitted and torqued like the head', type: 'checkbox' },
      { key: 'bores', label: 'Cylinder bores', type: 'table', columns: BORE_COLUMNS, defaultRows: CYL.map((c) => ({ cyl: c })),
        help: 'Each bore at three depths, across the thrust faces and along the pin. Taper and out-of-round are worked out below.' },
      mains('main_hsg_v', 'Main housing bore — vertical', 'in'), mains('main_hsg_h', 'Main housing bore — horizontal', 'in'),
      sel('main_align', 'Main line bore (alignment bar)', ['In line', 'Out of line']),
      mains('main_brg_back', 'Back of the main bearings', '', 'select', { options: ['OK', 'Fretting / polished', 'Spun', 'Cap walk marks'] }),
      cyl('rod_bore_v', 'Rod big end — vertical', 'in'), cyl('rod_bore_h', 'Rod big end — horizontal', 'in'),
      cyl('rod_bolt_len', 'Rod bolt length', 'in'),
      cyl('rod_ndt', 'Rod crack test (Magnaflux)', '', 'select', { options: ['Pass', 'Crack found', 'Not tested'] }),
      cyl('ring1_side', 'Top ring vertical clearance', 'in'), cyl('ring2_side', '2nd ring vertical clearance', 'in'),
      cyl('skirt', 'Piston skirt at the gauge point', 'in'),
      cyl('pin_clr', 'Wrist pin bore clearance', 'in'),
      cyl('pin_state', 'Wrist pin', '', 'select', { options: ['OK', 'Galled', 'Bent'] }),
      n('snout_runout', 'Crank snout runout', 'in'),
      sel('keyways', 'Damper keyways', ['OK', 'Worn', 'Cracked']),
      sel('pump_drive', 'Oil pump drive surfaces', ['OK', 'Worn', 'Damaged']),
    ] },
    { id: 'ndt', title: '4. Crack testing & stress mapping', carry: false, fields: [
      { key: 'ndt', label: 'Crack detection', type: 'table',
        columns: [{ key: 'zone', label: 'Area', text: true }, { key: 'method', label: 'Method', options: ['Magnaflux', 'Dye penetrant', 'Other'] },
          { key: 'result', label: 'Result', options: ['Pass', 'Crack found', 'Not tested'] }, { key: 'note', label: 'Note', text: true }],
        defaultRows: NDT_ZONES.map((zone) => ({ zone })),
        help: 'Magnaflux for steel and iron parts, dye penetrant for aluminium.' },
      n('deck_flat_l', 'Deck flatness — left bank', 'in'), n('deck_flat_r', 'Deck flatness — right bank', 'in'),
      { key: 'deck_height', label: 'Deck height', type: 'corners', input: 'number', corners: DECKS, unit: 'in' },
    ] },
    { id: 'decision', title: 'Findings & decisions', carry: false, fields: [
      sel('root_cause', 'Root cause', ROOT_CAUSES, { core: true }),
      { key: 'cause_notes', label: 'How we know', type: 'textarea' },
      { key: 'tuning', label: 'Tuning limits for the next build', type: 'textarea', placeholder: 'e.g. take 2° of timing out, richen the high-speed one pill size' },
      { key: 'parts', label: 'Reuse, machine or replace', type: 'table',
        columns: [{ key: 'part', label: 'Part', text: true }, { key: 'decision', label: 'Decision', options: DECISIONS }, { key: 'reason', label: 'Why', text: true }],
        defaultRows: PARTS.map((part) => ({ part })) },
      { key: 'signed_off', label: 'Signed off by', type: 'member' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
  ],
};

export const TEARDOWN_FORMS = [engineTeardownForm];

// ---------------------------------------------------------------- findings
const vals = (r) => r?.data?.values || {};
export const num = (x) => { const v = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
const f4 = (x) => (Math.abs(x) >= 1 ? x.toFixed(3) : x.toFixed(4));
const pct = (x) => `${Math.round(x)}%`;
const list = (xs) => xs.join(', ');
/** A tick-box item ('check' fields store { done, note }). */
export const ticked = (x) => (x && typeof x === 'object' ? !!x.done : !!x);
const cylsWith = (map, test) => CYL.filter((c) => map?.[c] && test(map[c]));

/**
 * Findings from a teardown's readings. build: the build sheet being torn down (optional; gives the new piston
 * sizes and spring seat pressures when the sheet's own baseline is blank).
 * Returns { items: [{ section, part, level: 'bad'|'warn', text }], suggest: { part: { decision, why } },
 *           causes: [{ cause, evidence: [] }], unset: [label] }.
 */
export function teardownFindings(v = {}, build = null) {
  const bv = build ? vals(build) : {};
  const items = [];
  const suggest = {};
  const causes = {};
  const unset = [];
  const add = (section, part, level, text, decision, cause) => {
    items.push({ section, part, level, text });
    if (decision && part) {
      const rank = { Machine: 1, Replace: 2 };
      const cur = suggest[part];
      if (!cur || rank[decision] > rank[cur.decision]) suggest[part] = { decision, why: [text] };
      else if (rank[decision] === rank[cur.decision]) cur.why.push(text);
    }
    if (cause) (causes[cause] ||= []).push(text);
  };
  // readings against a limit: over → bad, within 80% of it → warn; no limit → listed as unset
  const limitCheck = (section, label, readings, limit, part, decision, cause, fmtX = f4) => {
    const got = readings.filter(([, x]) => x !== null);
    if (!got.length) return;
    if (limit === null) { unset.push(label); return; }
    const over = got.filter(([, x]) => x > limit);
    const near = got.filter(([, x]) => x <= limit && x >= limit * 0.8);
    const show = (xs) => list(xs.map(([k, x]) => `${k} ${fmtX(x)}`));
    if (over.length) add(section, part, 'bad', `${label} over the ${fmtX(limit)} limit: ${show(over)}`, decision, cause);
    if (near.length) add(section, part, 'warn', `${label} close to the ${fmtX(limit)} limit: ${show(near)}`);
  };

  // 1. Forensic clean & visual log
  const plugs = v.plug_read || {};
  const det = cylsWith(plugs, (x) => x.startsWith('Detonation'));
  const lean = cylsWith(plugs, (x) => x.startsWith('Lean'));
  const oily = cylsWith(plugs, (x) => x.startsWith('Oil'));
  const rich = cylsWith(plugs, (x) => x.startsWith('Rich'));
  if (det.length) add('visual', 'Pistons', 'bad', `Plugs show detonation / aluminium peppering on ${list(det)}`, null, 'Detonation');
  if (lean.length) add('visual', null, 'warn', `Plugs read lean on ${list(lean)}`, null, 'Lean mixture');
  if (oily.length) add('visual', 'Rings', 'warn', `Plugs pulling oil on ${list(oily)} — rings, guides or seals`, null, 'Oil getting into the chamber');
  if (rich.length) add('visual', null, 'warn', `Plugs read rich on ${list(rich)}`);
  const ch = v.chamber || {};
  const chDet = cylsWith(ch, (x) => x.startsWith('Peppered'));
  const chLean = cylsWith(ch, (x) => x.startsWith('Washed'));
  const chOil = cylsWith(ch, (x) => x.startsWith('Wet'));
  if (chDet.length) add('visual', 'Cylinder heads', 'bad', `Chambers peppered or eroded on ${list(chDet)}`, null, 'Detonation');
  if (chLean.length) add('visual', null, 'warn', `Chambers washed clean (lean) on ${list(chLean)}`, null, 'Lean mixture');
  if (chOil.length) add('visual', 'Valve guides', 'warn', `Wet oily carbon in the chambers on ${list(chOil)}`, null, 'Oil getting into the chamber');

  const ferr = v.filter_ferrous; const non = v.filter_nonferrous;
  if (ferr === 'Heavy') add('visual', null, 'bad', 'Heavy ferrous metal on the filter magnet', null, 'Metal fatigue');
  else if (ferr === 'Fine') add('visual', null, 'warn', 'Fine ferrous metal on the filter magnet');
  if (non === 'Heavy') add('visual', null, 'bad', 'Heavy non-ferrous metal in the filter pleats');
  else if (non === 'Fine') add('visual', null, 'warn', 'Fine non-ferrous metal in the filter pleats');
  const src = v.debris_source || '';
  const metal = ferr === 'Heavy' || non === 'Heavy' || ferr === 'Fine' || non === 'Fine';
  if (src.startsWith('Bearing overlay')) {
    add('visual', 'Main bearings', metal ? 'bad' : 'warn', 'Bearing overlay in the filter', 'Replace', 'Oil starvation');
    add('visual', 'Rod bearings', metal ? 'bad' : 'warn', 'Bearing overlay in the filter', 'Replace');
  } else if (src.startsWith('Bearing copper')) {
    add('visual', 'Main bearings', 'bad', 'Bearing copper layer in the filter — worn through the overlay', 'Replace', 'Oil starvation');
    add('visual', 'Rod bearings', 'bad', 'Bearing copper layer in the filter — worn through the overlay', 'Replace');
    add('visual', 'Crankshaft', 'warn', 'Bearings worn to copper — check the journals', 'Machine');
  } else if (src.startsWith('Steel')) add('visual', 'Camshaft', 'warn', 'Steel in the filter — check the cam lobes, lifters and crank', null, 'Metal fatigue');
  else if (src.startsWith('Aluminium')) add('visual', 'Pistons', 'warn', 'Aluminium in the filter — check the pistons and skirts', null, 'Detonation');
  else if (src.startsWith('Bronze')) add('visual', 'Valve guides', 'warn', 'Bronze or brass in the filter — check the guides, bushes and thrust faces');

  const dil = num(v.dilution_pct); const dilMax = num(v.dilution_max);
  if (dil !== null && dilMax !== null && dil > dilMax) add('visual', 'Main bearings', 'bad', `Fuel in the oil ${dil}% — over the ${dilMax}% limit`, null, 'Fuel in the oil');
  else if (dil !== null && dilMax === null) unset.push('Fuel in the oil');
  if (v.oil_condition === 'Thin / smells of fuel' && !(dil !== null && dilMax !== null && dil > dilMax)) add('visual', null, 'warn', 'Drained oil is thin and smells of fuel', null, 'Fuel in the oil');
  if (v.oil_condition === 'Milky (water or coolant)') add('visual', 'Cylinder heads', 'bad', 'Milky oil — water or coolant got in (head gasket, cracked head or block)', null, 'Coolant in the oil');

  // 2. Valvetrain: every spring against the new baseline
  const loss = num(v.spring_loss_max);
  for (const side of IE) {
    const s = side === 'Int' ? 'int' : 'exh';
    const name = side === 'Int' ? 'intake' : 'exhaust';
    for (const kind of ['seat', 'open']) {
      const base = num(v[`spring_new_${kind}`]?.[side]) ?? (kind === 'seat' ? num(bv.seat_pressure?.[side]) : null);
      const readings = CYL.map((c) => [c, num(v[`spring_${kind}_${s}`]?.[c])]).filter(([, x]) => x !== null);
      if (!readings.length) continue;
      if (!base || loss === null) { unset.push(`New ${name} spring ${kind} pressure`); continue; }
      const drop = readings.map(([c, x]) => [c, ((base - x) / base) * 100]);
      const over = drop.filter(([, d]) => d > loss);
      const near = drop.filter(([, d]) => d <= loss && d >= loss * 0.8);
      if (over.length) add('valvetrain', 'Valve springs', 'bad', `${name[0].toUpperCase()}${name.slice(1)} springs ${kind} pressure down more than ${loss}% on ${list(over.map(([c, d]) => `${c} (${pct(d)})`))}`, 'Replace', 'Metal fatigue');
      if (near.length) add('valvetrain', 'Valve springs', 'warn', `${name[0].toUpperCase()}${name.slice(1)} springs ${kind} pressure close to the ${loss}% limit on ${list(near.map(([c, d]) => `${c} (${pct(d)})`))}`);
    }
    const newLen = num(v.valve_new_len?.[side]);
    const lens = CYL.map((c) => [c, num(v[`valve_len_${s}`]?.[c])]).filter(([, x]) => x !== null);
    if (lens.length && newLen === null) unset.push(`New ${name} valve length`);
    else if (lens.length) {
      const ti = side === 'Exh' && v.exh_valve_material === 'Titanium';
      limitCheck('valvetrain', `${name[0].toUpperCase()}${name.slice(1)} valve stretch`, lens.map(([c, x]) => [c, x - newLen]), num(v.valve_stretch_max), 'Valves', 'Replace', ti ? 'Over-rev / valve float' : 'Metal fatigue');
    }
    limitCheck('valvetrain', `${name[0].toUpperCase()}${name.slice(1)} guide clearance`, CYL.map((c) => [c, num(v[`guide_${s}`]?.[c])]), num(v.guide_max?.[side]), 'Valve guides', 'Machine');
  }
  const ret = cylsWith(v.retainer, (x) => x !== 'OK');
  const keep = cylsWith(v.keeper, (x) => x !== 'OK');
  if (ret.length) add('valvetrain', 'Retainers & keepers', 'bad', `Retainers ${list(ret.map((c) => `${c} ${v.retainer[c].toLowerCase()}`))}`, 'Replace', cylsWith(v.retainer, (x) => x === 'Galling').length ? 'Over-rev / valve float' : null);
  if (keep.length) add('valvetrain', 'Retainers & keepers', 'bad', `Keepers ${list(keep.map((c) => `${c} ${v.keeper[c].toLowerCase()}`))}`, 'Replace', 'Over-rev / valve float');

  // 3. Rotating assembly & block
  const rows = (Array.isArray(v.bores) ? v.bores : []).filter((r) => ['top_t', 'top_p', 'mid_t', 'mid_p', 'bot_t', 'bot_p'].some((k) => num(r[k]) !== null));
  if (rows.length) {
    if (!ticked(v.torque_plate)) add('rotating', 'Block', 'warn', 'Bores measured without a torque plate — they may change with the head torqued down');
    const taper = rows.map((r) => {
      const t = [num(r.top_t), num(r.bot_t)]; const p = [num(r.top_p), num(r.bot_p)];
      const d = [t, p].filter(([a, b]) => a !== null && b !== null).map(([a, b]) => Math.abs(a - b));
      return [r.cyl || '?', d.length ? Math.max(...d) : null];
    });
    const oor = rows.map((r) => {
      const d = ['top', 'mid', 'bot'].map((z) => [num(r[`${z}_t`]), num(r[`${z}_p`])]).filter(([a, b]) => a !== null && b !== null).map(([a, b]) => Math.abs(a - b));
      return [r.cyl || '?', d.length ? Math.max(...d) : null];
    });
    limitCheck('rotating', 'Bore taper', taper, num(v.bore_taper_max), 'Block', 'Machine', null);
    limitCheck('rotating', 'Bore out-of-round', oor, num(v.bore_oor_max), 'Block', 'Machine', null);
  }
  limitCheck('rotating', 'Main housing bore out-of-round', MAINS.map((m) => [m, num(v.main_hsg_v?.[m]) !== null && num(v.main_hsg_h?.[m]) !== null ? Math.abs(num(v.main_hsg_v[m]) - num(v.main_hsg_h[m])) : null]),
    num(v.main_oor_max), 'Block', 'Machine', 'Metal fatigue');
  if (v.main_align === 'Out of line') add('rotating', 'Block', 'bad', 'Main line bore out of line — line hone', 'Machine', 'Metal fatigue');
  const backs = MAINS.filter((m) => v.main_brg_back?.[m] && v.main_brg_back[m] !== 'OK');
  if (backs.length) {
    add('rotating', 'Main bearings', 'bad', `Back of the main bearings: ${list(backs.map((m) => `${m} ${v.main_brg_back[m].toLowerCase()}`))}`, 'Replace',
      backs.some((m) => v.main_brg_back[m] === 'Spun') ? 'Oil starvation' : 'Metal fatigue');
    if (backs.some((m) => v.main_brg_back[m] !== 'Spun')) add('rotating', 'Block', 'warn', 'Fretting or cap walk — main caps moving (crank whip at high rpm); check the housing bores', 'Machine');
  }
  limitCheck('rotating', 'Rod big-end out-of-round', CYL.map((c) => [c, num(v.rod_bore_v?.[c]) !== null && num(v.rod_bore_h?.[c]) !== null ? num(v.rod_bore_v[c]) - num(v.rod_bore_h[c]) : null]),
    num(v.rod_oor_max), 'Con rods', 'Machine', 'Metal fatigue');
  const boltNew = num(v.rod_bolt_new_len);
  const bolts = CYL.map((c) => [c, num(v.rod_bolt_len?.[c])]).filter(([, x]) => x !== null);
  if (bolts.length && boltNew === null) unset.push('New rod bolt length');
  else if (bolts.length) limitCheck('rotating', 'Rod bolt stretch', bolts.map(([c, x]) => [c, x - boltNew]), num(v.rod_bolt_stretch_max), 'Rod bolts', 'Replace', 'Metal fatigue');
  const cracked = cylsWith(v.rod_ndt, (x) => x === 'Crack found');
  if (cracked.length) add('rotating', 'Con rods', 'bad', `Crack found in the rod on ${list(cracked)}`, 'Replace', 'Metal fatigue');
  limitCheck('rotating', 'Top ring vertical clearance', CYL.map((c) => [c, num(v.ring1_side?.[c])]), num(v.ring1_side_max), 'Pistons', 'Replace', 'Detonation');
  limitCheck('rotating', '2nd ring vertical clearance', CYL.map((c) => [c, num(v.ring2_side?.[c])]), num(v.ring2_side_max), 'Pistons', 'Replace', 'Detonation');
  const skirts = CYL.map((c) => [c, num(v.skirt?.[c]), num(bv.piston_size?.[c])]).filter(([, x]) => x !== null);
  if (skirts.length && !skirts.some(([, , s]) => s !== null)) unset.push('Piston size when new (from the build sheet)');
  else if (skirts.length) limitCheck('rotating', 'Piston skirt collapse', skirts.filter(([, , s]) => s !== null).map(([c, x, s]) => [c, s - x]), num(v.skirt_loss_max), 'Pistons', 'Replace', 'Overheating');
  limitCheck('rotating', 'Wrist pin clearance', CYL.map((c) => [c, num(v.pin_clr?.[c])]), num(v.pin_clr_max), 'Wrist pins', 'Replace', null);
  const pins = cylsWith(v.pin_state, (x) => x !== 'OK');
  if (pins.length) add('rotating', 'Wrist pins', 'bad', `Wrist pins ${list(pins.map((c) => `${c} ${v.pin_state[c].toLowerCase()}`))}`, 'Replace', 'Detonation');
  limitCheck('rotating', 'Crank snout runout', [['Snout', num(v.snout_runout)]], num(v.snout_runout_max), 'Crankshaft', 'Machine', 'Metal fatigue');
  if (v.keyways === 'Cracked') add('rotating', 'Crankshaft', 'bad', 'Damper keyway cracked', 'Replace', 'Metal fatigue');
  else if (v.keyways === 'Worn') add('rotating', 'Crankshaft', 'warn', 'Damper keyways worn', 'Machine');
  if (v.pump_drive === 'Damaged') add('rotating', 'Crankshaft', 'bad', 'Oil pump drive damaged', 'Replace');
  else if (v.pump_drive === 'Worn') add('rotating', 'Crankshaft', 'warn', 'Oil pump drive worn', 'Machine');

  // 4. Crack testing & stress mapping
  for (const r of Array.isArray(v.ndt) ? v.ndt : []) {
    if (r.result === 'Crack found') add('ndt', NDT_PART[r.zone] || r.zone || 'Part', 'bad', `Crack found: ${r.zone || 'area not named'}${r.method ? ` (${r.method.toLowerCase()})` : ''}${r.note ? ` — ${r.note}` : ''}`, 'Replace', 'Metal fatigue');
  }
  limitCheck('ndt', 'Deck flatness', [['Left', num(v.deck_flat_l)], ['Right', num(v.deck_flat_r)]], num(v.deck_flat_max), 'Block', 'Machine', 'Overheating');
  const decks = DECKS.map((d) => num(v.deck_height?.[d]));
  const left = decks.slice(0, 2).filter((x) => x !== null); const right = decks.slice(2).filter((x) => x !== null);
  if (left.length && right.length) {
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const all = [...left, ...right];
    limitCheck('ndt', 'Deck height difference', [['Side to side', Math.abs(avg(left) - avg(right))], ['Highest to lowest', Math.max(...all) - Math.min(...all)]],
      num(v.deck_parity_max), 'Block', 'Machine', null);
  }

  const causeList = Object.entries(causes).map(([cause, evidence]) => ({ cause, evidence })).sort((a, b) => b.evidence.length - a.evidence.length);
  for (const k of Object.keys(suggest)) suggest[k].why = [...new Set(suggest[k].why)];
  return { items, suggest, causes: causeList, unset: [...new Set(unset)] };
}

/** Bore taper and out-of-round for each cylinder row (shown under the bore table). */
export function boreMap(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const g = (k) => num(r[k]);
    const t = [[g('top_t'), g('bot_t')], [g('top_p'), g('bot_p')]].filter(([a, b]) => a !== null && b !== null).map(([a, b]) => Math.abs(a - b));
    const o = ['top', 'mid', 'bot'].map((z) => [g(`${z}_t`), g(`${z}_p`)]).filter(([a, b]) => a !== null && b !== null).map(([a, b]) => Math.abs(a - b));
    return { cyl: r.cyl, taper: t.length ? Math.max(...t) : null, oor: o.length ? Math.max(...o) : null };
  }).filter((x) => x.taper !== null || x.oor !== null);
}

/** The decisions table with the suggestions filled in where nothing has been chosen yet (rows added for parts not listed). */
export function applySuggestions(parts, suggest) {
  const rows = (Array.isArray(parts) && parts.length ? parts : PARTS.map((part) => ({ part }))).map((r) => ({ ...r }));
  for (const [part, s] of Object.entries(suggest)) {
    const row = rows.find((r) => String(r.part || '').toLowerCase() === part.toLowerCase());
    if (row && row.decision) continue;
    if (row) { row.decision = s.decision; row.reason ||= s.why.join('; '); } else rows.push({ part, decision: s.decision, reason: s.why.join('; ') });
  }
  return rows;
}

/** The engine's teardowns, newest first; the teardown before a build is the newest one on or before its date. */
export const teardownsFor = (list, engineId) => list.filter((r) => vals(r).engine === engineId)
  .sort((a, b) => String(vals(b).date || '').localeCompare(String(vals(a).date || '')));
export function teardownBefore(list, build) {
  const bv = vals(build);
  // a rebuild sheet started from a teardown keeps its id (teardown); otherwise the newest one before it
  return (bv.teardown && list.find((t) => t.id === bv.teardown))
    || teardownsFor(list, bv.engine).find((t) => String(vals(t).date || '') <= String(bv.date || '') && vals(t).build !== build.id) || null;
}
