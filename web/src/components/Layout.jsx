import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { SyncBadge, useHeightVar } from './ui.jsx';
import { teamType } from '@shared/shop.js';
import { APP_VERSION } from '../lib/releases.js';

export const I = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
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
  admin: 'M12 2l8 4v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6zM9 12l2 2 4-4',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  ticket: 'M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3zM13 4v16',
  chevron: 'M6 9l6 6 6-6',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.9M12 17h.01',
  calc: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 6h8v3H8zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01',
  palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.1-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01',
  idea: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3',
  backup: 'M7 18a4.5 4.5 0 0 1-.7-8.9A6 6 0 0 1 17.8 8 4.5 4.5 0 0 1 17 18M12 11v9M9 14l3-3 3 3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  spark: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9zM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z',
};
export const Icon = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

export const AREA_ICON = { track: I.track, workshop: I.shop, engines: I.engine, team: I.team, admin: I.admin };
export const AREA_PATH = { track: '/track', workshop: '/workshop', engines: '/engines', team: '/team', admin: '/admin' };
const TAB_LABEL = { track: 'Track', workshop: 'Workshop', engines: 'Engines', team: 'Team', admin: 'Admin' };
const tabLabel = (g) => (g.area === 'engines' && g.label === 'Engine Shop' ? 'Shop' : TAB_LABEL[g.area]);

export const ADMIN_LINKS = [
  { to: '/admin', label: 'Overview', icon: I.admin, end: true },
  { to: '/admin/teams', label: 'Teams & licences', icon: I.users },
  { to: '/admin/plans', label: 'Plans & allocation', icon: I.ticket },
  { to: '/admin/users', label: 'Users', icon: I.user },
  { to: '/admin/directory', label: 'Tracks & directory', icon: I.globe },
  { to: '/admin/calendar', label: 'Shared calendars', icon: I.calendar },
  { to: '/admin/feedback', label: 'Feedback & ideas', icon: I.idea },
  { to: '/admin/lists', label: 'Pick-lists', icon: I.list },
  { to: '/admin/ai', label: 'AI assistant', icon: I.spark },
  { to: '/admin/settings', label: 'Settings', icon: I.sliders },
  { to: '/admin/backups', label: 'Backups', icon: I.backup },
  { to: '/admin/deleted', label: 'Recently deleted', icon: I.trash },
  { to: '/admin/system', label: 'System & activity', icon: I.server },
];

