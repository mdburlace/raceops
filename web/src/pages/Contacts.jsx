import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ENTITY_TYPES } from '@shared/baseForms3.js';
import ContactLinks from '../components/ContactLinks.jsx';
import { refLabel } from '../components/FormRenderer.jsx';
import { Attachments, Empty, History, PageHeader, Pill, Section } from '../components/ui.jsx';
import { titleOf, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

const isGlobal = (r) => !!(r?.global || r?.data?.scope === 'global');

export function ContactList() {
  const data = useTeamData();
  const { canType } = useSession();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('');
  const [role, setRole] = useState('');
  if (!data) return null;
  const links = data.list('contact_link');
  const rolesOf = (c) => links.filter((l) => v(l, 'contact') === c.id);
  const allRoles = [...new Set(links.map((l) => v(l, 'role')).filter(Boolean))].sort();
  const rows = data.list('contact')
    .filter((c) => !scope || (scope === 'global' ? isGlobal(c) : !isGlobal(c)))
    .filter((c) => !role || rolesOf(c).some((l) => v(l, 'role') === role))
    .filter((c) => !q || [titleOf(c), v(c, 'organisation'), v(c, 'email'), v(c, 'mobile'), v(c, 'phone')].join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(v(a, 'last_name') || titleOf(a)).localeCompare(String(v(b, 'last_name') || titleOf(b))));
  return (
    <div>
      <PageHeader title="Contacts" sub="Team contacts plus the shared directory (promoters, series officials…)">
        <Link className="btn ghost" to="/suppliers">Suppliers</Link>
        {canType('contact', 'edit') && <Link className="btn primary" to="/r/contact/new">New contact</Link>}
      </PageHeader>
      <div className="toolbar">
        <input type="search" placeholder="Search name, organisation, email, phone" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope">
          <option value="">Team + shared</option><option value="team">Team only</option><option value="global">Shared directory</option>
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          <option value="">Any role</option>{allRoles.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>
      {rows.length === 0 ? <Empty>No contacts yet.</Empty> : (
        <div className="card list">
          {rows.map((c) => {
            const rs = rolesOf(c);
            return (
              <Link key={c.id} to={`/contacts/${c.id}`} className="list-row">
                <span className="avatar">{(v(c, 'first_name') || titleOf(c))[0]?.toUpperCase()}{(v(c, 'last_name') || '')[0]?.toUpperCase() || ''}</span>
                <span className="grow">
                  <span className="row-title">{titleOf(c)}{v(c, 'organisation') ? <span className="muted"> · {v(c, 'organisation')}</span> : null}</span>
                  <span className="row-sub">{rs.length ? rs.slice(0, 3).map((l) => `${v(l, 'role')} — ${titleOf(data.byId[v(l, 'entity')], data)}`).join(' · ') : [v(c, 'mobile') || v(c, 'phone'), v(c, 'email')].filter(Boolean).join(' · ')}</span>
                </span>
                {isGlobal(c) && <Pill level="info">shared</Pill>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ContactDetail() {
  const { id } = useParams();
  const data = useTeamData();
  const { canType, user } = useSession();
  if (!data) return null;
  const c = data.byId[id];
  if (!c) return <PageHeader title="Contact not found" back="/contacts" />;
  const canEdit = canType('contact', 'edit') && (!isGlobal(c) || user?.is_platform_admin);
  const tel = (x) => x && <a href={`tel:${x.replace(/[^\d+]/g, '')}`}>{x}</a>;
  const addr = [v(c, 'address1'), v(c, 'address2'), [v(c, 'city'), v(c, 'state'), v(c, 'postcode')].filter(Boolean).join(' '), v(c, 'country')].filter(Boolean);
  const rows = [
    ['Position', v(c, 'position')], ['Organisation', v(c, 'organisation')], ['Mobile', tel(v(c, 'mobile'))], ['Phone', tel(v(c, 'phone'))],
    ['Email', v(c, 'email') && <a href={`mailto:${v(c, 'email')}`}>{v(c, 'email')}</a>], ['Other email', v(c, 'email2')],
    ['Website', v(c, 'website') && <a href={/^https?:/i.test(v(c, 'website')) ? v(c, 'website') : `https://${v(c, 'website')}`} target="_blank" rel="noreferrer">{v(c, 'website')}</a>],
    ['Address', addr.length ? addr.map((x) => <div key={x}>{x}</div>) : null],
  ].filter(([, x]) => x);
  return (
    <div>
      <PageHeader title={[v(c, 'salutation'), titleOf(c)].filter(Boolean).join(' ')} sub={isGlobal(c) ? 'Shared directory contact' : 'Team contact'} back="/contacts">
        {v(c, 'mobile') && <a className="btn ghost" href={`tel:${v(c, 'mobile').replace(/[^\d+]/g, '')}`}>Call</a>}
        {v(c, 'email') && <a className="btn ghost" href={`mailto:${v(c, 'email')}`}>Email</a>}
        {canEdit && <Link className="btn" to={`/r/contact/${id}`}>Edit</Link>}
      </PageHeader>
      <div className="grid-2">
        <Section title="Details">
          {rows.length ? <dl className="kv">{rows.map(([k, x]) => [<dt key={`t${k}`}>{k}</dt>, <dd key={`d${k}`}>{x}</dd>])}</dl> : <p className="muted">No details yet.</p>}
          {v(c, 'notes') && <p className="pre muted">{v(c, 'notes')}</p>}
        </Section>
        <ContactLinks data={data} contact={c} />
      </div>
      {!isGlobal(c) && <Attachments record={c} canEdit={canEdit} />}
      <History recordId={c.id} />
    </div>
  );
}

export function SupplierList() {
  const data = useTeamData();
  const { canType } = useSession();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  if (!data) return null;
  const links = data.list('contact_link').filter((l) => v(l, 'entity_type') === 'supplier');
  const rows = data.list('supplier').filter((s) => (!cat || v(s, 'category') === cat)
    && (!q || [v(s, 'name'), v(s, 'email'), v(s, 'phone'), v(s, 'city')].join(' ').toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  const cats = [...new Set(data.list('supplier').map((s) => v(s, 'category')).filter(Boolean))].sort();
  return (
    <div>
      <PageHeader title="Suppliers" sub="Parts, tires, fuel, engine and shock suppliers — with their contacts">
        <Link className="btn ghost" to="/contacts">Contacts</Link>
        {canType('supplier', 'edit') && <Link className="btn primary" to="/r/supplier/new">New supplier</Link>}
      </PageHeader>
      <div className="toolbar">
        <input type="search" placeholder="Search suppliers" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      {rows.length === 0 ? <Empty>No suppliers yet.</Empty> : (
        <div className="card list">
          {rows.map((s) => {
            const mine = links.filter((l) => v(l, 'entity') === s.id);
            return (
              <Link key={s.id} to={`/r/supplier/${s.id}`} className="list-row">
                <span className="grow">
                  <span className="row-title">{v(s, 'name')}{v(s, 'category') ? <span className="muted"> · {v(s, 'category')}</span> : null}</span>
                  <span className="row-sub">{mine.length ? mine.map((l) => `${v(l, 'role')}: ${titleOf(data.byId[v(l, 'contact')])}`).join(' · ') : [v(s, 'phone'), v(s, 'email')].filter(Boolean).join(' · ')}</span>
                </span>
                {isGlobal(s) && <Pill level="info">shared</Pill>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { ENTITY_TYPES, refLabel };
