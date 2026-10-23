import { useEffect, useMemo, useRef, useState } from 'react';
import { gearTeeth } from '../lib/gears.js';
import { dayOf, orderSessions, previousSession } from '../lib/sessions.js';
import { AiTools } from '../components/Ai.jsx';
import { WeatherTools, useWeatherUnits, withWeatherUnits } from '../components/Weather.jsx';
import { calcContext } from '../components/Calculator.jsx';
import { EngineChecks } from '../components/EngineChecks.jsx';
import { FuelPlanner, useFuelUnits } from '../components/FuelPlanner.jsx';
import { BarResults } from '../components/BarTests.jsx';
import { InitialClash, ShockVsInitial } from '../components/DynoInitial.jsx';
import { convertFuel, fuelUnit, withFuelUnits } from '@shared/fuel.js';
import { ArrangeSections, SheetNav, SheetTools, useSheetLayout } from '../components/SheetNav.jsx';
import { changedFields } from '@shared/setupLayout.js';
import { SHOP_SETUP_SKIP, toTrackValues } from '@shared/workshopSetup.js';
import { ShopSetupLinks } from './WorkshopSetups.jsx';
import { JobExtras } from './Shop.jsx';
import { nextJobNo, shopSettings } from '@shared/shop.js';
import { FIELD_CALCS, cornerPercents } from '@shared/calcs.js';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import FormRenderer from '../components/FormRenderer.jsx';
import DynoChart from '../components/DynoChart.jsx';
import ContactLinks from '../components/ContactLinks.jsx';
import { GLOBAL_TYPES } from '@shared/catalog.js';
import { Attachments, History, PageHeader } from '../components/ui.jsx';
import { allFields, isVisible, num, formFor, formsFor, fmtDate, levelLabel, titleOf, today, useRecordById, useTeamData, v } from '../lib/data.js';
import { deleteRecord, saveRecord } from '../lib/store.js';
import { useSession } from '../lib/session.jsx';

export const TYPE_LABEL = {
  car: 'Car', event: 'Event', setup: 'Setup sheet', maintenance: 'Maintenance log', asset: 'Asset',
  schedule: 'Maintenance schedule', measurement: 'Measurement', track_check: 'Between-rounds check',
  gear: 'Gear set', gear_list: 'Gear list', tire: 'Tire', track: 'Track', team_track: 'Team track', contact: 'Contact',
  supplier: 'Supplier', contact_link: 'Contact role', series: 'Series', dyno_run: 'Dyno run', engine_build: 'Engine build', review: 'Performance review',
  customer: 'Customer', job: 'Job', shop_setup: 'Workshop setup',
};

// New records pre-filled from the latest record with the same car / engine.
const CARRY = {
  setup: { match: 'car', skip: ['event', 'car', 'session', 'crew_chief', 'day', 'baseline', 'baseline_name'], label: 'session' },
  engine_build: { match: 'engine', skip: ['engine', 'date', 'build_type', 'engine_laps', 'builder', 'notes'], label: 'build' },
  shop_setup: { match: 'car', skip: ['car', ...SHOP_SETUP_SKIP], label: 'workshop setup' },
};

function afterSave(type, rec) {
  const vals = rec.data.values;
  switch (type) {
    case 'event': return `/events/${rec.id}`;
    case 'setup': return vals.event ? `/events/${vals.event}` : '/setups';
    case 'maintenance': return '/maintenance';
    case 'schedule': return '/maintenance?tab=schedules';
    case 'asset': return `/assets/${rec.id}`;
    case 'measurement': return vals.asset ? `/assets/${vals.asset}` : '/assets';
    case 'car': return '/cars';
    case 'track_check': return '/track/checks';
    case 'track': return `/tracks/${rec.id}`;
    case 'team_track': return vals.track ? `/tracks/${vals.track}` : '/tracks';
    case 'contact': return `/contacts/${rec.id}`;
    case 'customer': return `/customers/${rec.id}`;
    case 'job': return `/r/job/${rec.id}`;
    case 'supplier': return '/suppliers';
    case 'contact_link': return vals.contact ? `/contacts/${vals.contact}` : '/contacts';
    case 'series': return `/series/${rec.id}`;
    case 'gear': return '/track/gears?tab=chart';
    case 'gear_list': return '/track/gears?tab=lists';
    case 'tire': return '/track/gears?tab=tires';
    case 'dyno_run': return '/workshop/dyno';
    case 'engine_build': return '/engines';
    case 'review': return '/team/reviews';
    case 'shop_setup': return '/workshop/setups';
    default: return '/';
  }
}

