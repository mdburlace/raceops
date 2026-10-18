import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { SyncBadge } from './ui.jsx';

const I = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  sheet: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h4',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  car: 'M4 16v-4l2-5h12l2 5v4M4 16h16M4 16v2m16-2v2M7 13h.01M17 13h.01',
  form: 'M4 5h16M4 12h16M4 19h10',
  users: 'M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1a3 3 0 0 0-3-3M17 5a3 3 0 0 1 0 6',
  key: 'M15 7a4 4 0 1 1-3.9 5H3v3h3v-3m9-5h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0',
  menu: 'M4 6h16M4 12h16M4 18h16',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
};
export const Icon = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

export default function Layout() {
  const { user, memberships, membership, switchTenant, can, canType } = useSession();
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();

  const main = [
    { to: '/', label: 'Home', icon: I.home, end: true },
    canType('event', 'view') && { to: '/events', label: 'Events', icon: I.flag },
    canType('setup', 'view') && { to: '/setups', label: 'Setups', icon: I.sheet },
    canType('maintenance', 'view') && { to: '/maintenance', label: 'Maint.', full: 'Maintenance', icon: I.wrench },
    canType('asset', 'view') && { to: '/assets', label: 'Assets', icon: I.box },
  ].filter(Boolean);
  const more = [
    canType('car', 'view') && { to: '/cars', label: 'Cars', icon: I.car },
    { to: '/forms', label: 'Forms', icon: I.form },
    { to: '/team', label: 'Team & invites', icon: I.users },
    (can('roles.manage') || membership?.role.is_owner) && { to: '/roles', label: 'Roles & permissions', icon: I.key },
    user?.is_platform_admin && { to: '/admin/teams', label: 'All teams', icon: I.globe },
    { to: '/profile', label: 'Profile & device', icon: I.user },
  ].filter(Boolean);

  const link = (n) => (
    <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setDrawer(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      <Icon d={n.icon} /><span>{n.full || n.label}</span>
    </NavLink>
  );

  return (
    <div className="shell">
      <aside className={`sidebar${drawer ? ' open' : ''}`}>
        <div className="brand"><span className="brand-mark">RO</span><span>RaceOps</span></div>
        {memberships.length > 1 ? (
          <select className="team-switch" value={membership?.tenant_id} onChange={(e) => { switchTenant(e.target.value); setDrawer(false); }}>
            {memberships.map((m) => <option key={m.tenant_id} value={m.tenant_id}>{m.tenant_name}</option>)}
          </select>
        ) : <div className="team-name">{membership?.tenant_name}</div>}
        <nav>{main.map(link)}<div className="nav-sep" />{more.map(link)}</nav>
        <div className="sidebar-foot">
          <span className="muted small">{user?.name} · {membership?.role.name}</span>
        </div>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
      <div className="main-col">
        <div className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setDrawer(true)} aria-label="Menu"><Icon d={I.menu} /></button>
          <span className="topbar-team">{membership?.tenant_name}</span>
          <SyncBadge />
        </div>
        <main key={loc.pathname.split('/')[1]} className="content"><Outlet /></main>
        <nav className="tabbar">{main.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            <Icon d={n.icon} size={22} /><span>{n.label}</span>
          </NavLink>
        ))}</nav>
      </div>
    </div>
  );
}
