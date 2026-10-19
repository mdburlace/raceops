// Platform (global) administration: licences, plans, users, shared directory, pick-lists, settings and system.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AREAS, FEATURES } from '@shared/catalog.js';
import { AI_FEATURES, ANNOUNCE_LEVELS, TEAM_STATUS } from '@shared/platform.js';
import { ADMIN_LINKS, I, Icon } from '../components/Layout.jsx';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { fmtDate, fmtDateTime } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { OnlineOnly, useLoad } from './Team.jsx';
import { TrackImport } from './Tracks.jsx';
import { TEAM_TYPES } from '@shared/shop.js';

const LICENCE_PILL = { active: ['ok', 'Active'], trial: ['info', 'Trial'], expired: ['over', 'Expired · read-only'], suspended: ['over', 'Suspended'] };
const LicencePill = ({ state }) => <Pill level={LICENCE_PILL[state]?.[0] || 'muted'}>{LICENCE_PILL[state]?.[1] || state}</Pill>;
const seatsText = (members, limit) => (limit === null || limit === undefined ? `${members} member${members === 1 ? '' : 's'} · unlimited seats` : `${members} of ${limit} seats`);
const daysTo = (d) => (d ? Math.ceil((new Date(`${String(d).slice(0, 10)}T23:59:59`) - new Date()) / 864e5) : null);
const featureLabel = (k) => FEATURES.find((f) => f.key === k)?.label || k;
const ACTION_LABEL = {
  'team.create': 'Created team', 'team.update': 'Updated team', 'team.delete': 'Deleted team', 'team.join': 'Joined team',
  'plan.create': 'Added plan', 'plan.update': 'Updated plan', 'plan.delete': 'Removed plan', 'plan.reset': 'Reset plan',
  'user.update': 'Updated user', 'user.reset_password': 'Reset password', 'user.remove_from_team': 'Removed from team',
  'settings.general': 'Changed settings', 'settings.ai': 'Changed AI settings', 'list.update': 'Edited pick-list', 'list.reset': 'Reset pick-list',
  'auth.lockout': 'Sign-in locked out', 'auth.unlock': 'Unlocked sign-in',
  'tracks.import': 'Imported tracks', 'tracks.reseed': 'Re-applied bundled tracks', 'system.upgrade_forms': 'Upgraded base forms',
};
const auditDetail = (a) => {
  const d = { ...(a.detail || {}) };
  delete d.id;
  const parts = Object.entries(d).filter(([, val]) => val !== null && val !== '' && typeof val !== 'object').slice(0, 4)
    .map(([k, val]) => `${k.replace(/_/g, ' ')}: ${val}`);
  if (d.features && typeof d.features === 'object' && !Array.isArray(d.features)) parts.push('feature overrides');
  return parts.join(' · ');
};

export function AdminGate({ children }) {
  const { user } = useSession();
  if (!user?.is_platform_admin) return <div><PageHeader title="Not permitted" sub="Platform admin only" /></div>;
  return <OnlineOnly>{children}</OnlineOnly>;
}