/** Values from the car's most recent setup, limited to sections that carry forward. */
function carryValues(form, source, skip = CARRY.setup.skip) {
  const out = {};
  const sv = source?.data.values || {};
  for (const sec of form.data.sections) {
    if (sec.carry === false) continue;
    for (const f of sec.fields) {
      if (skip.includes(f.key) || f.nocopy || f.type === 'heading' || f.type === 'calc') continue;
      if (sv[f.key] !== undefined) out[f.key] = sv[f.key];
    }
  }
  return out;
}

/** Event fields that come from the chosen directory track. */
export function trackDetails(t) {
  if (!t) return {};
  return {
    track: v(t, 'name') || '',
    location: [v(t, 'city'), v(t, 'region'), v(t, 'country')].filter(Boolean).join(', '),
    track_length: v(t, 'length') || '',
    surface: v(t, 'surface') || '',
    banking: v(t, 'banking') || '',
  };
}

const eventDate = (s, data) => v(data.byId[v(s, 'event')], 'date') || '';
const recDate = (r, data) => (r.type === 'setup' ? eventDate(r, data) : v(r, 'date') || '');
const sortSetupsDesc = (list, data) => list.slice().sort((a, b) =>
  recDate(b, data).localeCompare(recDate(a, data)) || b.created_at.localeCompare(a.created_at));

