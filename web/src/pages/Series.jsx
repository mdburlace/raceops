import { Link, useParams } from 'react-router-dom';
import ContactLinks from '../components/ContactLinks.jsx';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { eventTrack, fmtDate, roundAndTrack, num, titleOf, today, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { dateRange, eventDays } from './Events.jsx';
import { useState } from 'react';
import { addToSeries, linkFor, removeFromSeries, roundLabel, ROUND_PREFIXES, seriesIdsOf } from '@shared/calendar.js';
import { platformList } from '../lib/data.js';
import { saveRecord } from '../lib/store.js';
import { FollowButton, RequestChange, TeamNotes } from '../components/SharedRequests.jsx';
import DayLines from '../components/DayLines.jsx';

// a team's copy of a shared series stands for the shared one
const canonOf = (data) => (x) => v(data.byId[x], 'shared_as') || x;
/** The events in a series (as its main series or one of its others), with their place in this series. */
const roundsOf = (data, id) => {
  const canon = canonOf(data);
  return data.list('event').map((e) => ({ e, link: linkFor(e.data?.values, id, canon) })).filter((x) => x.link)
    .sort((a, b) => (num(a.link.round) ?? 999) - (num(b.link.round) ?? 999) || (v(a.e, 'date') || '').localeCompare(v(b.e, 'date') || ''));
};
const isFeature = (s) => /feature|a-?main/i.test(v(s, 'session') || '');

export function SeriesList() {
  const data = useTeamData();
  const { canType } = useSession();
  if (!data) return null;
  // the team's series, plus shared series it runs in (events or a series entry); a team copy that
  // has been shared stands in for the shared one
  const isGlobal = (r) => !!(r?.global || r?.data?.scope === 'global');
  const used = new Set([...data.list('event').flatMap((e) => seriesIdsOf(e.data?.values)), ...data.list('season_plan').map((p) => v(p, 'series'))]);
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
              const rounds = roundsOf(data, s.id).map((x) => x.e);
              const next = rounds.find((e) => (v(e, 'end_date') || v(e, 'date') || '') >= today());
              return (
                <Link key={s.id} to={`/series/${s.id}`} className="list-row">
                  <span className="grow">
                    <span className="row-title">{v(s, 'name')}</span>
                    <span className="row-sub">{[v(s, 'class'), v(s, 'sanctioning'), `${rounds.length} round${rounds.length === 1 ? '' : 's'}`, next && `next: ${[v(next, 'name'), roundAndTrack(next?.data?.values, eventTrack(next, data)), fmtDate(v(next, 'date'))].filter(Boolean).join(' · ')}`].filter(Boolean).join(' · ')}</span>
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
  const placed = roundsOf(data, id);
  const rounds = placed.map((x) => x.e);
  const cars = data.list('car').filter((c) => v(c, 'active') !== false);
  const nextRound = (Math.max(0, ...placed.map((x) => num(x.link.round) || 0)) || rounds.length) + 1;
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
        {shared && <FollowButton data={data} entityType="series" entity={s.id} />}
        {shared && <a className="chip" href={`/cal/series/${s.id}`} target="_blank" rel="noreferrer">Public page & subscribe</a>}
      </div>
      {sentMsg && <div className="notice info small">{sentMsg}</div>}
      {changing && <RequestChange data={data} type="series" rec={s} onDone={(x) => { setChanging(false); if (x) setSentMsg('Change sent — a RaceOps admin will check it. See Calendar → Requests.'); }} />}
      <Section title={`Rounds (${rounds.length})`}>
        {rounds.length === 0 ? <p className="muted">No rounds yet.</p> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Round</th><th>Event</th><th>Track</th><th>Dates</th>{cars.map((c) => <th key={c.id}>#{v(c, 'number')} finish</th>)}<th /></tr></thead>
              <tbody>{placed.map(({ e, link }) => {
                const done = (v(e, 'end_date') || v(e, 'date') || '') < t;
                return (
                  <tr key={e.id}>
                    <td><b>{roundLabel(link.prefix, link.round) || '—'}</b></td>
                    <td><Link to={`/events/${e.id}`}>{v(e, 'name')}</Link>{eventDays(e) > 1 && <small className="muted"> · {eventDays(e)} days</small>}
                      <DayLines values={e.data?.values} eventId={e.id} compact /></td>
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
      {canType('event', 'edit') && <AddEvents data={data} series={s} placed={placed} nextRound={nextRound} />}
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

/**
 * Add the team's events to this series in one go (each as one of its series, with its round), or take one out.
 * An event already in another series keeps it: this series is added as one more.
 */
function AddEvents({ data, series, placed, nextRound }) {
  const { tid, user } = useSession();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState({});
  const ids = new Set(placed.map((x) => x.e.id));
  const prefixes = platformList('round_prefixes')?.length ? platformList('round_prefixes') : ROUND_PREFIXES;
  const season = String(v(series, 'season') || '').slice(0, 4);
  const others = data.list('event').filter((e) => !ids.has(e.id))
    .filter((e) => !q ? !season || String(v(e, 'date') || '').startsWith(season) : `${v(e, 'name')} ${eventTrack(e, data)}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(v(a, 'date')).localeCompare(String(v(b, 'date'))));
  const toggle = (e) => setPicked((p) => { const n = { ...p }; if (n[e.id]) delete n[e.id]; else n[e.id] = { round: String(nextRound + Object.keys(p).length), prefix: '' }; return n; });
  const set = (id, patch) => setPicked((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const save = async () => {
    for (const [id, r] of Object.entries(picked)) {
      const e = data.byId[id];
      await saveRecord(tid, 'event', id, { ...e.data, values: addToSeries(e.data.values, series.id, { ...r, extra: !!e.data.values.fixture }) }, user.id);
    }
    setPicked({}); setOpen(false);
  };
  const remove = (e) => saveRecord(tid, 'event', e.id, { ...e.data, values: removeFromSeries(e.data.values, series.id) }, user.id);
  return (
    <Section title="Add events to this series" actions={<button type="button" className="btn ghost small" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Add events'}</button>}>
      {!open ? <p className="muted small">Add events you already have — an event can count towards more than one series, each with its own round.</p> : (
        <>
          <input type="search" placeholder="Search all events" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
          {others.length === 0 ? <p className="muted">No other events{season && !q ? ` in ${season}` : ''}.</p> : (
            <div className="list" data-testid="add-events">{others.slice(0, 60).map((e) => (
              <div key={e.id} className="list-row">
                <label className="check-row grow"><input type="checkbox" checked={!!picked[e.id]} onChange={() => toggle(e)} />
                  <span>{v(e, 'name')} <span className="muted small">· {dateRange(e)}{seriesIdsOf(e.data?.values).length ? ` · also in ${seriesIdsOf(e.data.values).map((x) => titleOf(data.byId[x])).join(', ')}` : ''}</span></span></label>
                {picked[e.id] && (
                  <span className="row-actions">
                    <input aria-label={`Prefix for ${v(e, 'name')}`} list="dl-series-prefix" placeholder="Round" value={picked[e.id].prefix} onChange={(x) => set(e.id, { prefix: x.target.value })} style={{ width: 110 }} />
                    <input aria-label={`Round for ${v(e, 'name')}`} inputMode="numeric" value={picked[e.id].round} onChange={(x) => set(e.id, { round: x.target.value })} style={{ width: 70 }} />
                  </span>
                )}
              </div>
            ))}</div>
          )}
          <datalist id="dl-series-prefix">{prefixes.map((o) => <option key={o} value={o} />)}</datalist>
          <div className="row-actions"><button type="button" className="btn primary" disabled={!Object.keys(picked).length} onClick={save}>Add {Object.keys(picked).length || ''} to {v(series, 'name')}</button></div>
          {placed.length > 0 && (
            <>
              <h4 className="subhead">In this series</h4>
              <div className="list">{placed.map(({ e, link }) => (
                <div key={e.id} className="list-row"><span className="grow">{roundLabel(link.prefix, link.round)} · {v(e, 'name')}</span>
                  <button type="button" className="btn small ghost danger" onClick={() => remove(e)}>Take out</button></div>
              ))}</div>
            </>
          )}
        </>
      )}
    </Section>
  );
}