function useAct() {
  const [msg, setMsg] = useState(null);
  const act = async (fn, ok) => {
    setMsg(null);
    try { const r = await fn(); if (ok) setMsg({ ok: true, text: typeof ok === 'function' ? ok(r) : ok }); return r; } catch (e) { setMsg({ ok: false, text: e.message }); return null; }
  };
  const box = msg && <div className={`notice ${msg.ok ? 'info' : 'error'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>;
  return [act, box, setMsg];
}

function Stat({ label, value, sub, to }) {
  const body = <><small>{label}</small><b>{value}</b>{sub && <span className="muted small">{sub}</span>}</>;
  return to ? <Link to={to} className="admin-stat">{body}</Link> : <div className="admin-stat">{body}</div>;
}

function PoolBar({ used, pool, text }) {
  if (pool === null || pool === undefined) return <span className="muted small">No pool limit</span>;
  const pct = pool ? Math.min(1, used / pool) : 1;
  return (
    <span className="pool">
      <span className={`pool-bar${used > pool ? ' over' : used === pool ? ' full' : ''}`}><i style={{ width: `${pct * 100}%` }} /></span>
      <span className="small">{text || `${used} of ${pool} licences${used > pool ? ' — over-allocated' : ''}`}</span>
    </span>
  );
}

// ---------------- overview ----------------
export function AdminOverview() {
  const { platform } = useSession();
  const [o] = useLoad(() => api('/admin/overview'), []);
  const d = o.data;
  return (
    <div>
      <PageHeader title="Platform admin" sub={`Global settings for every team on ${platform?.app_name || 'RaceOps'}`} />
      {!d ? <p className="muted">{o.err || 'Loading…'}</p> : (
        <>
          <div className="admin-stats">
            <Stat label="Teams" value={d.teams.total} to="/admin/teams"
              sub={['active', 'trial', 'expired', 'suspended'].filter((k) => d.teams.by_state[k]).map((k) => `${d.teams.by_state[k]} ${k}`).join(' · ')} />
            <Stat label="Users" value={d.users.total} to="/admin/users" sub={`${d.users.active_30d} signed in last 30 days · ${d.users.admins} admin${d.users.admins === 1 ? '' : 's'}`} />
            <Stat label="Seats in use" value={Object.values(d.usage).reduce((a, u) => a + u.members, 0)}
              sub={`${Object.values(d.usage).reduce((a, u) => a + u.seats, 0)} allocated${Object.values(d.usage).some((u) => u.unlimited) ? ' + unlimited teams' : ''}`} to="/admin/plans" />
            <Stat label="Track directory" value={d.directory.tracks} to="/admin/directory" sub={`${d.directory.contacts} shared contacts · ${d.directory.suppliers} suppliers`} />
          </div>

          {d.announcement?.text && (
            <div className={`banner banner-${d.announcement.level} inline`}>
              <span className="grow"><b>Announcement showing to everyone:</b> {d.announcement.text}{d.announcement.until ? ` (until ${fmtDate(d.announcement.until)})` : ''}</span>
              <Link className="btn small ghost" to="/admin/settings">Edit</Link>
            </div>
          )}

          <div className="grid-2 admin-cols">
            <Section title="Licence allocation" actions={<Link className="btn ghost small" to="/admin/plans">Plans</Link>}>
              <table className="table admin-table">
                <thead><tr><th>Plan</th><th className="num">Teams</th><th className="num">Members</th><th>Pool</th></tr></thead>
                <tbody>
                  {Object.entries(d.plans).map(([k, p]) => {
                    const u = d.usage[k] || { teams: 0, members: 0, active: 0 };
                    return (
                      <tr key={k}>
                        <td><b>{p.label}</b>{p.price && <div className="muted small">{p.price}</div>}</td>
                        <td className="num">{u.teams}{u.active !== u.teams ? <span className="muted small"> ({u.active} live)</span> : null}</td>
                        <td className="num">{u.members}</td>
                        <td><PoolBar used={u.teams} pool={p.pool} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
            <Section title="Needs attention">
              {!d.attention.length ? <Empty>All teams are licensed and within their seats.</Empty> : (
                <div className="list">
                  {d.attention.map((t) => {
                    const days = daysTo(t.licence_expires);
                    const why = t.licence === 'suspended' ? 'Suspended' : t.licence === 'expired' ? `Licence expired ${fmtDate(t.licence_expires)}`
                      : days !== null && days <= 30 ? `Licence ends in ${days} day${days === 1 ? '' : 's'}` : 'All seats used';
                    return (
                      <Link key={t.id} className="list-row" to={`/admin/teams?team=${t.id}`}>
                        <span className="grow"><span className="row-title">{t.name}</span><span className="row-sub">{why} · {seatsText(t.members, t.seat_limit)}</span></span>
                        <LicencePill state={t.licence} />
                      </Link>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>

          <div className="grid-2 admin-cols">
            <Section title="Recent admin activity" actions={<Link className="btn ghost small" to="/admin/system">All activity</Link>}>
              <ActivityList rows={d.activity} />
            </Section>
            <Section title="Manage">
              <div className="admin-links">
                {ADMIN_LINKS.slice(1).map((l) => (
                  <Link key={l.to} to={l.to} className="admin-link"><Icon d={l.icon} size={18} /><span>{l.label}</span></Link>
                ))}
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

function ActivityList({ rows }) {
  if (!rows?.length) return <Empty>No admin changes yet.</Empty>;
  return (
    <div className="list activity">
      {rows.map((a) => (
        <div key={a.id} className="list-row">
          <span className="grow">
            <span className="row-title">{ACTION_LABEL[a.action] || a.action}{a.target ? ` — ${a.target}` : ''}</span>
            <span className="row-sub">{a.user_name || 'System'} · {fmtDateTime(a.at)}{auditDetail(a) ? ` · ${auditDetail(a)}` : ''}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------- teams & licences ----------------
function FeatureOverrides({ plans, plan, features, onChange }) {
  const planHas = new Set(plans[plan]?.features || []);
  const effective = (k) => (k in features ? features[k] : planHas.has(k));
  const flip = (k, on) => {
    const n = { ...features };
    if (on === planHas.has(k)) delete n[k]; else n[k] = on;
    onChange(n);
  };
  return (
    <div className="feature-grid">
      {FEATURES.map((f) => (
        <label key={f.key} className={`toggle small${f.key in features ? ' overridden' : ''}`} title={f.key in features ? 'Override of the plan' : 'From the plan'}>
          <input type="checkbox" checked={effective(f.key)} onChange={(e) => flip(f.key, e.target.checked)} aria-label={f.label} />
          <span>{f.label}{f.key in features && <em className="ovr"> {features[f.key] ? 'added' : 'removed'}</em>}</span>
        </label>
      ))}
    </div>
  );
}

function TeamEditor({ t, plans, onSaved, onDeleted }) {
  const { refresh, switchTenant } = useSession();
  const nav = useNavigate();
  const [f, setF] = useState({
    name: t.name, plan: t.plan, status: t.status, features: t.features || {},
    seats: t.seats ?? '', licence_expires: t.licence_expires ? String(t.licence_expires).slice(0, 10) : '', admin_notes: t.admin_notes || '',
    ai_budget_usd: t.ai_budget_usd ?? '', team_type: t.settings?.team_type || 'race',
  });
  const [act, box] = useAct();
  const set = (k, val) => setF((x) => ({ ...x, [k]: val }));
  const planSeats = plans[f.plan]?.seats;
  const save = () => act(async () => {
    await api(`/admin/tenants/${t.id}`, { method: 'PATCH', body: { ...f, seats: f.seats === '' ? null : Number(f.seats), licence_expires: f.licence_expires || null, ai_budget_usd: f.ai_budget_usd === '' ? null : Number(f.ai_budget_usd) } });
    onSaved(); refresh();
  }, 'Saved. Members pick up the change the next time their app syncs.');
  const open = () => act(async () => {
    if (!t.is_member) await api(`/admin/tenants/${t.id}/join`, { method: 'POST' });
    await refresh(); switchTenant(t.id); nav('/');
  });
  const del = () => {
    const typed = window.prompt(`This permanently deletes ${t.name} and all of its records, history and files.\n\nType the team name to confirm:`);
    if (typed === null) return;
    act(async () => { await api(`/admin/tenants/${t.id}`, { method: 'DELETE', body: { confirm: typed } }); onDeleted(); refresh(); });
  };
  return (
    <div className="team-editor">
      {box}
      <div className="grid-3">
        <div className="field"><label htmlFor={`tn-${t.id}`}>Team name</label><input id={`tn-${t.id}`} value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field"><label htmlFor={`tp-${t.id}`}>Plan</label>
          <select id={`tp-${t.id}`} value={f.plan} onChange={(e) => set('plan', e.target.value)}>
            {Object.entries(plans).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            {!plans[f.plan] && <option value={f.plan}>{f.plan} (removed)</option>}
          </select>
        </div>
        <div className="field"><label htmlFor={`tt-${t.id}`}>Team type</label>
          <select id={`tt-${t.id}`} value={f.team_type} onChange={(e) => set('team_type', e.target.value)}>
            {Object.entries(TEAM_TYPES).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor={`ts-${t.id}`}>Status</label>
          <select id={`ts-${t.id}`} value={f.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(TEAM_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor={`tseat-${t.id}`}>Seats</label>
          <input id={`tseat-${t.id}`} inputMode="numeric" value={f.seats} onChange={(e) => set('seats', e.target.value.replace(/\D/g, ''))}
            placeholder={planSeats ? `Plan default: ${planSeats}` : 'Unlimited'} />
          <p className="help">Members who can belong to the team. Blank uses the plan’s default.</p>
        </div>
        <div className="field"><label htmlFor={`te-${t.id}`}>Licence ends</label>
          <input id={`te-${t.id}`} type="date" value={f.licence_expires} onChange={(e) => set('licence_expires', e.target.value)} />
          <p className="help">After this date the team can read but not change its data. Blank = no end date.</p>
        </div>
        <div className="field"><label htmlFor={`tai-${t.id}`}>AI allowance (US$ / month)</label>
          <input id={`tai-${t.id}`} inputMode="decimal" value={f.ai_budget_usd} placeholder="Server default" onChange={(e) => set('ai_budget_usd', e.target.value.replace(/[^\d.]/g, ''))} />
          <p className="help">Blank uses the default on the AI page; 0 turns AI off for this team.</p>
        </div>
        <div className="field"><label htmlFor={`tnote-${t.id}`}>Admin notes</label>
          <input id={`tnote-${t.id}`} value={f.admin_notes} onChange={(e) => set('admin_notes', e.target.value)} placeholder="Only platform admins see this" />
        </div>
      </div>
      <h4 className="sub-head">Areas & features <span className="muted small">— ticks come from the plan; change one to override it for this team only</span></h4>
      <FeatureOverrides plans={plans} plan={f.plan} features={f.features} onChange={(n) => set('features', n)} />
      <div className="inline-row end">
        <button type="button" className="btn ghost danger small" onClick={del}>Delete team…</button>
        <span className="grow" />
        <button type="button" className="btn small" onClick={open}>{t.is_member ? 'Open team' : 'Join & open team'}</button>
        <button type="button" className="btn primary small" onClick={save}>Save licence</button>
      </div>
    </div>
  );
}

function CreateTeam({ plans, onCreated }) {
  const { refresh } = useSession();
  const blank = { name: '', plan: '', seats: '', licence_expires: '', status: 'active', owner_email: '', join: true, team_type: 'race' };
  const [f, setF] = useState(blank);
  const [invite, setInvite] = useState(null);
  const [act, box] = useAct();
  const set = (k, val) => setF((x) => ({ ...x, [k]: val }));
  const link = invite && `${window.location.origin}/invite/${invite.token}`;
  return (
    <Section title="Create a team">
      {box}
      {invite && (
        <div className="notice info">
          Owner invite for {invite.email}: <code className="invite-link">{link}</code>{' '}
          <button type="button" className="btn small" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
        </div>
      )}
      <form onSubmit={(e) => {
        e.preventDefault();
        act(async () => {
          const t = await api('/admin/tenants', { method: 'POST', body: { ...f, plan: f.plan || undefined, seats: f.seats === '' ? null : Number(f.seats), licence_expires: f.licence_expires || null, join: f.join || !f.owner_email } });
          setInvite(t.invite); setF(blank); onCreated(); refresh();
          return t;
        }, (t) => `Created ${t.name}.`);
      }}>
        <div className="grid-3">
          <div className="field"><label htmlFor="nt-name">Team name <span className="req">*</span></label><input id="nt-name" required value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field"><label htmlFor="nt-plan">Plan</label>
            <select id="nt-plan" value={f.plan} onChange={(e) => set('plan', e.target.value)}>
              <option value="">Default plan</option>
              {Object.entries(plans).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="nt-status">Status</label>
            <select id="nt-status" value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">Active</option><option value="trial">Trial</option>
            </select>
          </div>
          <div className="field"><label htmlFor="nt-seats">Seats</label><input id="nt-seats" inputMode="numeric" placeholder="Plan default" value={f.seats} onChange={(e) => set('seats', e.target.value.replace(/\D/g, ''))} /></div>
          <div className="field"><label htmlFor="nt-exp">Licence ends</label><input id="nt-exp" type="date" value={f.licence_expires} onChange={(e) => set('licence_expires', e.target.value)} /></div>
          <div className="field"><label htmlFor="nt-type">Team type</label>
            <select id="nt-type" value={f.team_type} onChange={(e) => { set('team_type', e.target.value); if (e.target.value === 'engine_shop' && !f.plan && plans.engine_shop) set('plan', 'engine_shop'); }}>
              {Object.entries(TEAM_TYPES).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
            </select></div>
          <div className="field"><label htmlFor="nt-owner">Owner’s email</label><input id="nt-owner" type="email" placeholder="Optional — creates an owner invite link" value={f.owner_email} onChange={(e) => set('owner_email', e.target.value)} /></div>
        </div>
        <div className="inline-row end">
          {f.owner_email && (
            <label className="toggle small"><input type="checkbox" checked={f.join} onChange={(e) => set('join', e.target.checked)} /><span>Also add me as an owner</span></label>
          )}
          <button className="btn primary">Create team</button>
        </div>
      </form>
      <p className="muted small">The team gets its own copy of the base forms, roles and gear lists.</p>
    </Section>
  );
}

export function AdminTeams() {
  const [params, setParams] = useSearchParams();
  const [teams, reload] = useLoad(() => api('/admin/tenants'), []);
  const [plansRes, reloadPlans] = useLoad(() => api('/admin/plans'), []);
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [state, setState] = useState('');
  const open = params.get('team');
  const plans = plansRes.data?.plans;
  const rows = (teams.data || [])
    .filter((t) => !plan || t.plan === plan)
    .filter((t) => !state || t.licence === state)
    .filter((t) => !q || [t.name, ...t.owners.map((o) => `${o.name} ${o.email}`), t.admin_notes].join(' ').toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Teams & licences" sub="Plan, seats, licence dates and feature overrides for every team" />
      {plans && <CreateTeam plans={plans} onCreated={() => { reload(); reloadPlans(); }} />}
      <div className="toolbar">
        <input type="search" placeholder="Search teams, owners, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan filter">
          <option value="">All plans</option>
          {plans && Object.entries(plans).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Status filter">
          <option value="">Any status</option>
          {Object.entries(LICENCE_PILL).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {!teams.data || !plans ? <p className="muted">{teams.err || plansRes.err || 'Loading…'}</p> : (
        <div className="card list team-list">
          {!rows.length && <Empty>No teams match.</Empty>}
          {rows.map((t) => {
            const days = daysTo(t.licence_expires);
            const isOpen = open === t.id;
            return (
              <div key={t.id} className={`team-row${isOpen ? ' open' : ''}`}>
                <button type="button" className="list-row" aria-expanded={isOpen} onClick={() => setParams(isOpen ? {} : { team: t.id }, { replace: true })}>
                  <span className="grow">
                    <span className="row-title">{t.name}</span>
                    <span className="row-sub">
                      {t.plan_label} · {seatsText(t.members, t.seat_limit)}{t.pending_invites ? ` · ${t.pending_invites} invite${t.pending_invites === 1 ? '' : 's'} pending` : ''}
                      {t.licence_expires ? ` · ${days < 0 ? 'ended' : 'ends'} ${fmtDate(t.licence_expires)}` : ''}
                    </span>
                    <span className="row-sub">
                      Owner{t.owners.length === 1 ? '' : 's'}: {t.owners.map((o) => o.name).join(', ') || '—'} · {t.records} records · last activity {t.last_activity ? fmtDate(t.last_activity) : 'never'}
                    </span>
                  </span>
                  {t.seat_limit !== null && t.members >= t.seat_limit && <Pill level="warn">Seats full</Pill>}
                  {Object.keys(t.features || {}).length > 0 && <Pill level="muted">{Object.keys(t.features).length} override{Object.keys(t.features).length === 1 ? '' : 's'}</Pill>}
                  <LicencePill state={t.licence} />
                  <span className="chev" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && <TeamEditor t={t} plans={plans} onSaved={reload} onDeleted={() => { setParams({}); reload(); }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- plans ----------------
function PlanCard({ k, p, usage, onSaved }) {
  const [f, setF] = useState({ label: p.label, features: p.features, seats: p.seats ?? '', pool: p.pool ?? '', price: p.price || '', share_limit: p.share_limit ?? '' });
  const [act, box] = useAct();
  const has = new Set(f.features);
  const toggle = (key, on) => setF((x) => ({ ...x, features: on ? [...x.features, key] : x.features.filter((z) => z !== key) }));
  const u = usage || { teams: 0, active: 0, members: 0, seats: 0, unlimited: 0 };
  const save = () => act(async () => onSaved(await api(`/admin/plans/${k}`, { method: 'PUT', body: { ...f, seats: f.seats === '' ? null : Number(f.seats), pool: f.pool === '' ? null : Number(f.pool), share_limit: f.share_limit === '' ? null : Number(f.share_limit) } })), 'Plan saved.');
  const del = () => window.confirm(`Remove the ${p.label} plan?`) && act(async () => onSaved(await api(`/admin/plans/${k}`, { method: 'DELETE' })));
  const reset = () => window.confirm('Restore this plan’s original features and settings?') && act(async () => onSaved(await api(`/admin/plans/${k}/reset`, { method: 'POST' }), true));
  return (
    <section className="card plan-card">
      {box}
      <div className="card-head">
        <div>
          <h3 className="plain">{p.label}</h3>
          <span className="muted small">key <code>{k}</code>{p.builtin ? ' · built-in' : ' · custom'} · {u.teams} team{u.teams === 1 ? '' : 's'} ({u.active} live) · {u.members} members</span>
        </div>
        <PoolBar used={u.teams} pool={p.pool} />
      </div>
      <div className="grid-4">
        <div className="field"><label htmlFor={`pl-${k}`}>Plan name</label><input id={`pl-${k}`} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        <div className="field"><label htmlFor={`pp-${k}`}>Price / notes</label><input id={`pp-${k}`} value={f.price} placeholder="e.g. $49 / month" onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
        <div className="field"><label htmlFor={`pseat-${k}`}>Seats per team</label><input id={`pseat-${k}`} inputMode="numeric" placeholder="Unlimited" value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value.replace(/\D/g, '') })} />
          <p className="help">Default; a team can have its own.</p></div>
        <div className="field"><label htmlFor={`pshare-${k}`}>Shared engines (engine shops)</label><input id={`pshare-${k}`} inputMode="numeric" placeholder="Unlimited" value={f.share_limit} onChange={(e) => setF({ ...f, share_limit: e.target.value.replace(/\D/g, '') })} />
          <p className="help">How many engines a shop on this plan can share with customers at once.</p></div>
        <div className="field"><label htmlFor={`ppool-${k}`}>Licences available</label><input id={`ppool-${k}`} inputMode="numeric" placeholder="No limit" value={f.pool} onChange={(e) => setF({ ...f, pool: e.target.value.replace(/\D/g, '') })} />
          <p className="help">Teams allowed on this plan.</p></div>
      </div>
      <h4 className="sub-head">Included</h4>
      <div className="plan-features">
        {AREAS.map((a) => (
          <div key={a.key} className={`plan-area area-${a.key}`}>
            <label className="toggle small strong"><input type="checkbox" checked={has.has(a.key)} onChange={(e) => toggle(a.key, e.target.checked)} aria-label={`${p.label}: ${a.label}`} /><span>{a.label}</span></label>
            {FEATURES.filter((x) => x.area === a.key && x.key !== a.key).map((x) => (
              <label key={x.key} className="toggle small"><input type="checkbox" checked={has.has(x.key)} disabled={!has.has(a.key)} onChange={(e) => toggle(x.key, e.target.checked)} aria-label={`${p.label}: ${x.label}`} /><span>{x.label}</span></label>
            ))}
          </div>
        ))}
        <div className="plan-area area-admin">
          <span className="toggle small strong"><span>Add-ons</span></span>
          {FEATURES.filter((x) => x.addon).map((x) => (
            <label key={x.key} className="toggle small"><input type="checkbox" checked={has.has(x.key)} onChange={(e) => toggle(x.key, e.target.checked)} aria-label={`${p.label}: ${x.label}`} /><span>{x.label}</span></label>
          ))}
        </div>
      </div>
      <div className="inline-row end">
        {p.builtin && p.customised && <button type="button" className="btn ghost small" onClick={reset}>Restore original</button>}
        <button type="button" className="btn ghost danger small" disabled={u.teams > 0} title={u.teams ? 'Move its teams to another plan first' : ''} onClick={del}>Remove plan</button>
        <span className="grow" />
        <button type="button" className="btn primary small" onClick={save}>Save plan</button>
      </div>
    </section>
  );
}

export function AdminPlans() {
  const [res, reload] = useLoad(() => api('/admin/plans'), []);
  const [data, setData] = useState(null);
  const [rev, setRev] = useState(0);
  const [nk, setNk] = useState({ key: '', label: '' });
  const [act, box] = useAct();
  const { refresh } = useSession();
  const d = data || res.data;
  const onSaved = (r, remount) => { setData(r); if (remount) setRev((x) => x + 1); refresh(); };
  const totals = useMemo(() => d && Object.values(d.usage).reduce((a, u) => ({ teams: a.teams + u.teams, members: a.members + u.members, seats: a.seats + u.seats, unlimited: a.unlimited + u.unlimited }), { teams: 0, members: 0, seats: 0, unlimited: 0 }), [d]);
  return (
    <div>
      <PageHeader title="Plans & licence allocation" sub="What each plan includes, seats per team, and how many licences you have to allocate" />
      {box}
      {!d ? <p className="muted">{res.err || 'Loading…'}</p> : (
        <>
          <div className="admin-stats">
            <Stat label="Teams licensed" value={totals.teams} />
            <Stat label="Members" value={totals.members} />
            <Stat label="Seats allocated" value={totals.seats} sub={totals.unlimited ? `+ ${totals.unlimited} team${totals.unlimited === 1 ? '' : 's'} unlimited` : ''} />
            <Stat label="Plans" value={Object.keys(d.plans).length} />
          </div>
          {Object.entries(d.plans).map(([k, p]) => <PlanCard key={`${k}:${rev}`} k={k} p={p} usage={d.usage[k]} onSaved={onSaved} />)}
          <Section title="Add a plan">
            <form className="inline-row wrap" onSubmit={(e) => {
              e.preventDefault();
              act(async () => { onSaved(await api(`/admin/plans/${encodeURIComponent(nk.key || nk.label)}`, { method: 'PUT', body: { label: nk.label, features: ['track', 'team'] } })); setNk({ key: '', label: '' }); }, 'Plan added — choose what it includes below.');
            }}>
              <input required placeholder="Plan name, e.g. Club" value={nk.label} onChange={(e) => setNk({ ...nk, label: e.target.value })} aria-label="New plan name" />
              <input placeholder="Key (optional), e.g. club" value={nk.key} onChange={(e) => setNk({ ...nk, key: e.target.value })} aria-label="New plan key" />
              <button className="btn primary">Add plan</button>
            </form>
          </Section>
          <p className="muted small">Changes apply to every team on the plan the next time their app syncs. Per-team overrides on <Link to="/admin/teams">Teams & licences</Link> still win.</p>
        </>
      )}
      {res.err && !d && <button type="button" className="btn" onClick={reload}>Retry</button>}
    </div>
  );
}

// ---------------- users ----------------
function UserRow({ u, me, onChanged }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ name: u.name, email: u.email });
  const [temp, setTemp] = useState('');
  const [act, box] = useAct();
  const patch = (body) => act(async () => { await api(`/admin/users/${u.id}`, { method: 'PATCH', body }); setEdit(false); onChanged(); });
  return (
    <div className={`user-row${u.disabled ? ' disabled' : ''}`}>
      {box}
      {temp && <div className="notice info">Temporary password for {u.email}: <code className="temp-pass">{temp}</code> — give it to them privately; they can change it under Profile.</div>}
      <div className="list-row">
        <span className="avatar">{u.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
        {edit ? (
          <span className="grow inline-row wrap">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Name" />
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="Email" />
            <button type="button" className="btn small primary" onClick={() => patch(f)}>Save</button>
            <button type="button" className="btn small ghost" onClick={() => setEdit(false)}>Cancel</button>
          </span>
        ) : (
          <span className="grow">
            <span className="row-title">{u.name}{u.id === me ? ' (you)' : ''} {u.is_platform_admin && <Pill level="info">Platform admin</Pill>} {u.disabled && <Pill level="over">Disabled</Pill>}
              {u.signin?.locked && <Pill level="over">Sign-in locked until {new Date(u.signin.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Pill>}
              {!u.signin?.locked && u.signin?.fails > 0 && <Pill level="warn">{u.signin.fails} failed sign-in{u.signin.fails === 1 ? '' : 's'}</Pill>}</span>
            <span className="row-sub">{u.email} · joined {fmtDate(u.created_at)} · last sign-in {u.last_login_at ? fmtDateTime(u.last_login_at) : 'never'}</span>
            <span className="user-teams">
              {u.teams.length ? u.teams.map((t) => (
                <span key={t.tenant_id} className="chip static">
                  {t.tenant_name} · {t.role}
                  <button type="button" className="chip-x" aria-label={`Remove ${u.name} from ${t.tenant_name}`}
                    onClick={() => window.confirm(`Remove ${u.name} from ${t.tenant_name}?`) && act(async () => { await api(`/admin/users/${u.id}/memberships/${t.tenant_id}`, { method: 'DELETE' }); onChanged(); })}>×</button>
                </span>
              )) : <span className="muted small">No team</span>}
            </span>
          </span>
        )}
        {!edit && (
          <span className="row-actions wrap-actions">
            {u.signin?.locked && (
              <button type="button" className="btn small" onClick={() => act(async () => { await api('/admin/lockouts', { method: 'DELETE', body: { key: `acct:${u.email}` } }); onChanged(); })}>Unlock sign-in</button>
            )}
            <button type="button" className="btn small ghost" onClick={() => setEdit(true)}>Edit</button>
            <button type="button" className="btn small ghost" onClick={() => window.confirm(`Set a new temporary password for ${u.name}? Their current password stops working.`)
              && act(async () => { const r = await api(`/admin/users/${u.id}/reset-password`, { method: 'POST' }); setTemp(r.password); })}>Reset password</button>
            {u.id !== me && (
              <>
                <button type="button" className="btn small ghost" onClick={() => patch({ is_platform_admin: !u.is_platform_admin })}>{u.is_platform_admin ? 'Remove admin' : 'Make admin'}</button>
                <button type="button" className={`btn small ghost${u.disabled ? '' : ' danger'}`} onClick={() => (u.disabled || window.confirm(`Disable ${u.name}? They are signed out everywhere and can’t sign in.`)) && patch({ disabled: !u.disabled })}>{u.disabled ? 'Enable' : 'Disable'}</button>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export function AdminUsers() {
  const { user } = useSession();
  const [users, reload] = useLoad(() => api('/admin/users'), []);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const rows = (users.data || [])
    .filter((u) => !filter || (filter === 'admin' ? u.is_platform_admin : filter === 'disabled' ? u.disabled : filter === 'none' ? !u.teams.length : true))
    .filter((u) => !q || [u.name, u.email, ...u.teams.map((t) => t.tenant_name)].join(' ').toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Users" sub="Everyone with an account, across all teams" />
      <div className="toolbar">
        <input type="search" placeholder="Search name, email or team…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="User filter">
          <option value="">All users</option><option value="admin">Platform admins</option><option value="disabled">Disabled</option><option value="none">Not in a team</option>
        </select>
      </div>
      {!users.data ? <p className="muted">{users.err || 'Loading…'}</p> : (
        <div className="card list">
          {!rows.length && <Empty>No users match.</Empty>}
          {rows.map((u) => <UserRow key={`${u.id}:${u.disabled}:${u.is_platform_admin}:${u.name}:${u.email}:${u.teams.length}`} u={u} me={user.id} onChanged={reload} />)}
        </div>
      )}
      <p className="muted small">People join a team through an invite link from that team (or the owner invite when you create a team). Disabling an account signs it out on every device.</p>
    </div>
  );
}

// ---------------- shared directory ----------------
export function AdminDirectory() {
  const [res, reload] = useLoad(() => api('/admin/directory'), []);
  const [act, box] = useAct();
  const d = res.data;
  const byCountry = useMemo(() => {
    if (!d) return [];
    const m = new Map();
    for (const r of d.countries) {
      const x = m.get(r.country) || { country: r.country, Active: 0, Inactive: 0, Closed: 0, total: 0 };
      x[r.status] = (x[r.status] || 0) + r.n; x.total += r.n; m.set(r.country, x);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [d]);
  const exportJson = () => act(async () => {
    const j = await api('/admin/tracks/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `raceops-tracks-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return j;
  }, (j) => `Exported ${j.tracks.length} tracks.`);
  return (
    <div>
      <PageHeader title="Tracks & shared directory" sub="Records every team can see: the track directory, shared contacts and suppliers" />
      {box}
      {!d ? <p className="muted">{res.err || 'Loading…'}</p> : (
        <>
          <div className="admin-stats">
            <Stat label="Tracks" value={d.counts.track || 0} to="/tracks?tab=all" sub={`${d.linked_tracks} linked to teams`} />
            <Stat label="Shared contacts" value={d.counts.contact || 0} to="/contacts?scope=global" />
            <Stat label="Shared suppliers" value={d.counts.supplier || 0} to="/suppliers" />
            <Stat label="Shared contact roles" value={d.counts.contact_link || 0} />
          </div>
          <div className="grid-2 admin-cols">
            <Section title="Tracks by country" actions={<Link className="btn ghost small" to="/tracks?tab=all">Browse & edit</Link>}>
              <table className="table admin-table">
                <thead><tr><th>Country</th><th className="num">Active</th><th className="num">Inactive</th><th className="num">Closed</th><th className="num">Total</th></tr></thead>
                <tbody>{byCountry.map((c) => <tr key={c.country}><td>{c.country}</td><td className="num">{c.Active}</td><td className="num">{c.Inactive}</td><td className="num">{c.Closed}</td><td className="num"><b>{c.total}</b></td></tr>)}</tbody>
              </table>
            </Section>
            <Section title="Data to fill in">
              <dl className="kv">
                <dt>No map location</dt><dd>{d.gaps.no_location}</dd>
                <dt>No classes</dt><dd>{d.gaps.no_classes}</dd>
                <dt>No track size</dt><dd>{d.gaps.no_size}</dd>
                <dt>No surface</dt><dd>{d.gaps.no_surface}</dd>
              </dl>
              <p className="muted small">Gaps can be filled by editing a track, or by importing a file in “fill empty fields” mode.</p>
              <div className="inline-row wrap">
                <Link className="btn small" to="/r/track/new?scope=global">Add a track</Link>
                <Link className="btn small" to="/r/contact/new?scope=global">Add a shared contact</Link>
                <Link className="btn small" to="/r/supplier/new?scope=global">Add a shared supplier</Link>
              </div>
            </Section>
          </div>
          <TrackImport />
          <Section title="Export & bundled list">
            <div className="inline-row wrap">
              <button type="button" className="btn" onClick={exportJson}>Download all tracks (JSON)</button>
              <button type="button" className="btn ghost" onClick={() => window.confirm('Re-apply the track list that ships with RaceOps? New tracks are added and empty fields filled; your edits are kept.')
                && act(async () => { const r = await api('/admin/tracks/reseed', { method: 'POST' }); reload(); return r; }, (r) => `Bundled list: ${r.added} added, ${r.updated} filled in.`)}>Re-apply bundled track list</button>
            </div>
            <p className="muted small">The export uses the same layout as the import, so you can edit it in bulk and re-import with “overwrite”.</p>
          </Section>
        </>
      )}
    </div>
  );
}

