import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CONTACT_ROLES, ENTITY_TYPES } from '@shared/baseForms3.js';
import { titleOf, v } from '../lib/data.js';
import { deleteRecord, saveRecord } from '../lib/store.js';
import { useSession } from '../lib/session.jsx';
import { RefSearch, refLabel } from './FormRenderer.jsx';

const ENTITY_PATH = { track: (id) => `/tracks/${id}`, series: (id) => `/series/${id}`, event: (id) => `/events/${id}`, supplier: (id) => `/r/supplier/${id}`, car: (id) => `/r/car/${id}` };

/**
 * Contacts with roles for an entity (entity mode), or the entities a contact is linked to (contact mode).
 * A link made by an admin between two global records can itself be global (seen by every team).
 */
export default function ContactLinks({ data, entity, contact }) {
  const { tid, user, canType } = useSession();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ contact: '', entity_type: entity?.type || 'track', entity: '', role: entity?.type === 'track' ? 'Track promoter' : 'Sales', global: false });
  const [err, setErr] = useState('');
  if (!data) return null;
  const links = data.list('contact_link').filter((l) => (entity ? v(l, 'entity') === entity.id : v(l, 'contact') === contact.id));
  const canEdit = canType('contact_link', 'edit');
  const form = data.list('form').find((f) => f.data.target === 'contact_link' && f.data.is_default);
  const otherIsGlobal = (rec) => !!(rec?.global || rec?.data?.scope === 'global');

  const save = async () => {
    const c = contact?.id || draft.contact;
    const eId = entity?.id || draft.entity;
    const eType = entity?.type || draft.entity_type;
    if (!c || !eId || !draft.role) { setErr('Choose the contact, record and role.'); return; }
    const bothGlobal = otherIsGlobal(data.byId[c]) && otherIsGlobal(data.byId[eId]);
    await saveRecord(tid, 'contact_link', null, {
      form_id: form?.id, ...(user.is_platform_admin && bothGlobal && draft.global ? { scope: 'global' } : {}),
      values: { contact: c, entity_type: eType, entity: eId, role: draft.role, primary: false },
    }, user.id);
    setAdding(false); setErr('');
    setDraft({ ...draft, contact: '', entity: '' });
  };
  const remove = async (l) => {
    if (!window.confirm('Remove this role?')) return;
    await deleteRecord(l.id);
  };
  const editable = (l) => canEdit && (!otherIsGlobal(l) || user.is_platform_admin);

  const contacts = data.list('contact').slice().sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  const targets = data.list(draft.entity_type).slice().sort((a, b) => refLabel(a, data).localeCompare(refLabel(b, data)));
  const bothGlobalDraft = otherIsGlobal(contact || data.byId[draft.contact]) && otherIsGlobal(entity || data.byId[draft.entity]);

  return (
    <section className="card">
      <div className="card-head">
        <h3>{entity ? 'Contacts' : 'Roles & links'}</h3>
        {canEdit && !adding && <button type="button" className="btn small" onClick={() => setAdding(true)}>+ {entity ? 'Add contact' : 'Link to…'}</button>}
      </div>
      {links.length === 0 && !adding && <p className="muted">{entity ? 'No contacts linked yet.' : 'Not linked to any track, supplier, series or event yet.'}</p>}
      <div className="list">
        {links.sort((a, b) => String(v(a, 'role')).localeCompare(String(v(b, 'role')))).map((l) => {
          const c = data.byId[v(l, 'contact')];
          const e = data.byId[v(l, 'entity')];
          return (
            <div key={l.id} className="list-row">
              <span className="role-pill">{v(l, 'role')}</span>
              {entity ? (
                <Link to={`/contacts/${c?.id}`} className="grow">
                  <span className="row-title">{titleOf(c)}{c && v(c, 'organisation') ? <span className="muted"> · {v(c, 'organisation')}</span> : null}</span>
                  <span className="row-sub">{[v(c, 'mobile') || v(c, 'phone'), v(c, 'email')].filter(Boolean).join(' · ')}</span>
                </Link>
              ) : (
                <Link to={e ? ENTITY_PATH[v(l, 'entity_type')]?.(e.id) || '#' : '#'} className="grow">
                  <span className="row-title">{e ? refLabel(e, data) : '(not available)'}</span>
                  <span className="row-sub">{ENTITY_TYPES[v(l, 'entity_type')]}</span>
                </Link>
              )}
              {otherIsGlobal(l) && <span className="pill pill-info">shared</span>}
              {editable(l) && <button type="button" className="icon-btn danger" aria-label="Remove role" onClick={() => remove(l)}>✕</button>}
            </div>
          );
        })}
      </div>
      {adding && (
        <div className="link-form">
          {!contact && (
            <div className="field"><label htmlFor="lk-contact">Contact</label>
              <RefSearch id="lk-contact" recs={contacts} value={draft.contact} data={data} onChange={(x) => setDraft({ ...draft, contact: x })} />
              <Link className="small" to="/r/contact/new">New contact…</Link>
            </div>
          )}
          {!entity && (
            <>
              <div className="field"><label htmlFor="lk-type">Linked to</label>
                <select id="lk-type" value={draft.entity_type} onChange={(e) => setDraft({ ...draft, entity_type: e.target.value, entity: '' })}>
                  {Object.entries(ENTITY_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></div>
              <div className="field"><label htmlFor="lk-entity">{ENTITY_TYPES[draft.entity_type]}</label>
                <RefSearch id="lk-entity" recs={targets} value={draft.entity} data={data} onChange={(x) => setDraft({ ...draft, entity: x })} /></div>
            </>
          )}
          <div className="field"><label htmlFor="lk-role">Role</label>
            <input id="lk-role" list="dl-roles" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
            <datalist id="dl-roles">{CONTACT_ROLES.map((r) => <option key={r} value={r} />)}</datalist></div>
          {user.is_platform_admin && bothGlobalDraft && (
            <label className="toggle small"><input type="checkbox" checked={draft.global} onChange={(e) => setDraft({ ...draft, global: e.target.checked })} /><span>Share with all teams</span></label>
          )}
          {err && <p className="error-text">{err}</p>}
          <div className="inline-row end">
            <button type="button" className="btn small ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button type="button" className="btn small primary" onClick={save}>Add role</button>
          </div>
        </div>
      )}
    </section>
  );
}
