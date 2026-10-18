import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { Empty, LifeBar, PageHeader, Pill, Section } from '../components/ui.jsx';
import { assetLife, scheduleStatus, setupsByAsset } from '../lib/compute.js';
import { fmtDate, levelLabel, titleOf, today, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { scheduleText } from './Maintenance.jsx';

export default function Dashboard() {
  const data = useTeamData();
  const { user, membership, canType } = useSession();
  const d = useMemo(() => {
    if (!data) return null;
    const t = today();
    const byAsset = setupsByAsset(data);
    const upcoming = data.list('event').filter((e) => (v(e, 'end_date') || v(e, 'date') || '') >= t)
      .sort((a, b) => v(a, 'date').localeCompare(v(b, 'date'))).slice(0, 4);
    const due = data.list('schedule').map((s) => ({ s, st: scheduleStatus(s, data, byAsset) }))
      .filter((x) => x.st.level !== 'ok').sort((a, b) => a.st.remaining - b.st.remaining).slice(0, 8);
    const attention = data.list('asset').filter((a) => v(a, 'status') !== 'Retired')
      .map((a) => ({ a, life: assetLife(a, data, byAsset) })).filter((x) => x.life.level !== 'ok')
      .sort((x, y) => (y.life.pct || 0) - (x.life.pct || 0)).slice(0, 8);
    const recent = data.list('setup').slice().sort((a, b) => b.client_updated_at.localeCompare(a.client_updated_at)).slice(0, 6);
    const cars = data.list('car').filter((c) => v(c, 'active') !== false).map((c) => {
      const last = data.list('maintenance').filter((m) => v(m, 'car') === c.id).sort((a, b) => (v(b, 'date') || '').localeCompare(v(a, 'date') || ''))[0];
      return { c, last };
    });
    return { upcoming, due, attention, recent, cars };
  }, [data]);
  if (!d) return <p className="muted pad">Loading…</p>;
  const empty = !data.list('car').length;

  return (
    <div>
      <PageHeader title={`G'day, ${user?.name?.split(' ')[0] || ''}`} sub={membership?.tenant_name} />
      {empty && (
        <div className="card onboarding">
          <h3>Get started</h3>
          <ol>
            <li><Link to="/r/car/new">Add your car(s)</Link></li>
            <li><Link to="/r/asset/new">Add assets</Link> — shocks, torsion bars, engines, gears</li>
            <li><Link to="/r/event/new">Create your next event</Link>, then fill a setup sheet per session</li>
            <li><Link to="/team">Invite your crew</Link></li>
          </ol>
        </div>
      )}
      <div className="grid-2">
        {canType('event', 'view') && (
          <Section title="Upcoming events" actions={<Link className="btn ghost small" to="/events">All</Link>}>
            {d.upcoming.length === 0 ? <p className="muted">Nothing scheduled.</p> : (
              <div className="list">{d.upcoming.map((e) => (
                <Link key={e.id} to={`/events/${e.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{v(e, 'name')}</span><span className="row-sub">{v(e, 'track')}</span></span>
                  <span className="row-meta">{fmtDate(v(e, 'date'))}</span>
                </Link>
              ))}</div>
            )}
          </Section>
        )}
        {canType('schedule', 'view') && (
          <Section title="Maintenance due" actions={<Link className="btn ghost small" to="/maintenance?tab=schedules">Schedules</Link>}>
            {d.due.length === 0 ? <p className="muted">Nothing due soon.</p> : (
              <div className="list">{d.due.map(({ s, st }) => (
                <Link key={s.id} to={`/r/schedule/${s.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{v(s, 'name')}</span>
                    <span className="row-sub">{titleOf(data.byId[v(s, 'applies_to') === 'Car' ? v(s, 'car') : v(s, 'asset')], data)}</span></span>
                  <Pill level={st.level}>{scheduleText(st)}</Pill>
                </Link>
              ))}</div>
            )}
          </Section>
        )}
        {canType('asset', 'view') && (
          <Section title="Assets needing attention" actions={<Link className="btn ghost small" to="/assets">Assets</Link>}>
            {d.attention.length === 0 ? <p className="muted">All assets within life limits.</p> : (
              <div className="list">{d.attention.map(({ a, life }) => (
                <Link key={a.id} to={`/assets/${a.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{v(a, 'name')}</span>
                    <span className="row-sub">{v(a, 'category')} · {v(a, 'status')}{life.daysToExpiry !== null && life.daysToExpiry <= 60 ? ` · expiry ${fmtDate(v(a, 'expiry_date'))}` : ''}</span></span>
                  <LifeBar pct={life.pct} level={life.level} />
                </Link>
              ))}</div>
            )}
          </Section>
        )}
        {canType('maintenance', 'view') && d.cars.length > 0 && (
          <Section title="Last checklist by car" actions={<Link className="btn ghost small" to="/maintenance">Checklists</Link>}>
            <div className="list">{d.cars.map(({ c, last }) => (
              <Link key={c.id} to={last ? `/r/maintenance/${last.id}` : `/r/maintenance/new?car=${c.id}&level=weekly`} className="list-row">
                <span className="car-num">{v(c, 'number')}</span>
                <span className="grow"><span className="row-title">{v(c, 'name') || titleOf(c)}</span>
                  <span className="row-sub">{last ? `${levelLabel(v(last, 'level'))} · ${fmtDate(v(last, 'date'))}` : 'No checklist yet — start one'}</span></span>
              </Link>
            ))}</div>
          </Section>
        )}
        {canType('setup', 'view') && (
          <Section title="Recently edited setups" actions={<Link className="btn ghost small" to="/setups">Setups</Link>}>
            {d.recent.length === 0 ? <p className="muted">No setup sheets yet.</p> : (
              <div className="list">{d.recent.map((s) => (
                <Link key={s.id} to={`/r/setup/${s.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{titleOf(s, data)}</span>
                    <span className="row-sub">{titleOf(data.byId[v(s, 'car')])}</span></span>
                  {s.dirty ? <Pill level="warn">not synced</Pill> : null}
                </Link>
              ))}</div>
            )}
          </Section>
        )}
      </div>
      {!empty && !canType('event', 'view') && <Empty>Your role has limited access. Ask a team owner if you need more.</Empty>}
    </div>
  );
}
