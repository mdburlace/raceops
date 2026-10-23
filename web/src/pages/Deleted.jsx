// Recently deleted: put back records deleted by mistake. Everyone sees what they created or deleted; a role with
// "Recover anyone's deleted items" sees the whole team. Platform admins have their own page across every team,
// and set how long deleted items are kept.
import { useMemo, useState } from 'react';
import { Empty, PageHeader, Section } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { syncNow } from '../lib/sync.js';
import { fmtDateTime } from '../lib/data.js';
import { useLoad } from './Team.jsx';

const TYPE = {
  setup: 'Setup sheet', track_check: 'Between-round check', dyno_run: 'Dyno run', engine_build: 'Engine build', tire: 'Tyre',
  team_track: 'Track (ours)', season_plan: 'Season plan', local_note: 'Calendar note', fixture: 'Calendar date', contact_link: 'Contact role',
  gear_list: 'Gear list', tuning_guide: 'Tuning guide', maintenance: 'Maintenance checklist', schedule: 'Service schedule', job: 'Shop job',
};
export const typeLabel = (t) => TYPE[t] || t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const CHOICES = [30, 60, 90, 180, 365, 730];
export const keepText = (d) => (d === null || d === undefined ? 'until recovered (they’re never removed)' : `for ${d} days`);

