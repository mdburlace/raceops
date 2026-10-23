// Demo data for a practice team: a realistic race team (and engine shop) to learn on. The training
// exercises (docs/guide/training-*.md) refer to these names, so change both together.
//
// practiceData({ form, today, uuid }) → [{ id, type, data: { form_id?, values } }]
//   form(target, kind?) returns the team's form id for a record type (kind: dyno 'shock' | 'bar').

export const PRACTICE = {
  car: 'Car 17', spareCar: 'Car 71', engine: '410 #3', series: 'Club Championship',
  tonight: 'Valley Speedway — Club night', next: 'Lakeside Raceway — Club Championship', shopSetup: 'Lakeside baseline',
  classic: 'Valley Spring Classic',
  engineTune: '2026 v2', oldTune: '2026 v1',
  rrShock: 'RR Penske 8760', customer: 'Sam Hart', customerEngine: 'Hart 410', job: 'J-1001',
  sponsor: 'Valley Tyres', prospect: 'Lakeside Motors', livery: '2026 main', vehicle: 'Hauler', loadTemplate: 'Sprint car race weekend',
  partsOrder: 'RR shock rebuild kit', guest: 'Chris Lee', merch: 'Team T-shirt', licenceHolder: 'Pat Driver', contract: 'Valley Tyres sponsorship',
};