// ---------------- pick-lists ----------------
function ListEditor({ def, items, custom, onSaved }) {
  const { refresh } = useSession();
  const [list, setList] = useState(items);
  const [text, setText] = useState('');
  const [bulk, setBulk] = useState(null);
  const [act, box] = useAct();
  const dirty = JSON.stringify(list) !== JSON.stringify(items);
  const add = () => { const x = text.trim(); if (x && !list.includes(x)) setList([...list, x]); setText(''); };
  const move = (i, d) => { const n = [...list]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setList(n); };
  const save = (body) => act(async () => { const r = await api(`/admin/settings/lists/${def.key}`, { method: 'PUT', body }); setList(r.items); setBulk(null); onSaved(def.key, r); refresh(); }, 'Saved. Devices pick up the new list when they next refresh (or sign in).');
  return (
    <Section title={def.label} actions={custom ? <Pill level="info">Customised</Pill> : <Pill level="muted">Default</Pill>}>
      {box}
      <p className="muted small">{def.help} Used by: {def.fields.map(([t, k]) => `${t.replace('_', ' ')} → ${k.replace(/_/g, ' ')}`).join(', ')}.</p>
      {bulk !== null ? (
        <textarea rows={10} value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label={`${def.label} — one per line`} />
      ) : (
        <div className="list-edit">
          {list.map((x, i) => (
            <span key={x} className="chip static le-item">
              <button type="button" className="le-move" disabled={!i} aria-label={`Move ${x} earlier`} onClick={() => move(i, -1)}>‹</button>
              {x}
              <button type="button" className="le-move" disabled={i === list.length - 1} aria-label={`Move ${x} later`} onClick={() => move(i, 1)}>›</button>
              <button type="button" className="chip-x" aria-label={`Remove ${x}`} onClick={() => setList(list.filter((y) => y !== x))}>×</button>
            </span>
          ))}
          <input className="le-add" value={text} placeholder="Add…" aria-label={`Add to ${def.label}`} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} />
        </div>
      )}
      <div className="inline-row end">
        {bulk === null
          ? <button type="button" className="btn ghost small" onClick={() => setBulk(list.join('\n'))}>Edit as text</button>
          : <button type="button" className="btn ghost small" onClick={() => { setList([...new Set(bulk.split('\n').map((x) => x.trim()).filter(Boolean))]); setBulk(null); }}>Back to chips</button>}
        {custom && <button type="button" className="btn ghost small" onClick={() => window.confirm('Go back to the standard list?') && save({ reset: true })}>Restore default</button>}
        <span className="grow" />
        <button type="button" className="btn primary small" disabled={!dirty && bulk === null}
          onClick={() => save({ items: bulk !== null ? bulk.split('\n') : list })}>Save list</button>
      </div>
    </Section>
  );
}

