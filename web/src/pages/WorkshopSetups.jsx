// In the Workshop → Workshop setups: each car's setups as measured on the shop floor, and the events they're
// the baseline for. A workshop setup is edited in the record editor (/r/shop_setup/:id); ShopSetupLinks sits
// under it to link it to the car's events.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, PageHeader, Section } from '../components/ui.jsx';
import { fmtDate, roundAndTrack, titleOf, today, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { saveRecord } from '../lib/store.js';

const byDateDesc = (a, b) => String(v(b, 'date') || b.created_at).localeCompare(String(v(a, 'date') || a.created_at));

export function WorkshopSetups() {
  const data = useTeamData();
  const { canType } = useSession();
  if (!data) return null;
  const cars = data.list('car').filter((c) => v(c, 'active') !== false);
  const setups = data.list('shop_setup');
  const events = data.list('event');
  const canEdit = canType('shop_setup', 'edit');
  const usedBy = (s) => events.filter((e) => v(e, 'shop_setup') === s.id);
  return (
    <div>
      <PageHeader title="Workshop setups" sub="How each car is set up on the shop floor — the baseline it goes to the track with" />
      {!cars.length && <Empty>Add a car first (Team Management → Cars).</Empty>}
      {cars.map((c) => {
        const mine = setups.filter((s) => v(s, 'car') === c.id).sort(byDateDesc);
        return (
          <Section key={c.id} title={titleOf(c)} actions={canEdit && <Link className="btn small primary" to={`/r/shop_setup/new?car=${c.id}`}>New workshop setup</Link>}>
            {!mine.length ? <p className="muted">No workshop setups for this car yet.</p> : (
              <div className="list" data-testid="shop-setups">
                {mine.map((s) => {
                  const evs = usedBy(s);
                  const next = evs.filter((e) => (v(e, 'date') || '') >= today()).sort((a, b) => String(v(a, 'date')).localeCompare(String(v(b, 'date'))))[0];
                  return (
                    <Link key={s.id} className="list-row" to={`/r/shop_setup/${s.id}`} data-testid="shop-setup-row">
                      <span className="grow">
                        <span className="row-title">{v(s, 'name') || 'Workshop setup'}</span>
                        <span className="row-sub">{[v(s, 'date') && `Set up ${fmtDate(v(s, 'date'))}`, v(s, 'purpose')].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="small muted">{evs.length ? `${evs.length} event${evs.length === 1 ? '' : 's'}${next ? ` · next ${fmtDate(v(next, 'date'))}` : ''}` : 'Not linked to an event'}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </Section>
        );
      })}
    </div>
  );
}

/** Under a workshop setup: the events it's the baseline for, and linking it to another of the car's events. */
export function ShopSetupLinks({ rec, values }) {
  const data = useTeamData();
  const { tid, user, canType } = useSession();
  const [pick, setPick] = useState('');
  const [msg, setMsg] = useState('');
  if (!data || !rec) return null;
  const car = values.car;
  const linked = data.list('event').filter((e) => v(e, 'shop_setup') === rec.id).sort((a, b) => String(v(b, 'date')).localeCompare(String(v(a, 'date'))));
  const candidates = data.list('event').filter((e) => v(e, 'car') === car && v(e, 'shop_setup') !== rec.id)
    .sort((a, b) => {
      const up = (e) => ((v(e, 'date') || '') >= today() ? 0 : 1);
      return up(a) - up(b) || (up(a) === 0 ? String(v(a, 'date')).localeCompare(String(v(b, 'date'))) : String(v(b, 'date')).localeCompare(String(v(a, 'date'))));
    });
  const canLink = canType('event', 'edit');
  const setLink = async (ev, on) => {
    await saveRecord(tid, 'event', ev.id, { ...ev.data, values: { ...ev.data.values, shop_setup: on ? rec.id : '' } }, user.id);
    setMsg(on ? `Linked to ${v(ev, 'name')}.` : `Unlinked from ${v(ev, 'name')}.`);
    setPick('');
  };
  const label = (e) => [fmtDate(v(e, 'date')), v(e, 'name'), roundAndTrack(v(e, 'round'), '')].filter(Boolean).join(' · ');
  return (
    <Section title="Events this is the baseline for" className="shop-links">
      <p className="small muted">At these events, setup sheets can start from this workshop setup (<b>Start this sheet from… → Workshop setup</b>).</p>
      {msg && <div className="notice info small" role="status">{msg}</div>}
      {!linked.length ? <p className="muted small">Not linked to an event yet.</p> : (
        <div className="list" data-testid="shop-linked-events">
          {linked.map((e) => (
            <div key={e.id} className="list-row static">
              <Link className="grow" to={`/events/${e.id}`}><span className="row-title">{v(e, 'name')}</span><span className="row-sub">{fmtDate(v(e, 'date'))}</span></Link>
              {canLink && <button type="button" className="btn small ghost" onClick={() => setLink(e, false)}>Unlink</button>}
            </div>
          ))}
        </div>
      )}
      {canLink && candidates.length > 0 && (
        <div className="inline-row wrap" data-testid="shop-link-event">
          <select aria-label="Event to link" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Use for an event…</option>
            {candidates.map((e) => <option key={e.id} value={e.id}>{label(e)}{v(e, 'shop_setup') ? ' (has another workshop setup)' : ''}</option>)}
          </select>
          <button type="button" className="btn small" disabled={!pick} onClick={() => setLink(data.byId[pick], true)}>Link</button>
        </div>
      )}
    </Section>
  );
}