function DeletedList({ items, showTeam, onRecover, busy }) {
  const [pick, setPick] = useState(new Set());
  const can = items.filter((i) => i.can_recover);
  const toggle = (id) => setPick((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  if (!items.length) return <Empty>Nothing here. Deleted items show up here, and can be put back until they’re removed for good.</Empty>;
  return (
    <>
      <div className="inline-row wrap">
        <label className="check-row"><input type="checkbox" aria-label="Choose all" checked={pick.size > 0 && pick.size === can.length} onChange={(e) => setPick(e.target.checked ? new Set(can.map((i) => i.id)) : new Set())} /> All</label>
        <button type="button" className="btn primary small" disabled={!pick.size || busy} onClick={() => onRecover([...pick]).then(() => setPick(new Set()))}>{busy ? 'Recovering…' : `Recover${pick.size ? ` ${pick.size}` : ''}`}</button>
      </div>
      <div className="table-wrap">
        <table className="table" data-testid="deleted-items">
          <thead><tr><th /><th>Item</th>{showTeam && <th>Team</th>}<th>Deleted</th><th>Removed for good</th><th /></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} data-testid="deleted-item">
                <td>{i.can_recover && <input type="checkbox" aria-label={`Choose ${i.title}`} checked={pick.has(i.id)} onChange={() => toggle(i.id)} />}</td>
                <td><b>{i.title}</b><span className="row-sub">{typeLabel(i.type)}{i.created_by ? ` · made by ${i.created_by}` : ''}</span></td>
                {showTeam && <td>{i.team || <span className="muted">Shared directory</span>}</td>}
                <td>{fmtDateTime(i.deleted_at)}{i.deleted_by && <span className="row-sub">by {i.deleted_by}</span>}</td>
                <td>{i.removed_at ? fmtDateTime(i.removed_at) : <span className="muted">Kept</span>}</td>
                <td className="num">{i.can_recover ? <button type="button" className="btn small ghost" disabled={busy} onClick={() => onRecover([i.id])}>Recover</button> : <span className="small muted">Ask your team manager</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AskRetention({ base, request, onSent }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('180');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  if (request) return <p className="small" data-testid="retention-request">You asked to keep them {keepText(request.days)} on {fmtDateTime(request.at)}. A platform admin will decide.</p>;
  if (!open) return <button type="button" className="btn small ghost" onClick={() => setOpen(true)}>Ask for a different time</button>;
  const send = async () => { setErr(''); try { await api(`${base}/retention-request`, { method: 'POST', body: { days: days === 'forever' ? 'forever' : Number(days), note } }); setOpen(false); onSent(); } catch (e) { setErr(e.message); } };
  return (
    <div className="sub-card card" data-testid="ask-retention">
      <p className="small">How long deleted items are kept is set by your platform admin. Ask for a different time:</p>
      <div className="inline-row wrap">
        <select aria-label="Keep deleted items for" value={days} onChange={(e) => setDays(e.target.value)}>
          {CHOICES.map((d) => <option key={d} value={d}>{d} days</option>)}
          <option value="forever">Until recovered (never removed)</option>
        </select>
        <input aria-label="Why" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (optional)" />
        <button type="button" className="btn small primary" onClick={send}>Send to the platform admin</button>
        <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {err && <div className="notice error small">{err}</div>}
    </div>
  );
}

/** Recently deleted, for the current team. */
export function RecentlyDeleted() {
  const { tid } = useSession();
  const base = `/t/${tid}/deleted`;
  const [mine, setMine] = useState(false);
  const [state, reload] = useLoad(() => api(`${base}${mine ? '?mine=1' : ''}`), [tid, mine]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const d = state.data;
  const recover = async (ids) => {
    setBusy(true); setMsg(null);
    try {
      const r = await api(`${base}/recover`, { method: 'POST', body: { ids } });
      setMsg({ ok: !r.refused, text: `${r.recovered} recovered.${r.refused ? ` ${r.refused} couldn’t be: ask your team manager.` : ''}` });
      reload(); syncNow();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader title="Recently deleted" sub="Put back something deleted by mistake" />
      {!d ? <p className="muted">{state.err || 'Loading…'}</p> : (
        <>
          <Section title={d.all ? 'Deleted in the team' : 'Things you made or deleted'}
            actions={d.manager && <label className="check-row small"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Just mine</label>}>
            <p className="small" data-testid="retention">Deleted items are kept {keepText(d.keep_days)}, then removed for good with their photos, files and history.
              {!d.manager && ' You can recover what you made or deleted. For anything else, ask your team manager.'}</p>
            {d.manager && <AskRetention base={base} request={d.request} onSent={reload} />}
            {msg && <div className={`notice small ${msg.ok ? 'info' : 'error'}`} role="status">{msg.text}</div>}
            <DeletedList items={d.items} onRecover={recover} busy={busy} />
          </Section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Platform admin → Recently deleted
function RetentionAdmin({ data, reload }) {
  const [def, setDef] = useState(data.platform_days === null ? 'forever' : String(data.platform_days));
  const [msg, setMsg] = useState(null);
  const act = async (fn, ok) => { setMsg(null); try { await fn(); setMsg({ ok: true, text: ok }); reload(); } catch (e) { setMsg({ ok: false, text: e.message }); } };
  const val = (t) => (t.deleted_retention_days === null ? 'default' : t.deleted_retention_days === 0 ? 'forever' : String(t.deleted_retention_days));
  const options = (cur) => [...new Set([...CHOICES.map(String), ...(cur && !['default', 'forever'].includes(cur) ? [cur] : [])])];
  const requests = data.teams.filter((t) => t.retention_request);
  return (
    <Section title="How long deleted items are kept">
      {msg && <div className={`notice small ${msg.ok ? 'info' : 'error'}`} role="status">{msg.text}</div>}
      <div className="inline-row wrap" data-testid="retention-default">
        <span>Every team, unless set below:</span>
        <select aria-label="Platform default" value={def} onChange={(e) => setDef(e.target.value)}>
          {options(def).map((d) => <option key={d} value={d}>{d} days</option>)}
          <option value="forever">Until recovered (never removed)</option>
        </select>
        <button type="button" className="btn small primary" onClick={() => act(() => api('/admin/deleted/retention', { method: 'PUT', body: { days: def === 'forever' ? 'forever' : Number(def) } }), 'Saved.')}>Save</button>
      </div>
      {requests.length > 0 && (
        <div className="notice info" data-testid="retention-requests">
          {requests.map((t) => (
            <div key={t.id} className="inline-row wrap">
              <span className="grow"><b>{t.name}</b> asks to keep deleted items {keepText(t.retention_request.days)}{t.retention_request.by_name ? ` (${t.retention_request.by_name})` : ''}{t.retention_request.note ? `: “${t.retention_request.note}”` : ''}</span>
              <button type="button" className="btn small primary" onClick={() => act(() => api(`/admin/deleted/retention/${t.id}`, { method: 'PUT', body: { days: t.retention_request.days === null ? 'forever' : t.retention_request.days } }), `${t.name}: done.`)}>Approve</button>
              <button type="button" className="btn small ghost" onClick={() => act(() => api(`/admin/deleted/retention/${t.id}/decline`, { method: 'POST', body: {} }), `${t.name}: declined.`)}>Decline</button>
            </div>
          ))}
        </div>
      )}
      <div className="table-wrap">
        <table className="table" data-testid="retention-teams">
          <thead><tr><th>Team</th><th className="num">Deleted now</th><th>Keep deleted items</th></tr></thead>
          <tbody>{data.teams.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td><td className="num">{t.deleted || ''}</td>
              <td><select aria-label={`Keep for ${t.name}`} value={val(t)} onChange={(e) => act(() => api(`/admin/deleted/retention/${t.id}`, { method: 'PUT', body: { days: e.target.value === 'default' || e.target.value === 'forever' ? e.target.value : Number(e.target.value) } }), `${t.name}: saved.`)}>
                <option value="default">Platform default ({data.platform_days === null ? 'never removed' : `${data.platform_days} days`})</option>
                {options(val(t)).map((d) => <option key={d} value={d}>{d} days</option>)}
                <option value="forever">Until recovered (never removed)</option>
              </select></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Section>
  );
}

export function AdminDeleted() {
  const [team, setTeam] = useState('all');
  const [state, reload] = useLoad(() => api(`/admin/deleted?team=${team}`), [team]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const d = state.data;
  const total = useMemo(() => (d?.teams || []).reduce((n, t) => n + t.deleted, 0), [d]);
  const recover = async (ids) => {
    setBusy(true); setMsg(null);
    try { const r = await api('/admin/deleted/recover', { method: 'POST', body: { ids } }); setMsg({ ok: true, text: `${r.recovered} recovered.` }); reload(); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader title="Recently deleted" sub="Recover anything deleted in any team or the shared directory, and set how long deleted items are kept" />
      {!d ? <p className="muted">{state.err || 'Loading…'}</p> : (
        <>
          <Section title="Deleted items" actions={(
            <select aria-label="Team" value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="all">Every team ({total})</option>
              <option value="shared">Shared directory</option>
              {d.teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.deleted})</option>)}
            </select>
          )}>
            {msg && <div className={`notice small ${msg.ok ? 'info' : 'error'}`} role="status">{msg.text}</div>}
            <DeletedList items={d.items} showTeam onRecover={recover} busy={busy} />
          </Section>
          <RetentionAdmin data={d} reload={reload} />
        </>
      )}
    </div>
  );
}
