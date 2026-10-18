import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Empty, PageHeader, Pill } from '../components/ui.jsx';
import { gearOptions, gearTeeth, mphAt, ownedByTeeth, rpName, rpRatio, rpmFor, spur, teethKey } from '../lib/gears.js';
import { num, titleOf, useTeamData, v } from '../lib/data.js';
import { deleteRecord, saveRecord } from '../lib/store.js';
import { useSession } from '../lib/session.jsx';

const NONE = '__none__'; // explicit "no cars" (an empty list means any car)
const carOk = (rec, car) => !car || !(v(rec, 'available_for') || []).length || v(rec, 'available_for').includes(car);
const f3 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(3));
const sign = (x, d = 0) => (x > 0 ? '+' : '') + x.toFixed(d);

export function GearsTires() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'calc';
  const { canType } = useSession();
  const set = (t) => setParams(t === 'calc' ? {} : { tab: t });
  const TABS = [['calc', 'Gear calculator'], ['chart', 'Gear chart & availability'], ['lists', 'Gear lists'], ['tires', 'Tires'], ['stagger', 'Stagger combos']];
  return (
    <div>
      <PageHeader title="Gears & tires" sub="Quick-change gear lists, availability by car, ratio & rpm calculator, tires and stagger">
        {tab === 'lists' && canType('gear_list', 'edit') && <Link className="btn primary" to="/r/gear_list/new?application=Midget">New gear list</Link>}
        {['tires', 'stagger'].includes(tab) && canType('tire', 'edit') && <Link className="btn primary" to="/r/tire/new">New tire</Link>}
      </PageHeader>
      <div className="tabs scroll">
        {TABS.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'active' : ''} onClick={() => set(k)}>{l}</button>)}
      </div>
      {tab === 'calc' && <GearCalculator />}
      {tab === 'chart' && <GearChart />}
      {tab === 'lists' && <GearLists />}
      {(tab === 'tires' || tab === 'stagger') && <Tires tab={tab} />}
    </div>
  );
}

