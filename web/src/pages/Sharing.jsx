// Customer access (engine shops): the engine page a customer sees (no login), the shop's
// sharing panel on an engine, accepting a link invite, and a team's engines from its builders.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { money } from '@shared/shop.js';
import { Empty, PageHeader, Pill, Section, useOnline } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { fmtDate, fmtDateTime, titleOf, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

// ---------------------------------------------------------------- the engine page
export function EnginePackView({ pack, frozen }) {
  const s = pack.service || {};
  return (
    <article className="pack">
      <header className="pack-head">
        <div><p className="muted small">{pack.shop}</p><h1>{pack.engine.name}</h1>
          <p className="muted">{[pack.engine.manufacturer, pack.engine.model, pack.engine.serial && `S/N ${pack.engine.serial}`].filter(Boolean).join(' · ')}</p></div>
        {pack.owner && <div className="pack-owner"><span className="muted small">Owner</span><b>{pack.owner}</b></div>}
      </header>
      {frozen && <div className="notice">{frozen}</div>}

      <section className="card"><h3>Service</h3>
        <dl className="pack-kv">
          <div><dt>Last serviced</dt><dd>{s.last_service ? fmtDate(s.last_service) : '—'}</dd></div>
          {s.limit ? <div><dt>Service interval</dt><dd>{s.limit} {String(s.unit || '').toLowerCase()}</dd></div> : null}
          {s.used !== null && s.used !== undefined ? (
            <div><dt>Since last service</dt><dd><b>{s.used}</b> laps in {s.sessions} session{s.sessions === 1 ? '' : 's'}{s.limit ? <> — <Pill level={s.used >= s.limit ? 'over' : s.used >= s.limit * 0.8 ? 'warn' : 'ok'}>{Math.max(0, s.limit - s.used)} to go</Pill></> : null}</dd></div>
          ) : null}
          {s.last_session && <div><dt>Last raced</dt><dd>{fmtDate(s.last_session)}{s.team ? ` · ${s.team}` : ''}</dd></div>}
        </dl>
        {s.used === null || s.used === undefined ? <p className="muted small">Laps since the last service show here when the engine is linked to the owner’s RaceOps team.</p> : null}
      </section>

      {pack.builds?.length > 0 && (
        <section className="card"><h3>Builds</h3>
          {pack.builds.map((b, i) => (
            <div key={i} className="pack-build">
              <h4>{b.build_type || 'Build'} · {fmtDate(b.date)}{b.job_no ? <span className="muted small"> — job {b.job_no}</span> : null}</h4>
              {b.specs.length > 0 && <dl className="pack-specs">{b.specs.map((x) => <div key={x.label}><dt>{x.label}</dt><dd>{x.value}{x.unit ? ` ${x.unit}` : ''}</dd></div>)}</dl>}
              {b.checks?.singles?.length > 0 && <dl className="pack-specs">{b.checks.singles.map(([l, x, u]) => <div key={l}><dt>{l}</dt><dd>{x}{u ? ` ${u}` : ''}</dd></div>)}</dl>}
              {b.checks?.rows?.map((r) => <p key={r.label} className="small"><b>{r.label}</b> ({r.unit}): {r.cells.map(([k, x]) => `${k} ${Number(x).toFixed(r.dp)}`).join(' · ')}</p>)}
            </div>
          ))}
        </section>
      )}

      <section className="card"><h3>Work history</h3>
        {!pack.jobs?.length ? <p className="muted">No jobs yet.</p> : pack.jobs.map((j) => (
          <div key={j.job_no} className="pack-job">
            <h4>{j.job_no} · {j.job_type || 'Job'} <span className="muted small">{fmtDate(j.date_in)}{j.date_out ? ` – ${fmtDate(j.date_out)}` : ''} · {j.status}</span></h4>
            {[['Asked for', j.request], ['Findings', j.findings], ['Work done', j.work_done], ['Recommendations', j.recommendations]].filter(([, x]) => x).map(([l, x]) => <p key={l} className="small pre"><b>{l}:</b> {x}</p>)}
            {j.parts?.length > 0 && (
              <table className="ps-table small"><thead><tr><th>Part</th><th className="num">Qty</th>{j.totals && <th className="num">Amount</th>}</tr></thead>
                <tbody>{j.parts.map((p, i) => <tr key={i}><td>{[p.part_no, p.description].filter(Boolean).join(' — ')}</td><td className="num">{p.qty}</td>{j.totals && <td className="num">{money(p.amount)}</td>}</tr>)}</tbody></table>
            )}
            {j.labour?.length > 0 && <p className="small"><b>Labour:</b> {j.labour.map((l) => `${l.description || 'Work'}${l.hours ? ` (${l.hours} h)` : ''}`).join(' · ')}</p>}
            {j.totals && <p className="small"><b>Total {money(j.totals.total)}</b> {j.totals.includes_tax ? `incl. ${j.totals.tax_label}` : `incl. ${j.totals.tax_label} ${money(j.totals.tax)}`}{j.invoice_ref ? ` · invoice ${j.invoice_ref}` : ''}{j.paid ? ' · paid' : ''}</p>}
          </div>
        ))}
      </section>
      {pack.terms && <p className="muted small pre">{pack.terms}</p>}
      <p className="muted small">From {pack.shop} via RaceOps · {fmtDateTime(pack.generated_at)}</p>
    </article>
  );
}

/** Public page: /s/:token — no login. */
export function SharePage() {
  const { token } = useParams();
  const [pack, setPack] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`/api/share/${encodeURIComponent(token)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not load this engine.');
      setPack(j); document.title = `${j.engine.name} — ${j.shop}`;
    }).catch((e) => setErr(e.message));
  }, [token]);
  return (
    <div className="share-page">
      <div className="share-tools no-print">{pack && <button type="button" className="btn ghost small" onClick={() => window.print()}>Print / save as PDF</button>}</div>
      {err ? <div className="card"><h1>Engine page unavailable</h1><p>{err}</p></div> : !pack ? <p className="muted">Loading…</p> : <EnginePackView pack={pack} />}
    </div>
  );
}

// ---------------------------------------------------------------- shop: customer access on an engine
export function CustomerAccess({ asset }) {
  const { tid, canType } = useSession();
  const online = useOnline();
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  // refreshing this panel also refreshes the team laps counted on lifecycle bars
  const load = () => api(`/t/${tid}/engines/${asset.id}/sharing`).then((x) => { setSt(x); window.dispatchEvent(new Event('raceops:linked-changed')); }).catch((e) => setErr(e.message));
  useEffect(() => { if (online) load(); }, [asset.id, online]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!canType('job', 'view')) return null;
  const edit = canType('job', 'edit');
  const act = async (fn) => { setErr(''); try { await fn(); await load(); } catch (e) { setErr(e.message); } };
  const shareUrl = st?.share ? `${window.location.origin}/s/${st.share.token}` : '';
  const pending = st?.links.find((l) => l.status === 'pending');
  const active = st?.links.find((l) => l.status === 'active');
  const inviteUrl = pending ? `${window.location.origin}/link-engine/${pending.code}` : '';
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); } catch { window.prompt('Copy this', text); } };
  return (
    <Section title="Customer access" className="customer-access">
      {!online ? <p className="muted small">Connect to the internet to manage sharing.</p> : !st ? <p className="muted small">{err || 'Loading…'}</p> : (
        <>
          {err && <div className="notice error small">{err}</div>}
          <div className="ca-block">
            <h4>Engine page link <span className="muted small">— no login needed</span></h4>
            {st.share ? (
              <>
                <div className="inline-row wrap"><input readOnly value={shareUrl} aria-label="Engine page link" onFocus={(e) => e.target.select()} />
                  <button type="button" className="btn small" onClick={() => copy(shareUrl, 'share')}>{copied === 'share' ? 'Copied ✓' : 'Copy link'}</button>
                  <a className="btn small ghost" href={shareUrl} target="_blank" rel="noopener noreferrer">Open</a></div>
                <p className="muted small">Viewed {st.share.views} time{st.share.views === 1 ? '' : 's'}{st.share.last_viewed_at ? `, last ${fmtDateTime(st.share.last_viewed_at)}` : ''}. Anyone with the link can see the build history and work done — not your internal notes, parts costs or margins. Prices show only on jobs where you tick “Show prices to the customer”.</p>
                {edit && <div className="inline-row"><button type="button" className="btn small ghost" onClick={() => act(() => api(`/t/${tid}/engines/${asset.id}/share`, { method: 'POST' }))}>Replace link</button>
                  <button type="button" className="btn small ghost danger" onClick={() => window.confirm('Turn off this link? Anyone using it will lose access.') && act(() => api(`/t/${tid}/engines/${asset.id}/share`, { method: 'DELETE' }))}>Turn off</button></div>}
              </>
            ) : edit ? (
              <button type="button" className="btn small primary" onClick={() => act(() => api(`/t/${tid}/engines/${asset.id}/share`, { method: 'POST' }))}>Create engine page link</button>
            ) : <p className="muted small">Not shared.</p>}
          </div>
          <div className="ca-block">
            <h4>Link to the owner’s RaceOps team <span className="muted small">— they see this engine’s builds; you see its laps</span></h4>
            {active ? (
              <>
                <p><Pill level="ok">Linked</Pill> <b>{active.team}</b> since {fmtDate(active.accepted_at)}</p>
                {st.usage && <p className="small"><b>{st.usage.laps}</b> laps in {st.usage.sessions} session{st.usage.sessions === 1 ? '' : 's'} since {st.usage.since ? fmtDate(st.usage.since) : 'the link started'}{st.usage.last ? ` · last raced ${fmtDate(st.usage.last)}` : ''}</p>}
                <p className="small">{active.feed_lifecycle ? <><Pill level="ok">On</Pill> The team counts these laps on your service tracker, so this engine’s lifecycle bar includes them.</> : <><Pill level="muted">Off</Pill> The team hasn’t chosen to count these laps on your service tracker — the lifecycle bar shows only laps you record.</>}</p>
                <p className="muted small">Only the engine’s laps and session dates come across — never their setups, tracks or results.</p>
                {edit && <button type="button" className="btn small ghost danger" onClick={() => window.confirm(`End the link with ${active.team}? They keep a copy of the build history as it is today.`) && act(() => api(`/t/${tid}/engine-links/${active.id}/end`, { method: 'POST' }))}>End link</button>}
              </>
            ) : pending ? (
              <>
                <p className="small">Send the owner this invite. Someone on their team opens it, signs in, and picks which of their engines it is.</p>
                <div className="inline-row wrap"><input readOnly value={inviteUrl} aria-label="Team invite link" onFocus={(e) => e.target.select()} />
                  <button type="button" className="btn small" onClick={() => copy(inviteUrl, 'invite')}>{copied === 'invite' ? 'Copied ✓' : 'Copy invite'}</button></div>
                <p className="muted small">Invite code <b className="mono">{pending.code}</b> — they can also enter it under Engine Builds → “Link an engine from your builder”.</p>
                {edit && <button type="button" className="btn small ghost danger" onClick={() => act(() => api(`/t/${tid}/engine-links/${pending.id}/end`, { method: 'POST' }))}>Cancel invite</button>}
              </>
            ) : edit ? (
              <button type="button" className="btn small" onClick={() => act(() => api(`/t/${tid}/engines/${asset.id}/link`, { method: 'POST' }))}>Invite the owner’s team</button>
            ) : <p className="muted small">Not linked.</p>}
            {st.links.filter((l) => l.status === 'ended' && l.team).slice(0, 3).map((l) => <p key={l.id} className="muted small">Was linked to {l.team} until {fmtDate(l.ended_at)} — {l.ended_reason}.</p>)}
          </div>
          {st.limit !== null && <p className="muted small">Your plan allows {st.limit} shared engine{st.limit === 1 ? '' : 's'} at a time ({st.shared} in use).</p>}
          <p className="muted small">Changing this engine’s owner turns off its link and ends any team link automatically.</p>
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- team: accept an invite
export function LinkEngine() {
  const { code } = useParams();
  const { tid, membership } = useSession();
  const data = useTeamData();
  const nav = useNavigate();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState(false);
  useEffect(() => { setInfo(null); setErr(''); api(`/t/${tid}/engine-invites/${encodeURIComponent(code)}`).then((x) => { setInfo(x); setName(x.engine); }).catch((e) => setErr(e.message)); }, [tid, code]);
  const engines = data ? data.list('asset').filter((a) => v(a, 'category') === 'Engine').sort((a, b) => titleOf(a).localeCompare(titleOf(b))) : [];
  const accept = async () => {
    setBusy(true); setErr('');
    try {
      await api(`/t/${tid}/engine-invites/${encodeURIComponent(code)}/accept`, { method: 'POST', body: { ...(pick && pick !== '__new' ? { asset_id: pick } : { new_engine_name: name }), feed_lifecycle: feed } });
      nav('/engines?linked=1', { replace: true });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader title="Link an engine from your builder" sub={membership?.tenant_name} back="/engines" />
      {err && <div className="notice error">{err}</div>}
      {info && (
        <Section title={`${info.shop} wants to link ${info.engine}`}>
          <p>{info.shop} built this engine{info.owner ? ` for ${info.owner}` : ''}{info.serial ? ` (S/N ${info.serial})` : ''}. Linking it to <b>{membership?.tenant_name}</b> means:</p>
          <ul className="tips">
            <li>You can see its build history, specs, clearances and job history, read-only.</li>
            <li>{info.shop} sees only how many laps and sessions you run on it, and when — so they can tell you when it’s due for service. Your setups, tracks and results stay private.</li>
            <li>Either side can end the link. You keep a copy of the build history as it is that day.</li>
          </ul>
          <div className="field"><label htmlFor="le-pick">Which of your engines is it?</label>
            <select id="le-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose…</option>
              {engines.map((a) => <option key={a.id} value={a.id}>{titleOf(a)}{v(a, 'serial_number') ? ` (S/N ${v(a, 'serial_number')})` : ''}</option>)}
              <option value="__new">It’s not in RaceOps yet — add it</option>
            </select></div>
          {pick === '__new' && <div className="field"><label htmlFor="le-name">Name for the engine</label><input id="le-name" value={name} onChange={(e) => setName(e.target.value)} /></div>}
          <FeedOption shop={info.shop} checked={feed} onChange={setFeed} />
          <div className="inline-row"><button type="button" className="btn primary" disabled={busy || !pick || (pick === '__new' && !name.trim())} onClick={accept}>{busy ? 'Linking…' : 'Link engine'}</button></div>
        </Section>
      )}
    </div>
  );
}

/** The team's per-engine choice: count our laps on the builder's service tracker. */
function FeedOption({ shop, checked, onChange, disabled }) {
  return (
    <div className="feed-option">
      <label className="check-row"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span>Count our laps on {shop}’s service tracker for this engine</span></label>
      <p className="muted small">When on, the laps you record on setup sheets with this engine count towards its service interval in {shop}’s app, so their lifecycle bar matches yours and they can tell you when it’s due. They already see the lap count either way; this only decides whether it counts on their tracker. You can change it at any time.</p>
    </div>
  );
}

// ---------------------------------------------------------------- team: engines from builders
export function LinkedEngines() {
  const { tid, canType } = useSession();
  const online = useOnline();
  const nav = useNavigate();
  const [list, setList] = useState(null);
  const [code, setCode] = useState('');
  useEffect(() => { if (online) api(`/t/${tid}/linked-engines`).then(setList).catch(() => setList([])); }, [tid, online]);
  const active = (list || []).filter((l) => l.status === 'active');
  const ended = (list || []).filter((l) => l.status === 'ended');
  return (
    <Section title="Engines from your engine builder" className="linked-engines">
      {!online ? <p className="muted small">Connect to the internet to see engines linked from your builder.</p> : !list ? <p className="muted small">Loading…</p> : (
        <>
          {!active.length && !ended.length && <p className="muted small">If your engine builder uses RaceOps, they can link your engine so you see its build sheets and service history here.</p>}
          {[...active, ...ended].map((l) => (
            <Link key={l.id} to={`/engines/linked/${l.id}`} className="list-row">
              <span className="grow"><span className="row-title">{l.pack?.engine?.name || 'Engine'} <span className="muted small">from {l.shop}</span></span>
                <span className="row-sub">{l.status === 'active' ? `Linked since ${fmtDate(l.accepted_at)}` : `Link ended ${fmtDate(l.ended_at)} — copy as at that date`}{l.pack?.service?.used !== null && l.pack?.service?.used !== undefined ? ` · ${l.pack.service.used} laps since last service` : ''}</span></span>
              <Pill level={l.status === 'active' ? 'ok' : 'muted'}>{l.status === 'active' ? 'linked' : 'ended'}</Pill>
            </Link>
          ))}
          {canType('asset', 'edit') && (
            <form className="inline-row wrap le-code" onSubmit={(e) => { e.preventDefault(); if (code.trim()) nav(`/link-engine/${encodeURIComponent(code.trim().toUpperCase())}`); }}>
              <input placeholder="Invite code, e.g. ABCD-2345" aria-label="Invite code" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="btn small" disabled={!code.trim()}>Link an engine from your builder</button>
            </form>
          )}
        </>
      )}
    </Section>
  );
}

export function LinkedEngineDetail() {
  const { id } = useParams();
  const { tid, canType } = useSession();
  const nav = useNavigate();
  const [l, setL] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { api(`/t/${tid}/linked-engines`).then((xs) => { const x = xs.find((y) => y.id === id); if (x) setL(x); else setErr('Not found.'); }).catch((e) => setErr(e.message)); }, [tid, id]);
  if (err) return <div><PageHeader title="Linked engine" back="/engines" /><div className="notice">{err}</div></div>;
  if (!l) return <p className="pad muted">Loading…</p>;
  if (!l.pack) return <div><PageHeader title="Linked engine" back="/engines" /><Empty>No build history was shared.</Empty></div>;
  return (
    <div>
      <PageHeader title={l.pack.engine.name} sub={`From ${l.shop}${l.status === 'active' ? '' : ' — link ended'}`} back="/engines">
        <Link className="btn ghost" to={`/assets/${l.team_asset_id}`}>Our engine record</Link>
        {l.status === 'active' && canType('asset', 'edit') && (
          <button type="button" className="btn ghost danger" onClick={async () => {
            if (!window.confirm(`End the link with ${l.shop}? You keep a copy of the build history as it is today, and they stop seeing your laps on this engine.`)) return;
            await api(`/t/${tid}/linked-engines/${l.id}/end`, { method: 'POST' }); nav('/engines', { replace: true });
          }}>End link</button>
        )}
      </PageHeader>
      {l.status === 'active' && (
        <Section title="Service tracking">
          <FeedOption shop={l.shop} checked={!!l.feed_lifecycle} disabled={!canType('asset', 'edit')}
            onChange={async (x) => {
              const before = l.feed_lifecycle;
              setL({ ...l, feed_lifecycle: x }); setSaving(true); // show the change at once; undo if it doesn't save
              try { await api(`/t/${tid}/linked-engines/${l.id}`, { method: 'PATCH', body: { feed_lifecycle: x } }); } catch (e) { setL((cur) => ({ ...cur, feed_lifecycle: before })); window.alert(e.message); } finally { setSaving(false); }
            }} />
        </Section>
      )}
      <EnginePackView pack={l.pack} frozen={l.status === 'ended' ? `This is a copy as at ${fmtDate(l.ended_at)} (${l.ended_reason}). Ask ${l.shop} to link it again for updates.` : null} />
    </div>
  );
}
