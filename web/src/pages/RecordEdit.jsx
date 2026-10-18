import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import FormRenderer from '../components/FormRenderer.jsx';
import { Attachments, History, PageHeader } from '../components/ui.jsx';
import { allFields, formFor, formsFor, fmtDate, levelLabel, titleOf, today, useRecordById, useTeamData, v } from '../lib/data.js';
import { deleteRecord, saveRecord } from '../lib/store.js';
import { useSession } from '../lib/session.jsx';

export const TYPE_LABEL = {
  car: 'Car', event: 'Event', setup: 'Setup sheet', maintenance: 'Maintenance log', asset: 'Asset',
  schedule: 'Maintenance schedule', measurement: 'Measurement',
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
    default: return '/';
  }
}

/** Values from the car's most recent setup, limited to sections that carry forward. */
function carryValues(form, source) {
  const out = {};
  const sv = source?.data.values || {};
  for (const sec of form.data.sections) {
    if (sec.carry === false) continue;
    for (const f of sec.fields) {
      if (['event', 'car', 'session'].includes(f.key) || f.type === 'heading' || f.type === 'calc') continue;
      if (sv[f.key] !== undefined) out[f.key] = sv[f.key];
    }
  }
  return out;
}

const eventDate = (s, data) => v(data.byId[v(s, 'event')], 'date') || '';
const sortSetupsDesc = (list, data) => list.slice().sort((a, b) =>
  eventDate(b, data).localeCompare(eventDate(a, data)) || b.created_at.localeCompare(a.created_at));

export default function RecordEdit() {
  const { type, id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { tid, user, canType } = useSession();
  const data = useTeamData();
  const rec = useRecordById(id === 'new' ? null : id);
  const isNew = id === 'new';
  const readOnly = !canType(type, 'edit');

  const [formId, setFormId] = useState(null);
  const [values, setValues] = useState(null);
  const [errors, setErrors] = useState({});
  const [carried, setCarried] = useState(null);
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
    for (const [k, val] of params.entries()) if (k !== 'form' && k !== 'from') init[k] = val;
    if (type === 'maintenance' || type === 'measurement') init.date ||= today();
    if (type === 'setup' && init.car) {
      const src = params.get('from') ? data.byId[params.get('from')]
        : sortSetupsDesc(data.list('setup').filter((s) => v(s, 'car') === init.car), data)[0];
      if (src) { Object.assign(init, carryValues(f, src)); setCarried(src); }
    }
    setFormId(f?.id);
    setValues(init);
  }, [data, rec, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (k, val) => { setValues((s) => ({ ...s, [k]: val })); setDirty(true); };

  const copyOptions = useMemo(() => (data && type === 'setup' && values?.car
    ? sortSetupsDesc(data.list('setup').filter((s) => v(s, 'car') === values.car && s.id !== id), data).slice(0, 30)
    : []), [data, type, values?.car, id]);

  if (!data || values === null) {
    if (!isNew && rec === null) return <div className="content-pad"><PageHeader title="Not found" back="/" /><p>This record no longer exists.</p></div>;
    return <p className="muted pad">Loading…</p>;
  }

  const save = async () => {
    const errs = {};
    for (const f of allFields(form)) {
      if (!f.required) continue;
      if (f.showIf) { const [k, want] = f.showIf.split('='); if (String(values[k] ?? '') !== want) continue; }
      const val = values[f.key];
      if (val === undefined || val === null || val === '') errs[f.key] = 'Required';
    }
    setErrors(errs);
    if (Object.keys(errs).length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const saved = await saveRecord(tid, type, isNew ? null : id, { ...(rec?.data || {}), form_id: form.id, values }, user.id);
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
        {!isNew && canType(type, 'delete') && <button type="button" className="btn ghost danger" onClick={remove}>Delete</button>}
      </PageHeader>

      {readOnly && <div className="notice">You have read-only access to {TYPE_LABEL[type]?.toLowerCase()}s.</div>}
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

      {type === 'setup' && !readOnly && (
        <div className="card carry-bar">
          {carried
            ? <span>Started from <b>{titleOf(carried, data)}</b> — weather, race and notes left blank.</span>
            : <span className="muted">Copy settings from a previous session:</span>}
          <select value="" onChange={(e) => {
            const src = data.byId[e.target.value];
            if (src) { setValues((s) => ({ ...s, ...carryValues(form, src) })); setCarried(src); setDirty(true); }
          }}>
            <option value="">{values.car ? 'Copy from…' : 'Pick a car first'}</option>
            {copyOptions.map((s) => <option key={s.id} value={s.id}>{titleOf(s, data)} ({fmtDate(eventDate(s, data))})</option>)}
          </select>
        </div>
      )}

      {type === 'maintenance' && values.level && (
        <div className="card inline-row">
          <span>Showing <b>{levelLabel(values.level)}</b> items{values.level !== 'weekly' ? ' (includes the shorter intervals)' : ''}.</span>
        </div>
      )}

      <FormRenderer form={form} values={values} onChange={onChange} data={data} readOnly={readOnly}
        level={type === 'maintenance' ? values.level || 'weekly' : null} recordType={type} errors={errors} />

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