// -------- shared: pick car, list and ring & pinion --------
function useGearContext(data) {
  const cars = data.list('car').filter((c) => v(c, 'active') !== false);
  const lists = data.list('gear_list').slice().sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  const [car, setCarState] = useState(cars[0]?.id || '');
  const [touched, setTouched] = useState(false);
  const setCar = (x) => { setTouched(true); setCarState(x); };
  // on a fresh device the cars may arrive after first render
  useEffect(() => { if (!touched && !car && cars[0]) setCarState(cars[0].id); }, [cars.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const carRec = data.byId[car];
  const [listId, setListId] = useState('');
  const list = data.byId[listId] || data.byId[v(carRec, 'gear_list')] || lists[0];
  return { cars, lists, car, setCar, carRec, list, setListId };
}

function ContextBar({ ctx, children }) {
  return (
    <div className="card toolbar">
      <label className="inline-field">Car
        <select value={ctx.car} onChange={(e) => { ctx.setCar(e.target.value); ctx.setListId(''); }}>
          <option value="">Any car</option>{ctx.cars.map((c) => <option key={c.id} value={c.id}>{titleOf(c)}</option>)}
        </select>
      </label>
      <label className="inline-field">Gear list
        <select value={ctx.list?.id || ''} onChange={(e) => ctx.setListId(e.target.value)}>
          {ctx.lists.map((l) => <option key={l.id} value={l.id}>{titleOf(l)}</option>)}
        </select>
      </label>
      {children}
    </div>
  );
}

// -------- calculator --------
function GearCalculator() {
  const data = useTeamData();
  if (!data) return null;
  return <Calc data={data} />;
}

function Calc({ data }) {
  const ctx = useGearContext(data);
  const { list, carRec, car } = ctx;
  const rps = (v(list, 'rps') || []).filter((r) => rpRatio(r));
  const [rpSel, setRpSel] = useState('car');
  const [customRp, setCustomRp] = useState('');
  const [onlyAvail, setOnlyAvail] = useState(true);
  const [lowHp, setLowHp] = useState(false);
  const [mode, setMode] = useState('ratio');
  const [curSet, setCurSet] = useState('');
  const [curPos, setCurPos] = useState('Low');
  const [curRatioIn, setCurRatioIn] = useState('');
  const [rpm, setRpm] = useState('8000');
  const [circ, setCirc] = useState('105');
  const [target, setTarget] = useState('');
  const [targetRpm, setTargetRpm] = useState('');
  const [trySet, setTrySet] = useState('');
  const [tryPos, setTryPos] = useState('Low');
  const [showAll, setShowAll] = useState(false);

  // R&P in use: car default (closest list option), a chosen option, all options, or custom
  const carRp = num(v(carRec, 'rp_ratio'));
  const closest = (x) => rps.slice().sort((a, b) => Math.abs(rpRatio(a) - x) - Math.abs(rpRatio(b) - x))[0];
  const activeRps = rpSel === 'all' ? rps
    : rpSel === 'custom' ? (num(customRp) ? [{ label: customRp }] : [])
      : rpSel === 'car' ? (carRp ? [closest(carRp) && Math.abs(rpRatio(closest(carRp)) - carRp) < 0.02 ? closest(carRp) : { label: String(carRp) }] : rps.slice(-1))
        : rps.filter((r) => r.label === rpSel);
  const curRp = activeRps[0];

  const owned = useMemo(() => ownedByTeeth(data.list('gear').filter((g) => !v(g, 'list') || v(g, 'list') === list?.id)), [data, list]);
  const anyOwned = owned.size > 0;
  const options = useMemo(() => (list ? gearOptions(list, { rps: activeRps, owned, car, onlyOwned: onlyAvail && anyOwned, includeLowHp: lowHp }) : []),
    [list, activeRps, owned, car, onlyAvail, anyOwned, lowHp]); // eslint-disable-line react-hooks/exhaustive-deps

  const sets = (v(list, 'sets') || []).filter((s) => spur(s));
  const setById = (id) => sets.find((s) => s.set === id);
  const ratioOf = (s, pos, rp) => (s && spur(s) && rpRatio(rp) ? rpRatio(rp) * (pos === 'Low' ? spur(s).low : spur(s).high) : null);
  const current = num(curRatioIn) ?? ratioOf(setById(curSet), curPos, curRp);
  const rpmN = num(rpm); const circN = num(circ);

  let goal = null; let goalLabel = '';
  if (mode === 'ratio' && num(target)) { goal = num(target); goalLabel = `target ${num(target).toFixed(3)}`; }
  if (mode === 'rpm' && num(targetRpm) && current && rpmN) {
    const want = Math.abs(num(targetRpm)) < 2000 ? rpmN + num(targetRpm) : num(targetRpm); // accept "+200" or "8200"
    goal = current * (want / rpmN); goalLabel = `${Math.round(want)} rpm → ratio ${goal.toFixed(3)}`;
  }
  const tryRatio = ratioOf(setById(trySet), tryPos, curRp);
  if (mode === 'try' && tryRatio) goal = tryRatio;

  const ranked = options.map((o) => ({
    ...o,
    diff: goal ? o.ratio - goal : 0,
    rpmNew: current && rpmN ? rpmFor(rpmN, current, o.ratio) : null,
    mph: rpmN && circN ? mphAt(rpmN, o.ratio, circN) : null,
  })).sort((a, b) => (goal ? Math.abs(a.diff) - Math.abs(b.diff) : a.ratio - b.ratio));
  const shown = showAll ? ranked : ranked.slice(0, 14);

  if (!list) return <Empty>No gear lists yet. Add one under “Gear lists”.</Empty>;
  return (
    <>
      <ContextBar ctx={ctx}>
        <label className="inline-field">Ring & pinion
          <select value={rpSel} onChange={(e) => setRpSel(e.target.value)}>
            <option value="car">{car && carRp ? `Car's (${carRp})` : 'Default'}</option>
            {rps.map((r) => <option key={r.label} value={r.label}>{rpName(r)}</option>)}
            <option value="all">Compare all</option><option value="custom">Custom…</option>
          </select>
        </label>
        {rpSel === 'custom' && <input className="num narrow" inputMode="decimal" aria-label="Custom ring and pinion ratio" placeholder="e.g. 4.86" value={customRp} onChange={(e) => setCustomRp(e.target.value)} />}
        {anyOwned && <label className="toggle small"><input type="checkbox" checked={onlyAvail} onChange={(e) => setOnlyAvail(e.target.checked)} /><span>Only sets available{car ? ' for this car' : ''}</span></label>}
        <label className="toggle small"><input type="checkbox" checked={lowHp} onChange={(e) => setLowHp(e.target.checked)} /><span>Include low-HP sets</span></label>
      </ContextBar>

      <div className="grid-2 calc-grid">
        <section className="card">
          <h3>Current gearing</h3>
          <div className="field-grid">
            <div className="field"><label htmlFor="cur-set">Gear set</label>
              <select id="cur-set" value={curSet} onChange={(e) => { setCurSet(e.target.value); setCurRatioIn(''); }}>
                <option value="">—</option>{sets.map((s) => <option key={s.set} value={s.set}>{s.set} ({s.small}/{s.large})</option>)}
              </select></div>
            <div className="field"><label htmlFor="cur-pos">Position</label>
              <select id="cur-pos" value={curPos} onChange={(e) => { setCurPos(e.target.value); setCurRatioIn(''); }}><option>Low</option><option>High</option></select></div>
            <div className="field"><label htmlFor="cur-ratio">Final drive</label>
              <input id="cur-ratio" className="num" inputMode="decimal" placeholder={f3(ratioOf(setById(curSet), curPos, curRp))} value={curRatioIn} onChange={(e) => setCurRatioIn(e.target.value)} /></div>
            <div className="field"><label htmlFor="cur-rpm">Engine rpm <span className="unit">at the point you care about</span></label>
              <input id="cur-rpm" className="num" inputMode="decimal" value={rpm} onChange={(e) => setRpm(e.target.value)} /></div>
            <div className="field"><label htmlFor="cur-circ">RR circumference <span className="unit">in</span></label>
              <input id="cur-circ" className="num" inputMode="decimal" value={circ} onChange={(e) => setCirc(e.target.value)} /></div>
          </div>
          <div className="stat-row">
            <div><b>{f3(current)}</b><small>final drive</small></div>
            <div><b>{current && rpmN && circN ? mphAt(rpmN, current, circN).toFixed(1) : '—'}</b><small>mph @ {rpm} rpm</small></div>
            <div><b>{curRp ? rpName(curRp) : '—'}</b><small>ring & pinion</small></div>
          </div>
        </section>

        <section className="card">
          <h3>What do you want to do?</h3>
          <div className="seg">
            {[['ratio', 'Hit a final drive'], ['rpm', 'Change rpm'], ['try', 'Try a gear set']].map(([k, l]) => (
              <button key={k} type="button" className={mode === k ? 'active' : ''} onClick={() => setMode(k)}>{l}</button>
            ))}
          </div>
          {mode === 'ratio' && (
            <div className="field"><label htmlFor="t-ratio">Desired final drive ratio</label>
              <input id="t-ratio" className="num" inputMode="decimal" placeholder="e.g. 5.40" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
          )}
          {mode === 'rpm' && (
            <div className="field"><label htmlFor="t-rpm">Desired rpm, or change (e.g. 8200 or +200 / −150)</label>
              <input id="t-rpm" className="num" inputMode="decimal" placeholder="+200" value={targetRpm} onChange={(e) => setTargetRpm(e.target.value.replace('−', '-'))} />
              {!current && <small className="error-text">Set the current gear or final drive first.</small>}</div>
          )}
          {mode === 'try' && (
            <div className="field-grid">
              <div className="field"><label htmlFor="try-set">Gear set</label>
                <select id="try-set" value={trySet} onChange={(e) => setTrySet(e.target.value)}>
                  <option value="">—</option>{sets.map((s) => <option key={s.set} value={s.set}>{s.set} ({s.small}/{s.large})</option>)}
                </select></div>
              <div className="field"><label htmlFor="try-pos">Position</label>
                <select id="try-pos" value={tryPos} onChange={(e) => setTryPos(e.target.value)}><option>Low</option><option>High</option></select></div>
            </div>
          )}
          {mode === 'try' && tryRatio && (
            <div className="try-result">
              <div><small>New final drive</small><b>{f3(tryRatio)}</b></div>
              {current && <div><small>Change</small><b>{sign(((tryRatio - current) / current) * 100, 1)}%</b></div>}
              {current && rpmN && <div><small>RPM at the same speed</small><b className={tryRatio > current ? 'lvl-warn' : 'lvl-ok'}>{Math.round(rpmFor(rpmN, current, tryRatio))} ({sign(rpmFor(rpmN, current, tryRatio) - rpmN)})</b></div>}
              {rpmN && circN && <div><small>mph @ {rpm} rpm</small><b>{mphAt(rpmN, tryRatio, circN).toFixed(1)}</b></div>}
            </div>
          )}
          {goalLabel && <p className="muted small">Ranking by closest to {goalLabel}.</p>}
        </section>
      </div>

      <div className="card table-card">
        <table className="table gear-results">
          <thead><tr><th>Set</th><th>Teeth</th><th>Pos.</th><th>R&amp;P</th><th>Final</th>{goal && <th>Off by</th>}<th>RPM</th><th>Δ rpm</th><th>mph</th><th /></tr></thead>
          <tbody>{shown.map((o, i) => (
            <tr key={`${o.set.set}-${o.pos}-${o.rp.label}`} className={goal && i === 0 ? 'best' : ''}>
              <td><b>{o.set.set}</b>{o.set.note ? <small className="muted"> · {o.set.note}</small> : null}</td>
              <td>{o.set.small}/{o.set.large}</td><td>{o.pos}</td><td>{rpName(o.rp)}</td>
              <td><b>{f3(o.ratio)}</b></td>
              {goal && <td className="muted">{sign(o.diff, 3)}</td>}
              <td>{o.rpmNew ? Math.round(o.rpmNew) : '—'}</td>
              <td className={o.rpmNew && rpmN ? (o.rpmNew > rpmN ? 'lvl-warn' : 'lvl-ok') : ''}>{o.rpmNew && rpmN ? sign(o.rpmNew - rpmN) : '—'}</td>
              <td>{o.mph ? o.mph.toFixed(1) : '—'}</td>
              <td>{o.available ? <Pill level="ok">available</Pill> : o.owned ? <Pill level="muted">not for this car</Pill> : anyOwned ? <Pill level="muted">not owned</Pill> : null}</td>
            </tr>
          ))}</tbody>
        </table>
        {ranked.length > shown.length && <button type="button" className="btn small ghost" onClick={() => setShowAll(true)}>Show all {ranked.length}</button>}
        {ranked.length === 0 && <p className="muted pad">No sets match. Untick “Only sets available” or mark sets as owned on the Gear chart tab.</p>}
      </div>
      <p className="muted small">Final drive = ring & pinion × spur ratio (low = small ÷ large, high = large ÷ small). RPM is at the same road speed: new rpm = current rpm × new ratio ÷ current ratio.</p>
    </>
  );
}

// -------- gear chart with team & car availability --------
function GearChart() {
  const data = useTeamData();
  if (!data) return null;
  return <Chart data={data} />;
}

function Chart({ data }) {
  const { tid, user, canType } = useSession();
  const ctx = useGearContext(data);
  const { list } = ctx;
  const [ownedOnly, setOwnedOnly] = useState(false);
  const canEdit = canType('gear', 'edit');
  if (!list) return <Empty>No gear lists yet.</Empty>;
  const rps = (v(list, 'rps') || []).filter((r) => rpRatio(r));
  const gears = data.list('gear').filter((g) => !v(g, 'list') || v(g, 'list') === list.id);
  const owned = ownedByTeeth(gears);
  const cars = ctx.cars;
  const sets = (v(list, 'sets') || []).filter((s) => spur(s)).filter((s) => !ownedOnly || owned.has(teethKey(num(s.small), num(s.large))));
  const gearForm = data.list('form').find((f) => f.data.target === 'gear' && f.data.is_default);

  const setQty = async (s, qty) => {
    const mine = owned.get(teethKey(num(s.small), num(s.large))) || [];
    const q = Math.max(0, Math.round(num(qty) || 0));
    if (!mine.length && q > 0) {
      await saveRecord(tid, 'gear', null, { form_id: gearForm?.id, values: { list: list.id, name: s.set, small: s.small, large: s.large, qty: String(q), status: 'Available', available_for: [] } }, user.id);
    } else if (mine.length && q === 0) {
      if (!window.confirm(`Remove set ${s.set} from the team's gears?`)) return;
      for (const g of mine) await deleteRecord(g.id);
    } else if (mine.length) {
      await saveRecord(tid, 'gear', mine[0].id, { ...mine[0].data, values: { ...mine[0].data.values, qty: String(q) } }, user.id);
    }
  };
  const toggleCar = async (g, carId, on) => {
    const cur = v(g, 'available_for') || [];
    // empty list means "any car": the first untick turns it into an explicit list of the others
    const base = (cur.length ? cur : cars.map((c) => c.id)).filter((x) => x !== NONE);
    const next = on ? [...new Set([...base, carId])] : base.filter((x) => x !== carId);
    const value = cars.every((c) => next.includes(c.id)) ? [] : next.length ? next : [NONE];
    await saveRecord(tid, 'gear', g.id, { ...g.data, values: { ...g.data.values, available_for: value } }, user.id);
  };

  return (
    <>
      <ContextBar ctx={ctx}>
        <label className="toggle small"><input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} /><span>Owned sets only</span></label>
        <Link className="btn small ghost" to={`/r/gear_list/${list.id}?back=${encodeURIComponent('/track/gears?tab=chart')}`}>Edit list</Link>
      </ContextBar>
      <p className="muted small">Set <b>Team qty</b> for the sets you own, then untick cars that can't use a set. Cars use this list when it's set on the car (Team → Cars).</p>
      <div className="card table-card">
        <table className="table gear-chart">
          <thead>
            <tr><th rowSpan={2}>Set</th><th rowSpan={2}>Teeth</th><th rowSpan={2}>Low spur</th><th rowSpan={2}>High spur</th>
              {rps.map((r) => <th key={r.label} colSpan={2} className="rp-head">{rpName(r)}</th>)}
              <th rowSpan={2}>Team qty</th>{cars.map((c) => <th key={c.id} rowSpan={2} className="car-col">#{v(c, 'number')}</th>)}</tr>
            <tr>{rps.map((r) => [<th key={`${r.label}l`}>Low</th>, <th key={`${r.label}h`}>High</th>])}</tr>
          </thead>
          <tbody>{sets.map((s) => {
            const sp = spur(s);
            const mine = owned.get(teethKey(num(s.small), num(s.large))) || [];
            const g = mine[0];
            const qty = mine.reduce((a, x) => a + (num(v(x, 'qty')) || 1), 0);
            return (
              <tr key={s.set} className={`${mine.length ? 'owned' : ''}${s.note ? ' lowhp' : ''}`}>
                <td><b>{s.set}</b>{s.note ? <small className="muted"> *</small> : null}</td><td>{s.small}/{s.large}</td>
                <td>{sp.low.toFixed(3)}</td><td>{sp.high.toFixed(3)}</td>
                {rps.map((r) => [<td key={`${r.label}l`}>{(rpRatio(r) * sp.low).toFixed(2)}</td>, <td key={`${r.label}h`}>{(rpRatio(r) * sp.high).toFixed(2)}</td>])}
                <td><QtyInput disabled={!canEdit} value={qty} onCommit={(x) => setQty(s, x)} label={`Team quantity for set ${s.set}`} /></td>
                {cars.map((c) => (
                  <td key={c.id} className="car-col">
                    {g ? <input type="checkbox" aria-label={`Set ${s.set} available for ${titleOf(c)}`} disabled={!canEdit} checked={carOk(g, c.id)} onChange={(e) => toggleCar(g, c.id, e.target.checked)} /> : null}
                  </td>
                ))}
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {sets.some((s) => s.note) && <p className="muted small">* {sets.find((s) => s.note)?.note}</p>}
    </>
  );
}

function QtyInput({ value, onCommit, disabled, label }) {
  const [x, setX] = useState(value ? String(value) : '');
  useEffect(() => { setX(value ? String(value) : ''); }, [value]);
  return (
    <input className="num qty" inputMode="numeric" aria-label={label} disabled={disabled} value={x} placeholder="0"
      onChange={(e) => setX(e.target.value)} onBlur={() => { if ((num(x) || 0) !== (value || 0)) onCommit(x); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

function GearLists() {
  const data = useTeamData();
  if (!data) return null;
  const lists = data.list('gear_list');
  return lists.length === 0 ? <Empty>No gear lists yet.</Empty> : (
    <div className="card list">
      {lists.map((l) => {
        const cars = data.list('car').filter((c) => v(c, 'gear_list') === l.id);
        return (
          <Link key={l.id} to={`/r/gear_list/${l.id}`} className="list-row">
            <span className="grow">
              <span className="row-title">{v(l, 'name')}</span>
              <span className="row-sub">{[v(l, 'application'), `${(v(l, 'sets') || []).filter((s) => spur(s)).length} sets`, `R&P ${(v(l, 'rps') || []).filter((r) => rpRatio(r)).map(rpName).join(', ') || 'none'}`].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="row-meta">{cars.length ? cars.map((c) => `#${v(c, 'number')}`).join(' ') : 'no cars'}</span>
          </Link>
        );
      })}
    </div>
  );
}

// -------- tires & stagger --------
function Tires({ tab }) {
  const data = useTeamData();
  const [car, setCar] = useState('');
  const [axle, setAxle] = useState('rear');
  const [target, setTarget] = useState('');
  const [tol, setTol] = useState('0.5');
  const [showUsed, setShowUsed] = useState(false);
  const tires = useMemo(() => (data ? data.list('tire').filter((t) => carOk(t, car))
    .filter((t) => showUsed || v(t, 'status') !== 'Worn out')
    .sort((a, b) => String(v(a, 'position')).localeCompare(String(v(b, 'position'))) || (num(v(a, 'circumference')) || 0) - (num(v(b, 'circumference')) || 0)) : []), [data, car, showUsed]);
  const combos = useMemo(() => {
    const [L, R] = axle === 'rear' ? ['LR', 'RR'] : ['LF', 'RF'];
    const usable = tires.filter((t) => v(t, 'status') !== 'Worn out' && num(v(t, 'circumference')) !== null);
    const left = usable.filter((t) => [L, 'Any', undefined, ''].includes(v(t, 'position')));
    const right = usable.filter((t) => [R, 'Any', undefined, ''].includes(v(t, 'position')));
    const out = [];
    for (const l of left) for (const r of right) {
      if (l.id === r.id) continue;
      out.push({ l, r, st: Math.round((num(v(r, 'circumference')) - num(v(l, 'circumference'))) * 1000) / 1000 });
    }
    const tg = num(target);
    return out.filter((c) => tg === null || Math.abs(c.st - tg) <= (num(tol) ?? 0.5))
      .sort((a, b) => (tg === null ? b.st - a.st : Math.abs(a.st - tg) - Math.abs(b.st - tg))).slice(0, 60);
  }, [tires, axle, target, tol]);
  if (!data) return null;
  return (
    <>
      <div className="toolbar">
        <select value={car} onChange={(e) => setCar(e.target.value)}>
          <option value="">Any car</option>{data.list('car').map((c) => <option key={c.id} value={c.id}>Available for {titleOf(c)}</option>)}
        </select>
        {tab === 'tires' && <label className="toggle small"><input type="checkbox" checked={showUsed} onChange={(e) => setShowUsed(e.target.checked)} /><span>Show worn out</span></label>}
        {tab === 'stagger' && (
          <>
            <select value={axle} onChange={(e) => setAxle(e.target.value)}><option value="rear">Rear (LR / RR)</option><option value="front">Front (LF / RF)</option></select>
            <label className="inline-field">Target <input inputMode="decimal" className="num" value={target} placeholder="any" onChange={(e) => setTarget(e.target.value)} /> in</label>
            <label className="inline-field">± <input inputMode="decimal" className="num" value={tol} onChange={(e) => setTol(e.target.value)} /> in</label>
          </>
        )}
      </div>
      {tab === 'tires' && (tires.length === 0 ? <Empty>No tires yet. Record each tire with its measured circumference to work out stagger.</Empty> : (
        <div className="card table-card">
          <table className="table">
            <thead><tr><th>Tire</th><th>Pos.</th><th>Circ.</th><th>Compound</th><th>Size</th><th>Duro</th><th>Laps</th><th>Status</th></tr></thead>
            <tbody>{tires.map((t) => (
              <tr key={t.id}>
                <td><Link to={`/r/tire/${t.id}`}><b>{v(t, 'name')}</b></Link><div className="muted small">{v(t, 'brand')}</div></td>
                <td>{v(t, 'position')}</td><td><b>{v(t, 'circumference')}</b></td><td>{v(t, 'compound')}</td><td>{v(t, 'size')}</td>
                <td>{v(t, 'durometer')}</td><td>{v(t, 'laps')}</td>
                <td><Pill level={v(t, 'status') === 'Worn out' ? 'muted' : v(t, 'status') === 'New' ? 'ok' : 'info'}>{v(t, 'status')}</Pill></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
      {tab === 'stagger' && (
        <>
          <p className="muted small">Stagger = right tire circumference − left tire circumference. Tires marked “Any” can go on either side.</p>
          {combos.length === 0 ? <Empty>No combinations match. Add tires with circumferences, or widen the tolerance.</Empty> : (
            <div className="card table-card">
              <table className="table">
                <thead><tr><th>Stagger</th><th>{axle === 'rear' ? 'LR' : 'LF'}</th><th>{axle === 'rear' ? 'RR' : 'RF'}</th><th>Compounds</th></tr></thead>
                <tbody>{combos.map(({ l, r, st }) => (
                  <tr key={`${l.id}-${r.id}`}>
                    <td><b className={num(target) !== null && Math.abs(st - num(target)) < 0.125 ? 'lvl-ok' : ''}>{st.toFixed(3)}</b></td>
                    <td><Link to={`/r/tire/${l.id}`}>{v(l, 'name')}</Link> <span className="muted">({v(l, 'circumference')})</span></td>
                    <td><Link to={`/r/tire/${r.id}`}>{v(r, 'name')}</Link> <span className="muted">({v(r, 'circumference')})</span></td>
                    <td className="muted">{[v(l, 'compound'), v(r, 'compound')].filter(Boolean).join(' / ')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

export { gearTeeth };
