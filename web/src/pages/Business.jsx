// The Business area: its hub, parts orders, reminders, and the cards it adds to Home and the event
// page (race night for each crew member, what's coming up, and everything else about a meeting).
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { Icon, I, useNav } from '../components/Layout.jsx';
import { fmtDate, formFor, memberName, titleOf, today, useTeamData, v } from '../lib/data.js';
import { saveRecord } from '../lib/store.js';
import { useSession } from '../lib/session.jsx';
import { setupsByAsset } from '../lib/compute.js';
import { computeReminders, dueText, REMINDER_KINDS } from '@shared/reminders.js';
import { currentEvents, crewSpot, jobsFor } from '@shared/raceNight.js';
import { eventPnl, purchaseTotal } from '@shared/finance.js';
import { fmtMoney } from '@shared/regions.js';
import { PURCHASE_STATUSES } from '@shared/baseForms5.js';
import { crewCosts } from '@shared/budgetSponsors.js';
import { eventDayList } from '@shared/calendar.js';

/** Format money in the team's currency (or a record's own). */
export function useMoney() {
  const { region } = useSession();
  return (n, cur) => fmtMoney(n, cur || region.currency);
}

/** Reminders for this person: only from what their role can see. */
export function useReminders() {
  const data = useTeamData();
  const { canType, can, membership } = useSession();
  return useMemo(() => (data ? computeReminders(data, { today: today(), canType, can, settings: membership?.settings || {}, memberName }) : null),
    [data, membership?.settings]); // eslint-disable-line react-hooks/exhaustive-deps
}

const LEVEL = { over: 'over', soon: 'warn', info: 'info' };

export function ReminderRows({ list, limit }) {
  return (
    <div className="list">
      {list.slice(0, limit || list.length).map((r) => (
        <Link key={r.key} to={r.link} className="list-row" data-testid="reminder">
          <span className="grow"><span className="row-title">{r.title}</span><span className="row-sub">{REMINDER_KINDS[r.kind]}{r.owner ? ` · ${memberName(r.owner)}` : ''}</span></span>
          <Pill level={LEVEL[r.level]}>{dueText(r)}</Pill>
        </Link>
      ))}
    </div>
  );
}

export function RemindersPage() {
  const list = useReminders();
  const [kind, setKind] = useState('');
  if (!list) return null;
  const kinds = [...new Set(list.map((r) => r.kind))];
  const shown = list.filter((r) => !kind || r.kind === kind);
  return (
    <div>
      <PageHeader title="Reminders" sub="Licences, vehicles, bills, contracts, sponsors, stock, budget and parts orders — from what your role can see" />
      {kinds.length > 1 && (
        <div className="tabs scroll">
          <button type="button" className={!kind ? 'active' : ''} onClick={() => setKind('')}>All <span className="tab-count">{list.length}</span></button>
          {kinds.map((k) => <button type="button" key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{REMINDER_KINDS[k]} <span className="tab-count">{list.filter((r) => r.kind === k).length}</span></button>)}
        </div>
      )}
      {shown.length ? <div className="card"><ReminderRows list={shown} /></div> : <Empty>Nothing coming up. Reminders appear here when a date is close or something runs low.</Empty>}
    </div>
  );
}

/** Home: what's coming up (top five). */
export function RemindersCard() {
  const list = useReminders();
  if (!list?.length) return null;
  return (
    <Section title="Coming up" actions={<Link className="btn ghost small" to="/reminders">All reminders ({list.length})</Link>} className="reminders-card">
      <ReminderRows list={list} limit={5} />
    </Section>
  );
}

