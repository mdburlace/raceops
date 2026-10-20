import { Link, useParams } from 'react-router-dom';
import ContactLinks from '../components/ContactLinks.jsx';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { eventTrack, fmtDate, num, titleOf, today, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { dateRange, eventDays } from './Events.jsx';
import { useState } from 'react';
import { RequestChange, TeamNotes } from '../components/SharedRequests.jsx';

const roundsOf = (data, id) => data.list('event').filter((e) => v(e, 'series') === id || (v(e, 'series') && v(data.byId[v(e, 'series')], 'shared_as') === id))
  .sort((a, b) => (num(v(a, 'round')) ?? 999) - (num(v(b, 'round')) ?? 999) || (v(a, 'date') || '').localeCompare(v(b, 'date') || ''));
const isFeature = (s) => /feature|a-?main/i.test(v(s, 'session') || '');

export function SeriesList() {
  const data = useTeamData();
  const { canType } = useSession();
  if (!data) return null;
  // the team's series, plus shared series it runs in (events or a series entry); a team copy that
  // has been shared stands in for the shared one
  const isGlobal = (r) => !!(r?.global || r?.data?.scope === 'global');
  const used = new Set([...data.list('event').map((e) => v(e, 'series')), ...data.list('season_plan').map((p) => v(p, 'series'))]);
  const copied = new Set(data.list('series').map((s) => v(s, 'shared_as')).filter(Boolean));
  const series = data.list('series').filter((s) => !isGlobal(s) || (used.has(s.id) && !copied.has(s.id))).sort((a, b) => String(v(b, 'season')).localeCompare(String(v(a, 'season'))) || titleOf(a).localeCompare(titleOf(b)));
  const seasons = [...new Set(series.map((s) => v(s, 'season') || 'No season'))];
  const standalone = data.list('event').filter((e) => !v(e, 'series')).length;
  return (
    <div>
      <PageHeader title="Race series" sub="Championships and series the team runs, made up of event rounds">
        <Link className="btn ghost" to="/events?series=none">Stand-alone events ({standalone})</Link>
        {canType('fixture', 'view') && <Link className="btn ghost" to="/calendar?tab=shared">Series calendars</Link>}
        {canType('series', 'edit') && <Link className="btn primary" to="/r/series/new">New series</Link>}
      </PageHeader>
      {series.length === 0 && <Empty>No series yet. Create one, then add its rounds as events.</Empty>}
      {seasons.map((season) => (
        <Section key={season} title={season}>
          <div className="list">
            {series.filter((s) => (v(s, 'season') || 'No season') === season).map((s) => {
              const rounds = roundsOf(data, s.id);
              const next = rounds.find((e) => (v(e, 'end_date') || v(e, 'date') || '') >= today());
              return (
                <Link key={s.id} to={`/series/${s.id}`} className="list-row">
                  <span className="grow">
                    <span className="row-title">{v(s, 'name')}</span>
                    <span className="row-sub">{[v(s, 'class'), v(s, 'sanctioning'), `${rounds.length} round${rounds.length === 1 ? '' : 's'}`, next && `next: ${v(next, 'name')} ${fmtDate(v(next, 'date'))}`].filter(Boolean).join(' · ')}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </Section>
      ))}
    </div>
  );
}

export function SeriesDetail() {
  const { id } = useParams();
  const data = useTeamData();
  const { canType, user } = useSession();
  const [changing, setChanging] = useState(false);
  const [sentMsg, setSentMsg] = useState('');
  if (!data) return null;
  const s = data.byId[id];
  if (!s) return <PageHeader title="Series not found" back="/series" />;
  const shared = !!(s.global || s.data?.scope === 'global');
  const rounds = roundsOf(data, id);
  const cars = data.list('car').filter((c) => v(c, 'active') !== false);
  const nextRound = (Math.max(0, ...rounds.map((e) => num(v(e, 'round')) || 0)) || rounds.length) + 1;
  const feature = (e, car) => data.list('setup').find((x) => v(x, 'event') === e.id && v(x, 'car') === car.id && isFeature(x));
  const t = today();
  return (
    <div>
      <PageHeader title={v(s, 'name')} sub={[v(s, 'season'), v(s, 'class'), v(s, 'sanctioning')].filter(Boolean).join(' · ')} back="/series">
        {canType('fixture', 'view') && <Link className="btn ghost" to={`/calendar?tab=shared&show=series:${v(s, 'shared_as') || id}`}>Series calendar</Link>}
        {canType('series', 'edit') && (!shared || user?.is_platform_admin) && <Link className="btn ghost" to={`/r/series/${id}`}>Edit series</Link>}
        {shared && !user?.is_platform_admin && canType('fixture', 'edit') && <button type="button" className="btn ghost" onClick={() => setChanging(!changing)}>Request a change</button>}
        {!shared && !v(s, 'shared_as') && canType('fixture', 'edit') && <Link className="btn ghost" to={`/calendar?tab=requests&send=series:${id}`}>Send to shared calendars</Link>}
        {canType('event', 'edit') && <Link className="btn primary" to={`/r/event/new?series=${id}&round=${nextRound}`}>Add round {nextRound}</Link>}
      </PageHeader>
      <div className="event-meta">
        {shared ? <span className="chip static">Shared series — kept by the RaceOps admin</span> : <span className="chip static">Our own series</span>}
      </div>
      {sentMsg && <div className="notice info small">{sentMsg}</div>}
      {changing && <RequestChange data={data} type="series" rec={s} onDone={(x) => { setChanging(false); if (x) setSentMsg('Change sent — a RaceOps admin will check it. See Calendar → Requests.'); }} />}
      <Section title={`Rounds (${rounds.length})`}>
        {rounds.length === 0 ? <p className="muted">No rounds yet.</p> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Rd</th><th>Event</th><th>Track</th><th>Dates</th>{cars.map((c) => <th key={c.id}>#{v(c, 'number')} finish</th>)}<th /></tr></thead>
              <tbody>{rounds.map((e) => {
                const done = (v(e, 'end_date') || v(e, 'date') || '') < t;
                return (
                  <tr key={e.id}>
                    <td><b>{v(e, 'round') || '—'}</b></td>
                    <td><Link to={`/events/${e.id}`}>{v(e, 'name')}</Link>{eventDays(e) > 1 && <small className="muted"> · {eventDays(e)} days</small>}</td>
                    <td>{data.byId[v(e, 'venue')] ? <Link to={`/tracks/${v(e, 'venue')}`}>{eventTrack(e, data)}</Link> : eventTrack(e, data)}</td>
                    <td>{dateRange(e)}</td>
                    {cars.map((c) => { const f = feature(e, c); return <td key={c.id}>{f && v(f, 'finish') ? <b>P{v(f, 'finish')}</b> : <span className="muted">—</span>}</td>; })}
                    <td>{done ? <Pill level="muted">done</Pill> : <Pill level="info">upcoming</Pill>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>
      <div className="grid-2">
        <Section title="Series info">
          <dl className="kv">
            {[['Start', fmtDate(v(s, 'start_date'))], ['End', fmtDate(v(s, 'end_date'))], ['Website', v(s, 'website')]].filter(([, x]) => x)
              .map(([k, x]) => [<dt key={`t${k}`}>{k}</dt>, <dd key={`d${k}`}>{x}</dd>])}
          </dl>
          {v(s, 'points') && <p className="pre"><b>Points:</b> {v(s, 'points')}</p>}
          {v(s, 'notes') && <p className="pre muted">{v(s, 'notes')}</p>}
        </Section>
        <ContactLinks data={data} entity={s} />
      </div>
      {shared && <TeamNotes data={data} entityType="series" entity={s.id} />}
    </div>
  );
}
