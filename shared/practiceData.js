// Demo data for a practice team: a realistic race team (and engine shop) to learn on. The training
// exercises (docs/guide/training-*.md) refer to these names, so change both together.
//
// practiceData({ form, today, uuid }) → [{ id, type, data: { form_id?, values } }]
//   form(target, kind?) returns the team's form id for a record type (kind: dyno 'shock' | 'bar').

export const PRACTICE = {
  car: 'Car 17', spareCar: 'Car 71', engine: '410 #3', series: 'Club Championship',
  tonight: 'Valley Speedway — Club night', next: 'Lakeside Raceway — Club Championship',
  rrShock: 'RR Penske 8760', customer: 'Sam Hart', customerEngine: 'Hart 410', job: 'J-1001',
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
  for (let n = 0; n < 8; n++) {
    const track = tracks[n % 3];
    const ev = add('event', {
      name: `${track} — ${series.data.values.name}`, series: series.id, round: String(n + 1), date: day(-112 + n * 14), track, car: car.id, intent: 'Planned',
      ...(n === 3 ? { outcome: 'Withdrew during the event', withdraw_reason: 'Engine', withdraw_session: 'Heat 1' } : { outcome: 'Raced the feature' }),
    });
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
  add('event', { name: 'Lakeside Raceway — Club Championship', series: series.id, round: '9', date: day(7), track: 'Lakeside Raceway', car: car.id, intent: 'Planned' });

  // ---- workshop: schedules and a recent service
  add('schedule', { name: 'RR shock rebuild', applies_to: 'Asset', asset: shocks.RR.id, interval: '10', interval_unit: 'Races', last_done: day(-120),
    instructions: 'Send to the shock builder for a rebuild and re-dyno.' });
  add('schedule', { name: 'Oil and filter change', applies_to: 'Car', car: car.id, interval: '3', interval_unit: 'Races', last_done: day(-30) });
  add('schedule', { name: 'Repack wheel bearings', applies_to: 'Car', car: car.id, interval: '6', interval_unit: 'Races', last_done: day(-60) });
  add('maintenance', { car: car.id, date: day(-14), level: 'weekly', notes: 'Weekly service after the Hilltop round.' });

  // ---- engines: the build sheet for our engine
  add('engine_build', { engine: eng.id, date: day(-130), build_type: 'Fresh build', builder: 'Hart Engines', engine_type: '410 sprint', cid: '410', hp: '920',
    engine_laps: '0', notes: 'Fresh build at the start of the season.' });

  // ---- engine shop: a customer, their engine and a job in progress
  const cust = add('customer', { name: 'Sam Hart', contact_name: 'Sam Hart', phone: '0400 111 222', races: '410 sprintcar' });
  const custEngine = A('Hart 410', 'Engine', { customer: cust.id, life_unit: 'Laps', life_limit: '500' });
  add('job', {
    job_no: 'J-1001', customer: cust.id, engine: custEngine.id, job_type: 'Freshen / refresh', status: 'In progress', date_in: day(-3), date_promised: day(5),
    request: 'Freshen after 480 laps. Down on power at the top end.',
    parts: [{ part_no: 'RS-410', description: 'Ring set', qty: '8', unit_cost: '45', unit_price: '60' }],
    labour: [{ date: day(-2), tech: 'Workshop', description: 'Teardown and inspection', hours: '4', rate: '120' }],
  });
  return out;
}