export default function RecordEdit() {
  const { type, id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { tid, user, canType, canModule, membership } = useSession();
  const data = useTeamData();
  const rec = useRecordById(id === 'new' ? null : id);
  const isNew = id === 'new';
  const canBeGlobal = GLOBAL_TYPES.includes(type) && user?.is_platform_admin;
  const [makeGlobal, setMakeGlobal] = useState(type === 'track' || new URLSearchParams(window.location.search).get('scope') === 'global');
  const isGlobal = isNew ? canBeGlobal && makeGlobal : !!(rec?.global || rec?.data?.scope === 'global');
  const readOnly = !canType(type, 'edit') || (!isNew && isGlobal && !user?.is_platform_admin);

  const [formId, setFormId] = useState(null);
  const [values, setValues] = useState(null);
  const [errors, setErrors] = useState({});
  const [carried, setCarried] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const [pickBaseline, setPickBaseline] = useState('');
  const [pickSession, setPickSession] = useState('');
  const [pickShopState, setPickShopState] = useState('');
  const [dirty, setDirty] = useState(false);
  const [stage, setStage] = useState('all'); // setup: All / Before / After the session
  const [changesOnly, setChangesOnly] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [fuelView, setFuelView] = useState(null); // setup: show fuel in this unit (null = as recorded)

  const form = data ? formFor(data, type, formId || rec?.data.form_id || params.get('form')) : null;
  const wxUnits = useWeatherUnits();
  const teamFuel = useFuelUnits();
  const sheet = useSheetLayout(type === 'setup' ? form : null, { isNew, values });

  // initialise once data + record are available
  useEffect(() => {
    if (!data || values || (!isNew && rec === undefined)) return;
    if (!isNew && !rec) return;
    if (!isNew) { setValues(rec.data.values || {}); setFormId(rec.data.form_id); return; }
    const f = formFor(data, type, params.get('form'));
    const init = {};
    for (const fd of allFields(f)) if (fd.default !== undefined) init[fd.key] = fd.default;
    for (const [k, val] of params.entries()) if (!['form', 'from', 'scope', 'back'].includes(k)) init[k] = val;
    for (const fd of allFields(f)) if (fd.defaultSelf && !init[fd.key]) init[fd.key] = user.id;
    if (type === 'dyno_run' && init.asset && v(data.byId[init.asset], 'adjust_type')) init.adjust_type = v(data.byId[init.asset], 'adjust_type');
    // the first test of a shock or bar is its initial measurement
    if (type === 'dyno_run' && init.asset && !data.list('dyno_run').some((r) => v(r, 'asset') === init.asset)) init.initial = true;
    if (allFields(f).some((fd) => fd.key === 'date' && fd.type === 'date')) init.date ||= today();
    if (type === 'setup' && init.order !== undefined) init.order = num(init.order);
    if (type === 'setup' && !init.fuel_unit) init.fuel_unit = teamFuel; // fuel recorded in the team's default unit
    if (type === 'car' && !init.fuel_min_unit) init.fuel_min_unit = teamFuel;
    if (type === 'job') {
      const shop = shopSettings(membership);
      init.job_no ||= nextJobNo(data.list('job').map((j) => v(j, 'job_no')), shop.job_prefix);
      init.status ||= 'Booked in';
      init.date_in ||= today();
      if (init.tax_rate === undefined) init.tax_rate = String(shop.tax_rate);
      if (!init.customer && init.engine && v(data.byId[init.engine], 'customer')) init.customer = v(data.byId[init.engine], 'customer');
    }
    if (type === 'event' && !init.car) {
      const active = data.list('car').filter((c) => v(c, 'active') !== false);
      if (active.length === 1) init.car = active[0].id; // the only car the team runs
    }
    if (type === 'event' && init.venue) Object.assign(init, trackDetails(data.byId[init.venue]));
    const cfg = CARRY[type];
    if (cfg && params.get('from') && data.byId[params.get('from')]) {
      const src = data.byId[params.get('from')];
      Object.assign(init, src.type === 'shop_setup' ? toTrackValues(formFor(data, 'shop_setup', src.data.form_id), src.data.values, f) : carryValues(f, src, cfg.skip)); setCarried(src);
      if (type === 'setup') init.copied_from = src.id; // changes are shown against this session
    } else if (type === 'setup') {
      setChoosing(true); // ask where to start from
    } else if (cfg && init[cfg.match]) {
      const src = sortSetupsDesc(data.list(type).filter((s) => v(s, cfg.match) === init[cfg.match]), data)[0];
      if (src) { Object.assign(init, carryValues(f, src, cfg.skip)); setCarried(src); if (type === 'setup') init.copied_from = src.id; }
    }
    setFormId(f?.id);
    setValues(init);
  }, [data, rec, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  // event: picking a different track fills location, length, surface and banking from the directory
  const venueRef = useRef(undefined);
  useEffect(() => {
    if (type !== 'event' || !values || !data) return;
    if (venueRef.current === undefined) { venueRef.current = values.venue || ''; return; }
    if ((values.venue || '') === venueRef.current) return;
    venueRef.current = values.venue || '';
    const t = data.byId[values.venue];
    if (t) setValues((x) => ({ ...x, ...trackDetails(t) }));
  }, [type, values?.venue, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // setup: final drive = ring & pinion on the car × spur ratio of the chosen gear set and position
  const carRp = type === 'setup' && data && values ? num(v(data.byId[values.car], 'rp_ratio')) : null;
  useEffect(() => {
    if (type !== 'setup' || !values || !data) return;
    const teeth = gearTeeth(data.byId[values.gear]);
    const fd = teeth && carRp ? (carRp * (values.gear_orientation === 'High' ? teeth.large / teeth.small : teeth.small / teeth.large)).toFixed(3) : '';
    if (fd !== (values.final_drive ?? '') && (fd || values.gear)) setValues((s0) => ({ ...s0, final_drive: fd }));
  }, [type, values?.gear, values?.gear_orientation, values?.car, carRp, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (k, val) => {
    setValues((s) => {
      const next = { ...s, [k]: val };
      // dyno run: picking a shock brings its adjuster type across
      if (type === 'dyno_run' && k === 'asset' && data?.byId[val] && v(data.byId[val], 'adjust_type')) next.adjust_type = v(data.byId[val], 'adjust_type');
      // new run: the first test of a shock or bar starts as its initial measurement
      if (type === 'dyno_run' && k === 'asset' && isNew) next.initial = !!val && !data.list('dyno_run').some((r) => v(r, 'asset') === val);
      // bar test: picking the bar brings its serial, maker, model and corner across (where empty)
      if (type === 'dyno_run' && k === 'asset' && data?.byId[val] && form?.data?.dyno_kind === 'bar') {
        const a = data.byId[val];
        const from = { serial: v(a, 'serial_number'), manufacturer: v(a, 'manufacturer'), model: v(a, 'model'), corner: ['LF', 'RF', 'LR', 'RR'].includes(v(a, 'position')) ? v(a, 'position') : '' };
        for (const [key, x] of Object.entries(from)) if (x && !next[key]) next[key] = x;
      }
      // setup: four corner weights fill in total, left, rear and cross
      if ((type === 'setup' || type === 'shop_setup') && k === 'corner_weights') {
        const p = cornerPercents(val);
        if (p) Object.assign(next, { total_weight: String(Math.round(p.total)), left_pct: p.left.toFixed(1), rear_pct: p.rear.toFixed(1), cross_pct: p.cross.toFixed(1) });
      }
      return next;
    });
    setDirty(true);
  };

  const cfg = CARRY[type];
  const matchVal = cfg ? values?.[cfg.match] : null;
  const baselines = data && type === 'setup' ? data.list('setup').filter((s) => v(s, 'baseline') && s.id !== id)
    .sort((a, b) => String(v(a, 'baseline_name') || titleOf(a, data)).localeCompare(String(v(b, 'baseline_name') || titleOf(b, data)))) : [];
  const baselineLabel = (s) => `${v(s, 'baseline_name') || titleOf(s, data)} — ${titleOf(data.byId[v(s, 'car')])}`;
  const presets = (type === 'setup' && form?.data.sessions) || [];
  // the session just before this one in the event's running order (the default to copy from)
  const prevSession = data && type === 'setup' && values?.event && values?.car ? previousSession(data.list('setup'), values, presets, id) : null;
  // sessions that can be copied: this event in running order, then this car's earlier events
  const thisEvent = data && type === 'setup' && values?.event && values?.car
    ? orderSessions(data.list('setup').filter((s) => s.id !== id && v(s, 'event') === values.event && v(s, 'car') === values.car), presets) : [];
  const earlier = data && type === 'setup' && values?.car
    ? sortSetupsDesc(data.list('setup').filter((s) => s.id !== id && v(s, 'car') === values.car && v(s, 'event') !== values.event), data).slice(0, 40) : [];
  const multiDay = thisEvent.some((s) => dayOf(s) > 1) || num(values?.day) > 1;
  const inEventLabel = (s) => `${multiDay ? `Day ${dayOf(s)} · ` : ''}${v(s, 'session') || 'Session'}${s.id === prevSession?.id ? ' (previous)' : ''}`;
  const chosenSession = pickSession || prevSession?.id || earlier[0]?.id || '';
  const lastEvent = data && type === 'setup' && values?.car
    ? sortSetupsDesc(data.list('setup').filter((s) => s.id !== id && v(s, 'car') === values.car && v(s, 'event') !== values.event), data)[0] : null;
  // a track sheet can start from a workshop setup: matching fields, front/rear merged into the four corners
  const sourceValues = (src) => (src.type === 'shop_setup'
    ? toTrackValues(formFor(data, 'shop_setup', src.data.form_id), src.data.values, form)
    : carryValues(form, src, cfg.skip));
  const startFrom = (src) => {
    if (src) { setValues((s0) => ({ ...s0, ...sourceValues(src), ...(type === 'setup' ? { copied_from: src.id } : {}) })); setCarried(src); setDirty(true); }
    setChoosing(false);
  };
  const eventShop = data && type === 'setup' && values?.event ? data.byId[v(data.byId[values.event], 'shop_setup')] : null;
  const shopSetups = data && type === 'setup' && values?.car && canType('shop_setup', 'view')
    ? data.list('shop_setup').filter((s) => v(s, 'car') === values.car).sort((a, b) => String(v(b, 'date') || b.created_at).localeCompare(String(v(a, 'date') || a.created_at))) : [];
  const [pickShop, setPickShop] = [pickShopState, setPickShopState];
  const chosenShop = pickShop || eventShop?.id || shopSetups[0]?.id || '';
  const copyOptions = useMemo(() => (data && cfg && matchVal
    ? sortSetupsDesc(data.list(type).filter((s) => v(s, cfg.match) === matchVal && s.id !== id), data).slice(0, 30)
    : []), [data, type, matchVal, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canType(type, 'view')) {
    return <div><PageHeader title="No access" back="/" /><div className="notice">Your role or your team’s plan doesn’t include {TYPE_LABEL[type]?.toLowerCase() || 'this'}s.</div></div>;
  }
  if (!data || values === null) {
    if (!isNew && rec === null) return <div className="content-pad"><PageHeader title="Not found" back="/" /><p>This record no longer exists.</p></div>;
    return <p className="muted pad">Loading…</p>;
  }

  const save = async () => {
    const errs = {};
    for (const f of allFields(form)) {
      if (!f.required) continue;
      if (!isVisible(f, values)) continue;
      const val = values[f.key];
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length)) errs[f.key] = 'Required';
    }
    setErrors(errs);
    if (Object.keys(errs).length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const vals = { ...values };
    if (type === 'event' && vals.venue && data.byId[vals.venue]) vals.track = v(data.byId[vals.venue], 'name');
    const scope = isGlobal ? { scope: 'global' } : {};
    const saved = await saveRecord(tid, type, isNew ? null : id, { ...(rec?.data || {}), ...scope, form_id: form.id, values: vals }, user.id);
    // only one initial measurement per shock or bar: this one takes over
    if (type === 'dyno_run' && vals.initial && vals.asset) {
      for (const r of data.list('dyno_run')) {
        if (r.id !== saved.id && v(r, 'asset') === vals.asset && v(r, 'initial')) await saveRecord(tid, 'dyno_run', r.id, { ...r.data, values: { ...r.data.values, initial: false } }, user.id);
      }
    }
    setDirty(false);
    nav(params.get('back') || afterSave(type, saved), { replace: true });
  };

  const remove = async () => {
    if (!window.confirm(`Delete this ${TYPE_LABEL[type]?.toLowerCase() || 'record'}? It stays in the change history.`)) return;
    await deleteRecord(id);
    nav(afterSave(type, rec), { replace: true });
  };

  const forms = formsFor(data, type);
  const title = isNew ? `New ${TYPE_LABEL[type]?.toLowerCase() || type}` : titleOf(rec, data);
  const sub = type === 'setup'
    ? [titleOf(data.byId[values.car], data), data.byId[values.event] && `${v(data.byId[values.event], 'track') || ''} ${fmtDate(v(data.byId[values.event], 'date'))}`].filter(Boolean).join(' · ')
    : type === 'maintenance' ? [titleOf(data.byId[values.car]), fmtDate(values.date)].filter(Boolean).join(' · ')
      : TYPE_LABEL[type];
  const labelFor = (k) => {
    const [key, sub2] = k.split('.');
    const f = allFields(form).find((x) => x.key === key);
    return f ? `${f.label}${sub2 ? ` ${sub2}` : ''}` : k;
  };

  // setup sheets: changes against the session this sheet was copied from (or the previous session)
  const fuelRecorded = fuelUnit(values.fuel_unit);
  const fuelShown = fuelView || fuelRecorded;
  const fuelConverting = type === 'setup' && fuelShown !== fuelRecorded;
  const setupForm = type === 'setup' ? withFuelUnits(withWeatherUnits(form, wxUnits), fuelShown) : form;
  const shownValues = fuelConverting
    ? { ...values, fuel_start: convertFuel(values.fuel_start, fuelRecorded, fuelShown), fuel_finish: convertFuel(values.fuel_finish, fuelRecorded, fuelShown) }
    : values;
  const setFuelRecorded = (u) => {
    setValues((x) => ({ ...x, fuel_unit: u, fuel_start: convertFuel(x.fuel_start, fuelUnit(x.fuel_unit), u), fuel_finish: convertFuel(x.fuel_finish, fuelUnit(x.fuel_unit), u) }));
    setFuelView(null); setDirty(true);
  };
  const base = type === 'setup' ? (values.copied_from && data.byId[values.copied_from]) || prevSession : null;
  const baseLabel = base ? (base.type === 'shop_setup' ? `workshop setup “${v(base, 'name') || ''}”` : v(base, 'event') === values.event ? v(base, 'session') || 'the copied session' : titleOf(base, data)) : '';
  const changed = type === 'setup' && base ? changedFields(form, values, base.type === 'shop_setup' ? sourceValues(base) : base.data?.values || {}) : {};
  const layout = type === 'setup' ? { ...sheet, stage, changesOnly, changed } : null;
  const sectionShown = (sec) => sec.fields.some((f) => isVisible(f, values) && f.type !== 'heading'
    && (stage === 'all' || (stage === 'after') === (f.stage === 'after')) && (!changesOnly || changed[f.key]));
  const shownSections = type === 'setup' ? form.data.sections.filter(sectionShown).map((x) => x.id) : [];
  const copySelect = cfg && !readOnly ? (
    <select value="" aria-label="Copy from" onChange={(e) => {
      const src = data.byId[e.target.value];
      if (src) { setValues((s) => ({ ...s, ...sourceValues(src), ...(type === 'setup' ? { copied_from: src.id } : {}) })); setCarried(src); setDirty(true); }
    }}>
      <option value="">{matchVal ? 'Copy from…' : `Pick a ${cfg.match} first`}</option>
      {baselines.length > 0 && <optgroup label="Baselines">{baselines.map((b) => <option key={b.id} value={b.id}>{baselineLabel(b)}</option>)}</optgroup>}
      {shopSetups.length > 0 && <optgroup label="Workshop setups">{shopSetups.map((b) => <option key={b.id} value={b.id}>{v(b, 'name') || 'Workshop setup'}{b.id === eventShop?.id ? ' (this event’s)' : ''}</option>)}</optgroup>}
      {type === 'setup' ? (
        <>
          {thisEvent.length > 0 && <optgroup label="This event">{thisEvent.map((s) => <option key={s.id} value={s.id}>{inEventLabel(s)}</option>)}</optgroup>}
          {earlier.length > 0 && <optgroup label="Earlier events">{earlier.map((s) => <option key={s.id} value={s.id}>{titleOf(s, data)} ({fmtDate(recDate(s, data))})</option>)}</optgroup>}
        </>
      ) : (
        <optgroup label="Previous">
          {copyOptions.map((s) => <option key={s.id} value={s.id}>{titleOf(s, data)} ({fmtDate(recDate(s, data))})</option>)}
        </optgroup>
      )}
    </select>
  ) : null;
  const startedText = carried
    ? <span>Started from <b>{carried.type === 'shop_setup' ? `workshop setup “${v(carried, 'name') || 'Workshop setup'}”` : v(carried, 'baseline') ? `baseline “${v(carried, 'baseline_name') || titleOf(carried, data)}”` : titleOf(carried, data)}</b>{type === 'setup' ? ' — hot values, travel, race, feedback and notes left blank.' : ' — measurements copied; check every value.'}</span>
    : <span className="muted">Copy settings from a previous {cfg?.label}{type === 'setup' ? ' or baseline' : ''}:</span>;
  const choosingStart = type === 'setup' && choosing && !readOnly && (thisEvent.length || earlier.length || baselines.length > 0 || shopSetups.length > 0);

  // calendar entries (events): Save and Cancel sit at the top of the form
  const topActions = !readOnly && type === 'event';
  return (
    <div className={`record-edit type-${type}`}>
      <PageHeader title={title} sub={sub} back={params.get('back') || (isNew ? -1 : afterSave(type, rec || { data: { values } }))}
        below={(
          <>
            {!readOnly && canType(type, 'edit') ? <AiTools type={type} form={form} values={values} setValues={(fn) => { setValues(fn); setDirty(true); }} /> : null}
            {layout && !choosingStart && <SheetNav form={form} layout={layout} shown={shownSections} changed={changed} onArrange={() => setArranging(true)} />}
          </>
        )}>
        {type === 'job' && !isNew && <Link className="btn ghost" to={`/print/job/${id}`}>Job sheet / handover pack</Link>}
        {type === 'setup' && !isNew && <Link className="btn ghost" to={`/compare?ids=${id}`}>Compare</Link>}
        {type === 'setup' && !isNew && <Link className="btn ghost advisor-link" to={`/track/advisor?setup=${id}`} title="What’s worked before for this handling problem, and what the tuning guides suggest">Setup advisor</Link>}
        {type === 'setup' && !isNew && canModule('dyno') && <Link className="btn ghost" to={`/workshop/dyno?setup=${id}`}>Shock dyno</Link>}
        {type === 'engine_build' && !isNew && <Link className="btn ghost" to={`/compare?ids=${id}`}>Compare</Link>}
        {!isNew && canType(type, 'delete') && <button type="button" className="btn ghost danger" onClick={remove}>Delete</button>}
        {topActions && (
          <span className="top-actions" data-testid="top-actions">
            {Object.keys(errors).length > 0 && <span className="error-text">Fill in the required fields.</span>}
            {dirty && <span className="muted small">Unsaved changes</span>}
            <button type="button" className="btn ghost" onClick={() => nav(-1)}>Cancel</button>
            <button type="button" className="btn primary" onClick={save}>Save</button>
          </span>
        )}
      </PageHeader>

      {readOnly && (isGlobal && canType(type, 'edit')
        ? <div className="notice info">Shared directory record — kept up to date by the platform administrator. Add your team's notes and contacts on the {TYPE_LABEL[type]?.toLowerCase()} page.</div>
        : <div className="notice">You have read-only access to {TYPE_LABEL[type]?.toLowerCase()}s.</div>)}
      {isNew && canBeGlobal && (
        <div className="card inline-row">
          <label className="toggle"><input type="checkbox" checked={makeGlobal} onChange={(e) => setMakeGlobal(e.target.checked)} />
            <span>Shared directory — visible to all teams (platform admin)</span></label>
        </div>
      )}
      {rec?.dirty === 1 && <div className="notice info">Saved on this device — will sync when online.</div>}

      {isNew && forms.length > 1 && (
        <div className="card inline-row">
          <label>Form
            <select value={form?.id} onChange={(e) => setFormId(e.target.value)}>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.data.name}</option>)}
            </select>
          </label>
        </div>
      )}

      {choosingStart && (
        <div className="card start-from">
          <h3>Start this sheet from…</h3>
          <p className="muted small">Copies the setup as starting values. Hot pressures and stagger, shock travel, race results, conditions & feedback, notes and photos are not copied.</p>
          <div className="start-options">
            {shopSetups.length > 0 && (
              <div className={`start-opt as-div${eventShop && !thisEvent.length ? ' primary' : ''}`} data-testid="start-shop">
                <b>Workshop setup</b>
                <select aria-label="Workshop setup" value={chosenShop} onChange={(e) => setPickShop(e.target.value)}>
                  {shopSetups.map((b) => <option key={b.id} value={b.id}>{v(b, 'name') || 'Workshop setup'}{b.id === eventShop?.id ? ' (this event’s)' : ''}{v(b, 'date') ? ` · ${fmtDate(v(b, 'date'))}` : ''}</option>)}
                </select>
                <button type="button" className={`btn small${eventShop && !thisEvent.length ? ' primary' : ''}`} disabled={!chosenShop} onClick={() => startFrom(data.byId[chosenShop])}>Use workshop setup</button>
              </div>
            )}
            {(thisEvent.length > 0 || earlier.length > 0) && (
              <div className="start-opt primary as-div copy-session">
                <b>Copy a session</b>
                <select aria-label="Session to copy" value={chosenSession} onChange={(e) => setPickSession(e.target.value)}>
                  {thisEvent.length > 0 && <optgroup label="This event">{thisEvent.map((s) => <option key={s.id} value={s.id}>{inEventLabel(s)}</option>)}</optgroup>}
                  {earlier.length > 0 && <optgroup label="Earlier events">{earlier.map((s) => <option key={s.id} value={s.id}>{titleOf(s, data)} · {fmtDate(recDate(s, data))}</option>)}</optgroup>}
                </select>
                <button type="button" className="btn small primary" disabled={!chosenSession} onClick={() => startFrom(data.byId[chosenSession])}>Copy this session</button>
              </div>
            )}
            {lastEvent && (
              <button type="button" className="start-opt" onClick={() => startFrom(lastEvent)}>
                <b>Last time out</b><span>{titleOf(lastEvent, data)} · {fmtDate(recDate(lastEvent, data))}</span>
              </button>
            )}
            {baselines.length > 0 && (
              <div className="start-opt as-div">
                <b>A baseline</b>
                <select aria-label="Baseline" value={pickBaseline} onChange={(e) => setPickBaseline(e.target.value)}>
                  <option value="">Choose baseline…</option>
                  {baselines.map((b) => <option key={b.id} value={b.id}>{baselineLabel(b)}</option>)}
                </select>
                <button type="button" className="btn small" disabled={!pickBaseline} onClick={() => startFrom(data.byId[pickBaseline])}>Use baseline</button>
              </div>
            )}
            <button type="button" className="start-opt" onClick={() => startFrom(null)}><b>Blank sheet</b><span>Start empty</span></button>
          </div>
        </div>
      )}

      {type === 'setup' && !choosingStart && (
        <SheetTools copy={copySelect} started={readOnly ? null : startedText} base={base} baseLabel={baseLabel} changed={changed}
          stage={stage} setStage={setStage} changesOnly={changesOnly} setChangesOnly={setChangesOnly} />
      )}
      {cfg && type !== 'setup' && !readOnly && (
        <div className="card carry-bar">
          {startedText}
          {copySelect}
        </div>
      )}
      {type === 'setup' && values.baseline && <div className="notice info">This sheet is a <b>baseline</b>{values.baseline_name ? ` — “${values.baseline_name}”` : ''}. It can be recalled as the starting point for any event or session.</div>}
      {type === 'setup' && values.gear && !carRp && <div className="notice">Set the ring & pinion ratio on the car to calculate the final drive.</div>}

      {type === 'maintenance' && values.level && (
        <div className="card inline-row">
          <span>Showing <b>{levelLabel(values.level)}</b> items{values.level !== 'weekly' ? ' (includes the shorter intervals)' : ''}.</span>
        </div>
      )}


      {arranging && layout && <ArrangeSections form={form} layout={layout} onClose={() => setArranging(false)} />}
      <FormRenderer form={setupForm} values={shownValues} onChange={onChange} data={data} readOnly={readOnly} layout={layout} roKeys={fuelConverting ? ['fuel_start', 'fuel_finish'] : []}
        level={type === 'maintenance' ? values.level || 'weekly' : null} recordType={type} errors={errors}
        sectionExtras={type === 'dyno_run' && form?.data?.dyno_kind === 'bar' ? { run: <InitialClash data={data} id={isNew ? null : id} values={values} readOnly={readOnly} setValues={(fn) => { setValues(fn); setDirty(true); }} />, rate: <BarResults data={data} id={id} values={values} /> }
          : type === 'dyno_run' ? { run: <InitialClash data={data} id={isNew ? null : id} values={values} readOnly={readOnly} setValues={(fn) => { setValues(fn); setDirty(true); }} />, data: <ShockVsInitial data={data} id={isNew ? null : id} values={values} /> } : type === 'setup' ? { weather: <WeatherTools data={data} values={values} readOnly={readOnly} setValues={(fn) => { setValues(fn); setDirty(true); }} />,
          race: <FuelPlanner id={id} data={data} values={shownValues} readOnly={readOnly} setValues={(fn) => { setValues(fn); setDirty(true); }}
            unit={fuelShown} recorded={fuelRecorded} setView={(u) => setFuelView(u === fuelRecorded ? null : u)} setRecorded={setFuelRecorded} /> } : undefined}
        calcCtx={FIELD_CALCS[type] ? calcContext(data, values, { prev: prevSession?.data?.values, units: wxUnits }) : null} />
      {type === 'engine_build' && <EngineChecks values={values} />}
      {type === 'job' && <JobExtras id={id} values={values} isNew={isNew} />}
      {type === 'shop_setup' && !isNew && <ShopSetupLinks rec={rec} values={values} />}

      {type === 'dyno_run' && <DynoChart runs={[{ id: id || 'new', name: values.label || 'This run', values, form }]} />}

      {!isNew && rec && ['supplier', 'car'].includes(type) && <ContactLinks data={data} entity={rec} />}

      {!isNew && rec && (
        <>
          <Attachments record={rec} canEdit={!readOnly} />
          <History recordId={rec.id} labelFor={labelFor} />
        </>
      )}

      {!readOnly && !topActions && (
        <div className="save-bar">
          {Object.keys(errors).length > 0 && <span className="error-text">Fill in the required fields.</span>}
          {dirty && <span className="muted small">Unsaved changes</span>}
          <button type="button" className="btn" onClick={() => nav(-1)}>Cancel</button>
          <button type="button" className="btn primary" onClick={save}>Save</button>
        </div>
      )}
    </div>
  );
}