/** Navigation tree; each link declares what it needs so locked items disappear. */
export function useNav() {
  const { can, canArea, canModule, user, membership, notices } = useSession();
  const admin = can('members.manage') || can('roles.manage') || can('forms.manage') || can('team.manage');
  // engine shops see jobs and customers; shops that don't race don't see the race-team pages
  const type = teamType(membership);
  const shop = type !== 'race';
  const racing = type !== 'engine_shop';
  const teamFull = canArea('team') || admin;
  const groups = [
    { area: 'track', label: 'At the Track', icon: I.track, show: canArea('track') && racing, links: [
      canModule('events') && { to: '/events', label: 'Events', icon: I.flag },
      canModule('events') && { to: '/series', label: 'Series', icon: I.trophy },
      canModule('tracks') && { to: '/tracks', label: 'Tracks', icon: I.pin },
      canModule('setups') && { to: '/setups', label: 'Setup sheets', icon: I.sheet },
      canModule('setups') && { to: '/track/advisor', label: 'Setup advisor', icon: I.sliders },
      canModule('trackside') && { to: '/track/checks', label: 'Between-round checks', icon: I.check },
      racing && canModule('enginetunes') && !canArea('engines') && { to: '/tunes', label: 'Engine tunes', icon: I.engine },
      canModule('gears') && { to: '/track/gears', label: 'Gears & tires', icon: I.gear },
      { to: '/calculators?area=track', label: 'Calculators', icon: I.calc },
    ] },
    { area: 'workshop', label: 'In the Workshop', icon: I.shop, show: canArea('workshop'), links: [
      racing && canModule('maintenance') && { to: '/maintenance', label: 'Car maintenance', icon: I.wrench },
      racing && canModule('shopsetups') && { to: '/workshop/setups', label: 'Workshop setups', icon: I.sheet },
      canModule('enginechecks') && { to: '/workshop/engine-checks', label: 'Engine checks', icon: I.check },
      canModule('assets') && { to: '/assets', label: 'Assets', icon: I.box },
      canModule('dyno') && { to: '/workshop/dyno', label: 'Shock & bar dyno', icon: I.wave },
      { to: '/calculators?area=workshop', label: 'Calculators', icon: I.calc },
    ] },
    { area: 'engines', label: shop ? 'Engine Shop' : 'Engine Builds', icon: I.engine, show: canArea('engines'), links: [
      shop && canModule('jobs') && { to: '/jobs', label: 'Jobs', icon: I.ticket },
      shop && canModule('customers') && { to: '/customers', label: 'Customers', icon: I.users },
      shop && canModule('assets') && { to: '/assets?category=Engine', label: 'Customer engines', icon: I.box },
      canModule('engines') && { to: '/engines', label: shop ? 'Build sheets' : 'Engines & builds', icon: I.engine, end: true, keep: shop },
      canModule('enginetunes') && { to: '/tunes', label: 'Engine tunes', icon: I.sheet },
      { to: '/calculators?area=engines', label: 'Calculators', icon: I.calc },
    ] },
    // the Calendar is open to anyone with Calendars → view, so the group shows for them too (with just that link)
    { area: 'team', label: 'Team Management', icon: I.team, show: teamFull || (racing && canModule('calendar')), path: teamFull ? null : '/calendar', links: [
      racing && canModule('calendar') && { to: '/calendar', label: 'Calendar', icon: I.calendar, badge: (canModule('calendar', 'edit') ? membership?.calendar_notices || 0 : 0) + (membership?.calendar_updates || 0) },
      teamFull && racing && canModule('cars') && { to: '/cars', label: 'Cars', icon: I.car },
      teamFull && canModule('contacts') && { to: '/contacts', label: 'Contacts', icon: I.book },
      teamFull && canModule('contacts') && { to: '/suppliers', label: 'Suppliers', icon: I.truck },
      teamFull && { to: '/team/members', label: 'Members & invites', icon: I.users },
      (can('roles.manage') || membership?.role.is_owner) && { to: '/roles', label: 'Roles & permissions', icon: I.key },
      teamFull && { to: '/forms', label: 'Forms', icon: I.form },
      teamFull && can('backup.manage') && { to: '/team/backups', label: 'Backups & export', icon: I.backup },
      canModule('reports') && { to: '/team/reports', label: 'Reports', icon: I.chart },
      canModule('reports') && { to: '/team/stats', label: 'Crew Chief stats', icon: I.star },
      canModule('reviews') && { to: '/team/reviews', label: 'Performance reviews', icon: I.user },
    ] },
    { area: 'admin', label: 'Platform admin', icon: I.admin, show: !!user?.is_platform_admin, links: ADMIN_LINKS.map((l) => (l.to === '/admin/calendar' ? { ...l, badge: notices?.calendar_requests || 0 } : l.to === '/admin/feedback' ? { ...l, badge: notices?.feedback_new || 0 } : l)) },
  ].map((g) => ({ ...g, links: g.links.filter(Boolean) }));
  return groups.filter((g) => g.show && g.links.length);
}

