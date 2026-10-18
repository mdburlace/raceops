import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { SyncBadge } from './ui.jsx';

export const I = {
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
  track: 'M4 17c0-6 4-10 8-10s8 4 8 10M7 17c0-4 2.2-7 5-7s5 3 5 7M3 17h18',
  shop: 'M3 21V9l9-6 9 6v12M7 21v-6h10v6M7 18h10',
  engine: 'M4 9h3l2-2h5l2 2h2v3h2v-2h1v6h-1v-2h-2v3h-3l-2 2H9l-2-2H4zM2 11v4',
  team: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z',
  check: 'M4 12l5 5L20 6',
  gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  wave: 'M2 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0 2 3 2 3',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6',
  pin: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  book: 'M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h11M9 8h5',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
};
export const Icon = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

export const AREA_ICON = { track: I.track, workshop: I.shop, engines: I.engine, team: I.team };
export const AREA_PATH = { track: '/track', workshop: '/workshop', engines: '/engines', team: '/team' };

/** Navigation tree; each link declares what it needs so locked items disappear. */
export function useNav() {
  const { can, canArea, canModule, user, membership } = useSession();
  const admin = can('members.manage') || can('roles.manage') || can('forms.manage') || can('team.manage');
  const groups = [
    { area: 'track', label: 'At the Track', icon: I.track, show: canArea('track'), links: [
      canModule('events') && { to: '/events', label: 'Events', icon: I.flag },
      canModule('events') && { to: '/series', label: 'Series', icon: I.trophy },
      canModule('tracks') && { to: '/tracks', label: 'Tracks', icon: I.pin },
      canModule('setups') && { to: '/setups', label: 'Setup sheets', icon: I.sheet },
      canModule('trackside') && { to: '/track/checks', label: 'Between-round checks', icon: I.check },
      canModule('gears') && { to: '/track/gears', label: 'Gears & tires', icon: I.gear },
    ] },
    { area: 'workshop', label: 'In the Workshop', icon: I.shop, show: canArea('workshop'), links: [
      canModule('maintenance') && { to: '/maintenance', label: 'Car maintenance', icon: I.wrench },
      canModule('assets') && { to: '/assets', label: 'Assets', icon: I.box },
      canModule('dyno') && { to: '/workshop/dyno', label: 'Shock & bar dyno', icon: I.wave },
    ] },
    { area: 'engines', label: 'Engine Builds', icon: I.engine, show: canArea('engines'), links: [
      canModule('engines') && { to: '/engines', label: 'Engines & builds', icon: I.engine, end: true },
    ] },
    { area: 'team', label: 'Team Management', icon: I.team, show: canArea('team') || admin, links: [
      canModule('cars') && { to: '/cars', label: 'Cars', icon: I.car },
      canModule('contacts') && { to: '/contacts', label: 'Contacts', icon: I.book },
      canModule('contacts') && { to: '/suppliers', label: 'Suppliers', icon: I.truck },
      { to: '/team/members', label: 'Members & invites', icon: I.users },
      (can('roles.manage') || membership?.role.is_owner) && { to: '/roles', label: 'Roles & permissions', icon: I.key },
      { to: '/forms', label: 'Forms', icon: I.form },
      canModule('reports') && { to: '/team/reports', label: 'Reports', icon: I.chart },
      canModule('reports') && { to: '/team/stats', label: 'Crew Chief stats', icon: I.star },
      canModule('reviews') && { to: '/team/reviews', label: 'Performance reviews', icon: I.user },
      user?.is_platform_admin && { to: '/admin/teams', label: 'All teams & licences', icon: I.globe },
    ] },
  ].map((g) => ({ ...g, links: g.links.filter(Boolean) }));
  return groups.filter((g) => g.show && g.links.length);
}

export default function Layout() {
  const { user, memberships, membership, switchTenant } = useSession();
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  const groups = useNav();

  const link = (n) => (
    <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setDrawer(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      <Icon d={n.icon} size={18} /><span>{n.label}</span>
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
        <nav>
          <NavLink to="/" end onClick={() => setDrawer(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Icon d={I.home} size={18} /><span>Home</span></NavLink>
          {groups.map((g) => (
            <div key={g.area} className="nav-group">
              <NavLink to={AREA_PATH[g.area]} end onClick={() => setDrawer(false)} className={({ isActive }) => `nav-area area-${g.area}${isActive ? ' active' : ''}`}>
                <Icon d={g.icon} size={16} /><span>{g.label}</span>
              </NavLink>
              {g.links.filter((l) => l.to !== AREA_PATH[g.area]).map(link)}
            </div>
          ))}
          <div className="nav-sep" />
          {link({ to: '/profile', label: 'Profile & device', icon: I.user })}
        </nav>
        <div className="sidebar-foot"><span className="muted small">{user?.name} · {membership?.role.name}</span></div>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
      <div className="main-col">
        <div className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setDrawer(true)} aria-label="Menu"><Icon d={I.menu} /></button>
          <span className="topbar-team">{membership?.tenant_name}</span>
          <SyncBadge />
        </div>
        <main key={loc.pathname.split('/')[1]} className="content"><Outlet /></main>
        <nav className="tabbar">
          <NavLink to="/" end className={({ isActive }) => `tab${isActive ? ' active' : ''}`}><Icon d={I.home} size={22} /><span>Home</span></NavLink>
          {groups.map((g) => {
            const active = g.links.some((l) => loc.pathname === l.to || loc.pathname.startsWith(`${l.to}/`)) || loc.pathname.startsWith(AREA_PATH[g.area]);
            return (
              <NavLink key={g.area} to={AREA_PATH[g.area]} className={`tab area-${g.area}${active ? ' active' : ''}`}>
                <Icon d={g.icon} size={22} /><span>{{ track: 'Track', workshop: 'Workshop', engines: 'Engines', team: 'Team' }[g.area]}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