const JOB_LINKS = {
  debrief: { label: 'Debrief: track & car feedback', to: (ctx) => (ctx.sheet ? `/r/setup/${ctx.sheet.id}#sec-feedback` : `/events/${ctx.ev.id}`) },
  changes: { label: 'Change list', to: (ctx) => (ctx.sheet ? `/r/setup/${ctx.sheet.id}#sec-changes` : `/events/${ctx.ev.id}`) },
  tyres: { label: 'Tyre sheet', to: (ctx) => (ctx.sheet ? `/r/setup/${ctx.sheet.id}#sec-tire_sheet` : '/track/gears?tab=tires') },
  setup: { label: 'Setup sheets', to: (ctx) => `/events/${ctx.ev.id}` },
  load: { label: 'Load list', to: (ctx) => (ctx.load ? `/r/load_list/${ctx.load.id}` : `/r/load_list/new?event=${ctx.ev.id}`) },
  trip: { label: 'Trip plan', to: (ctx) => (ctx.trip ? `/r/trip/${ctx.trip.id}` : `/r/trip/new?event=${ctx.ev.id}`) },
  guests: { label: 'Guest check-in', to: (ctx) => `/partners?tab=guests&event=${ctx.ev.id}` },
  post: { label: 'Results post', to: (ctx) => `/r/social_post/new?event=${ctx.ev.id}` },
  media: { label: 'Add photos', to: (ctx) => `/r/media/new?event=${ctx.ev.id}` },
};
const JOB_TYPE = { debrief: 'setup', changes: 'setup', tyres: 'setup', setup: 'setup', load: 'load_list', trip: 'trip', guests: 'guest', post: 'social_post', media: 'media' };

/** Home on race night: this person's role on the crew list and the screens they'll need. */
export function RaceNightCard() {
  const data = useTeamData();
  const { user, membership, canType } = useSession();
  if (!data) return null;
  const evs = currentEvents(data, today()).filter((e) => crewSpot(e, user.id));
  if (!evs.length) return null;
  return (
    <>
      {evs.map((ev) => {
        const spot = crewSpot(ev, user.id);
        const sheets = data.list('setup').filter((s) => v(s, 'event') === ev.id).sort((a, b) => b.client_updated_at.localeCompare(a.client_updated_at));
        const ctx = { ev, sheet: sheets[0], load: data.list('load_list').find((l) => v(l, 'event') === ev.id), trip: data.list('trip').find((t) => v(t, 'event') === ev.id) };
        const jobs = jobsFor(spot.role, membership?.role?.names || [membership?.role?.name || '']).filter((j) => canType(JOB_TYPE[j], 'view'));
        return (
          <Section key={ev.id} title={`Race night: ${v(ev, 'name')}`} className="race-night" actions={<Link className="btn ghost small" to={`/events/${ev.id}`}>Event</Link>}>
            <p data-testid="race-night-role">You’re on the crew{spot.role ? <> as <b>{spot.role}</b></> : ''}{spot.note ? ` — ${spot.note}` : ''}.</p>
            <div className="module-cards">
              {jobs.map((j) => <Link key={j} to={JOB_LINKS[j].to(ctx)} className="module-card"><Icon d={I.check} size={20} /><span>{JOB_LINKS[j].label}</span></Link>)}
            </div>
          </Section>
        );
      })}
    </>
  );
}