function Banners() {
  const { platform, licence, user, membership } = useSession();
  const a = platform?.announcement;
  const key = a ? `raceops.ann.${a.text}` : '';
  const [hidden, setHidden] = useState(() => { try { return !!(key && localStorage.getItem(key)); } catch { return false; } });
  return (
    <>
      {licence === 'expired' && (
        <div className="banner banner-critical" role="alert">
          <span className="grow">
            The team licence has expired, so this team is <b>read-only</b>.{user?.is_platform_admin ? ' (You can still edit as platform admin.)' : ' Changes can’t be saved — contact your administrator to renew.'}
            {platform?.support_email && <> <a href={`mailto:${platform.support_email}`}>{platform.support_email}</a></>}
          </span>
        </div>
      )}
      {licence === 'suspended' && <div className="banner banner-critical" role="alert"><span className="grow">This team is suspended. Only platform admins can open it.</span></div>}
      {membership?.settings?.practice && (
        <div className="banner banner-info practice-banner" role="status" data-testid="practice-banner">
          <span className="grow"><b>Practice team</b> — for training, with demo data. Try anything: the owner can reset it. <Link to="/help/training">Training exercises</Link></span>
        </div>
      )}
      {a && !hidden && (
        <div className={`banner banner-${a.level}`} role="status">
          <span className="grow">{a.text}</span>
          {a.level !== 'critical' && (
            <button type="button" className="banner-x" aria-label="Dismiss" onClick={() => { try { localStorage.setItem(key, '1'); } catch { /* private mode */ } setHidden(true); }}>×</button>
          )}
        </div>
      )}
    </>
  );
}

function Suspended() {
  const { membership, memberships, switchTenant, platform, logout } = useSession();
  return (
    <div className="auth-wrap"><div className="auth-card card">
      <h1>{membership?.tenant_name} is suspended</h1>
      <p className="muted">This team’s access has been suspended by the platform administrator.{platform?.support_email ? ` Contact ${platform.support_email}.` : ''}</p>
      {memberships.filter((m) => m.licence !== 'suspended').length > 0 && (
        <select className="team-switch light" value="" onChange={(e) => switchTenant(e.target.value)} aria-label="Switch team">
          <option value="">Switch to another team…</option>
          {memberships.filter((m) => m.licence !== 'suspended').map((m) => <option key={m.tenant_id} value={m.tenant_id}>{m.tenant_name}</option>)}
        </select>
      )}
      <button type="button" className="btn" onClick={() => logout()}>Sign out</button>
    </div></div>
  );
}

/** Is the current page one of this sidebar section's pages? */
export const inGroup = (g, path) => path.startsWith(AREA_PATH[g.area]) || g.links.some((l) => path === l.to || path.startsWith(`${l.to}/`));