export function AdminLists() {
  const [res] = useLoad(() => api('/admin/settings'), []);
  const [over, setOver] = useState({});
  const d = res.data;
  return (
    <div>
      <PageHeader title="Pick-lists" sub="Standard choices offered to every team. Teams can still type their own where a field allows it." />
      {!d ? <p className="muted">{res.err || 'Loading…'}</p> : d.list_defs.map((def) => {
        const o = over[def.key];
        return <ListEditor key={`${def.key}:${(o?.items || d.lists[def.key]).join('|')}`} def={def} items={o?.items || d.lists[def.key]} custom={o ? o.custom : d.custom_lists.includes(def.key)}
          onSaved={(k, r) => setOver((x) => ({ ...x, [k]: r }))} />;
      })}
    </div>
  );
}

// ---------------- settings ----------------
export function AdminSettings() {
  const [res] = useLoad(() => Promise.all([api('/admin/settings'), api('/admin/plans')]), []);
  return (
    <div>
      <PageHeader title="Settings" sub="Name, defaults for new teams and the announcement banner" />
      {!res.data ? <p className="muted">{res.err || 'Loading…'}</p> : <SettingsForm g={res.data[0].general} plans={res.data[1].plans} />}
    </div>
  );
}

function SettingsForm({ g, plans }) {
  const { refresh } = useSession();
  const [f, setF] = useState({ ...g, default_seats: g.default_seats ?? '', announcement: { ...g.announcement, until: g.announcement.until || '' } });
  const [act, box] = useAct();
  const set = (k, val) => setF((x) => ({ ...x, [k]: val }));
  const setA = (k, val) => setF((x) => ({ ...x, announcement: { ...x.announcement, [k]: val } }));
  const save = () => act(async () => {
    const r = await api('/admin/settings/general', { method: 'PUT', body: { ...f, default_seats: f.default_seats === '' ? null : Number(f.default_seats), announcement: { ...f.announcement, until: f.announcement.until || null } } });
    await refresh(); return r;
  }, 'Settings saved.');
  return (
    <>
      {box}
      <Section title="General">
        <div className="grid-3">
          <div className="field"><label htmlFor="s-name">App name</label><input id="s-name" maxLength={40} value={f.app_name} onChange={(e) => set('app_name', e.target.value)} />
            <p className="help">Shown in the menu and browser tab.</p></div>
          <div className="field"><label htmlFor="s-support">Support email</label><input id="s-support" type="email" value={f.support_email} placeholder="Shown when a licence has expired" onChange={(e) => set('support_email', e.target.value)} /></div>
          <div className="field"><label htmlFor="s-days">Invite links last (days)</label><input id="s-days" inputMode="numeric" value={f.invite_days} onChange={(e) => set('invite_days', e.target.value.replace(/\D/g, ''))} /></div>
        </div>
      </Section>
      <Section title="New teams">
        <div className="grid-3">
          <div className="field"><label htmlFor="s-plan">Default plan</label>
            <select id="s-plan" value={f.default_plan} onChange={(e) => set('default_plan', e.target.value)}>
              {Object.entries(plans).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select></div>
          <div className="field"><label htmlFor="s-seats">Default seats</label><input id="s-seats" inputMode="numeric" placeholder="Use the plan’s seats" value={f.default_seats} onChange={(e) => set('default_seats', e.target.value.replace(/\D/g, ''))} /></div>
        </div>
      </Section>
      <Section title="Announcement banner">
        <p className="muted small">Shown at the top of the app for every user in every team, e.g. planned maintenance or a new feature. Leave empty for none.</p>
        <div className="field"><label htmlFor="s-ann">Message</label><textarea id="s-ann" rows={2} maxLength={500} value={f.announcement.text} onChange={(e) => setA('text', e.target.value)} /></div>
        <div className="grid-3">
          <div className="field"><label htmlFor="s-level">Type</label>
            <select id="s-level" value={f.announcement.level} onChange={(e) => setA('level', e.target.value)}>
              {Object.entries(ANNOUNCE_LEVELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <p className="help">Critical messages can’t be dismissed.</p></div>
          <div className="field"><label htmlFor="s-until">Show until</label><input id="s-until" type="date" value={f.announcement.until} onChange={(e) => setA('until', e.target.value)} />
            <p className="help">Blank = until you clear it.</p></div>
        </div>
        {f.announcement.text && <div className={`banner banner-${f.announcement.level} inline`}><span className="grow">{f.announcement.text}</span></div>}
      </Section>
      <div className="inline-row end sticky-save"><button type="button" className="btn primary" onClick={save}>Save settings</button></div>
    </>
  );
}

// ---------------- system & activity ----------------
const fmtBytes = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} kB`);
const fmtUptime = (s) => (s > 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : s > 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m`);

export function AdminSystem() {
  const [sys] = useLoad(() => api('/admin/system'), []);
  const [kind, setKind] = useState('');
  const [log] = useLoad(() => api(`/admin/audit?limit=200${kind ? `&action=${kind}` : ''}`), [kind]);
  const [act, box] = useAct();
  const s = sys.data;
  return (
    <div>
      <PageHeader title="System & activity" sub="Server health, data counts and the log of admin changes" />
      {box}
      {!s ? <p className="muted">{sys.err || 'Loading…'}</p> : (
        <div className="grid-2 admin-cols">
          <Section title="Server">
            <dl className="kv">
              <dt>Version</dt><dd>{s.version}</dd>
              <dt>Running since</dt><dd>{fmtDateTime(s.started)} ({fmtUptime(s.uptime_s)})</dd>
              <dt>Node</dt><dd>{s.node} · {s.env.node_env}</dd>
              <dt>Database</dt><dd>{s.database.version} · {s.database.size}</dd>
              <dt>Uploads</dt><dd>{s.uploads.attachments} files · {fmtBytes(s.uploads.attachment_bytes)} (max {s.env.max_upload_mb} MB each)</dd>
              <dt>Sign-in lasts</dt><dd>{s.env.jwt_ttl}</dd>
              <dt>Migrations</dt><dd>{s.migrations.map((m) => m.name.replace('.sql', '')).join(', ')}</dd>
            </dl>
            <div className="inline-row wrap">
              <button type="button" className="btn small" onClick={() => act(() => api('/admin/system/upgrade-forms', { method: 'POST' }), 'Base forms checked for every team.')}>Re-check base forms for all teams</button>
            </div>
            <p className="muted small">Settings like the upload limit and sign-in length come from the server’s environment variables in Portainer.</p>
          </Section>
          <Section title="Records">
            <table className="table admin-table">
              <thead><tr><th>Type</th><th className="num">Team</th><th className="num">Shared</th></tr></thead>
              <tbody>{s.record_types.map((r) => <tr key={r.type}><td>{r.type.replace(/_/g, ' ')}</td><td className="num">{r.team}</td><td className="num">{r.global || ''}</td></tr>)}</tbody>
            </table>
          </Section>
        </div>
      )}
      <SignInProtection />
      <Section title="Admin activity" actions={(
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Activity filter">
          <option value="">Everything</option><option value="team">Teams</option><option value="plan">Plans</option><option value="user">Users</option>
          <option value="settings">Settings</option><option value="auth">Sign-in</option><option value="list">Pick-lists</option><option value="tracks">Tracks</option><option value="system">System</option>
        </select>
      )}>
        {!log.data ? <p className="muted">{log.err || 'Loading…'}</p> : <ActivityList rows={log.data} />}
      </Section>
    </div>
  );
}

function SignInProtection() {
  const [res, reload] = useLoad(() => api('/admin/lockouts'), []);
  const [act, box] = useAct();
  const d = res.data;
  return (
    <Section title="Sign-in protection" actions={<button type="button" className="btn ghost small" onClick={reload}>Refresh</button>}>
      {box}
      {!d ? <p className="muted">{res.err || 'Loading…'}</p> : (
        <>
          <p className="muted small">
            After {d.limits.account} wrong passwords for one account, or {d.limits.ip} from one address, within {d.limits.windowMinutes} minutes,
            sign-in is locked for {d.limits.lockMinutes} minutes (doubling for repeat lockouts). Change these with the LOGIN_* settings in Portainer.
          </p>
          {!d.entries.length ? <Empty>No failed sign-ins recently.</Empty> : (
            <div className="list">
              {d.entries.map((e) => (
                <div key={e.key} className="list-row">
                  <span className="grow">
                    <span className="row-title">{e.value} <span className="muted small">({e.type})</span></span>
                    <span className="row-sub">{e.locked ? `Locked until ${fmtDateTime(e.until)}` : `${e.fails} of ${e.limit} failed attempts`}</span>
                  </span>
                  {e.locked ? <Pill level="over">Locked</Pill> : <Pill level="warn">Watching</Pill>}
                  <button type="button" className="btn small" onClick={() => act(async () => { await api('/admin/lockouts', { method: 'DELETE', body: { key: e.key } }); reload(); }, `Cleared ${e.value}.`)}>
                    {e.locked ? 'Unlock' : 'Clear'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ---------------- AI assistant ----------------
const usd = (x) => `US$${Number(x || 0).toFixed(Number(x) && Number(x) < 0.1 ? 4 : 2)}`;

export function AdminAi() {
  const [res, reload] = useLoad(() => api('/admin/ai'), []);
  const d = res.data;
  return (
    <div>
      <PageHeader title="AI assistant" sub="Fill from photo, voice debrief and Ask RaceOps — models, allowances and usage" />
      {!d ? <p className="muted">{res.err || 'Loading…'}</p> : <AiSettings d={d} reload={reload} />}
    </div>
  );
}

function AiSettings({ d, reload }) {
  const { refresh } = useSession();
  const s = d.settings;
  const [f, setF] = useState({ enabled: s.enabled, model_fast: s.model_fast, model_smart: s.model_smart, monthly_usd: s.monthly_usd, prices: s.prices });
  const [act, box] = useAct();
  const [test, setTest] = useState(null);
  const ids = d.models.map((m) => m.id);
  const modelSel = (key, label, help) => (
    <div className="field"><label htmlFor={`ai-${key}`}>{label}</label>
      <select id={`ai-${key}`} value={ids.includes(f[key]) ? f[key] : '__custom'} onChange={(e) => setF({ ...f, [key]: e.target.value === '__custom' ? '' : e.target.value })}>
        {d.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        <option value="__custom">Other model ID…</option>
      </select>
      {!ids.includes(f[key]) && <input aria-label={`${label} model ID`} value={f[key]} placeholder="model ID" onChange={(e) => setF({ ...f, [key]: e.target.value.trim() })} />}
      <p className="help">{help}</p>
    </div>
  );
  const save = () => act(async () => { await api('/admin/ai', { method: 'PUT', body: { ...f, monthly_usd: Number(f.monthly_usd) || 0 } }); reload(); refresh(); }, 'AI settings saved.');
  const used = [...new Set([f.model_fast, f.model_smart])].filter(Boolean);
  return (
    <>
      {box}
      <div className="admin-stats">
        <Stat label="Status" value={s.enabled ? 'On' : 'Off'} sub={d.key_configured ? (d.provider === 'mock' ? 'Test provider (mock)' : 'API key configured') : 'No API key — add ANTHROPIC_API_KEY in Portainer'} />
        <Stat label="This month" value={usd(d.month.spent)} sub={`${d.month.requests} requests · estimated`} />
        <Stat label="Tokens" value={`${Math.round((d.month.input_tokens + d.month.output_tokens) / 1000)}k`} sub={`${Math.round(d.month.input_tokens / 1000)}k in · ${Math.round(d.month.output_tokens / 1000)}k out`} />
        <Stat label="Default allowance" value={usd(s.monthly_usd)} sub="per team per month" />
      </div>
      <Section title="Settings">
        <label className="toggle"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /><span>Turn on the AI assistant for teams whose plan includes it</span></label>
        <div className="grid-3">
          {modelSel('model_fast', 'Model for photo fill & debrief', 'Reading photos and tidying debriefs — fast and low cost is best.')}
          {modelSel('model_smart', 'Model for Ask RaceOps', 'Answering questions across your records.')}
          <div className="field"><label htmlFor="ai-month">Default allowance (US$ / team / month)</label>
            <input id="ai-month" inputMode="decimal" value={f.monthly_usd} onChange={(e) => setF({ ...f, monthly_usd: e.target.value.replace(/[^\d.]/g, '') })} />
            <p className="help">Set a different amount per team on Teams & licences. AI stops for the month when it’s reached.</p></div>
        </div>
        <h4 className="sub-head">Prices used for cost estimates (US$ per million tokens)</h4>
        <table className="table admin-table price-table">
          <thead><tr><th>Model</th><th>Input</th><th>Output</th></tr></thead>
          <tbody>
            {used.map((m) => (
              <tr key={m}>
                <td>{d.models.find((x) => x.id === m)?.label || m}</td>
                {['in', 'out'].map((k) => (
                  <td key={k}><input aria-label={`${m} ${k === 'in' ? 'input' : 'output'} price`} inputMode="decimal" value={f.prices[m]?.[k] ?? ''}
                    onChange={(e) => setF({ ...f, prices: { ...f.prices, [m]: { ...(f.prices[m] || { in: 0, out: 0 }), [k]: e.target.value.replace(/[^\d.]/g, '') } } })} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Check current prices at platform.claude.com/docs — estimates here are for allowances only; your Anthropic invoice is the real cost.</p>
        <div className="inline-row end">
          <button type="button" className="btn small" onClick={() => act(async () => { const r = await api('/admin/ai/test', { method: 'POST' }); setTest(r); reload(); })}>Test connection</button>
          <button type="button" className="btn primary small" onClick={save}>Save AI settings</button>
        </div>
        {test && <div className={`notice ${test.ok ? 'info' : 'error'}`}>{test.ok ? `Connected to ${test.model} in ${test.ms} ms — replied “${test.reply}”.` : `Test failed (${test.model}): ${test.error}`}</div>}
      </Section>
      <div className="grid-2 admin-cols">
        <Section title="Teams this month">
          <table className="table admin-table">
            <thead><tr><th>Team</th><th className="num">Requests</th><th className="num">Spent</th><th>Allowance</th></tr></thead>
            <tbody>{d.teams.map((t) => (
              <tr key={t.id}><td>{t.name}{t.ai_off ? <span className="muted small"> · off by team</span> : null}</td><td className="num">{t.requests}</td><td className="num">{usd(t.spent)}</td>
                <td><PoolBar used={t.spent} pool={t.budget} text={`${usd(t.spent)} of ${usd(t.budget)}`} /></td></tr>
            ))}</tbody>
          </table>
        </Section>
        <Section title="Recent requests">
          {!d.recent.length ? <Empty>No AI requests yet.</Empty> : (
            <div className="list activity">
              {d.recent.map((r) => (
                <div key={r.id} className="list-row">
                  <span className="grow">
                    <span className="row-title">{AI_FEATURES[r.feature] || r.feature}{r.team ? ` — ${r.team}` : ''} {!r.ok && <Pill level="over">Failed</Pill>}</span>
                    <span className="row-sub">{r.user_name || 'Unknown'} · {fmtDateTime(r.at)} · {r.model} · {r.input_tokens + r.output_tokens} tokens · {usd(r.cost_usd)}{r.error ? ` · ${r.error}` : ''}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

export const ADMIN_ICON = I.admin;