export function practiceData({ form, today = new Date(), uuid }) {
  const day = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const out = [];
  const add = (type, values, target = type) => {
    const r = { id: uuid(), type, data: { ...(form(target) ? { form_id: form(target) } : {}), values } };
    out.push(r);
    return r;
  };
  const ref = (r) => ({ asset: r.id });
  const year = String(new Date(today).getFullYear());

  // ---- cars
  const car = add('car', { name: 'Car 17', number: '17', class: '410 Sprint', rp_ratio: '4.86', fuel_min: '1.5', active: true });
  const car2 = add('car', { name: 'Car 71', number: '71', class: '360 Sprint', rp_ratio: '5.14', fuel_min: '1.5', active: true });

  // ---- assets: engines, shocks, bars, wheels, wings
  const A = (name, category, extra = {}) => add('asset', { name, category, status: 'In Service', ...extra });
  const eng = A('410 #3', 'Engine', { car: car.id, life_unit: 'Laps', life_limit: '600', manufacturer: 'Hart Engines' });
  A('410 #2', 'Engine', { status: 'Out for Service', life_unit: 'Laps', life_limit: '600', manufacturer: 'Hart Engines', notes: 'At the rebuilder for a freshen.' });
  const shocks = {};
  for (const [c, n, t] of [['LF', 'Penske 7500', 'Two-way'], ['RF', 'Penske 7500', 'Two-way'], ['LR', 'QA1 fixed', 'Non-adjustable'], ['RR', 'Penske 8760', 'Three-way']]) {
    shocks[c] = A(`${c} ${n}`, 'Shock', { position: c, car: car.id, adjust_type: t, manufacturer: n.split(' ')[0],
      ...(c === 'RR' ? { life_unit: 'Races', life_limit: '10' } : {}) });
  }
  A('Spare Penske', 'Shock', { status: 'Spare', adjust_type: 'Two-way', manufacturer: 'Penske' });
  const bars = {};
  for (const [c, rate] of [['LF', '900'], ['RF', '1000'], ['LR', '850'], ['RR', '1100']]) {
    bars[c] = A(`${c} bar ${rate}`, 'Torsion Bar', { position: c, car: car.id, spec: `${rate} lb/in` });
  }
  A('Spare bar 950', 'Torsion Bar', { status: 'Spare', spec: '950 lb/in' });
  const wheels = {};
  for (const [c, spec] of [['LF', '15x8, 3" offset'], ['RF', '15x10, 4" offset'], ['LR', '15x12, 5" offset'], ['RR', '15x15, 5" offset']]) {
    wheels[c] = A(`${c} wheel`, 'Wheel', { position: c, car: car.id, spec });
  }
  const topWing = A('Top wing — 25 sq ft', 'Wing', { position: 'Top', car: car.id, spec: '4" sideboards' });
  const frontWing = A('Front wing — 6 sq ft', 'Wing', { position: 'Front', car: car.id });

  // ---- tyres
  const T = (name, position, extra = {}) => add('tire', { name, brand: 'Hoosier', position, status: 'Mounted', available_for: [car.id], ...extra });
  const tyres = {
    LF: T('LF-04', 'LF', { compound: 'Medium', circumference: '84' }),
    RF: T('RF-02', 'RF', { compound: 'Medium', circumference: '88' }),
    LR: T('LR-07', 'LR', { compound: 'Medium', circumference: '93' }),
    RR: T('RR-12', 'RR', { compound: 'Hard', circumference: '105.5' }),
  };
  T('RR-14', 'RR', { compound: 'Medium', circumference: '106', status: 'New' });
  T('Spare-1', 'Any', { compound: 'Medium', status: 'New', available_for: [] });

  // ---- people
  add('contact', { first_name: 'Jo', last_name: 'Reid', organisation: 'Valley Speedway', position: 'Promoter', mobile: '0400 000 000' });
  add('supplier', { name: 'Hoosier Tyres QLD', category: 'Tires', phone: '07 0000 0000' });

  // ---- series and a season of race nights
  const series = add('series', { name: 'Club Championship', season: year, class: '410 Sprint', points: 'Feature finish points, heats count for draw only.' });
  const S = (v) => ({
    car: car.id, engine: ref(eng),
    shocks: Object.fromEntries(Object.entries(shocks).map(([c, a]) => [c, ref(a)])),
    bars: Object.fromEntries(Object.entries(bars).map(([c, a]) => [c, ref(a)])),
    wheels: Object.fromEntries(Object.entries(wheels).map(([c, a]) => [c, ref(a)])),
    tires: Object.fromEntries(Object.entries(tyres).map(([c, a]) => [c, ref(a)])),
    top_wing: ref(topWing), front_wing: ref(frontWing), wicker: '1"', front_wicker: '1/2"', nose_wing: '8', wing_position: '2',
    shock_adjust: { LF: 'Comp 4 · Reb 6', RF: 'Comp 6 · Reb 8', RR: 'LS comp 3 · HS comp 2 · Reb 9' },
    pressure_cold: { LF: '12', RF: '14', LR: '10', RR: '16' },
    ...v,
  });
  const tracks = ['Lakeside Raceway', 'Valley Speedway', 'Hilltop Oval'];
  const rounds = [];
  for (let n = 0; n < 8; n++) {
    const track = tracks[n % 3];
    const ev = add('event', {
      name: `${track} — ${series.data.values.name}`, series: series.id, round: String(n + 1), date: day(-112 + n * 14), track, car: car.id, intent: 'Planned',
      ...(n === 3 ? { outcome: 'Withdrew during the event', withdraw_reason: 'Engine', withdraw_session: 'Heat 1' } : { outcome: 'Raced the feature' }),
    });
    rounds.push(ev);
    for (const [k, [session, order]] of [['Heat 1', 10], ['Feature', 20]].entries()) {
      const stagger = 5 + (n % 4) * 0.5;
      const start = 4 + ((n * 3 + k) % 7);
      const finish = Math.max(1, start - Math.round((5.75 - stagger) * 3) + ((n + k) % 3) - 1);
      add('setup', S({
        event: ev.id, session, order, start: String(start), finish: String(finish), stagger_cold: String(stagger), wing_angle: String(12 + (n % 3)),
        adr: String(90 + n * 1.5), main_jet: String(46 + Math.floor(n / 3)), laps: k === 0 ? '10' : '30', fuel_start: k === 0 ? '5' : '9',
        fuel_finish: k === 0 ? '3' : String(Math.round((3 - n * 0.05) * 100) / 100), tach_high: String(8600 - n * 12),
        track_conditions: [['Heavy', 'Tacky'], ['Slick'], ['Tacky'], ['Dry slick']][n % 4],
        driver_feel: k === 0 && n % 2 === 0 ? ['Loose exit'] : [],
      }));
    }
  }

  // tonight: Heat 1 is done and the car was loose off the corners; the Feature sheet is still to start
  const tonight = add('event', { name: 'Valley Speedway — Club night', date: day(0), track: 'Valley Speedway', car: car.id, intent: 'Planned' });
  add('setup', S({
    event: tonight.id, session: 'Heat 1', order: 10, laps: '10', start: '6', finish: '4', fuel_start: '5', fuel_finish: '3', temp: '68', baro: '29.82',
    stagger_cold: '5.5', wing_angle: '13', track_conditions: ['Tacky'], driver_feel: ['Loose exit'], driver_comments: 'Loose off turn 2, good drive into 3.',
  }));
  add('track_check', { event: tonight.id, car: car.id, after_session: 'Heat 1', c_pressures: { done: true }, c_lugs: { done: true }, c_fuel: { done: true, value: '2' }, issues: 'Small oil weep on the RR shock.' });
  // ---- engines: the build sheet for our engine, and its tune from the builder (two versions, the newer active)
  const build = add('engine_build', { engine: eng.id, date: day(-130), build_type: 'Fresh build', builder: 'Hart Engines', engine_type: '410 sprint', cid: '410', hp: '920',
    engine_laps: '0', rebuild_cost: '9500', notes: 'Fresh build at the start of the season.' });
  const tuneBase = {
    engine: eng.id, source: 'Engine builder', builder: 'Hart Engines', build: build.id, shared: true, induction: 'Engler 2.9', prepared_by: 'Hart Engines',
    fuel_by: 'ADR %', plugs: 'NGK R5671A-10', plug_gap: '0.024', lash_int: '0.012', lash_exh: '0.016', lash_when: 'Cold', spring_int: '280', spring_exh: '280',
    springs: 'PSI 1577', timing: '30° BTDC', ram_tube: '3.750 in', oil_level: '8.5 L', oil_type: 'Driven XP6 15W-50',
    fuel_pump: 'Waterman 500', metering_block: '20–22', ls_psi: '40–50', ls_pill: '80', hs_type: 'IRL', nozzles_down: '435', nozzles_up: '165',
    rocker_stud: '5/16 in', rocker_stud_torque: '28', rocker_stand: '7/16 in', rocker_stand_torque: '60',
  };
  add('engine_tune', { ...tuneBase, name: '2026 v1', date: day(-130), active: false,
    fuel_chart: [{ from: '87', to: '89', main: '76', hs_psi: '104', hs: '72' }, { from: '90', to: '93', main: '72', hs_psi: '106', hs: '72' },
      { from: '94', to: '97', main: '70', hs_psi: '108', hs: '72' }, { from: '98', to: '100', main: '68', hs_psi: '110', hs: '72' }],
    notes: 'Running-in tune after the fresh build.' });
  const tune = add('engine_tune', { ...tuneBase, name: '2026 v2', date: day(-60), active: true,
    fuel_chart: [{ from: '87', to: '89', main: '75', hs_psi: '106', hs: '72' }, { from: '90', to: '93', main: '70', hs_psi: '108', hs: '72' },
      { from: '94', to: '97', main: '68', hs_psi: '110', hs: '72' }, { from: '98', to: '100', main: '66', hs_psi: '112', hs: '72' },
      { from: '101', to: '103', main: '64', hs_psi: '114', hs: '72' }],
    notes: 'Leaner on the top end after the dyno session. Richen one pill if the plugs read white.', run_ref: 'Dyno, then Hilltop round' });
  // engine checks: the last one, and the one before, where #5 intake spring has dropped
  const CYLS = ['#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8'];
  const each = (f) => Object.fromEntries(CYLS.map((c, i) => [c, f(c, i)]));
  const allDone = ['c_flush', 'c_nozzles', 'c_filters', 'c_valves', 'c_throttle', 'c_return', 'c_fuel_lines', 'c_oil_level', 'c_filter_cut', 'c_tank', 'c_air', 'c_hat_seal',
    'c_radiator', 'c_water', 'c_headers', 'c_gaskets', 'c_cam_hex', 'c_wing_lines', 'c_mag', 'c_harness', 'c_motor_plates', 'c_header_bolts', 'c_ujoint'];
  add('engine_check', { engine: eng.id, date: day(-35), car: car.id, engine_tune: tune.id, leakdown_temp: 'Cold',
    leakdown: each((c, i) => String([3, 4, 3, 3, 4, 3, 4, 3][i])), lash_int: each(() => '0.012'), lash_exh: each(() => '0.016'),
    spring_int: each(() => '278'), spring_exh: each(() => '276'), plug_read: each(() => 'Good'), plug_gap: '0.024', bypass_pill: '80', filter_status: 'Clean', oil_changed: 'Yes',
    ...Object.fromEntries(allDone.map((k) => [k, true])), notes: 'All good.' });
  add('engine_check', { engine: eng.id, date: day(-5), car: car.id, engine_tune: tune.id, leakdown_temp: 'Cold',
    leakdown: each((c, i) => String([4, 4, 3, 4, 5, 3, 4, 4][i])), lash_int: each((c) => (c === '#6' ? '0.015' : '0.012')), lash_exh: each(() => '0.016'),
    spring_int: each((c) => (c === '#5' ? '246' : '275')), spring_exh: each(() => '274'), plug_read: each((c) => (c === '#6' ? 'Lean' : 'Good')), plug_gap: '0.024', bypass_pill: '80',
    filter_status: 'Minor specks', oil_changed: 'No', ...Object.fromEntries(allDone.filter((k) => k !== 'c_pressure').map((k) => [k, true])),
    parts_needed: 'Intake spring for #5. Check #6 nozzle.', notes: 'Small specks in the filter, nothing shiny.' });

  // the car as set up in the workshop for next week (the baseline for round 9)
  const pick = (o, cs) => Object.fromEntries(cs.map((c) => [c, o[c]]));
  const shop = add('shop_setup', {
    car: car.id, name: 'Lakeside baseline', date: day(-2), purpose: 'Big, fast tracks like Lakeside',
    fuel_load: '15', fuel_load_unit: 'US gal', driver_weight: '78 kg driver in the seat', chassis_type: 'Standard rail',
    block_heights: { LF: '4', RF: '4.25', LR: '4.5', RR: '4.75' },
    front_bars: pick(Object.fromEntries(Object.entries(bars).map(([c, x]) => [c, ref(x)])), ['LF', 'RF']), arm_length: { LF: '13', RF: '13.5' },
    front_turns: { LF: '2', RF: '1' }, front_ride_height: { LF: '9.25', RF: '9.5' }, toe: '1/16 out (tyre faces)', caster: { LF: '5', RF: '6' }, camber: { LF: '1', RF: '-2' }, axle_lead: '0.25',
    front_square: { LF: '30.5', RF: '30.5' }, front_shocks: pick(Object.fromEntries(Object.entries(shocks).map(([c, x]) => [c, ref(x)])), ['LF', 'RF']),
    front_clicks: { LF: 'Comp 4 · Reb 6', RF: 'Comp 6 · Reb 8' },
    rear_bars: pick(Object.fromEntries(Object.entries(bars).map(([c, x]) => [c, ref(x)])), ['LR', 'RR']), rear_turns: { LR: '0', RR: '1.5' },
    rear_ride_height: { LR: '4.5', RR: '4.75' }, rear_square: { LR: '41', RR: '41' }, jacobs_ladder: 'Frame hole 2 / strap hole 3',
    rear_shocks: pick(Object.fromEntries(Object.entries(shocks).map(([c, x]) => [c, ref(x)])), ['LR', 'RR']), rear_clicks: { RR: 'LS comp 3 · HS comp 2 · Reb 8' },
    pressure_cold: { LF: '12', RF: '14', LR: '9', RR: '17' }, stagger_front: '1.5', stagger_cold: '6',
    top_wing: ref(topWing), wing_angle: '12', wing_position: '3', wicker: '1"', front_wing: ref(frontWing), nose_wing: '8', front_wicker: '1/2"',
    engine: ref(eng), engine_tune: tune.id, timing: '30° BTDC', nozzles: '435 down, 165 up', ls_bypass: '40–50 psi / 80',
  });
  add('event', { name: 'Lakeside Raceway — Club Championship', series: series.id, round: '9', date: day(7), track: 'Lakeside Raceway', car: car.id, intent: 'Planned', shop_setup: shop.id });
  // a two-night meeting with a night off between: practice and prelims, then finals (multi-day exercise)
  add('event', { name: PRACTICE.classic, date: day(21), end_date: day(23), multi_day: true, track: 'Valley Speedway', car: car.id, intent: 'Planned',
    event_type: 'Special event', days: [{ n: 1, date: day(21), label: 'Practice & prelims', time: '18:00' }, { n: 2, date: day(23), label: 'Finals', time: '17:30' }] });

  // ---- workshop: schedules and a recent service
  add('schedule', { name: 'RR shock rebuild', applies_to: 'Asset', asset: shocks.RR.id, interval: '10', interval_unit: 'Races', last_done: day(-120),
    instructions: 'Send to the shock builder for a rebuild and re-dyno.' });
  add('schedule', { name: 'Oil and filter change', applies_to: 'Car', car: car.id, interval: '3', interval_unit: 'Races', last_done: day(-30) });
  add('schedule', { name: 'Repack wheel bearings', applies_to: 'Car', car: car.id, interval: '6', interval_unit: 'Races', last_done: day(-60) });
  add('maintenance', { car: car.id, date: day(-14), level: 'weekly', notes: 'Weekly service after the Hilltop round.' });

  // ---- engine shop: a customer, their engine and a job in progress
  const cust = add('customer', { name: 'Sam Hart', contact_name: 'Sam Hart', phone: '0400 111 222', races: '410 sprintcar' });
  const custEngine = A('Hart 410', 'Engine', { customer: cust.id, life_unit: 'Laps', life_limit: '500' });
  add('job', {
    job_no: 'J-1001', customer: cust.id, engine: custEngine.id, job_type: 'Freshen / refresh', status: 'In progress', date_in: day(-3), date_promised: day(5),
    request: 'Freshen after 480 laps. Down on power at the top end.',
    parts: [{ part_no: 'RS-410', description: 'Ring set', qty: '8', unit_cost: '45', unit_price: '60' }],
    labour: [{ date: day(-2), tech: 'Workshop', description: 'Teardown and inspection', hours: '4', rate: '120' }],
  });

  // ---- business: parts orders, finance, transport, partnerships and marketing
  const next = out.find((r) => r.type === 'event' && r.data.values.round === '9');
  add('purchase', { item: 'RR shock rebuild kit', part_no: 'PEN-8760-RK', qty: '1', unit_cost: '180', cost: '180', event: next.id, car: car.id, needed_by: day(5), status: 'Requested',
    notes: 'The RR shock is due for its rebuild.' });
  const yStart = `${year}-01-01`; const yEnd = `${year}-12-31`;
  add('budget', { season: year, start: yStart, end: yEnd, alert_pct: '80', lines: [
    { category: 'Tyres', amount: '8000' }, { category: 'Fuel & oil', amount: '3000' }, { category: 'Engine', amount: '15000' },
    { category: 'Travel', amount: '4000' }, { category: 'Entry fees', amount: '1500' }, { category: 'Parts', amount: '6000' }] });
  rounds.forEach((ev, n) => {
    const d = ev.data.values.date;
    add('expense', { date: d, category: 'Tyres', description: `Tyres — round ${n + 1}`, supplier_name: 'Hoosier Tyres QLD', amount: '900', tax_amount: '81.82', event: ev.id, car: car.id, paid: true });
    add('expense', { date: d, category: 'Fuel & oil', description: `Methanol — round ${n + 1}`, amount: '240', event: ev.id, paid: true });
    add('expense', { date: d, category: 'Entry fees', description: `Entry — round ${n + 1}`, amount: '120', event: ev.id, paid: true });
    if (n !== 3) add('income', { date: d, kind: 'Prize money', description: `Feature — round ${n + 1}`, payer: 'Valley Speedway', amount: String(500 + ((n * 170) % 700)), event: ev.id, paid: true });
  });
  add('expense', { date: day(-4), category: 'Engine', description: 'Engine freshen — 410 #2', supplier_name: 'Hart Engines', amount: '4800', paid: false, due_date: day(5) });
  const contract = add('contract', { name: 'Valley Tyres sponsorship', party: 'Valley Tyres', kind: 'Sponsorship', start: yStart, end: day(45), renewal_date: day(30), value: '12000',
    terms: 'Top wing side panels, one post per meeting, four hospitality passes a season.' });
  const sponsor = add('sponsor', { name: 'Valley Tyres', stage: 'Signed', level: 'Major', value: '12000', start: yStart, end: day(45), contract: contract.id, public: true,
    deliverables: [{ kind: 'Logo on car', detail: 'Top wing side panels', qty: '1', per: 'Season' }, { kind: 'Posts per event', qty: '1', per: 'Event' },
      { kind: 'Hospitality passes', qty: '4', per: 'Season' }], pitch_crowd: '3,000', pitch_social: '4,500' });
  add('sponsor', { name: 'Lakeside Motors', stage: 'Prospect', level: 'Associate', value: '5000', pitch_notes: 'Local dealer; their customers are at the track every week.' });
  add('income', { date: day(-90), kind: 'Sponsorship', description: 'Valley Tyres — first half', payer: 'Valley Tyres', sponsor: sponsor.id, amount: '6000', paid: true });
  add('livery', { name: '2026 main', car: car.id, from: yStart, sponsors: [sponsor.id],
    positions: [{ position: 'Top wing side panels', sponsor: 'Valley Tyres', size: 'Full height' }],
    decals: [{ decal: 'Valley Tyres top wing', stock: '1', reorder: '2', supplier: 'Sign Shop' }] });
  const last = rounds[rounds.length - 1];
  add('media', { caption: 'Car 17 at Hilltop — top wing', date: last.data.values.date, event: last.id, car: car.id, sponsors: [sponsor.id], logo_position: 'Top wing side panels', approved: true });
  add('social_post', { event: last.id, status: 'Posted', text: 'Solid night at the Club Championship. Thanks Valley Tyres!', sponsors: [sponsor.id], posted_on: last.data.values.date });
  add('guest', { event: tonight.id, name: 'Chris Lee', sponsor: sponsor.id, passes: '2', pass_type: 'Pit', notes: 'Valley Tyres sales manager and partner.' });
  add('merch', { name: 'Team T-shirt', variant: 'L', stock: '3', reorder_at: '5', price: '35', cost: '12' });
  const hauler = A('Hauler', 'Vehicle', { vehicle_type: 'Hauler / truck', status: 'In Service', manufacturer: 'Isuzu', rego_due: day(20), inspection_due: day(45) });
  add('licence', { holder: 'Pat Driver', class: 'HR (heavy rigid)', expiry: day(40), country: 'Australia' });
  add('load_list', { is_template: true, name: 'Sprint car race weekend', items: [
    { item: 'Spare front axle', qty: '1' }, { item: 'Tyre rack (6 rears, 4 fronts)', qty: '1' }, { item: 'Methanol drums', qty: '4' },
    { item: 'Tool boxes', qty: '2' }, { item: 'Wing spares', qty: '1' }, { item: 'Generator', qty: '1' }] });
  add('trip', { event: next.id, vehicle: ref(hauler), depart_date: day(7), depart_time: '1:00 pm', from: 'Workshop', distance: '180', route: 'Highway the whole way; fuel at the halfway roadhouse.' });
  return out;
}