export default function Layout() {
  const { user, memberships, membership, switchTenant, platform, licence, canModule, prefs, setPrefs, notices } = useSession();
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  const groups = useNav();
  const topbar = useHeightVar('--topbar-h');
  // compact the sticky title row once the page has scrolled
  useEffect(() => {
    const root = document.documentElement;
    // hysteresis: compacting shortens the page, which can pull scrollY back — without a gap
    // between the two thresholds the header would flicker between sizes
    const on = () => {
      const y = window.scrollY;
      if (y > 56) root.classList.add('scrolled');
      else if (y < 4) root.classList.remove('scrolled');
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); root.classList.remove('scrolled'); };
  }, []);
  if (licence === 'suspended' && !user?.is_platform_admin) return <Suspended />;
  const appName = platform?.app_name || 'RaceOps';
  const words = appName.trim().split(/\s+/);
  const caps = appName.replace(/[^A-Z]/g, '');
  const mark = (words.length > 1 ? words.map((w) => w[0]).join('') : caps.length > 1 ? caps : appName).slice(0, 2).toUpperCase() || 'RO';

  const link = (n) => (
    <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setDrawer(false)}
      className={({ isActive }) => `nav-link${(n.to.includes('?') ? `${loc.pathname}${loc.search}`.startsWith(n.to) : isActive) ? ' active' : ''}`}>
      <Icon d={n.icon} size={18} /><span>{n.label}</span>{n.badge ? <span className="nav-badge" aria-label={`${n.badge} new`}>{n.badge}</span> : null}
    </NavLink>
  );

  return (
    <div className="shell">
      <aside className={`sidebar${drawer ? ' open' : ''}`}>
        <div className="brand"><span className="brand-mark">{mark}</span><span>{appName}</span></div>
        {memberships.length > 1 ? (
          <select className="team-switch" value={membership?.tenant_id} onChange={(e) => { switchTenant(e.target.value); setDrawer(false); }}>
            {memberships.map((m) => <option key={m.tenant_id} value={m.tenant_id}>{m.tenant_name}</option>)}
          </select>
        ) : <div className="team-name">{membership?.tenant_name}</div>}
        <nav>
          <NavLink to="/" end onClick={() => setDrawer(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Icon d={I.home} size={18} /><span>Home</span></NavLink>
          {canModule('ai') && <NavLink to="/ask" onClick={() => setDrawer(false)} className={({ isActive }) => `nav-link ask-link${isActive ? ' active' : ''}`}><Icon d={I.spark} size={18} /><span>Ask RaceOps</span></NavLink>}
          {canModule('analytics') && <NavLink to="/analytics" onClick={() => setDrawer(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Icon d={I.chart} size={18} /><span>Analytics</span></NavLink>}
          {groups.map((g) => {
            const collapsed = (prefs.nav_collapsed || []).includes(g.area);
            const here = inGroup(g, loc.pathname);
            const toggle = () => setPrefs({ nav_collapsed: collapsed ? prefs.nav_collapsed.filter((k) => k !== g.area) : [...(prefs.nav_collapsed || []), g.area] });
            return (
              <div key={g.area} className={`nav-group${collapsed ? ' collapsed' : ''}`}>
                <div className="nav-head">
                  <NavLink to={g.path || AREA_PATH[g.area]} end onClick={() => setDrawer(false)} className={({ isActive }) => `nav-area area-${g.area}${isActive ? ' active' : ''}`}>
                    <Icon d={g.icon} size={16} /><span>{g.label}</span>
                    {collapsed && here && <span className="nav-dot" title="You're in this section" />}
                  </NavLink>
                  <button type="button" className="nav-toggle" onClick={toggle} aria-expanded={!collapsed} aria-controls={`nav-${g.area}`}
                    aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${g.label}`} title={collapsed ? 'Show links' : 'Hide links'}>
                    <Icon d={I.chevron} size={16} />
                  </button>
                </div>
                {!collapsed && <div id={`nav-${g.area}`} className="nav-links">{g.links.filter((l) => l.keep || l.to !== AREA_PATH[g.area]).map(link)}</div>}
              </div>
            );
          })}
          <div className="nav-sep" />
          {link({ to: '/profile', label: 'Profile & device', icon: I.user })}
          {link({ to: '/deleted', label: 'Recently deleted', icon: I.trash })}
          {link({ to: '/help', label: 'Help & guide', icon: I.help })}
          {link({ to: `/feedback${loc.pathname.startsWith('/feedback') ? '' : `?from=${encodeURIComponent(loc.pathname)}`}`, label: 'Feedback & roadmap', icon: I.idea, badge: notices?.feedback_updates || 0 })}
        </nav>
        <div className="sidebar-foot"><span className="muted small">{user?.name} · {membership?.role.name}</span>
          <Link to="/help/releases" className="muted small app-version" onClick={() => setDrawer(false)} title="Release notes">Version {APP_VERSION}</Link></div>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
      <div className="main-col">
        <div className="topbar" ref={topbar}>
          <button type="button" className="icon-btn menu-btn" onClick={() => setDrawer(true)} aria-label="Menu"><Icon d={I.menu} /></button>
          <span className="topbar-team">{membership?.tenant_name}</span>
          <SyncBadge />
        </div>
        <Banners />
        <main key={loc.pathname.split('/')[1]} className="content"><Outlet /></main>
        <nav className="tabbar">
          <NavLink to="/" end className={({ isActive }) => `tab${isActive ? ' active' : ''}`}><Icon d={I.home} size={22} /><span>Home</span></NavLink>
          {groups.map((g) => {
            const active = inGroup(g, loc.pathname);
            return (
              <NavLink key={g.area} to={g.path || AREA_PATH[g.area]} className={`tab area-${g.area}${active ? ' active' : ''}`}>
                <Icon d={g.icon} size={22} /><span>{tabLabel(g)}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
