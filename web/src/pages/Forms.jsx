import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Empty, PageHeader, Section } from '../components/ui.jsx';
import { allFields, formFor, optionsOf, useTeamData } from '../lib/data.js';
import { deleteRecord, saveRecord } from '../lib/store.js';
import { useSession } from '../lib/session.jsx';
import { TYPE_LABEL } from './RecordEdit.jsx';
import { FIELD_INFO } from '@shared/fieldInfo.js';

const TYPES = [
  ['text', 'Text'], ['number', 'Number'], ['textarea', 'Long text'], ['select', 'Dropdown'], ['date', 'Date'],
  ['checkbox', 'Yes / no'], ['corners', 'Corners (LF/RF/LR/RR)'], ['asset', 'Asset picker'], ['ref', 'Link to record'],
  ['calc', 'Calculated'], ['check', 'Checklist item'], ['heading', 'Sub-heading'],
];
const ALL_CORNERS = ['LF', 'RF', 'LR', 'RR'];
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'field';

export function FormList() {
  const data = useTeamData();
  const { can } = useSession();
  if (!data) return null;
  const forms = data.list('form').sort((a, b) => a.data.target.localeCompare(b.data.target) || a.data.name.localeCompare(b.data.name));
  return (
    <div>
      <PageHeader title="Forms" sub={can('forms.manage') ? 'Add, remove and rename the fields on each sheet' : 'Forms your team uses (view only)'} />
      {forms.length === 0 ? <Empty>No forms yet — sync to download them.</Empty> : (
        <div className="card list">
          {forms.map((f) => (
            <Link key={f.id} to={`/forms/${f.id}`} className="list-row">
              <span className="grow">
                <span className="row-title">{f.data.name}</span>
                <span className="row-sub">{TYPE_LABEL[f.data.target] || f.data.target} · {allFields(f).filter((x) => x.type !== 'heading').length} fields</span>
              </span>
              {f.data.is_default && <span className="pill pill-info">default</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function FormBuilder() {
  const { id } = useParams();
  const nav = useNavigate();
  const data = useTeamData();
  const { tid, user, can } = useSession();
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState('');
  const rec = data?.byId[id];
  useEffect(() => { if (rec && !draft) setDraft(structuredClone(rec.data)); }, [rec, draft]);
  if (!data) return null;
  if (!rec) return <PageHeader title="Form not found" back="/forms" />;
  if (!draft) return null;
  const editable = can('forms.manage');
  const assetForm = formFor(data, 'asset');
  const categories = optionsOf(allFields(assetForm).find((f) => f.key === 'category') || {}, assetForm, data);

  const upd = (fn) => setDraft((d) => { const n = structuredClone(d); fn(n); return n; });
  const usedKeys = () => new Set(draft.sections.flatMap((s) => s.fields.map((f) => f.key)));
  const uniqueKey = (base, self) => { const used = usedKeys(); used.delete(self); let k = base, i = 2; while (used.has(k)) k = `${base}_${i++}`; return k; };

  const save = async () => {
    const clean = structuredClone(draft);
    for (const s of clean.sections) for (const f of s.fields) delete f._new;
    await saveRecord(tid, 'form', id, clean, user.id);
    if (clean.is_default) {
      for (const other of data.list('form').filter((f) => f.id !== id && f.data.target === clean.target && f.data.is_default)) {
        await saveRecord(tid, 'form', other.id, { ...other.data, is_default: false }, user.id);
      }
    }
    setDraft(clean);
    setMsg('Saved. Changes reach other devices on their next sync.');
  };
  const duplicate = async () => {
    const copy = { ...structuredClone(draft), name: `${draft.name} (copy)`, is_default: false, base: false };
    const r = await saveRecord(tid, 'form', null, copy, user.id);
    setDraft(null); nav(`/forms/${r.id}`);
  };
  const remove = async () => {
    if (!window.confirm('Delete this form? Records that used it will display with the default form.')) return;
    await deleteRecord(id); nav('/forms');
  };

  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

  return (
    <div className="form-builder">
      <PageHeader title={draft.name} sub={`${TYPE_LABEL[draft.target] || draft.target} form`} back="/forms">
        {editable && <button type="button" className="btn ghost" onClick={duplicate}>Duplicate</button>}
        {editable && !draft.is_default && <button type="button" className="btn ghost danger" onClick={remove}>Delete</button>}
      </PageHeader>
      {!editable && <div className="notice">You can view this form. Ask an owner for “Edit forms & fields” permission to change it.</div>}

      <Section title="Form settings">
        <div className="field-grid">
          <div className="field"><label>Name</label><input disabled={!editable} value={draft.name} onChange={(e) => upd((d) => { d.name = e.target.value; })} /></div>
          <div className="field"><label>Default for new {TYPE_LABEL[draft.target]?.toLowerCase()}s</label>
            <label className="toggle"><input type="checkbox" disabled={!editable} checked={!!draft.is_default} onChange={(e) => upd((d) => { d.is_default = e.target.checked; })} /><span>{draft.is_default ? 'Yes' : 'No'}</span></label>
          </div>
          {draft.sessions && (
            <div className="field span-all"><label>Sessions (one per line — shown as columns on each event)</label>
              <textarea rows={4} disabled={!editable} value={draft.sessions.join('\n')} onChange={(e) => upd((d) => { d.sessions = e.target.value.split('\n'); })}
                onBlur={() => upd((d) => { d.sessions = d.sessions.map((s) => s.trim()).filter(Boolean); })} />
            </div>
          )}
        </div>
      </Section>

      {draft.sections.map((sec, si) => (
        <section key={sec.id} className="card builder-section">
          <div className="card-head">
            <input className="section-title" disabled={!editable} value={sec.title} onChange={(e) => upd((d) => { d.sections[si].title = e.target.value; })} />
            {editable && (
              <span className="row-actions">
                {draft.target === 'setup' && (
                  <label className="toggle small" title="Copy these values into the next session's sheet">
                    <input type="checkbox" checked={sec.carry !== false} onChange={(e) => upd((d) => { d.sections[si].carry = e.target.checked; })} /><span>Carry forward</span>
                  </label>
                )}
                <button type="button" className="icon-btn" onClick={() => upd((d) => move(d.sections, si, -1))} aria-label="Move section up">↑</button>
                <button type="button" className="icon-btn" onClick={() => upd((d) => move(d.sections, si, 1))} aria-label="Move section down">↓</button>
                {!sec.fields.some((f) => f.core) && (
                  <button type="button" className="icon-btn danger" aria-label="Delete section"
                    onClick={() => window.confirm(`Remove section “${sec.title}”? Existing data is kept but hidden.`) && upd((d) => { d.sections.splice(si, 1); })}>✕</button>
                )}
              </span>
            )}
          </div>
          <div className="builder-fields">
            {sec.fields.map((f, fi) => {
              const k = `${si}:${fi}`;
              const set = (patch) => upd((d) => Object.assign(d.sections[si].fields[fi], patch));
              return (
                <div key={k} className={`builder-field${open === k ? ' open' : ''}`}>
                  <div className="bf-row">
                    <input className="bf-label" disabled={!editable} value={f.label} onChange={(e) => set({ label: e.target.value, ...(f._new && f.type !== 'heading' ? { key: uniqueKey(slug(e.target.value), f.key) } : {}) })} />
                    <select disabled={!editable || f.core} value={f.type} onChange={(e) => set({ type: e.target.value })}>
                      {TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
                    </select>
                    {editable && (
                      <span className="row-actions">
                        <button type="button" className="icon-btn" onClick={() => setOpen(open === k ? null : k)} aria-label="Field settings">⚙</button>
                        <button type="button" className="icon-btn" onClick={() => upd((d) => move(d.sections[si].fields, fi, -1))} aria-label="Move up">↑</button>
                        <button type="button" className="icon-btn" onClick={() => upd((d) => move(d.sections[si].fields, fi, 1))} aria-label="Move down">↓</button>
                        {!f.core && <button type="button" className="icon-btn danger" onClick={() => upd((d) => { d.sections[si].fields.splice(fi, 1); })} aria-label="Remove field">✕</button>}
                      </span>
                    )}
                  </div>
                  {f.core && <small className="muted">Core field — used by the app; can be renamed but not removed.</small>}
                  {open === k && editable && (
                    <div className="bf-settings field-grid">
                      {f.type !== 'heading' && <div className="field"><label>Key</label><input value={f.key} disabled={!f._new} onChange={(e) => set({ key: slug(e.target.value) })} /></div>}
                      {['number', 'corners', 'calc', 'text'].includes(f.type) && <div className="field"><label>Unit</label><input value={f.unit || ''} onChange={(e) => set({ unit: e.target.value })} /></div>}
                      {f.type === 'select' && !f.optionsFrom && (
                        <div className="field span-all"><label>Options (one per line)</label>
                          <textarea rows={4} value={(f.options || []).join('\n')} onChange={(e) => set({ options: e.target.value.split('\n') })}
                            onBlur={() => set({ options: (f.options || []).map((o) => o.trim()).filter(Boolean) })} /></div>
                      )}
                      {f.type === 'ref' && (
                        <div className="field"><label>Links to</label>
                          <select value={f.ref || ''} onChange={(e) => set({ ref: e.target.value })}>
                            <option value="">—</option>{['car', 'event', 'asset'].map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                          </select></div>
                      )}
                      {f.type === 'corners' && (
                        <>
                          <div className="field"><label>Input</label>
                            <select value={f.input || 'number'} onChange={(e) => set({ input: e.target.value })}>
                              <option value="number">Number</option><option value="text">Text</option><option value="asset">Asset picker</option>
                            </select></div>
                          <div className="field"><label>Corners</label>
                            <div className="chips">{ALL_CORNERS.map((c) => (
                              <label key={c} className="toggle small"><input type="checkbox" checked={(f.corners || ALL_CORNERS).includes(c)}
                                onChange={(e) => set({ corners: ALL_CORNERS.filter((x) => (x === c ? e.target.checked : (f.corners || ALL_CORNERS).includes(x))) })} /><span>{c}</span></label>
                            ))}</div></div>
                        </>
                      )}
                      {(f.type === 'asset' || (f.type === 'corners' && f.input === 'asset')) && (
                        <div className="field"><label>Asset category</label>
                          <select value={f.category || ''} onChange={(e) => set({ category: e.target.value })}>
                            <option value="">Any</option>{categories.map((c) => <option key={c}>{c}</option>)}
                          </select></div>
                      )}
                      {f.type === 'calc' && (
                        <div className="field span-all"><label>Formula</label>
                          <input value={f.formula || ''} onChange={(e) => set({ formula: e.target.value })} placeholder="e.g. fuel_start - fuel_finish  or  (ride_height.LF + ride_height.RF) / 2" />
                          <small className="help">Use field keys with + − × ÷ and brackets. Corner values: key.LF</small></div>
                      )}
                      {f.type === 'check' && (
                        <>
                          <div className="field"><label>Frequency</label>
                            <select value={f.freq || 'weekly'} onChange={(e) => set({ freq: e.target.value })}>
                              <option value="weekly">Weekly</option><option value="race2">Every 2nd race</option><option value="monthly">Monthly / 4th race</option>
                            </select></div>
                          <div className="field"><label>Record a measurement (unit)</label><input value={f.measure || ''} onChange={(e) => set({ measure: e.target.value })} placeholder="e.g. mm — leave blank for tick only" /></div>
                        </>
                      )}
                      {!['heading', 'check', 'calc', 'checkbox'].includes(f.type) && (
                        <>
                          <div className="field"><label>Placeholder</label><input value={f.placeholder || ''} onChange={(e) => set({ placeholder: e.target.value })} /></div>
                          <div className="field"><label>Required</label><label className="toggle"><input type="checkbox" disabled={f.core && f.required} checked={!!f.required} onChange={(e) => set({ required: e.target.checked })} /><span>{f.required ? 'Yes' : 'No'}</span></label></div>
                        </>
                      )}
                      {f.type !== 'heading' && <div className="field span-all"><label>Help text (shown under the field)</label><input value={f.help || ''} onChange={(e) => set({ help: e.target.value })} /></div>}
                      {f.type !== 'heading' && (() => {
                        const std = FIELD_INFO[draft.target]?.[f.key] || [];
                        return (
                          <>
                            <div className="field span-all"><label htmlFor={`fi-${f.key}`}>Description (the ⓘ beside the label)</label>
                              <textarea id={`fi-${f.key}`} rows={2} value={f.info || ''} placeholder={std[0] || 'What this field is for and what to enter'} onChange={(e) => set({ info: e.target.value || undefined })} /></div>
                            <div className="field span-all"><label htmlFor={`fs-${f.key}`}>Where to find it</label>
                              <input id={`fs-${f.key}`} value={f.source || ''} placeholder={std[1] || 'e.g. tyre gauge, dyno sheet, cam card'} onChange={(e) => set({ source: e.target.value || undefined })} /></div>
                            {std[0] && !f.info && <small className="help span-all">Leave blank to keep the standard description shown as the placeholder.</small>}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {editable && (
            <div className="bf-add">
              <button type="button" className="btn small" onClick={() => { upd((d) => { d.sections[si].fields.push({ key: uniqueKey('new_field'), label: 'New field', type: draft.target === 'maintenance' ? 'check' : 'text', freq: draft.target === 'maintenance' ? 'weekly' : undefined, _new: true }); }); setOpen(`${si}:${sec.fields.length}`); }}>+ Field</button>
              {draft.target === 'maintenance' && <button type="button" className="btn small ghost" onClick={() => upd((d) => { d.sections[si].fields.push({ type: 'heading', label: 'Sub-heading' }); })}>+ Sub-heading</button>}
            </div>
          )}
        </section>
      ))}
      {editable && (
        <button type="button" className="btn" onClick={() => upd((d) => { d.sections.push({ id: `s${Date.now().toString(36)}`, title: 'New section', fields: [] }); })}>+ Section</button>
      )}
      {editable && (
        <div className="save-bar">
          {msg && <span className="muted small">{msg}</span>}
          <button type="button" className="btn" onClick={() => { setDraft(structuredClone(rec.data)); setMsg(''); }}>Discard</button>
          <button type="button" className="btn primary" onClick={save}>Save form</button>
        </div>
      )}
    </div>
  );
}
