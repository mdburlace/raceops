import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AREAS, MODULE } from '@shared/catalog.js';
import { RequestNotice } from '../components/SharedRequests.jsx';
import { AREA_ICON, AREA_PATH, Icon, I, useNav } from '../components/Layout.jsx';
import { LifeBar, PageHeader, Pill, Section } from '../components/ui.jsx';
import { assetLife, scheduleStatus, setupsByAsset } from '../lib/compute.js';
import { eventTrack, fmtDate, levelLabel, roundAndTrack, titleOf, today, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { scheduleText } from './Maintenance.jsx';
import { teamType } from '@shared/shop.js';
import { ShopHome } from './Shop.jsx';
import { SetupChecklist } from '../components/SetupChecklist.jsx';
import { AnalyticsKpis } from './Analytics.jsx';
import { markReleaseSeen, unseenRelease } from '../lib/releases.js';
import DayLines from '../components/DayLines.jsx';
import { RaceNightCard, RemindersCard } from './Business.jsx';

// ---------- access gate used by routes ----------
export function AreaGate({ area, module, children }) {
  const { canArea, canModule, licensed, can } = useSession();
  const teamAdmin = area === 'team' && (can('members.manage') || can('roles.manage') || can('forms.manage') || can('team.manage'));
  if (!licensed(area)) return <Locked reason="plan" area={area} />;
  if (!canArea(area) && !teamAdmin) return <Locked reason="role" area={area} />;
  if (module && !canModule(module)) return <Locked reason={licensed(module) ? 'role' : 'plan'} area={area} />;
  return children;
}

/** Pages for modules that need no area (e.g. the Calendar): only the licence and the role's right. */
export function ModuleGate({ module, children }) {
  const { canModule, licensed } = useSession();
  if (!canModule(module)) return <Locked reason={MODULE[module]?.feature && !licensed(MODULE[module].feature) ? 'plan' : 'role'} area="team" />;
  return children;
}

function Locked({ reason, area }) {
  const a = AREAS.find((x) => x.key === area);
  return (
    <div className="locked">
      <span className="lock-badge"><Icon d={I.lock} size={28} /></span>
      <h1>{a?.label}</h1>
      <p className="muted">{reason === 'plan'
        ? 'This area isn’t included in your team’s plan. Contact your administrator to enable it.'
        : 'Your role doesn’t include access to this area. Ask a team owner to update your role.'}</p>
      <Link to="/" className="btn">Back to home</Link>
    </div>
  );
}

// ---------- derived numbers shared by landing + hubs ----------
function useSummary() {
  const data = useTeamData();
  return useMemo(() => {
    if (!data) return null;
    const t = today();
    const byAsset = setupsByAsset(data);
    const nextEvents = data.list('event').filter((e) => (v(e, 'end_date') || v(e, 'date') || '') >= t)
      .sort((a, b) => (v(a, 'date') || '').localeCompare(v(b, 'date') || ''));
    const due = data.list('schedule').map((s) => ({ s, st: scheduleStatus(s, data, byAsset) }))
      .filter((x) => x.st.level !== 'ok').sort((a, b) => a.st.remaining - b.st.remaining);
    const attention = data.list('asset').filter((a) => v(a, 'status') !== 'Retired')
      .map((a) => ({ a, life: assetLife(a, data, byAsset) })).filter((x) => x.life.level !== 'ok')
      .sort((x, y) => (y.life.pct || 0) - (x.life.pct || 0));
    const recentSetups = data.list('setup').slice().sort((a, b) => b.client_updated_at.localeCompare(a.client_updated_at));
    const engines = data.list('asset').filter((a) => v(a, 'category') === 'Engine' && v(a, 'status') !== 'Retired');
    const builds = data.list('engine_build').slice().sort((a, b) => (v(b, 'date') || '').localeCompare(v(a, 'date') || ''));
    return { data, nextEvents, due, attention, recentSetups, engines, builds, byAsset };
  }, [data]);
}

function areaStat(key, s) {
  if (!s) return '';
  switch (key) {
    case 'track': return s.nextEvents[0] ? `Next: ${[v(s.nextEvents[0], 'name'), roundAndTrack(s.nextEvents[0]?.data?.values, eventTrack(s.nextEvents[0], s.data)), fmtDate(v(s.nextEvents[0], 'date'))].filter(Boolean).join(' · ')}` : `${s.data.list('setup').length} setup sheets`;
    case 'workshop': return `${s.due.length} service${s.due.length === 1 ? '' : 's'} due · ${s.attention.length} asset${s.attention.length === 1 ? '' : 's'} to check`;
    case 'engines': return `${s.engines.length} engine${s.engines.length === 1 ? '' : 's'} · ${s.builds[0] ? `last build ${fmtDate(v(s.builds[0], 'date'))}` : 'no builds yet'}`;
    case 'team': return `${s.data.list('car').length} car${s.data.list('car').length === 1 ? '' : 's'} · ${s.data.list('review').length} reviews`;
    default: return '';
  }
}

// ---------- landing page ----------
/** After the app updates to a new release: a one-off note on Home pointing to the release notes. */
function UpdatedNotice() {
  const [r, setR] = useState(() => unseenRelease());
  if (!r) return null;
  const done = () => { markReleaseSeen(); setR(null); };
  return (
    <div className="notice info release-notice" data-testid="release-notice">
      <span className="grow">RaceOps has been updated to version {r.version}: <b>{r.title}</b>. <Link to={`/help/releases/${r.version}`} onClick={markReleaseSeen}>See what’s new</Link></span>
      <button type="button" className="icon-btn" aria-label="Dismiss" onClick={done}>×</button>
    </div>
  );
}

export function Landing() {
  const { user, membership, canArea, licensed, can } = useSession();
  const s = useSummary();
  const groups = useNav();
  if (!s) return <p className="muted pad">Loading…</p>;
  const teamAdmin = can('members.manage') || can('roles.manage') || can('forms.manage') || can('team.manage');
  const type = teamType(membership);

  return (
    <div>
      <PageHeader title={`G'day, ${user?.name?.split(' ')[0] || ''}`} sub={membership?.tenant_name} />
      <UpdatedNotice />
      <RequestNotice />
      <SetupChecklist />
      <RaceNightCard />
      <RemindersCard />
      {type !== 'engine_shop' && <AnalyticsKpis />}
      {type !== 'race' && <ShopHome />}
      <div className="area-grid">
        {AREAS.filter((a) => type !== 'engine_shop' || a.key !== 'track').map((a) => {
          const isLicensed = licensed(a.key);
          const allowed = isLicensed && (canArea(a.key) || (a.key === 'team' && teamAdmin));
          const g = groups.find((x) => x.area === a.key);
          const body = (
            <>
              <div className="area-top">
                <span className="area-icon"><Icon d={AREA_ICON[a.key]} size={26} /></span>
                <div>
                  <h2>{g?.label || a.label}</h2>
                  <p className="muted">{a.key === 'engines' && type !== 'race' ? 'Jobs with parts & labour, customers and their engines, build sheets and handover packs.' : a.blurb}</p>
                </div>
                {!allowed && <span className="area-lock"><Icon d={I.lock} size={18} />{isLicensed ? 'No access' : 'Not in plan'}</span>}
              </div>
              {allowed && <p className="area-stat">{areaStat(a.key, s)}</p>}
              {allowed && g && (
                <div className="area-links">{g.links.slice(0, 5).map((l) => <span key={l.to}>{l.label}</span>)}</div>
              )}
              <div className="roadmap">
                <span className="roadmap-label">Coming next</span>
                <ul>{a.roadmap.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            </>
          );
          return allowed
            ? <Link key={a.key} to={AREA_PATH[a.key]} className={`area-tile area-${a.key}`}>{body}</Link>
            : <div key={a.key} className={`area-tile area-${a.key} locked-tile`}>{body}</div>;
        })}
        {user?.is_platform_admin && (
          <Link to="/admin" className="area-tile area-admin">
            <div className="area-top">
              <span className="area-icon"><Icon d={AREA_ICON.admin} size={26} /></span>
              <div>
                <h2>Platform admin</h2>
                <p className="muted">Global settings for every team: licences and plans, users, the track directory, pick-lists and system settings.</p>
              </div>
            </div>
            <div className="area-links">{['Teams & licences', 'Plans & allocation', 'Users', 'Tracks & directory', 'Pick-lists', 'Settings'].map((x) => <span key={x}>{x}</span>)}</div>
          </Link>
        )}
      </div>

      {canArea('workshop') && (s.due.length > 0 || s.attention.length > 0) && (
        <Section title="Needs attention" actions={<Link className="btn ghost small" to="/workshop">Workshop</Link>}>
          <div className="list">
            {s.due.slice(0, 4).map(({ s: sch, st }) => (
              <Link key={sch.id} to={`/r/schedule/${sch.id}`} className="list-row">
                <span className="grow"><span className="row-title">{v(sch, 'name')}</span><span className="row-sub">Service schedule</span></span>
                <Pill level={st.level}>{scheduleText(st)}</Pill>
              </Link>
            ))}
            {s.attention.slice(0, 4).map(({ a, life }) => (
              <Link key={a.id} to={`/assets/${a.id}`} className="list-row">
                <span className="grow"><span className="row-title">{v(a, 'name')}</span><span className="row-sub">{v(a, 'category')} · {v(a, 'status')}</span></span>
                <LifeBar pct={life.pct} level={life.level} />
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------- hub building blocks ----------
function ModuleCards({ area }) {
  const g = useNav().find((x) => x.area === area);
  if (!g) return null;
  return (
    <div className="module-cards">
      {g.links.map((l) => (
        <Link key={l.to} to={l.to} className="module-card">
          <Icon d={l.icon} size={22} /><span>{l.label}</span>
        </Link>
      ))}
    </div>
  );
}

function HubHeader({ area, children }) {
  const a = AREAS.find((x) => x.key === area);
  return (
    <PageHeader title={a.label} sub={a.blurb}>{children}</PageHeader>
  );
}

export function TrackHub() {
  const s = useSummary();
  const { canModule, canType } = useSession();
  if (!s) return null;
  const { data } = s;
  const checks = data.list('track_check').slice().sort((a, b) => b.client_updated_at.localeCompare(a.client_updated_at));
  const ev = s.nextEvents[0];
  return (
    <div className="hub hub-track">
      <HubHeader area="track">
        {canType('event', 'edit') && <Link className="btn primary" to="/r/event/new">New event</Link>}
      </HubHeader>
      <ModuleCards area="track" />
      <div className="grid-2">
        {canModule('events') && (
          <Section title="Next event" actions={<Link className="btn ghost small" to="/events">All events</Link>}>
            {ev ? (
              <Link to={`/events/${ev.id}`} className="next-event">
                <span className="ne-date"><b>{new Date(`${v(ev, 'date')}T00:00:00`).getDate()}</b><small>{new Date(`${v(ev, 'date')}T00:00:00`).toLocaleString(undefined, { month: 'short' })}</small></span>
                <span className="grow"><span className="row-title">{v(ev, 'name')}</span><span className="row-sub">{roundAndTrack(ev?.data?.values, eventTrack(ev, data))}</span>
                  <DayLines values={ev.data?.values} compact /></span>
                <span className="btn small">Open sheets</span>
              </Link>
            ) : <p className="muted">Nothing scheduled.</p>}
            {s.nextEvents.slice(1, 4).map((e) => (
              <Link key={e.id} to={`/events/${e.id}`} className="list-row"><span className="grow">{v(e, 'name')}<span className="row-sub">{roundAndTrack(e?.data?.values, eventTrack(e, data))}</span>
                <DayLines values={e.data?.values} compact /></span><span className="row-meta">{fmtDate(v(e, 'date'))}</span></Link>
            ))}
          </Section>
        )}
        {canModule('setups') && (
          <Section title="Recently edited setups" actions={<Link className="btn ghost small" to="/setups">Setups</Link>}>
            {s.recentSetups.length === 0 ? <p className="muted">No setup sheets yet.</p> : (
              <div className="list">{s.recentSetups.slice(0, 5).map((x) => (
                <Link key={x.id} to={`/r/setup/${x.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{titleOf(x, data)}</span><span className="row-sub">{titleOf(data.byId[v(x, 'car')])}</span></span>
                  {x.dirty ? <Pill level="warn">not synced</Pill> : null}
                </Link>
              ))}</div>
            )}
          </Section>
        )}
        {canModule('trackside') && (
          <Section title="Between-round checks" actions={<Link className="btn ghost small" to="/track/checks">All checks</Link>}>
            {checks.length === 0 ? <p className="muted">No checks recorded yet.</p> : (
              <div className="list">{checks.slice(0, 4).map((c) => (
                <Link key={c.id} to={`/r/track_check/${c.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{titleOf(c, data)}</span><span className="row-sub">{titleOf(data.byId[v(c, 'car')])}</span></span>
                  {v(c, 'issues') ? <Pill level="warn">issues</Pill> : null}
                </Link>
              ))}</div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

export function WorkshopHub() {
  const s = useSummary();
  const { canModule } = useSession();
  if (!s) return null;
  const { data } = s;
  const runs = data.list('dyno_run').slice().sort((a, b) => (v(b, 'date') || '').localeCompare(v(a, 'date') || ''));
  const cars = data.list('car').filter((c) => v(c, 'active') !== false).map((c) => ({
    c, last: data.list('maintenance').filter((m) => v(m, 'car') === c.id).sort((a, b) => (v(b, 'date') || '').localeCompare(v(a, 'date') || ''))[0],
  }));
  return (
    <div className="hub hub-workshop">
      <HubHeader area="workshop" />
      <ModuleCards area="workshop" />
      <div className="grid-2">
        {canModule('maintenance') && (
          <Section title="Service due" actions={<Link className="btn ghost small" to="/maintenance?tab=schedules">Schedules</Link>}>
            {s.due.length === 0 ? <p className="muted">Nothing due soon.</p> : (
              <div className="list">{s.due.slice(0, 6).map(({ s: sch, st }) => (
                <Link key={sch.id} to={`/r/schedule/${sch.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{v(sch, 'name')}</span><span className="row-sub">{titleOf(data.byId[v(sch, 'applies_to') === 'Car' ? v(sch, 'car') : v(sch, 'asset')], data)}</span></span>
                  <Pill level={st.level}>{scheduleText(st)}</Pill>
                </Link>
              ))}</div>
            )}
          </Section>
        )}
        {canModule('assets') && (
          <Section title="Assets needing attention" actions={<Link className="btn ghost small" to="/assets">Assets</Link>}>
            {s.attention.length === 0 ? <p className="muted">All assets within life limits.</p> : (
              <div className="list">{s.attention.slice(0, 6).map(({ a, life }) => (
                <Link key={a.id} to={`/assets/${a.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{v(a, 'name')}</span><span className="row-sub">{v(a, 'category')} · {v(a, 'status')}</span></span>
                  <LifeBar pct={life.pct} level={life.level} />
                </Link>
              ))}</div>
            )}
          </Section>
        )}
        {canModule('maintenance') && cars.length > 0 && (
          <Section title="Last checklist by car" actions={<Link className="btn ghost small" to="/maintenance">Checklists</Link>}>
            <div className="list">{cars.map(({ c, last }) => (
              <Link key={c.id} to={last ? `/r/maintenance/${last.id}` : `/r/maintenance/new?car=${c.id}&level=weekly`} className="list-row">
                <span className="car-num">{v(c, 'number')}</span>
                <span className="grow"><span className="row-title">{v(c, 'name') || titleOf(c)}</span>
                  <span className="row-sub">{last ? `${levelLabel(v(last, 'level'))} · ${fmtDate(v(last, 'date'))}` : 'No checklist yet — start one'}</span></span>
              </Link>
            ))}</div>
          </Section>
        )}
        {canModule('dyno') && (
          <Section title="Recent dyno runs" actions={<Link className="btn ghost small" to="/workshop/dyno">Dyno</Link>}>
            {runs.length === 0 ? <p className="muted">No dyno runs yet.</p> : (
              <div className="list">{runs.slice(0, 5).map((r) => (
                <Link key={r.id} to={`/r/dyno_run/${r.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{v(r, 'label') || 'Run'}</span><span className="row-sub">{titleOf(data.byId[v(r, 'asset')])}</span></span>
                  <span className="row-meta">{fmtDate(v(r, 'date'))}</span>
                </Link>
              ))}</div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

export function TeamHub() {
  const s = useSummary();
  if (!s) return null;
  return (
    <div className="hub hub-team">
      <HubHeader area="team" />
      <ModuleCards area="team" />
    </div>
  );
}
