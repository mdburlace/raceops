import { useEffect, useMemo, useState } from 'react';
import { gearTeeth } from '../lib/gears.js';
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
};

// New records pre-filled from the latest record with the same car / engine.
const CARRY = {
  setup: { match: 'car', skip: ['event', 'car', 'session', 'crew_chief', 'day', 'baseline', 'baseline_name'], label: 'session' },
  engine_build: { match: 'engine', skip: ['engine', 'date', 'build_type', 'engine_laps', 'builder', 'notes'], label: 'build' },
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
    case 'supplier': return '/suppliers';
    case 'contact_link': return vals.contact ? `/contacts/${vals.contact}` : '/contacts';
    case 'series': return `/series/${rec.id}`;
    case 'gear': return '/track/gears?tab=chart';
    case 'gear_list': return '/track/gears?tab=lists';
    case 'tire': return '/track/gears?tab=tires';
    case 'dyno_run': return '/workshop/dyno';
    case 'engine_build': return '/engines';
    case 'review': return '/team/reviews';
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

const eventDate = (s, data) => v(data.byId[v(s, 'event')], 'date') || '';
const recDate = (r, data) => (r.type === 'setup' ? eventDate(r, data) : v(r, 'date') || '');
const sortSetupsDesc = (list, data) => list.slice().sort((a, b) =>
  recDate(b, data).localeCompare(recDate(a, data)) || b.created_at.localeCompare(a.created_at));

export default function RecordEdit() {
  const { type, id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { tid, user, canType, canModule } = useSession();
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
  const [dirty, setDirty] = useState(false);

  const form = data ? formFor(data, type, formId || rec?.data.form_id || params.get('form')) : null;

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
    if (allFields(f).some((fd) => fd.key === 'date' && fd.type === 'date')) init.date ||= today();
    const cfg = CARRY[type];
    if (cfg && params.get('from') && data.byId[params.get('from')]) {
      const src = data.byId[params.get('from')];
      Object.assign(init, carryValues(f, src, cfg.skip)); setCarried(src);
    } else if (type === 'setup') {
      setChoosing(true); // ask where to start from
    } else if (cfg && init[cfg.match]) {
      const src = sortSetupsDesc(data.list(type).filter((s) => v(s, cfg.match) === init[cfg.match]), data)[0];
      if (src) { Object.assign(init, carryValues(f, src, cfg.skip)); setCarried(src); }
    }
    setFormId(f?.id);
    setValues(init);
  }, [data, rec, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

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
      return next;
    });
    setDirty(true);
  };

  const cfg = CARRY[type];
  const matchVal = cfg ? values?.[cfg.match] : null;
  const baselines = data && type === 'setup' ? data.list('setup').filter((s) => v(s, 'baseline') && s.id !== id)
    .sort((a, b) => String(v(a, 'baseline_name') || titleOf(a, data)).localeCompare(String(v(b, 'baseline_name') || titleOf(b, data)))) : [];
  const baselineLabel = (s) => `${v(s, 'baseline_name') || titleOf(s, data)} — ${titleOf(data.byId[v(s, 'car')])}`;
  const prevSession = data && type === 'setup' && values?.event && values?.car
    ? data.list('setup').filter((s) => s.id !== id && v(s, 'event') === values.event && v(s, 'car') === values.car)
      .sort((a, b) => (num(v(b, 'day')) || 1) - (num(v(a, 'day')) || 1) || b.created_at.localeCompare(a.created_at))[0] : null;
  const lastEvent = data && type === 'setup' && values?.car
    ? sortSetupsDesc(data.list('setup').filter((s) => s.id !== id && v(s, 'car') === values.car && v(s, 'event') !== values.event), data)[0] : null;
  const startFrom = (src) => {
    if (src) { setValues((s0) => ({ ...s0, ...carryValues(form, src, cfg.skip) })); setCarried(src); setDirty(true); }
    setChoosing(false);
  };
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
      if (val === undefined || val === null || val === '') errs[f.key] = 'Required';
    }
    setErrors(errs);
    if (Object.keys(errs).length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const vals = { ...values };
    if (type === 'event' && vals.venue && data.byId[vals.venue]) vals.track = v(data.byId[vals.venue], 'name');
    const scope = isGlobal ? { scope: 'global' } : {};
    const saved = await saveRecord(tid, type, isNew ? null : id, { ...(rec?.data || {}), ...scope, form_id: form.id, values: vals }, user.id);
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

  return (
    <div className={`record-edit type-${type}`}>
      <PageHeader title={title} sub={sub} back={params.get('back') || (isNew ? -1 : afterSave(type, rec || { data: { values } }))}>
        {type === 'setup' && !isNew && <Link className="btn ghost" to={`/compare?ids=${id}`}>Compare</Link>}
        {type === 'setup' && !isNew && canModule('dyno') && <Link className="btn ghost" to={`/workshop/dyno?setup=${id}`}>Shock dyno</Link>}
        {type === 'engine_build' && !isNew && <Link className="btn ghost" to={`/compare?ids=${id}`}>Compare</Link>}
        {!isNew && canType(type, 'delete') && <button type="button" className="btn ghost danger" onClick={remove}>Delete</button>}
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

      {type === 'setup' && choosing && !readOnly && (prevSession || lastEvent || baselines.length > 0) && (
        <div className="card start-from">
          <h3>Start this sheet from…</h3>
          <p className="muted small">Copies the setup as starting values. Hot pressures and stagger, shock travel, race results, conditions & feedback, notes and photos are not copied.</p>
          <div className="start-options">
            {prevSession && (
              <button type="button" className="start-opt primary" onClick={() => startFrom(prevSession)}>
                <b>Previous session</b><span>{titleOf(prevSession, data)}{num(v(prevSession, 'day')) > 1 ? ` · Day ${v(prevSession, 'day')}` : ''}</span>
              </button>
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

      {cfg && !readOnly && !(type === 'setup' && choosing && (prevSession || lastEvent || baselines.length > 0)) && (
        <div className="card carry-bar">
          {carried
            ? <span>Started from <b>{v(carried, 'baseline') ? `baseline “${v(carried, 'baseline_name') || titleOf(carried, data)}”` : titleOf(carried, data)}</b>{type === 'setup' ? ' — hot values, travel, race, feedback and notes left blank.' : ' — measurements copied; check every value.'}</span>
            : <span className="muted">Copy settings from a previous {cfg.label}{type === 'setup' ? ' or baseline' : ''}:</span>}
          <select value="" aria-label="Copy from" onChange={(e) => {
            const src = data.byId[e.target.value];
            if (src) { setValues((s) => ({ ...s, ...carryValues(form, src, cfg.skip) })); setCarried(src); setDirty(true); }
          }}>
            <option value="">{matchVal ? 'Copy from…' : `Pick a ${cfg.match} first`}</option>
            {baselines.length > 0 && <optgroup label="Baselines">{baselines.map((b) => <option key={b.id} value={b.id}>{baselineLabel(b)}</option>)}</optgroup>}
            <optgroup label={type === 'setup' ? 'Sessions' : 'Previous'}>
              {copyOptions.map((s) => <option key={s.id} value={s.id}>{titleOf(s, data)} ({fmtDate(recDate(s, data))})</option>)}
            </optgroup>
          </select>
        </div>
      )}
      {type === 'setup' && values.baseline && <div className="notice info">This sheet is a <b>baseline</b>{values.baseline_name ? ` — “${values.baseline_name}”` : ''}. It can be recalled as the starting point for any event or session.</div>}
      {type === 'setup' && values.gear && !carRp && <div className="notice">Set the ring & pinion ratio on the car to calculate the final drive.</div>}

      {type === 'maintenance' && values.level && (
        <div className="card inline-row">
          <span>Showing <b>{levelLabel(values.level)}</b> items{values.level !== 'weekly' ? ' (includes the shorter intervals)' : ''}.</span>
        </div>
      )}

      <FormRenderer form={form} values={values} onChange={onChange} data={data} readOnly={readOnly}
        level={type === 'maintenance' ? values.level || 'weekly' : null} recordType={type} errors={errors} />

      {type === 'dyno_run' && <DynoChart runs={[{ id: id || 'new', name: values.label || 'This run', values, form }]} />}

      {!isNew && rec && ['supplier', 'car'].includes(type) && <ContactLinks data={data} entity={rec} />}

      {!isNew && rec && (
        <>
          <Attachments record={rec} canEdit={!readOnly} />
          <History recordId={rec.id} labelFor={labelFor} />
        </>
      )}

      {!readOnly && (
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
