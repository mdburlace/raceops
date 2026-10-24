import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Empty, PageHeader, Section, useOnline } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { fmtDate, fmtDateTime } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { fullResync, getSyncStatus, repairDevice, subscribeSync, syncNow } from '../lib/sync.js';
import { TeamAiSection } from '../components/Ai.jsx';
import { ACTIONS, ADMIN_PERMISSIONS, AREAS, MODULES, SPECIAL_PERMISSIONS, MODULE, moduleActions } from '@shared/catalog.js';
import { CURRENCIES, REGIONS, regionOf } from '@shared/regions.js';
import { CONNECTORS, FINANCE_CATEGORIES } from '@shared/accounting.js';
import { Appearance } from '../components/Appearance.jsx';
import { ShopSettings } from './Shop.jsx';
import { Avatar, PhotoButtons } from '../components/Avatar.jsx';
import { teamPhotoUrl, userPhotoUrl } from '../lib/photos.js';

export function OnlineOnly({ children }) {
  const online = useOnline();
  return online ? children : <div className="notice">Team administration needs an internet connection.</div>;
}

export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, err: '' });
  const reload = () => fn().then((data) => setState({ data, err: '' })).catch((e) => setState({ data: null, err: e.message }));
  useEffect(() => { reload(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return [state, reload];
}

/** A practice team: what it's for, and putting the demo data back. */
function PracticeReset({ canReset }) {
  const { tid } = useSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const reset = async () => {
    if (!window.confirm('Reset the practice team? Everything added or changed here is removed and the demo data comes back.')) return;
    setBusy(true); setMsg(null);
    try { await api(`/t/${tid}/practice/reset`, { method: 'POST' }); await syncNow(); setMsg({ ok: true, text: 'Practice data reset.' }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <Section title="Practice team">
      <p>This team is for training. It comes with demo cars, setup sheets, parts, maintenance schedules and an engine shop job, used by the exercises in <Link to="/help/training">Training</Link>.</p>
      {msg && <div className={`notice small ${msg.ok ? 'info' : 'error'}`} role="status">{msg.text}</div>}
      {canReset && <button type="button" className="btn ghost danger" disabled={busy} onClick={reset}>{busy ? 'Resetting…' : 'Reset practice data'}</button>}
    </Section>
  );
}

export function Team() {
  const { tid, user, can, membership, refresh, logout } = useSession();
  const manage = can('members.manage');
  const [members, reloadMembers] = useLoad(() => api(`/t/${tid}/members`), [tid]);
  const [roles] = useLoad(() => api(`/t/${tid}/roles`), [tid]);
  const [invites, reloadInvites] = useLoad(() => (manage ? api(`/t/${tid}/invites`) : Promise.resolve([])), [tid, manage]);
  const [inv, setInv] = useState({ email: '', role_id: '' });
  const [teamName, setTeamName] = useState(membership?.tenant_name || '');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const nav = useNavigate();

  const link = (token) => `${window.location.origin}/invite/${token}`;
  const copy = async (token) => {
    try { await navigator.clipboard.writeText(link(token)); setCopied(token); } catch { window.prompt('Copy this invite link', link(token)); }
  };
  const act = async (fn) => { setErr(''); try { await fn(); } catch (e) { setErr(e.message); } };

  return (
    <div>
      <PageHeader title="Team" sub={membership?.tenant_name} />
      <OnlineOnly>
        {err && <div className="notice error">{err}</div>}
        <Section title="Team profile">
          <div className="profile-row" data-testid="team-profile">
            <Avatar src={teamPhotoUrl(tid, membership?.settings?.photo?.at)} name={membership?.tenant_name} size={112} square testid="team-photo" />
            <div className="stack">
              <span className="row-title">{membership?.tenant_name}</span>
              {can('team.photo') || can('team.manage')
                ? <PhotoButtons path={`/t/${tid}/photo`} has={!!membership?.settings?.photo?.at} label="team photo" onDone={() => refresh()} />
                : <p className="muted small">{membership?.settings?.photo?.at ? 'The team photo' : 'A team photo'} is added by the team manager, or a role they give <b>Change the team photo</b>.</p>}
              <p className="muted small">A team picture, car shot or logo. It shows on this page and beside the team’s name in the menu.</p>
            </div>
          </div>
        </Section>
        <Section title="Licence">
          <dl className="kv">
            <dt>Plan</dt><dd>{membership?.plan_label || membership?.plan}</dd>
            <dt>Seats</dt><dd>{members.data ? members.data.length : '…'} member{members.data?.length === 1 ? '' : 's'}{(invites.data || []).length ? ` + ${invites.data.length} pending invite${invites.data.length === 1 ? '' : 's'}` : ''} · {membership?.seat_limit == null ? 'unlimited seats' : `${membership.seat_limit} seats`}</dd>
            <dt>Licence</dt><dd>{{ active: 'Active', trial: 'Trial', expired: 'Expired — read-only', suspended: 'Suspended' }[membership?.licence] || 'Active'}{membership?.licence_expires ? ` · ends ${fmtDate(membership.licence_expires)}` : ''}</dd>
          </dl>
          <p className="muted small">Your platform administrator manages plans, seats and licence dates.</p>
        </Section>
        <TeamAiSection Section={Section} />
        <ShopSettings />
        {membership?.settings?.practice && <PracticeReset canReset={can('team.manage') || !!user?.is_platform_admin} />}
        {can('team.manage') && (
          <Section title="Team settings">
            <div className="inline-row">
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} />
              <button type="button" className="btn" onClick={() => act(async () => { await api(`/t/${tid}`, { method: 'PATCH', body: { name: teamName } }); await refresh(); })}>Rename</button>
            </div>
          </Section>
        )}
        {can('team.manage') && <RegionSettings />}
        {manage && (
          <Section title="Invite someone">
            <form className="inline-row wrap" onSubmit={(e) => { e.preventDefault(); act(async () => { const r = await api(`/t/${tid}/invites`, { method: 'POST', body: inv }); setInv({ email: '', role_id: inv.role_id }); await reloadInvites(); copy(r.token); }); }}>
              <input type="email" required placeholder="crew@example.com" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
              <select required value={inv.role_id} onChange={(e) => setInv({ ...inv, role_id: e.target.value })}>
                <option value="">Role…</option>
                {(roles.data || []).filter((r) => !r.is_owner || membership.role.is_owner).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button className="btn primary">Create invite link</button>
            </form>
            <p className="muted small">The link is copied for you to send by text, email or WhatsApp. It works for a limited time (shown below), and people already on another team can use it to add this team to their account.</p>
            {(invites.data || []).length > 0 && (
              <div className="list">
                {invites.data.map((i) => (
                  <div key={i.id} className="list-row">
                    <span className="grow"><span className="row-title">{i.email}</span><span className="row-sub">{i.role_name} · expires {fmtDate(i.expires_at)}</span></span>
                    <button type="button" className="btn small" onClick={() => copy(i.token)}>{copied === i.token ? 'Copied ✓' : 'Copy link'}</button>
                    <button type="button" className="btn small ghost danger" onClick={() => act(async () => { await api(`/t/${tid}/invites/${i.id}`, { method: 'DELETE' }); reloadInvites(); })}>Revoke</button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}
        <Section title="Members">
          {!members.data ? <p className="muted">{members.err || 'Loading…'}</p> : (
            <div className="list">
              {members.data.map((m) => (
                <div key={m.id} className="list-row member-row" data-testid="member-row">
                  <Avatar src={userPhotoUrl(m.id, m.photo_at)} name={m.name} size={44} testid="member-photo" />
                  <span className="grow"><span className="row-title">{m.name}{m.id === user.id ? ' (you)' : ''}</span><span className="row-sub">{m.email}</span>
                    {(m.id === user.id || (manage && (!(m.role_id && (roles.data || []).find((x) => x.id === m.role_id)?.is_owner) || membership?.role?.is_owner))) && (
                      <PhotoButtons small path={m.id === user.id ? '/me/photo' : `/t/${tid}/members/${m.id}/photo`} has={!!m.photo_at} label="photo"
                        onDone={async () => { await reloadMembers(); if (m.id === user.id) await refresh(); }} />
                    )}</span>
                  {manage && m.id !== user.id ? (
                    <span className="role-pick">
                      <select aria-label={`${m.name}’s main role`} value={m.role_id} onChange={(e) => act(async () => { await api(`/t/${tid}/members/${m.id}`, { method: 'PATCH', body: { role_id: e.target.value } }); reloadMembers(); })}>
                        {(roles.data || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      {(m.extra_role_ids || []).map((rid) => {
                        const r = (roles.data || []).find((x) => x.id === rid);
                        return r ? (
                          <button type="button" key={rid} className="chip" title="Remove this extra role"
                            onClick={() => act(async () => { await api(`/t/${tid}/members/${m.id}`, { method: 'PATCH', body: { extra_role_ids: m.extra_role_ids.filter((x) => x !== rid) } }); reloadMembers(); })}>+ {r.name} ×</button>
                        ) : null;
                      })}
                      <select aria-label={`Add a role for ${m.name}`} value="" onChange={(e) => e.target.value && act(async () => { await api(`/t/${tid}/members/${m.id}`, { method: 'PATCH', body: { extra_role_ids: [...(m.extra_role_ids || []), e.target.value] } }); reloadMembers(); })}>
                        <option value="">+ Also…</option>
                        {(roles.data || []).filter((r) => !r.is_owner && r.id !== m.role_id && !(m.extra_role_ids || []).includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </span>
                  ) : <span className="pill pill-info">{[m.role_name, ...(m.extra_role_names || [])].join(' + ')}</span>}
                  {(manage || m.id === user.id) && (
                    <button type="button" className="btn small ghost danger" onClick={() => act(async () => {
                      if (!window.confirm(m.id === user.id ? 'Leave this team?' : `Remove ${m.name} from the team?`)) return;
                      await api(`/t/${tid}/members/${m.id}`, { method: 'DELETE' });
                      if (m.id === user.id) { await refresh(); nav('/'); } else reloadMembers();
                    })}>{m.id === user.id ? 'Leave' : 'Remove'}</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </OnlineOnly>
      <p className="muted small">Signed in as {user.email}. <button type="button" className="link" onClick={() => logout()}>Sign out</button></p>
    </div>
  );
}

export function Roles() {
  const { tid, can, licensed } = useSession();
  const manage = can('roles.manage');
  const [roles, reload] = useLoad(() => api(`/t/${tid}/roles`), [tid]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');

  const save = async () => {
    setErr(''); setSaved('');
    try {
      const body = { name: edit.name, description: edit.description, permissions: edit.permissions };
      const r = edit.id ? await api(`/t/${tid}/roles/${edit.id}`, { method: 'PATCH', body }) : await api(`/t/${tid}/roles`, { method: 'POST', body });
      setEdit({ ...r }); setSaved('Saved — members get the new access next time their app syncs.'); reload();
    } catch (e) { setErr(e.message); }
  };
  const addStandard = async () => {
    setErr(''); setSaved('');
    try {
      const r = await api(`/t/${tid}/roles/standard`, { method: 'POST' });
      setSaved(r.added.length ? `Added: ${r.added.join(', ')}.` : 'This team already has every standard role.');
      reload();
    } catch (e) { setErr(e.message); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete role “${edit.name}”?`)) return;
    try { await api(`/t/${tid}/roles/${edit.id}`, { method: 'DELETE' }); setEdit(null); reload(); } catch (e) { setErr(e.message); }
  };
  const has = (p) => edit?.permissions.includes(p);
  const toggle = (p, on) => setEdit((e) => {
    let perms = new Set(e.permissions);
    if (on) perms.add(p); else perms.delete(p);
    const [m, a] = p.split('.');
    // edit/delete imply view; removing view removes edit/delete
    if (on && (a === 'edit' || a === 'delete')) perms.add(`${m}.view`);
    if (!on && a === 'view') { perms.delete(`${m}.edit`); perms.delete(`${m}.delete`); for (const x of [...perms]) if (x.startsWith(`${m}.part.`)) perms.delete(x); }
    return { ...e, permissions: [...perms] };
  });

  return (
    <div>
      {saved && !edit && <div className="notice info" role="status">{saved}</div>}
      <PageHeader title="Roles & permissions" sub="Decide what each role can see and change">
        {manage && <button type="button" className="btn" onClick={addStandard} title="Adds the built-in roles this team doesn't have yet">Add standard roles</button>}
        {manage && <button type="button" className="btn primary" onClick={() => { setEdit({ name: '', description: '', permissions: [] }); setSaved(''); }}>New role</button>}
      </PageHeader>
      <OnlineOnly>
        {err && <div className="notice error">{err}</div>}
        <div className="grid-roles">
          <div className="card list">
            {(roles.data || []).map((r) => (
              <button type="button" key={r.id} className={`list-row as-btn${edit?.id === r.id ? ' selected' : ''}`} onClick={() => { setEdit({ ...r }); setSaved(''); setErr(''); }}>
                <span className="grow"><span className="row-title">{r.name}</span><span className="row-sub">{r.description}</span></span>
                <span className="row-meta">{r.members} member{r.members === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
          {edit ? (
            <section className="card">
              {edit.is_owner ? (
                <><h3>{edit.name}</h3><p className="muted">Owners always have full access to everything, including roles and billing in future releases.</p></>
              ) : (
                <>
                  <div className="field-grid">
                    <div className="field"><label>Role name</label><input disabled={!manage} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                    <div className="field"><label>Description</label><input disabled={!manage} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
                  </div>
                  <table className="table perm-table">
                    <thead><tr><th>Area / module</th>{ACTIONS.map((a) => <th key={a}>{a[0].toUpperCase() + a.slice(1)}</th>)}</tr></thead>
                    <tbody>
                      {[{ key: null, label: 'Shared data' }, ...AREAS].map((ar) => {
                        const mods = MODULES.filter((m) => m.area === ar.key);
                        const areaOn = !ar.key || has(`area.${ar.key}`);
                        return [
                          <tr key={`a-${ar.key}`} className="area-row">
                            <th scope="row" colSpan={ACTIONS.length + 1}>
                              {ar.key ? (
                                <label className="toggle small"><input type="checkbox" disabled={!manage} checked={has(`area.${ar.key}`)} onChange={(e) => toggle(`area.${ar.key}`, e.target.checked)} />
                                  <span>{ar.label}</span></label>
                              ) : <span>{ar.label}</span>}
                              {ar.key && !licensed(ar.key) && <small className="muted"> — not in your plan</small>}
                            </th>
                          </tr>,
                          ...mods.map((m) => (
                            <tr key={m.key} className={areaOn ? '' : 'dim'}>
                              <th scope="row" className="mod-name">{m.label}{m.feature && !licensed(m.feature) && <small className="muted"> (not in plan)</small>}</th>
                              {ACTIONS.map((a) => (
                                <td key={a}>{moduleActions(m).includes(a) && (
                                  <input type="checkbox" aria-label={`${m.label} ${a}`} disabled={!manage || !areaOn} checked={has(`${m.key}.${a}`)} onChange={(e) => toggle(`${m.key}.${a}`, e.target.checked)} />
                                )}</td>
                              ))}
                            </tr>
                          )),
                        ];
                      })}
                    </tbody>
                  </table>
                  <h4 className="subhead">Other rights</h4>
                  <p className="muted small">Part rights let a role that can only view setup sheets change just those sections.</p>
                  {SPECIAL_PERMISSIONS.map((p) => {
                    const needView = p.module && p.key !== 'purchases.approve' && !has(`${p.module}.view`);
                    return (
                      <label key={p.key} className={`toggle block${needView ? ' dim' : ''}`}><input type="checkbox" disabled={!manage || needView} checked={has(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} />
                        <span>{p.label}{needView ? <small className="muted"> — needs {MODULE[p.module]?.label} → view</small> : null}</span></label>
                    );
                  })}
                  <h4 className="subhead">Administration</h4>
                  {ADMIN_PERMISSIONS.map((p) => (
                    <label key={p.key} className="toggle block"><input type="checkbox" disabled={!manage} checked={has(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} /><span>{p.label}</span></label>
                  ))}
                  {manage && (
                    <div className="inline-row end">
                      {saved && <span className="muted small">{saved}</span>}
                      {edit.id && <button type="button" className="btn ghost danger" onClick={remove}>Delete role</button>}
                      <button type="button" className="btn primary" onClick={save} disabled={!edit.name}>Save role</button>
                    </div>
                  )}
                </>
              )}
            </section>
          ) : <Empty>Select a role to see its permissions.</Empty>}
        </div>
      </OnlineOnly>
    </div>
  );
}

export function Profile() {
  const { user, logout, tid, refresh, prefs, setPrefs } = useSession();
  const sync = useSyncExternalStore(subscribeSync, getSyncStatus);
  const online = useOnline();
  const [name, setName] = useState(user?.name || '');
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [msg, setMsg] = useState('');
  const [installEvt, setInstallEvt] = useState(window.__raceopsInstall || null);
  useEffect(() => {
    const h = () => setInstallEvt(window.__raceopsInstall);
    window.addEventListener('raceops:installable', h);
    return () => window.removeEventListener('raceops:installable', h);
  }, []);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
  const act = async (fn, ok) => { setMsg(''); try { await fn(); setMsg(ok); } catch (e) { setMsg(e.message); } };

  return (
    <div>
      <PageHeader title="Profile & device" />
      {msg && <div className="notice info">{msg}</div>}
      <div className="grid-2">
        <Section title="Your photo">
          <div className="profile-row" data-testid="my-photo">
            <Avatar src={userPhotoUrl(user?.id, user?.photo_at)} name={user?.name} size={96} testid="profile-photo" />
            <div className="stack">
              {online ? <PhotoButtons path="/me/photo" has={!!user?.photo_at} label="photo" onDone={() => refresh()} /> : <p className="muted small">Adding a photo needs a connection.</p>}
              <p className="muted small">Your teammates see it beside your name. Your team manager can add or change it too.</p>
            </div>
          </div>
        </Section>
        <Section title="Email notifications">
          <label className="check-row"><input type="checkbox" checked={prefs.email_notices !== false} onChange={(e) => setPrefs({ email_notices: e.target.checked })} />
            Email me about shared-calendar requests, the series and tracks my team follows, and my feedback</label>
          <p className="muted small">Only when this server has email set up. Requests go to people who can edit the calendar.</p>
        </Section>
        <Section title="Install on this device">
          {standalone ? <p>Installed — RaceOps opens full screen and works offline.</p> : installEvt ? (
            <button type="button" className="btn primary" onClick={async () => { installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); }}>Install app</button>
          ) : (
            <ul className="tips">
              <li><b>iPhone / iPad (Safari):</b> Share → Add to Home Screen.</li>
              <li><b>Android (Chrome):</b> ⋮ menu → Install app / Add to Home screen.</li>
              <li><b>Desktop (Chrome / Edge):</b> install icon in the address bar.</li>
            </ul>
          )}
          <p className="muted small">Once you have opened the app online, it keeps working with no signal. Changes queue on the device and sync when you're back online. Photos and files need a connection.</p>
        </Section>
        <Section title="Sync">
          <dl className="kv">
            <dt>Status</dt><dd>{sync.state}{sync.error ? ` — ${sync.error}` : ''}</dd>
            <dt>Waiting to sync</dt><dd>{sync.pending}</dd>
            <dt>Last synced</dt><dd>{sync.lastSync ? fmtDateTime(sync.lastSync) : '—'}</dd>
          </dl>
          {sync.stuck && (
            <div className="notice">The server is answering, but this device still can't sync. Something stale is stored on
              this device — tap <b>Repair this device</b> to fix it.</div>
          )}
          <div className="inline-row wrap">
            <button type="button" className="btn" disabled={!online} onClick={() => syncNow()}>Sync now</button>
            <button type="button" className="btn ghost" disabled={!online} onClick={() => fullResync(tid)}>Re-download all data</button>
            <button type="button" className={`btn ${sync.stuck ? 'primary' : 'ghost'}`} disabled={!online} onClick={() => {
              const kept = sync.pending ? ` Your ${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting to sync will be kept.` : '';
              if (!window.confirm(`Repair this device? This clears the app's stored files and cached data on this device, then reloads and downloads your team's data again. You stay signed in.${kept}`)) return;
              act(() => repairDevice(tid), 'Repairing…');
            }}>Repair this device</button>
          </div>
          <p className="muted small">Use <b>Repair this device</b> if the app shows <b>Offline</b> on this device while it works on others.</p>
        </Section>
        <Section title="Your details">
          <div className="inline-row">
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <button type="button" className="btn" disabled={!online} onClick={() => act(async () => { await api('/me', { method: 'PATCH', body: { name } }); await refresh(); }, 'Name updated.')}>Save</button>
          </div>
          <p className="muted small">{user?.email}</p>
        </Section>
        <Section title="Change password">
          <form className="stack" onSubmit={(e) => { e.preventDefault(); act(async () => { await api('/me', { method: 'PATCH', body: pw }); setPw({ current_password: '', new_password: '' }); }, 'Password changed.'); }}>
            <input type="password" placeholder="Current password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
            <input type="password" placeholder="New password (8+ characters)" autoComplete="new-password" minLength={8} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
            <button className="btn" disabled={!online || !pw.new_password}>Change password</button>
          </form>
        </Section>
      </div>
      <Appearance />
      <button type="button" className="btn ghost danger" onClick={() => logout()}>Sign out of this device</button>
    </div>
  );
}

/** Team → Region & currency: the region pack (tax, licence classes, work-hour rules), currency and accounting codes. */
function RegionSettings() {
  const { tid, membership, refresh } = useSession();
  const st = membership?.settings || {};
  const [f, setF] = useState(() => ({ region: regionOf(st).key, currency: st.currency || '', tax_rate: st.tax_rate ?? '', entity_name: st.entity_name || '',
    connector: st.accounting?.connector || '', accounts: st.accounting?.accounts || {} }));
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  const r = REGIONS[f.region];
  const save = async () => {
    setMsg('');
    try {
      const settings = { ...(membership.settings || {}), region: f.region, currency: f.currency || undefined, tax_rate: f.tax_rate === '' ? undefined : Number(f.tax_rate), entity_name: f.entity_name || undefined,
        accounting: { connector: f.connector || undefined, accounts: Object.fromEntries(Object.entries(f.accounts).filter(([, x]) => x)) } };
      await api(`/t/${tid}`, { method: 'PATCH', body: { settings } });
      await refresh(); setMsg('Saved.');
    } catch (e) { setMsg(e.message); }
  };
  return (
    <Section title="Region & currency">
      <div className="field-grid">
        <div className="field"><label htmlFor="rg-region">Region</label>
          <select id="rg-region" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
            {Object.entries(REGIONS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
          </select></div>
        <div className="field"><label htmlFor="rg-cur">Currency</label>
          <select id="rg-cur" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
            <option value="">{r.currency} (the region’s)</option>
            {CURRENCIES.filter((c) => c !== r.currency).map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div className="field"><label htmlFor="rg-tax">{r.tax.name} rate (%)</label>
          <input id="rg-tax" inputMode="decimal" placeholder={String(r.tax.rate)} value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })} />
          {r.tax.varies && <small className="help">Varies by {f.region === 'US' ? 'state' : 'country'} — enter yours.</small>}</div>
        <div className="field"><label htmlFor="rg-ent">Business name (for exports)</label>
          <input id="rg-ent" value={f.entity_name} onChange={(e) => setF({ ...f, entity_name: e.target.value })} /></div>
      </div>
      <p className="muted small">{r.label}: {r.tax.name}, {r.business_no} on receipts, heavy-vehicle licences {r.heavy_classes.join(', ')}, {r.hours.name}, {r.inspections.join(', ')}. These are starting points, not compliance advice — check your country’s rules.</p>
      <button type="button" className="btn ghost small" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} accounting export settings</button>
      {open && (
        <div className="field-grid">
          <div className="field"><label htmlFor="rg-conn">Accounting software</label>
            <select id="rg-conn" value={f.connector} onChange={(e) => setF({ ...f, connector: e.target.value })}>
              <option value="">Suggested for the region ({CONNECTORS.find((c) => c.key === r.accounting[0])?.label})</option>
              {CONNECTORS.filter((c) => !c.future).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select></div>
          {FINANCE_CATEGORIES.map((c) => (
            <div key={c} className="field"><label htmlFor={`acc-${c}`}>Account code: {c}</label>
              <input id={`acc-${c}`} value={f.accounts[c] || ''} onChange={(e) => setF({ ...f, accounts: { ...f.accounts, [c]: e.target.value } })} /></div>
          ))}
        </div>
      )}
      <div className="inline-row end">{msg && <span className="muted small">{msg}</span>}<button type="button" className="btn primary" onClick={save}>Save region & currency</button></div>
    </Section>
  );
}
