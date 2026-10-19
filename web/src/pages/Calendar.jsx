// Calendars: the team's own calendar for a racing year (its events, with whether the team is going
// and what happened), the shared series and track calendars every team can pull dates from,
// series entries (full or partial), importing published calendars, printing and publishing.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import FormRenderer from '../components/FormRenderer.jsx';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { fileToPart } from '../lib/ai.js';
import { fmtDate, formFor, num, titleOf, today, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { deleteRecord, saveRecord } from '../lib/store.js';
import {
  INTENTS, MONTHS, OUTCOMES, WITHDREW, WITHDRAW_REASONS, carsForFixture, entryStatus, eventFromFixture, fixtureChanges,
  fixtureClasses, inSeason, matchTrack, sameFixture, seasonLabel, seasonMatches, seasonOf, seasonStart, seasonSummary,
} from '@shared/calendar.js';

const isGlobal = (r) => !!(r?.global || r?.data?.scope === 'global');
const vals = (r) => r?.data?.values || {};
const lc = (s) => String(s ?? '').trim().toLowerCase();
const dateRangeOf = (x) => (x.end_date && x.end_date !== x.date ? `${fmtDate(x.date)} – ${fmtDate(x.end_date)}` : fmtDate(x.date));
const dow = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' }) : '');

/** The racing year shown (?year=), and the month the team's year starts. */
export function useRacingYear() {
  const { membership } = useSession();
  const [params, setParams] = useSearchParams();
  const sm = seasonStart(membership?.settings);
  const year = num(params.get('year')) || seasonOf(today(), sm);
  const setYear = (y) => { const p = new URLSearchParams(params); p.set('year', String(y)); setParams(p, { replace: true }); };
  return { sm, year, setYear, label: seasonLabel(year, sm) };
}

/** Series id as the shared calendar knows it (a team series that has been shared points at the shared one). */
const canon = (data, id) => (id && vals(data.byId[id]).shared_as) || id;
/** The team's own copy of a shared series, if it has one, else the shared series. */
const localSeries = (data, id) => (id && data.list('series').find((s) => !isGlobal(s) && vals(s).shared_as === id)?.id) || id;
const trackName = (data, x) => (x.venue && data.byId[x.venue] ? vals(data.byId[x.venue]).name : x.track || '');
const seriesName = (data, id) => (id && data.byId[id] ? vals(data.byId[id]).name : '');

/** Team events in the racing year, shaped for lists, the month view, print and summaries. */
export function teamItems(data, year, sm, { notGoing = true } = {}) {
  return data.list('event').map((e) => ({ e, x: vals(e) }))
    .filter(({ x }) => inSeason(x.date, x.end_date, year, sm) && (notGoing || x.intent !== 'Not going'))
    .map(({ e, x }) => {
      const car = data.byId[x.car];
      const fx = data.byId[x.fixture];
      return {
        id: e.id, rec: e, values: x, date: x.date, end_date: x.end_date || '', name: x.name || 'Event', track: trackName(data, x),
        location: x.location || '', series: seriesName(data, x.series), round: x.round || '', car: car ? titleOf(car) : '',
        tentative: x.intent === 'Tentative', notGoing: x.intent === 'Not going',
        cancelled: vals(fx).status === 'Cancelled' || x.outcome === 'Event cancelled', fx, changes: fx ? fixtureChanges(x, vals(fx)) : [],
        result: x.outcome ? (x.outcome === WITHDREW ? `Withdrew${x.withdraw_reason ? ` — ${x.withdraw_reason}` : ''}` : x.outcome) : '', note: x.public_note || '',
      };
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.name.localeCompare(b.name));
}

/** Shared dates in the racing year: approved ones plus this team's own suggestions. */
function sharedFixtures(data, year, sm) {
  return data.list('fixture').filter((f) => (isGlobal(f) || vals(f).review) && inSeason(vals(f).date, vals(f).end_date, year, sm))
    .sort((a, b) => (vals(a).date || '').localeCompare(vals(b).date || '') || (num(vals(a).round) || 0) - (num(vals(b).round) || 0));
}

// ======================================================================= page
export function CalendarPage() {
  const data = useTeamData();
  const { canType, can, membership } = useSession();
  const { sm, year, setYear, label } = useRacingYear();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'ours';
  const setTab = (t) => { const p = new URLSearchParams(params); p.set('tab', t); setParams(p, { replace: true }); };
  const [publishing, setPublishing] = useState(false);
  if (!data) return null;
  const published = !!membership?.settings?.calendar_publish?.token;
  return (
    <div>
      <PageHeader title="Calendar" sub="Your racing year — pull dates from the series and track calendars, plan which car runs, record what happened"
        below={(
          <div className="cal-head">
            <div className="year-pick" role="group" aria-label="Racing year">
              <button type="button" className="icon-btn" aria-label="Previous year" onClick={() => setYear(year - 1)}>‹</button>
              <b data-testid="cal-year">{label}</b>
              <button type="button" className="icon-btn" aria-label="Next year" onClick={() => setYear(year + 1)}>›</button>
            </div>
            <div className="tabs">
              {[['ours', 'Our calendar'], ['shared', 'Series & track calendars'], ['entries', 'Series entries']].map(([k, l]) => (
                <button key={k} type="button" className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
          </div>
        )}>
        <Link className="btn ghost" to={`/print/calendar?year=${year}`}>Print</Link>
        {can('team.manage') && <button type="button" className={`btn ${publishing ? 'primary' : 'ghost'}`} onClick={() => setPublishing(!publishing)}>{published ? 'Published' : 'Publish'}</button>}
        {canType('event', 'edit') && <Link className="btn primary" to="/r/event/new?back=/calendar">New event</Link>}
      </PageHeader>
      {publishing && <PublishPanel onClose={() => setPublishing(false)} />}
      {tab === 'ours' && <OurCalendar data={data} year={year} sm={sm} label={label} goShared={() => setTab('shared')} />}
      {tab === 'shared' && <SharedCalendars data={data} year={year} sm={sm} label={label} />}
      {tab === 'entries' && <SeriesEntries data={data} year={year} sm={sm} label={label} />}
    </div>
  );
}

// ======================================================================= our calendar
function OurCalendar({ data, year, sm, label, goShared }) {
  const { prefs, setPrefs } = useSession();
  const view = prefs.calendar_view === 'month' ? 'month' : 'agenda';
  const [showNot, setShowNot] = useState(false);
  const items = teamItems(data, year, sm);
  const shown = items.filter((i) => showNot || !i.notGoing);
  const sum = seasonSummary(items.map((i) => i.values));
  const t = today();
  return (
    <>
      <div className="kpis" data-testid="cal-summary">
        <div className="kpi"><span className="kpi-label">Planned</span><span className="kpi-value">{sum.planned}</span>{sum.tentative > 0 && <span className="muted small">{sum.tentative} tentative</span>}</div>
        <div className="kpi"><span className="kpi-label">Ran</span><span className="kpi-value">{sum.ran}</span></div>
        <div className="kpi"><span className="kpi-label">Feature starts</span><span className="kpi-value">{sum.features}</span>{sum.missedFeature > 0 && <span className="muted small">{sum.missedFeature} missed the feature</span>}</div>
        <div className="kpi"><span className="kpi-label">Withdrew</span><span className="kpi-value">{sum.withdrew}</span>
          {Object.keys(sum.reasons).length > 0 && <span className="muted small">{Object.entries(sum.reasons).map(([r, n]) => `${r} ${n}`).join(', ')}</span>}</div>
      </div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Calendar view">
          {[['agenda', 'List'], ['month', 'Month']].map(([k, l]) => <button key={k} type="button" className={view === k ? 'active' : ''} aria-pressed={view === k} onClick={() => setPrefs({ calendar_view: k })}>{l}</button>)}
        </div>
        {items.some((i) => i.notGoing) && <label className="check-row"><input type="checkbox" checked={showNot} onChange={(e) => setShowNot(e.target.checked)} /> Show “Not going”</label>}
      </div>
      {items.length === 0 && (
        <Empty>
          Nothing on the {label} calendar yet. <button type="button" className="link" onClick={goShared}>Pull dates from the series and track calendars</button> or add an event.
        </Empty>
      )}
      {view === 'month' ? <MonthGrid items={shown} year={year} sm={sm} /> : (
        <div className="list cal-list" data-testid="cal-list">
          {shown.map((i) => <CalendarRow key={i.id} i={i} data={data} past={(i.end_date || i.date) < t} />)}
        </div>
      )}
    </>
  );
}

function CalendarRow({ i, data, past }) {
  const st = entryStatus(i.values, today());
  return (
    <div className={`list-row cal-row${i.notGoing ? ' not-going' : ''}${i.cancelled ? ' cancelled' : ''}`} data-event={i.id}>
      <span className="date-block">
        <b>{new Date(`${i.date}T00:00:00`).getDate() || '–'}</b>
        <small>{i.date ? new Date(`${i.date}T00:00:00`).toLocaleString(undefined, { month: 'short' }) : ''} {dow(i.date)}</small>
      </span>
      <span className="grow">
        <Link className="row-title" to={`/events/${i.id}`}>{i.name}</Link>
        <span className="row-sub">{[i.track, i.series && `${i.series}${i.round ? ` · Rd ${i.round}` : ''}`, i.car, i.end_date && i.end_date !== i.date && `to ${fmtDate(i.end_date)}`].filter(Boolean).join(' · ')}</span>
        {i.cancelled && <span className="pill pill-over">Cancelled</span>}
        {i.changes.filter((c) => c.key !== 'status').length > 0 && <FixtureMoved ev={i.rec} fx={i.fx} changes={i.changes} data={data} />}
      </span>
      <span className="row-meta cal-status">
        <EntryResult ev={i.rec} compact past={past} />
        <span className="sr-only">{st.label}</span>
      </span>
    </div>
  );
}

/** "The series moved this date" — offer to bring the team's entry into line. */
function FixtureMoved({ ev, fx, changes, data }) {
  const { tid, user, canType } = useSession();
  const shown = changes.filter((c) => c.key !== 'status');
  const fmt = (c, x) => (c.key === 'venue' ? trackName(data, { venue: x }) : fmtDate(x) || '—');
  const apply = () => {
    const x = { ...vals(ev) };
    for (const c of shown) x[c.key] = c.now;
    saveRecord(tid, 'event', ev.id, { ...ev.data, values: x }, user.id);
  };
  return (
    <span className="notice small fx-moved" data-testid="fixture-moved">
      The shared calendar changed: {shown.map((c) => `${c.label} ${fmt(c, c.was)} → ${fmt(c, c.now)}`).join(', ')}.
      {canType('event', 'edit') && <> <button type="button" className="link" onClick={apply}>Update ours</button></>}
    </span>
  );
}

/** Going? before the event; what happened (and why they withdrew) after. Saves straight away. */
export function EntryResult({ ev, compact, past: pastIn }) {
  const { tid, user, canType } = useSession();
  const x = vals(ev);
  const past = pastIn ?? (x.date || '') <= today();
  const canEdit = canType('event', 'edit');
  const set = (patch) => saveRecord(tid, 'event', ev.id, { ...ev.data, values: { ...x, ...patch } }, user.id);
  const st = entryStatus(x, today());
  if (!canEdit) return <Pill level={st.level}>{st.label}</Pill>;
  const name = x.name || 'event';
  return (
    <span className={`entry-result${compact ? ' compact' : ''}`}>
      {(!past || !x.outcome) && (
        <select aria-label={`Going to ${name}?`} value={x.intent || 'Planned'} onChange={(e) => set({ intent: e.target.value })}>
          {INTENTS.map((o) => <option key={o}>{o}</option>)}
        </select>
      )}
      {past && x.intent !== 'Not going' && (
        <select aria-label={`What happened at ${name}`} className={x.outcome ? '' : 'needs'} value={x.outcome || ''} onChange={(e) => set({ outcome: e.target.value })}>
          <option value="">What happened?</option>
          {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
        </select>
      )}
      {x.outcome === WITHDREW && (
        <select aria-label={`Why we withdrew from ${name}`} value={x.withdraw_reason || ''} onChange={(e) => set({ withdraw_reason: e.target.value })}>
          <option value="">Reason…</option>
          {[...new Set([...WITHDRAW_REASONS, ...(x.withdraw_reason ? [x.withdraw_reason] : [])])].map((o) => <option key={o}>{o}</option>)}
        </select>
      )}
    </span>
  );
}

function MonthGrid({ items, year, sm }) {
  const months = Array.from({ length: 12 }, (_, k) => { const m = (sm - 1 + k) % 12; return { y: year + Math.floor((sm - 1 + k) / 12), m }; });
  const pad = (n) => String(n).padStart(2, '0');
  return (
    <div className="month-grid" data-testid="cal-month">
      {months.map(({ y, m }) => {
        const first = new Date(y, m, 1); const days = new Date(y, m + 1, 0).getDate();
        const lead = (first.getDay() + 6) % 7; // Monday first
        const on = (d) => { const ds = `${y}-${pad(m + 1)}-${pad(d)}`; return items.filter((i) => i.date <= ds && (i.end_date || i.date) >= ds); };
        const any = items.some((i) => i.date.slice(0, 7) === `${y}-${pad(m + 1)}` || (i.end_date || '').slice(0, 7) === `${y}-${pad(m + 1)}`);
        return (
          <section key={`${y}-${m}`} className={`month card${any ? '' : ' empty-month'}`}>
            <h3>{MONTHS[m]} {y}</h3>
            <div className="mg">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, k) => <span key={`h${k}`} className="mg-h">{d}</span>)}
              {Array.from({ length: lead }, (_, k) => <span key={`b${k}`} />)}
              {Array.from({ length: days }, (_, k) => {
                const list = on(k + 1);
                return (
                  <span key={k} className={`mg-d${list.length ? ' has' : ''}${list.some((i) => i.tentative) && !list.some((i) => !i.tentative) ? ' tent' : ''}`}
                    title={list.map((i) => `${i.name}${i.track ? ` — ${i.track}` : ''}`).join('\n')}>
                    {list.length ? <Link to={`/events/${list[0].id}`} aria-label={`${k + 1} ${MONTHS[m]}: ${list.map((i) => i.name).join(', ')}`}>{k + 1}</Link> : k + 1}
                  </span>
                );
              })}
            </div>
            {any && <ul className="mg-list">{items.filter((i) => i.date.slice(0, 7) === `${y}-${pad(m + 1)}`).map((i) => <li key={i.id}><b>{Number(i.date.slice(8))}</b> <Link to={`/events/${i.id}`}>{i.name}</Link>{i.tentative ? <small className="muted"> (tentative)</small> : ''}</li>)}</ul>}
          </section>
        );
      })}
    </div>
  );
}

// ======================================================================= shared calendars
function SharedCalendars({ data, year, sm, label }) {
  const { canType, user, membership } = useSession();
  const [params, setParams] = useSearchParams();
  const filter = params.get('show') || 'ours';
  const setFilter = (f) => { const p = new URLSearchParams(params); p.set('show', f); setParams(p, { replace: true }); };
  const [editing, setEditing] = useState(null); // { rec?, initial? }
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(null); // fixture being added
  const [entering, setEntering] = useState(null); // series id for a new entry
  const canSuggest = canType('fixture', 'edit');
  const admin = !!user?.is_platform_admin;
  const all = sharedFixtures(data, year, sm);
  const cars = data.list('car').map((c) => ({ id: c.id, values: vals(c) }));
  const ourClasses = new Set([...(membership?.settings?.classes || []), ...cars.filter((c) => c.values.active !== false).map((c) => c.values.class)].filter(Boolean).map(lc));
  const entries = data.list('season_plan').filter((p) => seasonMatches(vals(p).season, year, sm));
  const enteredSeries = new Set(entries.map((p) => canon(data, vals(p).series)));
  const onCal = (f) => data.list('event').filter((e) => v(e, 'fixture') === f.id);
  const ours = (f) => onCal(f).length > 0 || enteredSeries.has(canon(data, vals(f).series))
    || fixtureClasses(vals(f), vals(data.byId[vals(f).series])).some((c) => ourClasses.has(lc(c)));
  const [kind, id] = filter.split(':');
  // a suggested change shows on the date it changes, not as a date of its own
  const changeFor = (f) => all.find((c) => vals(c).replaces === f.id && !isGlobal(c));
  const list = all.filter((f) => isGlobal(f) || !vals(f).replaces).filter((f) => (filter === 'all' ? true : kind === 'series' ? canon(data, vals(f).series) === id : kind === 'track' ? vals(f).venue === id : ours(f)));
  // series and tracks that have shared dates this year
  const seriesOpts = [...new Set(all.map((f) => canon(data, vals(f).series)).filter(Boolean))].map((s) => [s, seriesName(data, s)]).sort((a, b) => a[1].localeCompare(b[1]));
  const trackOpts = [...new Set(all.map((f) => vals(f).venue).filter(Boolean))].map((t) => [t, trackName(data, { venue: t })]).sort((a, b) => a[1].localeCompare(b[1]));
  const pick = kind === 'series' ? id : '';
  const pending = all.filter((f) => vals(f).review === 'pending').length;

  return (
    <>
      <p className="muted small">Dates for every series and track, shared by all teams. Pull the ones you race into your calendar.
        {canSuggest && !admin && ' Missing a date, or one is wrong? Suggest it — it goes live for everyone once a RaceOps admin approves it.'}</p>
      <div className="toolbar">
        <select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="ours">Matching our cars & series</option>
          <option value="all">All dates in {label}</option>
          {seriesOpts.length > 0 && <optgroup label="Series">{seriesOpts.map(([s, n]) => <option key={s} value={`series:${s}`}>{n}</option>)}</optgroup>}
          {trackOpts.length > 0 && <optgroup label="Tracks">{trackOpts.map(([t, n]) => <option key={t} value={`track:${t}`}>{n}</option>)}</optgroup>}
        </select>
        <span className="grow" />
        {canSuggest && <button type="button" className="btn ghost" onClick={() => { setImporting(!importing); setEditing(null); }}>Import a calendar</button>}
        {canSuggest && <button type="button" className="btn ghost" onClick={() => { setEditing({ initial: { series: pick ? id : '', venue: kind === 'track' ? id : '' } }); setImporting(false); }}>{admin ? 'Add a date' : 'Suggest a date'}</button>}
        {pick && canType('season_plan', 'edit') && <button type="button" className="btn primary" onClick={() => setEntering(id)}>Enter this series</button>}
      </div>
      {pending > 0 && <div className="notice info small">{pending === 1 ? 'Your suggested date is' : `${pending} of your suggested dates are`} waiting for a RaceOps admin to approve.</div>}
      {importing && <ImportPanel data={data} year={year} sm={sm} seriesId={pick} trackId={kind === 'track' ? id : ''} onDone={() => setImporting(false)} />}
      {editing && <FixtureEditor data={data} rec={editing.rec} initial={editing.initial} onDone={() => setEditing(null)} />}
      {entering && <EntryEditor data={data} year={year} sm={sm} initial={{ series: entering }} onDone={() => setEntering(null)} />}
      {list.length === 0 ? (
        <Empty>{filter === 'ours'
          ? <>No shared dates in {label} match your cars’ classes or series yet. <button type="button" className="link" onClick={() => setFilter('all')}>Show all dates</button>{canSuggest && ', import a published calendar or suggest a date.'}</>
          : `No shared dates here for ${label}.`}</Empty>
      ) : (
        <div className="list fx-list" data-testid="fx-list">
          {list.map((f) => {
            const fv = vals(f);
            const evs = onCal(f);
            const series = data.byId[fv.series];
            const classes = fixtureClasses(fv, vals(series));
            const change = changeFor(f);
            const cv = vals(change);
            return (
              <div key={f.id} className={`list-row fx-row${fv.status === 'Cancelled' ? ' cancelled' : ''}`} data-fixture={f.id}>
                <span className="date-block">
                  <b>{Number(String(fv.date).slice(8)) || '–'}</b>
                  <small>{fv.date ? new Date(`${fv.date}T00:00:00`).toLocaleString(undefined, { month: 'short' }) : ''} {dow(fv.date)}</small>
                </span>
                <span className="grow">
                  <span className="row-title">{fv.name}{fv.end_date && fv.end_date !== fv.date ? <span className="muted small"> · to {fmtDate(fv.end_date)}</span> : null}</span>
                  <span className="row-sub">{[trackName(data, fv), series && `${vals(series).name}${fv.round ? ` · Rd ${fv.round}` : ''}`, classes.join(', '), fv.start_time].filter(Boolean).join(' · ')}</span>
                  <span className="fx-flags">
                    {fv.status && fv.status !== 'Scheduled' && <Pill level={fv.status === 'Cancelled' ? 'over' : 'warn'}>{fv.status}</Pill>}
                    {fv.review === 'pending' && <Pill level="info">{fv.replaces ? 'Your change — waiting for approval' : 'Suggested — waiting for approval'}</Pill>}
                    {fv.review === 'rejected' && <Pill level="warn">Not approved{fv.review_note ? `: ${fv.review_note}` : ''}</Pill>}
                    {cv.review === 'pending' && <Pill level="info">Your change — waiting for approval</Pill>}
                    {cv.review === 'rejected' && <Pill level="warn">Your change wasn’t approved{cv.review_note ? `: ${cv.review_note}` : ''}</Pill>}
                    {evs.map((e) => <Link key={e.id} className="pill pill-ok" to={`/events/${e.id}`}>On our calendar{data.byId[v(e, 'car')] ? ` — ${titleOf(data.byId[v(e, 'car')])}` : ''}</Link>)}
                  </span>
                </span>
                <span className="row-actions">
                  {canType('event', 'edit') && fv.status !== 'Cancelled' && (evs.length === 0
                    ? <button type="button" className="btn small primary" onClick={() => setAdding(f)}>Add to our calendar</button>
                    : cars.length > evs.length && <button type="button" className="btn small ghost" onClick={() => setAdding(f)}>Add another car</button>)}
                  {canSuggest && (fv.review === 'rejected' || cv.review === 'rejected'
                    ? <button type="button" className="btn small ghost" onClick={() => deleteRecord(cv.review === 'rejected' ? change.id : f.id)}>Dismiss</button>
                    : <button type="button" className="btn small ghost" onClick={() => setEditing({ rec: change || f })}>{admin || !isGlobal(f) || change ? 'Edit' : 'Suggest a change'}</button>)}
                </span>
                {adding?.id === f.id && <AddToCalendar data={data} fx={f} onDone={() => setAdding(null)} />}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Pick the car (or cars) for a shared date. One matching car: added straight away. */
function AddToCalendar({ data, fx, onDone }) {
  const { tid, user } = useSession();
  const nav = useNavigate();
  const fv = vals(fx);
  const series = data.byId[fv.series];
  const already = data.list('event').filter((e) => v(e, 'fixture') === fx.id).map((e) => v(e, 'car'));
  const cars = data.list('car').map((c) => ({ id: c.id, values: vals(c) })).filter((c) => !already.includes(c.id));
  const { matches, others, classes } = carsForFixture(fv, vals(series), cars);
  const [picked, setPicked] = useState(() => (matches.length === 1 ? [matches[0].id] : []));
  const [intent, setIntent] = useState('Planned');
  const [busy, setBusy] = useState(false);
  const form = formFor(data, 'event');
  const add = async (ids) => {
    setBusy(true);
    for (const car of ids) {
      const values = { ...eventFromFixture(fv, fx.id, car, localSeries(data, fv.series)), intent };
      await saveRecord(tid, 'event', null, { form_id: form?.id, values }, user.id);
    }
    setBusy(false); onDone();
  };
  if (!cars.length && !already.length) {
    return <div className="add-fx card"><p>Add a car first — each calendar entry is for one car.</p><button type="button" className="btn" onClick={() => nav('/cars')}>Go to Cars</button> <button type="button" className="btn ghost" onClick={onDone}>Cancel</button></div>;
  }
  const label = (c) => `${c.values.number ? `#${c.values.number} ` : ''}${c.values.name || ''}${c.values.class ? ` — ${c.values.class}` : ''}`.trim();
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="add-fx card" data-testid="add-fx">
      <b>Which car is racing {fv.name}?</b>
      <p className="muted small">{classes.length ? `Classes running: ${classes.join(', ')}.` : 'No classes listed for this date.'} {matches.length > 1 ? 'More than one of your cars fits — tick the ones going (each gets its own entry).' : ''}</p>
      <div className="car-picks">
        {matches.map((c) => <label key={c.id} className="check-row"><input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} /> {label(c)}</label>)}
        {others.length > 0 && <span className="muted small">{matches.length ? 'Other cars (class not listed):' : 'None of your cars’ classes are listed — pick the car:'}</span>}
        {others.map((c) => <label key={c.id} className="check-row muted-car"><input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} /> {label(c)}</label>)}
      </div>
      <label className="inline-field">Going? <select value={intent} onChange={(e) => setIntent(e.target.value)} aria-label="Going?">{INTENTS.filter((x) => x !== 'Not going').map((o) => <option key={o}>{o}</option>)}</select></label>
      <div className="row-actions">
        <button type="button" className="btn primary" disabled={!picked.length || busy} onClick={() => add(picked)}>Add {picked.length > 1 ? `${picked.length} entries` : 'to our calendar'}</button>
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

/** Add or change a shared date. Admins publish straight away; teams send a suggestion for approval. */
function FixtureEditor({ data, rec, initial = {}, onDone }) {
  const { tid, user } = useSession();
  const admin = !!user?.is_platform_admin;
  const form = formFor(data, 'fixture');
  const base = rec ? vals(rec) : { status: 'Scheduled', ...Object.fromEntries(Object.entries(initial).filter(([, x]) => x)) };
  const [values, setValues] = useState(() => { const { review, review_note: _n, replaces: _r, ...rest } = base; return rest; }); // eslint-disable-line no-unused-vars
  const [publish, setPublish] = useState(admin);
  const [errors, setErrors] = useState({});
  const [note, setNote] = useState('');
  const dupes = data.list('fixture').filter((f) => f.id !== rec?.id && (isGlobal(f) || vals(f).review === 'pending') && sameFixture(vals(f), values));
  const save = async () => {
    const e = {};
    if (!values.name) e.name = 'Required'; if (!values.date) e.date = 'Required';
    if (!values.venue && !values.track) e.venue = 'Pick a track or type its name';
    setErrors(e);
    if (Object.keys(e).length) return;
    const clean = Object.fromEntries(Object.entries(values).filter(([, x]) => x !== '' && x !== undefined && !(Array.isArray(x) && !x.length)));
    if (admin && publish) {
      // admins change shared dates directly
      await saveRecord(tid, 'fixture', rec && isGlobal(rec) ? rec.id : null, { ...(rec && isGlobal(rec) ? rec.data : {}), scope: 'global', form_id: form?.id, values: clean }, user.id);
    } else if (rec && !isGlobal(rec)) {
      await saveRecord(tid, 'fixture', rec.id, { ...rec.data, values: { ...clean, review: 'pending', ...(vals(rec).replaces ? { replaces: vals(rec).replaces } : {}), ...(note ? { suggest_note: note } : {}) } }, user.id);
    } else {
      await saveRecord(tid, 'fixture', null, { form_id: form?.id, values: { ...clean, review: 'pending', ...(rec ? { replaces: rec.id } : {}), ...(note ? { suggest_note: note } : {}) } }, user.id);
    }
    onDone();
  };
  return (
    <div className="card fx-editor" data-testid="fx-editor">
      <h3>{rec ? (admin || !isGlobal(rec) ? 'Edit calendar date' : 'Suggest a change') : admin ? 'Add a calendar date' : 'Suggest a calendar date'}</h3>
      <FormRenderer form={form} values={values} onChange={(k, x) => setValues((s) => ({ ...s, [k]: x }))} data={data} recordType="fixture" errors={errors} />
      {dupes.length > 0 && <div className="notice small">Already listed: {dupes.map((d) => `${vals(d).name} (${fmtDate(vals(d).date)})`).join(', ')}. Change that one instead if it’s wrong.</div>}
      {!(admin && publish) && <label className="field"><span className="label">Note for the admin (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Source: series website, posted 3 Oct" /></label>}
      {admin && <label className="check-row"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publish to every team now (platform admin)</label>}
      <div className="row-actions">
        <button type="button" className="btn primary" onClick={save}>{admin && publish ? 'Save' : 'Send for approval'}</button>
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

// ======================================================================= import
function ImportPanel({ data, year, sm, seriesId, trackId, onDone }) {
  const { tid, user } = useSession();
  const admin = !!user?.is_platform_admin;
  const [mode, setMode] = useState('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [series, setSeries] = useState(seriesId || '');
  const [track, setTrack] = useState(trackId || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rows, setRows] = useState(null);
  const [info, setInfo] = useState('');
  const [publish, setPublish] = useState(admin);
  const form = formFor(data, 'fixture');
  const tracks = data.list('track').map((t) => ({ id: t.id, values: vals(t) }));
  const existing = data.list('fixture').filter((f) => isGlobal(f) || vals(f).review === 'pending').map(vals);
  const seriesList = data.list('series').filter((s) => isGlobal(s) || !vals(s).shared_as);

  const read = async () => {
    setBusy(true); setErr(''); setRows(null);
    try {
      const body = { year: seasonLabel(year, sm) };
      if (mode === 'link') body.url = url;
      else if (mode === 'text') body.text = text;
      else {
        body.files = [];
        for (const f of files) {
          if (/\.ics$/i.test(f.name) || f.type === 'text/calendar') body.files.push({ media_type: 'text/calendar', name: f.name, text: await f.text() });
          else body.files.push({ ...(await fileToPart(f)), name: f.name });
        }
      }
      const out = await api(`/t/${tid}/calendar/import`, { method: 'POST', body });
      const sv = vals(data.byId[series]);
      setInfo([out.source === 'ical' ? 'Read from an iCal calendar.' : 'Read by the AI assistant — check every date before saving.', out.unclear].filter(Boolean).join(' '));
      setRows((out.items || []).map((it) => {
        const t = track ? tracks.find((x) => x.id === track) : matchTrack(it.track || it.location || it.name, tracks);
        const row = {
          name: it.name || '', date: it.date || '', end_date: it.end_date || '', venue: t?.id || '', track: t ? '' : it.track || it.location || '',
          series, round: it.round || '', classes: (it.classes || []).length ? it.classes : sv.class ? [sv.class] : [], notes: it.notes || '',
          status: it.status === 'Cancelled' ? 'Cancelled' : 'Scheduled', website: it.website || (mode === 'link' ? url : ''),
        };
        const dup = existing.some((e) => sameFixture(e, row));
        return { ...row, _dup: dup, _on: !!row.date && !dup };
      }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const setRow = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const save = async () => {
    setBusy(true);
    const source = mode === 'link' ? url : mode === 'files' ? files.map((f) => f.name).join(', ') : 'pasted text';
    for (const r of rows.filter((x) => x._on && x.date && x.name)) {
      const { _dup, _on, ...row } = r; // eslint-disable-line no-unused-vars
      const clean = Object.fromEntries(Object.entries(row).filter(([, x]) => x !== '' && !(Array.isArray(x) && !x.length)));
      if (admin && publish) await saveRecord(tid, 'fixture', null, { scope: 'global', form_id: form?.id, values: { ...clean, source } }, user.id);
      else await saveRecord(tid, 'fixture', null, { form_id: form?.id, values: { ...clean, source, review: 'pending' } }, user.id);
    }
    setBusy(false); onDone();
  };
  const on = rows?.filter((r) => r._on).length || 0;
  return (
    <div className="card import-cal" data-testid="import-cal">
      <h3>Import a published calendar</h3>
      <p className="muted small">Paste a web or iCal link, upload a PDF, photo or screenshot (a Facebook post, a poster), or paste the text. The dates are listed for you to check before anything is saved.</p>
      <div className="seg" role="group" aria-label="Import from">
        {[['link', 'Link'], ['files', 'File or screenshot'], ['text', 'Paste text']].map(([k, l]) => <button key={k} type="button" className={mode === k ? 'active' : ''} onClick={() => setMode(k)}>{l}</button>)}
      </div>
      {mode === 'link' && <label className="field"><span className="label">Calendar link</span><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… or webcal://… (series website, track fixture page, .ics feed)" /></label>}
      {mode === 'files' && <label className="field"><span className="label">Files</span><input type="file" multiple accept=".ics,text/calendar,application/pdf,image/*" onChange={(e) => setFiles([...e.target.files])} /></label>}
      {mode === 'text' && <label className="field"><span className="label">Calendar text</span><textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the dates — e.g. copied from a Facebook post or an email" /></label>}
      <div className="grid-2">
        <label className="field"><span className="label">Series these dates belong to</span>
          <select value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Series these dates belong to">
            <option value="">None — track dates</option>
            {seriesList.map((s) => <option key={s.id} value={s.id}>{vals(s).name}{vals(s).season ? ` (${vals(s).season})` : ''}</option>)}
          </select>
          <small className="muted">Not listed? Add the series under <Link to="/r/series/new">Series</Link> first.</small>
        </label>
        <label className="field"><span className="label">All at one track</span>
          <select value={track} onChange={(e) => setTrack(e.target.value)} aria-label="All at one track">
            <option value="">No — match each date’s track</option>
            {tracks.filter((t) => t.values.name).sort((a, b) => a.values.name.localeCompare(b.values.name)).map((t) => <option key={t.id} value={t.id}>{t.values.name}</option>)}
          </select>
        </label>
      </div>
      <div className="row-actions">
        <button type="button" className="btn primary" disabled={busy || (mode === 'link' ? !url : mode === 'text' ? !text.trim() : !files.length)} onClick={read}>{busy && !rows ? 'Reading…' : 'Read dates'}</button>
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
      {err && <div className="notice error">{err}</div>}
      {rows && (
        <>
          {info && <div className="notice info small">{info}</div>}
          {rows.length === 0 ? <p className="muted">No dates found.</p> : (
            <div className="table-scroll">
              <table className="table import-rows" data-testid="import-rows">
                <thead><tr><th>Add</th><th>Date</th><th>End</th><th>Event</th><th>Track</th><th>Rd</th><th>Classes</th></tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i} className={r._dup ? 'dup' : ''}>
                    <td><input type="checkbox" aria-label={`Add ${r.name}`} checked={r._on} onChange={(e) => setRow(i, { _on: e.target.checked })} />{r._dup && <small className="muted"> already listed</small>}</td>
                    <td><input type="date" aria-label={`Date of ${r.name}`} value={r.date} onChange={(e) => setRow(i, { date: e.target.value })} /></td>
                    <td><input type="date" aria-label={`End date of ${r.name}`} value={r.end_date} onChange={(e) => setRow(i, { end_date: e.target.value })} /></td>
                    <td><input aria-label={`Name of row ${i + 1}`} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} /></td>
                    <td>
                      <select aria-label={`Track for ${r.name}`} value={r.venue} onChange={(e) => setRow(i, { venue: e.target.value })}>
                        <option value="">{r.track ? `“${r.track}” (not in directory)` : 'Not set'}</option>
                        {tracks.filter((t) => t.values.name).sort((a, b) => a.values.name.localeCompare(b.values.name)).map((t) => <option key={t.id} value={t.id}>{t.values.name}</option>)}
                      </select>
                    </td>
                    <td><input className="narrow" aria-label={`Round for ${r.name}`} value={r.round} onChange={(e) => setRow(i, { round: e.target.value })} /></td>
                    <td><input aria-label={`Classes for ${r.name}`} value={(r.classes || []).join(', ')} onChange={(e) => setRow(i, { classes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {admin && <label className="check-row"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publish to every team now (platform admin)</label>}
          <div className="row-actions">
            <button type="button" className="btn primary" disabled={!on || busy} onClick={save}>{admin && publish ? `Save ${on} date${on === 1 ? '' : 's'}` : `Send ${on} date${on === 1 ? '' : 's'} for approval`}</button>
          </div>
        </>
      )}
    </div>
  );
}

// ======================================================================= series entries
function seriesRounds(data, seriesId, year, sm) {
  return sharedFixtures(data, year, sm).filter((f) => seriesId && canon(data, vals(f).series) === canon(data, seriesId) && vals(f).status !== 'Cancelled');
}

function SeriesEntries({ data, year, sm, label }) {
  const { canType } = useSession();
  const [editing, setEditing] = useState(null);
  const entries = data.list('season_plan').filter((p) => seasonMatches(vals(p).season, year, sm));
  const evs = data.list('event');
  return (
    <>
      <p className="muted small">The series you’re running in {label}, with which car and class, and whether it’s the full series or some rounds.</p>
      {canType('season_plan', 'edit') && <div className="toolbar"><button type="button" className="btn primary" onClick={() => setEditing({})}>New series entry</button></div>}
      {editing && <EntryEditor data={data} year={year} sm={sm} rec={editing.rec} initial={editing.initial} onDone={() => setEditing(null)} />}
      {entries.length === 0 ? <Empty>No series entries for {label}. Add one to put its rounds on your calendar.</Empty> : (
        <div className="list" data-testid="entries">
          {entries.map((p) => {
            const pv = vals(p);
            const rounds = seriesRounds(data, pv.series, year, sm);
            const mine = rounds.filter((f) => evs.some((e) => v(e, 'fixture') === f.id && v(e, 'car') === pv.car));
            const ownEvents = evs.filter((e) => canon(data, v(e, 'series')) === canon(data, pv.series) && v(e, 'car') === pv.car && inSeason(v(e, 'date'), v(e, 'end_date'), year, sm));
            const car = data.byId[pv.car];
            return (
              <div key={p.id} className="list-row entry-row">
                <span className="grow">
                  <span className="row-title">{seriesName(data, pv.series) || 'Series'}</span>
                  <span className="row-sub">{[car && titleOf(car), pv.class, pv.participation, rounds.length ? `${mine.length} of ${rounds.length} rounds on our calendar` : `${ownEvents.length} round${ownEvents.length === 1 ? '' : 's'} on our calendar`].filter(Boolean).join(' · ')}</span>
                </span>
                {canType('season_plan', 'edit') && <span className="row-actions">
                  {rounds.length > mine.length && pv.participation !== 'Partial series' && <AddRounds data={data} entry={p} rounds={rounds.filter((f) => !mine.includes(f))} />}
                  <button type="button" className="btn small ghost" onClick={() => setEditing({ rec: p })}>{pv.participation === 'Partial series' ? 'Choose rounds' : 'Edit'}</button>
                </span>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

async function addRounds(data, tid, user, entry, fixtures) {
  const form = formFor(data, 'event');
  for (const f of fixtures) {
    const values = eventFromFixture(vals(f), f.id, entry.car, localSeries(data, vals(f).series));
    await saveRecord(tid, 'event', null, { form_id: form?.id, values }, user.id);
  }
}

function AddRounds({ data, entry, rounds }) {
  const { tid, user } = useSession();
  const [busy, setBusy] = useState(false);
  return <button type="button" className="btn small primary" disabled={busy} onClick={async () => { setBusy(true); await addRounds(data, tid, user, vals(entry), rounds); setBusy(false); }}>
    Add {rounds.length} missing round{rounds.length === 1 ? '' : 's'}</button>;
}

function EntryEditor({ data, year, sm, rec, initial = {}, onDone }) {
  const { tid, user, canType } = useSession();
  const form = formFor(data, 'season_plan');
  const [values, setValues] = useState(() => (rec ? { ...vals(rec) } : { season: seasonLabel(year, sm), participation: 'Full series', ...initial }));
  const rounds = seriesRounds(data, values.series, year, sm);
  const evs = data.list('event');
  const onCalFor = (f, car) => evs.find((e) => v(e, 'fixture') === f.id && v(e, 'car') === car);
  const [picked, setPicked] = useState(() => rounds.filter((f) => onCalFor(f, values.car)).map((f) => f.id));
  const [errors, setErrors] = useState({});
  const set = (k, x) => setValues((s) => {
    const next = { ...s, [k]: x };
    if (k === 'car' && !s.class) next.class = vals(data.byId[x]).class || '';
    if (k === 'series' && !s.class) next.class = vals(data.byId[x]).class || s.class;
    return next;
  });
  useEffect(() => { setPicked(rounds.filter((f) => onCalFor(f, values.car)).map((f) => f.id)); }, [values.series, values.car]); // eslint-disable-line react-hooks/exhaustive-deps
  const partial = values.participation === 'Partial series';
  const save = async () => {
    const e = {};
    for (const k of ['series', 'season', 'car', 'participation']) if (!values[k]) e[k] = 'Required';
    setErrors(e);
    if (Object.keys(e).length) return;
    await saveRecord(tid, 'season_plan', rec?.id || null, { ...(rec?.data || {}), form_id: form?.id, values }, user.id);
    // full series: every round not yet on the calendar for this car; partial: the ticked rounds
    const want = rounds.filter((f) => (partial ? picked.includes(f.id) : true) && !onCalFor(f, values.car));
    if (canType('event', 'edit')) await addRounds(data, tid, user, values, want);
    onDone();
  };
  const remove = async () => { await deleteRecord(rec.id); onDone(); };
  return (
    <div className="card entry-editor" data-testid="entry-editor">
      <h3>{rec ? 'Series entry' : 'New series entry'}</h3>
      <FormRenderer form={form} values={values} onChange={set} data={data} recordType="season_plan" errors={errors} />
      {values.series && (rounds.length ? (
        <div className="rounds-pick">
          <b>{partial ? 'Rounds we’re running' : `All ${rounds.length} rounds go on the calendar`}</b>
          {partial ? rounds.map((f) => {
            const on = onCalFor(f, values.car);
            return (
              <label key={f.id} className="check-row">
                <input type="checkbox" disabled={!!on} checked={!!on || picked.includes(f.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id)))} />
                {vals(f).round ? `Rd ${vals(f).round} — ` : ''}{vals(f).name} · {fmtDate(vals(f).date)}{on ? ' (already on our calendar)' : ''}
              </label>
            );
          }) : <p className="muted small">{rounds.map((f) => `${vals(f).round ? `Rd ${vals(f).round}` : vals(f).name} ${fmtDate(vals(f).date)}`).join(' · ')}</p>}
        </div>
      ) : <p className="muted small">This series has no shared dates for this racing year yet — import or suggest them on Series & track calendars.</p>)}
      <div className="row-actions">
        <button type="button" className="btn primary" onClick={save}>Save entry</button>
        {rec && canType('season_plan', 'delete') && <button type="button" className="btn ghost danger" onClick={remove}>Delete entry</button>}
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
      {rec && <p className="muted small">Deleting an entry leaves its events on your calendar.</p>}
    </div>
  );
}

// ======================================================================= publish
function PublishPanel({ onClose }) {
  const { tid, membership, refresh } = useSession();
  const pub = membership?.settings?.calendar_publish || null;
  const sm = seasonStart(membership?.settings);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [shown, setShown] = useState({}); // options as just ticked, until the saved settings come back
  const put = async (body) => { setBusy(true); try { await api(`/t/${tid}/calendar/publish`, { method: 'PUT', body }); await refresh(); } finally { setBusy(false); } };
  const setStart = async (m) => { setBusy(true); try { await api(`/t/${tid}`, { method: 'PATCH', body: { settings: { ...(membership.settings || {}), calendar_season_start: Number(m) } } }); await refresh(); } finally { setBusy(false); } };
  const page = pub ? `${window.location.origin}/c/${pub.token}` : '';
  const ics = pub ? `${window.location.origin}/api/public/calendar/${pub.token}.ics` : '';
  const copy = async (what, text) => { try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied(''); } };
  return (
    <div className="card publish-cal" data-testid="publish-cal">
      <h3>Publish your calendar</h3>
      <p className="muted small">A public page anyone with the link can open (no login), and a subscribe link that keeps their phone or Google calendar up to date. Only events marked going are shown — never setups, notes or withdraw reasons.</p>
      {pub ? (
        <>
          <div className="pub-links">
            <label className="field"><span className="label">Public page</span><span className="copy-row"><input readOnly value={page} aria-label="Public page link" /><button type="button" className="btn small" onClick={() => copy('page', page)}>{copied === 'page' ? 'Copied' : 'Copy'}</button><a className="btn small ghost" href={page} target="_blank" rel="noreferrer">Open</a></span></label>
            <label className="field"><span className="label">Subscribe (iCal)</span><span className="copy-row"><input readOnly value={ics} aria-label="Subscribe link" /><button type="button" className="btn small" onClick={() => copy('ics', ics)}>{copied === 'ics' ? 'Copied' : 'Copy'}</button><a className="btn small ghost" href={ics.replace(/^https?:/, 'webcal:')}>Subscribe</a></span></label>
          </div>
          <div className="pub-opts">
            {[['show_tentative', 'Include tentative events'], ['show_cars', 'Show which car'], ['show_results', 'Show results (raced the feature, withdrew)']].map(([k, l]) => (
              <label key={k} className="check-row"><input type="checkbox" checked={!!(k in shown ? shown[k] : pub[k])} disabled={busy} onChange={(e) => { setShown((x) => ({ ...x, [k]: e.target.checked })); put({ [k]: e.target.checked }); }} /> {l}</label>
            ))}
          </div>
          <div className="row-actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => put({ new_link: true })}>New link (old one stops working)</button>
            <button type="button" className="btn ghost danger" disabled={busy} onClick={() => put({ on: false })}>Stop publishing</button>
          </div>
        </>
      ) : <div className="row-actions"><button type="button" className="btn primary" disabled={busy} onClick={() => put({ on: true, show_tentative: false, show_cars: true, show_results: false })}>Publish calendar</button></div>}
      <label className="field narrow-field"><span className="label">Racing year starts in</span>
        <select aria-label="Racing year starts in" value={sm} disabled={busy} onChange={(e) => setStart(e.target.value)}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <small className="muted">January for a calendar-year season; July (for example) for a summer season like 2026-27.</small>
      </label>
      <div className="row-actions"><button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
    </div>
  );
}

// ======================================================================= print & public page
/** The printable / public calendar: dates grouped by month. */
export function CalendarSheet({ title, sub, items, showCar = true, showResult = false }) {
  const months = [];
  for (const i of items) {
    const k = i.date.slice(0, 7);
    let m = months.find((x) => x.k === k);
    if (!m) { m = { k, label: new Date(`${k}-01T00:00:00`).toLocaleString(undefined, { month: 'long', year: 'numeric' }), items: [] }; months.push(m); }
    m.items.push(i);
  }
  return (
    <article className="print-sheet cal-sheet" data-testid="cal-sheet">
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
      {items.length === 0 && <p className="muted">No events listed.</p>}
      {months.map((m) => (
        <section key={m.k}>
          <h3>{m.label}</h3>
          <table className="cal-table">
            <tbody>{m.items.map((i) => (
              <tr key={i.id} className={i.cancelled ? 'cancelled' : i.tentative ? 'tentative' : ''}>
                <td className="cs-date">{dow(i.date)} {Number(i.date.slice(8))}{i.end_date && i.end_date !== i.date ? `–${Number(i.end_date.slice(8))}${i.end_date.slice(5, 7) !== i.date.slice(5, 7) ? ` ${new Date(`${i.end_date}T00:00:00`).toLocaleString(undefined, { month: 'short' })}` : ''}` : ''}</td>
                <td>
                  <b>{i.name}</b>{i.tentative && <em className="muted"> (tentative)</em>}{i.cancelled && <b className="cs-cancel"> CANCELLED</b>}
                  <div className="muted small">{[i.track, i.location && i.location !== i.track ? i.location : '', i.series && `${i.series}${i.round ? ` — Rd ${i.round}` : ''}`].filter(Boolean).join(' · ')}</div>
                  {((showCar && i.car) || (showResult && i.result)) && (
                    <div className="small cs-extra">{showCar && i.car && <span>{i.car}</span>}{showResult && i.result && <b>{i.result}</b>}</div>
                  )}
                  {i.note && <div className="small">{i.note}</div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ))}
    </article>
  );
}

export function CalendarPrint() {
  const data = useTeamData();
  const nav = useNavigate();
  const { membership } = useSession();
  const { sm, year, label } = useRacingYear();
  const [showCar, setShowCar] = useState(true);
  const [showResult, setShowResult] = useState(false);
  const [tentative, setTentative] = useState(true);
  if (!data) return <p className="pad muted">Loading…</p>;
  const items = teamItems(data, year, sm, { notGoing: false }).filter((i) => tentative || !i.tentative);
  return (
    <div className="print-page">
      <div className="print-tools no-print">
        <button type="button" className="btn ghost" onClick={() => nav(-1)}>‹ Back</button>
        <label className="check-row"><input type="checkbox" checked={tentative} onChange={(e) => setTentative(e.target.checked)} /> Tentative events</label>
        <label className="check-row"><input type="checkbox" checked={showCar} onChange={(e) => setShowCar(e.target.checked)} /> Car</label>
        <label className="check-row"><input type="checkbox" checked={showResult} onChange={(e) => setShowResult(e.target.checked)} /> Results</label>
        <button type="button" className="btn primary" onClick={() => window.print()}>Print / save as PDF</button>
      </div>
      <CalendarSheet title={`${membership?.tenant_name || membership?.name || 'Our'} race calendar ${label}`} items={items} showCar={showCar} showResult={showResult} />
    </div>
  );
}

/** No-login page for a published calendar (/c/:token). */
export function PublicCalendar() {
  const { token } = useParams();
  const [cal, setCal] = useState(null);
  const [err, setErr] = useState('');
  const [year, setYear] = useState(null);
  useEffect(() => {
    fetch(`/api/public/calendar/${encodeURIComponent(token)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'This calendar isn’t available.');
      setCal(j);
      const cur = seasonOf(today(), j.season_start);
      setYear(j.seasons.some((s) => s.year === cur) ? cur : j.seasons[j.seasons.length - 1]?.year ?? cur);
    }).catch((e) => setErr(e.message));
  }, [token]);
  useEffect(() => { if (cal) document.title = `${cal.team} — race calendar`; }, [cal]);
  if (err) return <div className="auth-wrap"><div className="auth-card card"><h1>Calendar not available</h1><p className="muted">{err}</p></div></div>;
  if (!cal) return <p className="pad muted">Loading…</p>;
  const items = cal.items.filter((i) => i.season === year);
  const label = cal.seasons.find((s) => s.year === year)?.label || seasonLabel(year, cal.season_start);
  const ics = `${window.location.origin}/api/public/calendar/${token}.ics`;
  const next = cal.items.find((i) => (i.end_date || i.date) >= today() && !i.cancelled);
  return (
    <div className="print-page public-cal">
      <div className="print-tools no-print">
        {cal.seasons.length > 1 && (
          <div className="seg" role="group" aria-label="Racing year">
            {cal.seasons.map((s) => <button key={s.year} type="button" className={s.year === year ? 'active' : ''} onClick={() => setYear(s.year)}>{s.label}</button>)}
          </div>
        )}
        <a className="btn" href={ics.replace(/^https?:/, 'webcal:')}>Subscribe</a>
        <a className="btn ghost" href={ics} download="race-calendar.ics">Download .ics</a>
        <button type="button" className="btn primary" onClick={() => window.print()}>Print / save as PDF</button>
      </div>
      <CalendarSheet title={`${cal.team} — race calendar ${label}`}
        sub={next ? `Next: ${next.name}${next.track ? ` at ${next.track}` : ''}, ${dateRangeOf(next)}` : ''}
        items={items} showCar={cal.options.show_cars} showResult={cal.options.show_results} />
    </div>
  );
}

// ======================================================================= platform admin
export function AdminCalendar() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [notes, setNotes] = useState({});
  const load = () => api('/admin/calendar/suggestions').then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const act = async (id, action) => {
    try { await api(`/admin/calendar/suggestions/${id}`, { method: 'POST', body: { action, note: notes[id] || '' } }); load(); } catch (e) { setErr(e.message); }
  };
  const ref = (id) => d?.refs?.[id]?.values?.name || '';
  const show = (x, k) => {
    const val = x?.[k];
    if (k === 'venue') return ref(val) || '';
    if (k === 'series') return ref(val) ? `${ref(val)}${d.refs[val]?.global ? '' : ' (team series — will be shared)'}` : '';
    if (k === 'date' || k === 'end_date') return fmtDate(val);
    return Array.isArray(val) ? val.join(', ') : val ?? '';
  };
  const KEYS = [['name', 'Event'], ['date', 'Date'], ['end_date', 'End'], ['venue', 'Track'], ['track', 'Track name'], ['series', 'Series'], ['round', 'Round'], ['classes', 'Classes'], ['status', 'Status'], ['start_time', 'Times'], ['website', 'Link'], ['notes', 'Notes']];
  const list = d?.suggestions || [];
  return (
    <div>
      <PageHeader title="Calendar suggestions" sub="Dates teams have added or corrected on the shared series and track calendars. Approved dates go live for every team." />
      {err && <div className="notice error">{err}</div>}
      {d && list.length === 0 && <Empty>Nothing waiting for review.</Empty>}
      <div className="cards" data-testid="cal-suggestions">
        {list.map((s) => {
          const old = s.values.replaces ? d.refs[s.values.replaces]?.values : null;
          const rows = KEYS.filter(([k]) => show(s.values, k) || (old && show(old, k)));
          return (
            <Section key={s.id} title={`${s.values.replaces ? 'Change' : 'New date'}: ${s.values.name || ''}`} className="cal-sugg">
              <p className="muted small">From {s.team}{s.by ? ` (${s.by})` : ''} · {fmtDate(String(s.at).slice(0, 10))}{s.values.source ? ` · source: ${s.values.source}` : ''}</p>
              {s.values.suggest_note && <p className="small"><b>Note:</b> {s.values.suggest_note}</p>}
              <table className="table compact">
                <thead><tr><th /><th>{old ? 'Suggested' : 'Value'}</th>{old && <th>Now</th>}</tr></thead>
                <tbody>{rows.map(([k, l]) => (
                  <tr key={k} className={old && show(old, k) !== show(s.values, k) ? 'diff' : ''}><th scope="row">{l}</th><td>{show(s.values, k)}</td>{old && <td className="muted">{show(old, k)}</td>}</tr>
                ))}</tbody>
              </table>
              <div className="row-actions">
                <button type="button" className="btn primary" onClick={() => act(s.id, 'approve')}>Approve</button>
                <input aria-label="Reason (sent back to the team)" placeholder="Reason, if rejecting" value={notes[s.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))} />
                <button type="button" className="btn ghost danger" onClick={() => act(s.id, 'reject')}>Reject</button>
              </div>
            </Section>
          );
        })}
      </div>
    </div>
  );
}

/** Shared dates at one track (track page). */
export function TrackDates({ data, trackId }) {
  const { canModule, membership } = useSession();
  const sm = seasonStart(membership?.settings);
  const y = seasonOf(today(), sm);
  if (!canModule('calendar')) return null;
  const list = data.list('fixture').filter((f) => isGlobal(f) && vals(f).venue === trackId && (vals(f).end_date || vals(f).date) >= today()).sort((a, b) => vals(a).date.localeCompare(vals(b).date)).slice(0, 8);
  return (
    <Section title="Coming up at this track" actions={<Link className="btn ghost small" to={`/calendar?tab=shared&show=track:${trackId}&year=${y}`}>Track calendar</Link>}>
      {list.length === 0 ? <p className="muted small">No dates on the shared calendar yet.</p> : (
        <ul className="plain-list">{list.map((f) => <li key={f.id}><b>{fmtDate(vals(f).date)}</b> {vals(f).name}{vals(f).series && data.byId[vals(f).series] ? <span className="muted"> · {vals(data.byId[vals(f).series]).name}</span> : ''}{vals(f).status && vals(f).status !== 'Scheduled' ? <span className="muted"> · {vals(f).status}</span> : ''}</li>)}</ul>
      )}
    </Section>
  );
}
