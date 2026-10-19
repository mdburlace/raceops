import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { classMatches } from '@shared/tracks.js';
import ContactLinks from '../components/ContactLinks.jsx';
import { TrackDates } from './Calendar.jsx';
import { Empty, PageHeader, Pill, Section, useOnline } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { fmtDate, titleOf, useTeamData, v, platformList } from '../lib/data.js';
import { deleteRecord, saveRecord } from '../lib/store.js';
import { useSession } from '../lib/session.jsx';
import { dateRange } from './Events.jsx';

const place = (t) => [v(t, 'city'), v(t, 'region'), v(t, 'country')].filter(Boolean).join(', ');
const isGlobal = (r) => !!(r?.global || r?.data?.scope === 'global');

const nameKey = (x) => String(x || '').trim().toLowerCase();

/** Events held at each track: by the event's directory track, or by the typed track name. */
export function eventsByTrack(data) {
  const tracks = data.list('track');
  const byName = new Map(tracks.map((t) => [nameKey(v(t, 'name')), t.id]));
  const out = new Map();
  for (const e of data.list('event')) {
    const id = v(e, 'venue') || byName.get(nameKey(v(e, 'track')));
    if (id) out.set(id, (out.get(id) || 0) + 1);
  }
  return out;
}

/**
 * Our tracks: tracks we've raced at (have an event there), tracks we linked by hand, and our own
 * team-only tracks — minus any we've hidden. Starts empty for a new team. Classes we race only
 * marks matching tracks in the Directory; it doesn't add them.
 */