/** The event page: everything else about the meeting — crew, logistics, money, sponsors, media. */
export function EventBusiness({ ev }) {
  const data = useTeamData();
  const { canType, canModule, canMoney, membership } = useSession();
  const money = useMoney();
  const usage = useMemo(() => (data ? setupsByAsset(data) : {}), [data]);
  if (!data) return null;
  const id = ev.id;
  const crew = (Array.isArray(v(ev, 'crew')) ? v(ev, 'crew') : []).filter((r) => r.member || r.role);
  const linked = (type) => data.list(type).filter((r) => v(r, 'event') === id);
  const groups = [
    { type: 'trip', label: 'Trip plans' }, { type: 'load_list', label: 'Load lists' }, { type: 'purchase', label: 'Parts orders' },
    { type: 'expense', label: 'Expenses' }, { type: 'income', label: 'Income' }, { type: 'guest', label: 'Hospitality guests' },
    { type: 'media', label: 'Photos' }, { type: 'social_post', label: 'Results posts' },
  ].filter((g) => canType(g.type, 'view'));
  const pnl = canModule('finance') && canMoney ? eventPnl(data, id, { settings: membership?.settings || {}, usage }) : null;
  if (!crew.length && !groups.length) return null;
  const add = (type) => `/r/${type}/new?event=${id}&back=${encodeURIComponent(`/events/${id}`)}`;
  return (
    <div className="grid-2 event-business" data-testid="event-business">
      {(crew.length > 0 || canType('event', 'edit')) && (
        <Section title="Crew" actions={canType('event', 'edit') ? <Link className="btn ghost small" to={`/r/event/${id}#sec-crew`}>Edit crew</Link> : null}>
          {crew.length ? (
            <div className="list">{crew.map((r, i) => (
              <div key={i} className="list-row"><span className="grow"><span className="row-title">{memberName(r.member) || '—'}</span><span className="row-sub">{[r.role, r.note].filter(Boolean).join(' · ')}</span></span></div>
            ))}</div>
          ) : <p className="muted">No crew list yet. Add who’s going and their job on the night — each person then sees their race-night jobs on Home.</p>}
          {crew.length > 0 && canMoney && canType('expense', 'edit') && <CrewCosts ev={ev} data={data} />}
        </Section>
      )}
      {pnl && (
        <Section title="Profit & loss" actions={<Link className="btn ghost small" to={`/finance?tab=events&event=${id}`}>Details</Link>}>
          <dl className="kv" data-testid="event-pnl">
            <dt>Income</dt><dd>{money(pnl.totalIncome)}</dd>
            <dt>Costs</dt><dd>{money(pnl.totalCosts)}</dd>
            <dt>Wear (tyres, engine, parts)</dt><dd>{money(pnl.totalWear)}</dd>
            <dt><b>Net</b></dt><dd><b>{money(pnl.net)}</b></dd>
          </dl>
        </Section>
      )}
      {groups.map((g) => {
        const list = linked(g.type);
        if (!list.length && !canType(g.type, 'edit')) return null;
        return (
          <Section key={g.type} title={g.label} actions={canType(g.type, 'edit') ? <Link className="btn ghost small" to={add(g.type)}>+ Add</Link> : null}>
            {list.length ? (
              <div className="list">{list.slice(0, 6).map((r) => (
                <Link key={r.id} to={`/r/${r.type}/${r.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{titleOf(r, data)}</span>
                    <span className="row-sub">{r.type === 'purchase' ? v(r, 'status') || 'Requested' : r.type === 'guest' ? (v(r, 'checked_in') ? 'Checked in' : 'Not here yet') : r.type === 'social_post' ? v(r, 'status') || 'Draft' : ''}</span></span>
                  {canMoney && (r.type === 'expense' || r.type === 'income') && <span className="row-meta">{money(v(r, 'amount'), v(r, 'currency'))}</span>}
                </Link>
              ))}{list.length > 6 && <p className="muted small">and {list.length - 6} more</p>}</div>
            ) : <p className="muted small">None yet.</p>}
          </Section>
        );
      })}
    </div>
  );
}

/**
 * Crew pay for a meeting: per diems (rate × days) and pay per meeting for each person on the crew list whose
 * Crew / contractor or Driver contract covers the date. Drafts them as unpaid expenses (bills to pay).
 */
function CrewCosts({ ev, data }) {
  const { tid, user } = useSession();
  const money = useMoney();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const days = Math.max(1, eventDayList(ev.data?.values || {}).filter((d) => !d.off).length || 1);
  const lines = crewCosts(data.list, ev, days);
  const recorded = data.list('expense').filter((e) => v(e, 'event') === ev.id && v(e, 'member') && ['Per diems & catering', 'Wages & contractors'].includes(v(e, 'category')));
  if (!lines.length && !recorded.length) return null;
  const draft = async () => {
    setBusy(true);
    try {
      const [y, mo, dd] = String(v(ev, 'end_date') || v(ev, 'date') || today()).split('-').map(Number);
      const due = new Date(Date.UTC(y, mo - 1, dd + 7));   // in UTC, so the date doesn't move with the time zone
      for (const l of lines) {
        await saveRecord(tid, 'expense', null, { form_id: formFor(data, 'expense')?.id, values: {
          date: v(ev, 'date') || today(), category: l.category, description: `${memberName(l.member)} — ${l.description}`, event: ev.id, member: l.member,
          amount: String(l.amount), currency: l.currency, paid: false, due_date: due.toISOString().slice(0, 10), notes: 'Drafted from the crew list and their contract rates.' } }, user.id);
      }
      setDone(`Added ${lines.length} crew cost${lines.length === 1 ? '' : 's'} as bills to pay.`);
    } finally { setBusy(false); }
  };
  return (
    <div className="crew-costs" data-testid="crew-costs">
      <h4 className="subhead">Crew pay</h4>
      {lines.length > 0 && (
        <div className="list">{lines.map((l, i) => (
          <div key={i} className="list-row"><span className="grow"><span className="row-title">{memberName(l.member)}</span><span className="row-sub">{l.category} · {l.description}</span></span><span className="row-meta">{money(l.amount, l.currency)}</span></div>
        ))}</div>
      )}
      {recorded.length > 0 && <p className="muted small">{recorded.length} crew cost{recorded.length === 1 ? '' : 's'} already in Finance for this meeting.</p>}
      {lines.length > 0 && <button type="button" className="btn small" disabled={busy} onClick={draft}>Add crew costs to Finance ({money(lines.reduce((a, l) => a + l.amount, 0))})</button>}
      {done && <span className="muted small" role="status"> {done}</span>}
      <p className="muted small">From each person’s <b>Crew / contractor</b> or <b>Driver</b> contract (per diem × {days} day{days === 1 ? '' : 's'}, and pay per meeting).</p>
    </div>
  );
}

/** Parts orders: raise a request; a role with Approve parts orders approves it; then it becomes an expense. */
export function Purchases() {
  const data = useTeamData();
  const { tid, user, can, canType, canMoney } = useSession();
  const money = useMoney();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'open';
  if (!data) return null;
  const all = data.list('purchase').slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const open = (p) => !['Received', 'Declined'].includes(v(p, 'status'));
  const list = all.filter((p) => (status === 'open' ? open(p) : status === 'all' ? true : (v(p, 'status') || 'Requested') === status));
  const decide = (p, st) => saveRecord(tid, 'purchase', p.id, { ...p.data, values: { ...p.data.values, status: st, approved_by: user.id, approved_on: today() } }, user.id);
  return (
    <div>
      <PageHeader title="Parts orders" sub="Ask for parts, get them approved, then record them as expenses">
        {canType('purchase', 'edit') && <Link className="btn primary" to="/r/purchase/new">New parts order</Link>}
      </PageHeader>
      <div className="tabs scroll">
        {['open', ...PURCHASE_STATUSES, 'all'].map((k) => (
          <button type="button" key={k} className={status === k ? 'active' : ''} onClick={() => setParams(k === 'open' ? {} : { status: k })}>
            {k === 'open' ? 'Open' : k === 'all' ? 'All' : k} <span className="tab-count">{k === 'open' ? all.filter(open).length : k === 'all' ? all.length : all.filter((p) => (v(p, 'status') || 'Requested') === k).length}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? <Empty>No parts orders here.</Empty> : (
        <div className="card list">
          {list.map((p) => (
            <div key={p.id} className="list-row" data-testid="purchase-row">
              <Link to={`/r/purchase/${p.id}`} className="grow">
                <span className="row-title">{titleOf(p, data)}</span>
                <span className="row-sub">{[v(p, 'status') || 'Requested', memberName(v(p, 'requested_by')) && `by ${memberName(v(p, 'requested_by'))}`, data.byId[v(p, 'event')] && titleOf(data.byId[v(p, 'event')]), v(p, 'needed_by') && `needed ${fmtDate(v(p, 'needed_by'))}`].filter(Boolean).join(' · ')}</span>
              </Link>
              {canMoney && purchaseTotal(p) > 0 && <span className="row-meta">{money(purchaseTotal(p))}</span>}
              {can('purchases.approve') && (v(p, 'status') || 'Requested') === 'Requested' && (
                <span className="row-actions">
                  <button type="button" className="btn small primary" onClick={() => decide(p, 'Approved')}>Approve</button>
                  <button type="button" className="btn small ghost danger" onClick={() => decide(p, 'Declined')}>Decline</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {!can('purchases.approve') && <p className="muted small">Someone whose role can approve parts orders (usually the crew chief) approves or declines each request.</p>}
    </div>
  );
}

/** /business: the modules this person can use, and what's coming up. */
export function BusinessHub() {
  const g = useNav().find((x) => x.area === 'business');
  const list = useReminders();
  return (
    <div className="hub hub-business">
      <PageHeader title="Business" sub="Parts orders, finance, transport, partnerships and marketing — all tied to your events" />
      {g && (
        <div className="module-cards">
          {g.links.map((l) => <Link key={l.to} to={l.to} className="module-card"><Icon d={l.icon} size={22} /><span>{l.label}</span></Link>)}
        </div>
      )}
      {list?.length ? <Section title="Coming up" actions={<Link className="btn ghost small" to="/reminders">All</Link>}><ReminderRows list={list} limit={8} /></Section> : null}
    </div>
  );
}