export function useTeamTracks(data) {
  const { membership } = useSession();
  const classes = membership?.settings?.classes || [];
  return useMemo(() => {
    if (!data) return { classes, mine: [], links: new Map(), raced: new Map() };
    const links = new Map(data.list('team_track').map((tt) => [v(tt, 'track'), tt]));
    const raced = eventsByTrack(data);
    const mine = [];
    for (const t of data.list('track')) {
      const link = links.get(t.id);
      const matched = classes.length ? classMatches(classes, v(t, 'classes')) : [];
      const hidden = v(link, 'link') === 'Hidden';
      const manual = v(link, 'link') === 'Linked';
      const events = raced.get(t.id) || 0;
      if (!hidden && (manual || events || !isGlobal(t))) mine.push({ t, link, matched, manual, events });
    }
    mine.sort((a, b) => (v(b.link, 'home') ? 1 : 0) - (v(a.link, 'home') ? 1 : 0) || titleOf(a.t).localeCompare(titleOf(b.t)));
    return { classes, mine, links, raced };
  }, [data, classes.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
}

function TeamClasses({ data, classes }) {
  const { tid, can, refresh, membership } = useSession();
  const online = useOnline();
  const [edit, setEdit] = useState(false);
  const [list, setList] = useState(classes);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const all = useMemo(() => [...new Set([...(platformList('race_classes') || []), ...[...new Set(data.list('track').flatMap((t) => v(t, 'classes') || []))].sort()])], [data]);
  const carClasses = [...new Set(data.list('car').map((c) => v(c, 'class')).filter(Boolean))];
  const save = async () => {
    try {
      await api(`/t/${tid}`, { method: 'PATCH', body: { settings: { ...(membership.settings || {}), classes: list } } });
      await refresh(); setEdit(false); setErr('');
    } catch (e) { setErr(e.message); }
  };
  const add = (x) => { const c = x.trim(); if (c && !list.includes(c)) setList([...list, c]); setText(''); };
  return (
    <section className="card">
      <div className="card-head">
        <h3>Classes we race</h3>
        {can('team.manage') && !edit && <button type="button" className="btn small ghost" onClick={() => { setList(classes); setEdit(true); }}>Edit</button>}
      </div>
      {!edit ? (
        classes.length ? <div className="chips">{classes.map((c) => <span key={c} className="chip static">{c}</span>)}</div>
          : <p className="muted">Set your classes (e.g. 410 Sprintcars). Tracks that run them are marked in the Directory, and you can filter to them.</p>
      ) : (
        <>
          <div className="tags-input">
            {list.map((c) => <span key={c} className="chip active">{c}<button type="button" aria-label={`Remove ${c}`} onClick={() => setList(list.filter((x) => x !== c))}>×</button></span>)}
            <input list="dl-classes" value={text} placeholder="Add a class…" aria-label="Add class" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }} />
            <datalist id="dl-classes">{all.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          {carClasses.length > 0 && <p className="small muted">From your cars: {carClasses.map((c) => <button key={c} type="button" className="link small" onClick={() => add(c)}>{c}</button>)}</p>}
          {err && <p className="error-text">{err}</p>}
          <div className="inline-row end">
            <button type="button" className="btn small ghost" onClick={() => setEdit(false)}>Cancel</button>
            <button type="button" className="btn small primary" disabled={!online} onClick={save}>Save classes</button>
          </div>
        </>
      )}
    </section>
  );
}

export function TrackDirectory() {
  const data = useTeamData();
  const { canType, user } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'mine';
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState('Active');
  const [cls, setCls] = useState('');
  const [ourClasses, setOurClasses] = useState(false);
  const [limit, setLimit] = useState(100);
  const team = useTeamTracks(data);
  const all = data ? data.list('track') : [];
  const countries = [...new Set(all.map((t) => v(t, 'country')).filter(Boolean))].sort();
  const regions = [...new Set(all.filter((t) => !country || v(t, 'country') === country).map((t) => v(t, 'region')).filter(Boolean))].sort();
  const filtered = all.filter((t) => (!country || v(t, 'country') === country) && (!region || v(t, 'region') === region)
    && (!status || v(t, 'status') === status)
    && (!cls || classMatches([cls], v(t, 'classes')).length)
    && (!ourClasses || classMatches(team.classes, v(t, 'classes')).length)
    && (!q || `${v(t, 'name')} ${place(t)}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => String(v(a, 'country')).localeCompare(String(v(b, 'country'))) || String(v(a, 'region')).localeCompare(String(v(b, 'region'))) || titleOf(a).localeCompare(titleOf(b)));
  if (!data) return null;
  const eventsAt = (id) => team.raced.get(id) || 0;

  const Row = ({ t, link, matched, manual }) => (
    <Link to={`/tracks/${t.id}`} className="list-row">
      <span className="grow">
        <span className="row-title">{v(t, 'name')}{v(link, 'home') ? <Pill level="ok">home</Pill> : null}</span>
        <span className="row-sub">{[place(t), v(t, 'length'), v(t, 'surface')].filter(Boolean).join(' · ')}</span>
      </span>
      {manual && <Pill level="info">linked</Pill>}
      {!manual && eventsAt(t.id) > 0 && v(link, 'link') !== 'Hidden' && <Pill level="info">raced here</Pill>}
      {matched?.length > 0 && <Pill level="muted">our class: {matched[0]}</Pill>}
      {!isGlobal(t) && <Pill level="warn">team track</Pill>}
      {v(t, 'status') !== 'Active' && <Pill level="muted">{v(t, 'status')}</Pill>}
      <span className="row-meta">{eventsAt(t.id) ? `${eventsAt(t.id)} event${eventsAt(t.id) === 1 ? '' : 's'}` : ''}</span>
    </Link>
  );

  return (
    <div>
      <PageHeader title="Tracks" sub={`${all.length} tracks in the directory · ${team.mine.length} linked to your team`}>
        {canType('track', 'edit') && <Link className="btn primary" to="/r/track/new">{user?.is_platform_admin ? 'New track' : 'Add a missing track'}</Link>}
      </PageHeader>
      <TeamClasses data={data} classes={team.classes} />
      <div className="tabs">
        <button type="button" className={tab === 'mine' ? 'active' : ''} onClick={() => setParams({})}>Our tracks ({team.mine.length})</button>
        <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setParams({ tab: 'all' })}>Directory</button>
      </div>
      {tab === 'mine' ? (
        team.mine.length === 0 ? <Empty>No tracks yet. A track is added here when you create an event at it, or open a track in the Directory and choose “Link to team”.</Empty> : (
          <div className="card list">{team.mine.map((x) => <Row key={x.t.id} {...x} />)}</div>
        )
      ) : (
        <>
          <div className="toolbar">
            <input type="search" placeholder="Search name or town" value={q} onChange={(e) => { setQ(e.target.value); setLimit(100); }} />
            <select value={country} onChange={(e) => { setCountry(e.target.value); setRegion(''); }} aria-label="Country">
              <option value="">All countries</option>{countries.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="State or region">
              <option value="">All states / regions</option>{regions.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">Any status</option><option>Active</option><option>Inactive</option><option>Closed</option>
            </select>
            <input list="dl-cls-filter" placeholder="Class" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class" />
            {team.classes.length > 0 && <label className="toggle small"><input type="checkbox" checked={ourClasses} onChange={(e) => setOurClasses(e.target.checked)} /><span>Runs our classes</span></label>}
            <datalist id="dl-cls-filter">{[...new Set(all.flatMap((t) => v(t, 'classes') || []))].sort().map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <p className="muted small">{filtered.length} tracks</p>
          <div className="card list">
            {filtered.slice(0, limit).map((t) => {
              const link = team.links.get(t.id);
              return <Row key={t.id} t={t} link={link} manual={v(link, 'link') === 'Linked'} matched={team.classes.length ? classMatches(team.classes, v(t, 'classes')) : []} />;
            })}
          </div>
          {filtered.length > limit && <button type="button" className="btn" onClick={() => setLimit(limit + 200)}>Show more</button>}
        </>
      )}
    </div>
  );
}

export function TrackDetail() {
  const { id } = useParams();
  const data = useTeamData();
  const { tid, user, canType } = useSession();
  const team = useTeamTracks(data);
  if (!data) return null;
  const t = data.byId[id];
  if (!t) return <PageHeader title="Track not found" back="/tracks" />;
  const link = team.links.get(id);
  const matched = team.classes.length ? classMatches(team.classes, v(t, 'classes')) : [];
  const racedHere = team.raced.get(id) || 0;
  const hidden = v(link, 'link') === 'Hidden';
  const linked = !hidden && (v(link, 'link') === 'Linked' || racedHere > 0 || !isGlobal(t));
  const canEditLink = canType('team_track', 'edit');
  const canEditTrack = canType('track', 'edit') && (!isGlobal(t) || user?.is_platform_admin);
  const ttForm = data.list('form').find((f) => f.data.target === 'team_track' && f.data.is_default);
  const setLink = async (patch) => {
    if (link) await saveRecord(tid, 'team_track', link.id, { ...link.data, values: { ...link.data.values, ...patch } }, user.id);
    else await saveRecord(tid, 'team_track', null, { form_id: ttForm?.id, values: { track: id, link: 'Linked', ...patch } }, user.id);
  };
  const unlink = async () => {
    if (racedHere || !isGlobal(t)) await setLink({ link: 'Hidden', home: false });
    else if (link) await deleteRecord(link.id);
  };
  const events = data.list('event').filter((e) => v(e, 'venue') === id || (!v(e, 'venue') && nameKey(v(e, 'track')) === nameKey(v(t, 'name')))).sort((a, b) => (v(b, 'date') || '').localeCompare(v(a, 'date') || ''));
  const setups = data.list('setup').filter((s) => events.some((e) => e.id === v(s, 'event')));
  const mapUrl = v(t, 'lat') && v(t, 'lon')
    ? `https://www.google.com/maps/search/?api=1&query=${v(t, 'lat')},${v(t, 'lon')}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v(t, 'name')} ${place(t)}`)}`;
  const web = v(t, 'website');
  const details = [['Track size', v(t, 'length')], ['Surface', v(t, 'surface')], ['Dirt type', v(t, 'dirt_type')], ['Banking', v(t, 'banking')],
    ['Radius', v(t, 'radius')], ['Cushion', v(t, 'cushion')], ['Typical', v(t, 'typical')], ['Address', v(t, 'address')],
    ['Contact number', v(t, 'phone')], ['Status', v(t, 'status')]].filter(([, x]) => x);

  return (
    <div>
      <PageHeader title={v(t, 'name')} sub={place(t)} back="/tracks">
        {canEditLink && (linked
          ? <>
              <button type="button" className="btn ghost" onClick={() => setLink({ home: !v(link, 'home'), link: 'Linked' })}>{v(link, 'home') ? 'Unset home track' : 'Make home track'}</button>
              <button type="button" className="btn ghost danger" onClick={unlink}>{racedHere || !isGlobal(t) ? 'Hide from our tracks' : 'Unlink'}</button>
            </>
          : <>
              <button type="button" className="btn ghost" onClick={() => setLink({ link: 'Linked', home: true })}>Make home track</button>
              <button type="button" className="btn primary" onClick={() => setLink({ link: 'Linked' })}>{hidden ? 'Show in our tracks' : 'Link to team'}</button>
            </>)}
        {canEditTrack && <Link className="btn" to={`/r/track/${id}`}>Edit track</Link>}
      </PageHeader>
      <div className="event-meta">
        {isGlobal(t) ? <span className="chip static">Shared directory</span> : <span className="chip static">Team-only track</span>}
        {linked && <span className="chip static">{v(link, 'link') === 'Linked' ? 'Linked to team' : racedHere ? `Raced here (${racedHere} event${racedHere === 1 ? '' : 's'})` : 'Our team track'}</span>}
        {matched.length > 0 && <span className="chip static">Runs our class: {matched.join(', ')}</span>}
        {v(link, 'link') === 'Hidden' && <span className="chip static">Hidden from our tracks</span>}
      </div>
      <div className="grid-2">
        <Section title="Track">
          {details.length ? <dl className="kv">{details.map(([k, x]) => [<dt key={`t${k}`}>{k}</dt>, <dd key={`d${k}`}>{x}</dd>])}</dl> : <p className="muted">No details yet.</p>}
          <div className="inline-row wrap" style={{ marginTop: 10 }}>
            <a className="btn small ghost" href={mapUrl} target="_blank" rel="noreferrer">Map</a>
            {web && <a className="btn small ghost" href={/^https?:/i.test(web) ? web : `https://${web}`} target="_blank" rel="noreferrer">Website</a>}
          </div>
          {v(t, 'notes') && <p className="pre muted">{v(t, 'notes')}</p>}
        </Section>
        <Section title="Classes" actions={link && canEditLink && <Link className="btn small ghost" to={`/r/team_track/${link.id}`}>Team notes</Link>}>
          <div className="chips">{(v(t, 'classes') || []).map((c) => <span key={c} className={`chip static${matched.includes(c) ? ' match' : ''}`}>{c}</span>)}</div>
          {v(link, 'notes') && <p className="pre"><b>Team notes:</b> {v(link, 'notes')}</p>}
        </Section>
      </div>
      <TrackDates data={data} trackId={t.id} />
      <ContactLinks data={data} entity={t} />
      <Section title={`Our events here (${events.length})`} actions={canType('event', 'edit') && <Link className="btn small" to={`/r/event/new?venue=${id}`}>New event here</Link>}>
        {events.length === 0 ? <p className="muted">No events recorded at this track yet.</p> : (
          <div className="list">{events.map((e) => (
            <Link key={e.id} to={`/events/${e.id}`} className="list-row">
              <span className="grow"><span className="row-title">{v(e, 'name')}</span><span className="row-sub">{dateRange(e)}{data.byId[v(e, 'series')] ? ` · ${titleOf(data.byId[v(e, 'series')])}` : ''}</span></span>
              <span className="row-meta">{setups.filter((s) => v(s, 'event') === e.id).length} sheets</span>
            </Link>
          ))}</div>
        )}
      </Section>
    </div>
  );
}

/** Platform admin: import / refresh the track directory from a JSON file. */
export function TrackImport() {
  const [mode, setMode] = useState('fill');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async (file) => {
    setBusy(true); setMsg('');
    try {
      const json = JSON.parse(await file.text());
      const tracks = Array.isArray(json) ? json : json.tracks;
      const r = await api('/admin/tracks/import', { method: 'POST', body: { tracks, mode } });
      setMsg(`Imported: ${r.added} added, ${r.updated} updated, ${r.skipped} unchanged. Devices pick them up on next sync.`);
    } catch (e) { setMsg(e.message.includes('JSON') ? 'That file is not valid JSON.' : e.message); } finally { setBusy(false); }
  };
  return (
    <Section title="Track directory import">
      <p className="muted small">JSON in the same layout as the supplied track lists (an object with a <code>tracks</code> array). Tracks are matched by their <code>id</code>.</p>
      <div className="inline-row wrap">
        <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Import mode">
          <option value="add">Add new tracks only</option>
          <option value="fill">Add new + fill empty fields</option>
          <option value="overwrite">Add new + overwrite with file values</option>
        </select>
        <label className={`btn${busy ? ' disabled' : ''}`}>{busy ? 'Importing…' : 'Choose JSON file'}
          <input type="file" hidden accept=".json,application/json" onChange={(e) => { if (e.target.files[0]) run(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>
      {msg && <p className="small">{msg}</p>}
    </Section>
  );
}

export { fmtDate };
