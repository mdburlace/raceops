// Backups: the platform's full backups (Platform admin → Backups) and a team's own backups (Team Management →
// Backups). Destinations, schedules, backing up now, the list of backups, and restoring — from a listed backup,
// a file from the computer, or a file found on a destination.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { api, token } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { fmtDateTime } from '../lib/data.js';
import { useLoad } from './Team.jsx';

export const fmtBytes = (b) => (!b && b !== 0 ? '' : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`);
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hourLabel = (h) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'am' : 'pm'}`;
export const scheduleText = (p) => {
  if (!p || p.frequency === 'off') return 'Off';
  const at = hourLabel(p.at_hour);
  return p.frequency === 'daily' ? `Every day at ${at}` : p.frequency === 'weekly' ? `Every ${DAYS[p.weekday]} at ${at}` : `On day ${p.monthday} of every month at ${at}`;
};
const TRIGGER = { manual: 'Made by hand', scheduled: 'Scheduled', 'pre-restore': 'Safety backup before a restore', download: 'Download' };

// ---------------------------------------------------------------- background jobs
/** Start a job (a POST that answers { op }) and follow it until it finishes. */
export function useOp(onDone) {
  const [op, setOp] = useState(null);
  useEffect(() => {
    if (!op || op.status !== 'running') return undefined;
    const t = setTimeout(async () => {
      try {
        const r = await api(`/backup/ops/${op.id}`);
        setOp(r.op);
        if (r.op.status !== 'running') onDone?.(r.op);
      } catch (e) { setOp({ ...op, status: 'failed', error: e.message }); }
    }, 1000);
    return () => clearTimeout(t);
  }, [op]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = async (fn) => {
    setOp({ status: 'running', step: 'Starting' });
    try { const r = await fn(); setOp(r.op); if (r.op.status !== 'running') onDone?.(r.op); } catch (e) { setOp({ status: 'failed', error: e.message }); }
  };
  return [op, start, setOp];
}
export function OpStatus({ op, done }) {
  if (!op) return null;
  if (op.status === 'running') return <div className="notice info" role="status" data-testid="op-status"><span className="spinner" /> {op.step || 'Working'}…</div>;
  if (op.status === 'failed') return <div className="notice error" role="alert" data-testid="op-status">{op.error}</div>;
  return <div className="notice info" role="status" data-testid="op-status">{done ? done(op.result) : 'Done.'}</div>;
}

// ---------------------------------------------------------------- destinations
function DestinationForm({ base, kinds, onSaved, onCancel }) {
  const [f, setF] = useState({ name: '', kind: 'local', folder: '', endpoint: '', region: '', bucket: '', prefix: '', path_style: true, access_key_id: '', secret_access_key: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const k = kinds?.[f.kind];
  const save = async () => {
    setErr(''); setBusy(true);
    try {
      const config = f.kind === 's3' ? { endpoint: f.endpoint, region: f.region, bucket: f.bucket, prefix: f.prefix, path_style: f.path_style } : { folder: f.folder };
      const r = await api(`${base}/targets`, { method: 'POST', body: { name: f.name, kind: f.kind, config, secret: f.kind === 's3' ? { access_key_id: f.access_key_id, secret_access_key: f.secret_access_key } : undefined } });
      if (r.connect_url) { window.location.href = r.connect_url; return; }
      onSaved(r);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card sub-card" data-testid="dest-form">
      <div className="grid-2">
        <label className="field"><span className="label">Name</span><input aria-label="Destination name" value={f.name} onChange={set('name')} placeholder="e.g. Office NAS, Team Google Drive" /></label>
        <label className="field"><span className="label">Kind</span>
          <select aria-label="Kind of destination" value={f.kind} onChange={set('kind')}>
            {Object.entries(kinds || {}).map(([key, v]) => <option key={key} value={key} disabled={!v.ready}>{v.label}{v.ready ? '' : ' (not set up)'}</option>)}
          </select>
        </label>
      </div>
      {k && !k.ready && <p className="small muted">{k.why}</p>}
      {f.kind === 'local' && (
        <label className="field"><span className="label">Folder</span><input aria-label="Folder" value={f.folder} onChange={set('folder')} placeholder="raceops" />
          <span className="small muted">A folder inside the server’s backup folder (BACKUP_DIR). Keep a copy somewhere else too: a server folder is lost with the server.</span></label>
      )}
      {f.kind === 's3' && (
        <>
          <div className="grid-2">
            <label className="field"><span className="label">Endpoint</span><input aria-label="Endpoint" value={f.endpoint} onChange={set('endpoint')} placeholder="Blank for AWS, or e.g. https://s3.us-west-004.backblazeb2.com" /></label>
            <label className="field"><span className="label">Region</span><input aria-label="Region" value={f.region} onChange={set('region')} placeholder="e.g. ap-southeast-2 (or auto for R2)" /></label>
            <label className="field"><span className="label">Bucket</span><input aria-label="Bucket" value={f.bucket} onChange={set('bucket')} /></label>
            <label className="field"><span className="label">Folder in the bucket (optional)</span><input aria-label="Prefix" value={f.prefix} onChange={set('prefix')} placeholder="raceops" /></label>
            <label className="field"><span className="label">Access key ID</span><input aria-label="Access key ID" value={f.access_key_id} onChange={set('access_key_id')} autoComplete="off" /></label>
            <label className="field"><span className="label">Secret access key</span><input aria-label="Secret access key" type="password" value={f.secret_access_key} onChange={set('secret_access_key')} autoComplete="new-password" /></label>
          </div>
          {f.endpoint && <label className="check-row"><input type="checkbox" checked={f.path_style} onChange={set('path_style')} /> Path-style addresses (most S3-compatible services need this)</label>}
          <p className="small muted">Use a key that can only read and write this bucket. The keys are stored encrypted.</p>
        </>
      )}
      {k?.oauth && (
        <label className="field"><span className="label">Folder</span><input aria-label="Folder" value={f.folder} onChange={set('folder')} placeholder="RaceOps backups" />
          <span className="small muted">After you press <b>Save and connect</b>, sign in to {k.label} and allow RaceOps to keep files there. RaceOps can only see the files it makes.</span></label>
      )}
      {err && <div className="notice error small" role="alert">{err}</div>}
      <div className="row-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy || !f.name.trim() || !k?.ready} onClick={save}>{busy ? 'Saving…' : k?.oauth ? 'Save and connect' : 'Save'}</button>
      </div>
    </div>
  );
}

function FilesOnDestination({ base, target, onRestore }) {
  const [state] = useLoad(() => api(`${base}/targets/${target.id}/files`), [target.id]);
  if (state.err) return <div className="notice error small">{state.err}</div>;
  if (!state.data) return <p className="muted small">Looking…</p>;
  if (!state.data.files.length) return <p className="muted small">No RaceOps backups there yet.</p>;
  return (
    <table className="table" data-testid="dest-files">
      <thead><tr><th>File</th><th>When</th><th className="num">Size</th><th /></tr></thead>
      <tbody>{state.data.files.map((f) => (
        <tr key={f.ref}><td>{f.name}</td><td>{fmtDateTime(f.modified)}</td><td className="num">{fmtBytes(f.size)}</td>
          <td className="num"><button type="button" className="btn small ghost" onClick={() => onRestore({ source: 'target', target_id: target.id, ref: f.ref, label: f.name })}>Restore…</button></td></tr>
      ))}</tbody>
    </table>
  );
}

function Destinations({ base, data, reload, onRestore, intro }) {
  const [adding, setAdding] = useState(false);
  const [browse, setBrowse] = useState(null);
  const [msg, setMsg] = useState(null);
  const act = async (fn, ok) => { setMsg(null); try { const r = await fn(); setMsg({ ok: r?.check ? r.check.ok : true, text: r?.check && !r.check.ok ? r.check.error : ok }); reload(); } catch (e) { setMsg({ ok: false, text: e.message }); } };
  return (
    <Section title="Destinations" actions={!adding && <button type="button" className="btn small" onClick={() => setAdding(true)}>+ Add destination</button>}>
      {intro}
      {msg && <div className={`notice small ${msg.ok ? 'info' : 'error'}`} role="status">{msg.text}</div>}
      {adding && <DestinationForm base={base} kinds={data.kinds} onCancel={() => setAdding(false)} onSaved={(r) => { setAdding(false); setMsg(r.check?.ok === false ? { ok: false, text: `Saved, but it isn’t working yet: ${r.check.error}` } : { ok: true, text: 'Saved. It’s working.' }); reload(); }} />}
      {!data.targets.length && !adding ? <Empty>No destinations yet. Add one to keep backups somewhere.</Empty> : (
        <div className="list" data-testid="destinations">
          {data.targets.map((t) => (
            <div key={t.id} className="list-row static" data-testid="destination">
              <span className="grow">
                <b>{t.name}</b> <span className="muted small">{t.kind_label}{t.config?.bucket ? ` · ${t.config.bucket}` : ''}{t.config?.folder ? ` · ${t.config.folder}` : ''}</span>
                {t.last_error && <span className="row-sub error-text">{t.last_error}</span>}
              </span>
              {t.needs_connect ? <Pill level="warn">Not connected</Pill> : t.last_error ? <Pill level="bad">Not working</Pill> : t.last_ok_at ? <Pill level="ok">Working</Pill> : null}
              <span className="inline-row">
                {['gdrive', 'dropbox', 'onedrive'].includes(t.kind) ? <button type="button" className="btn small ghost" onClick={() => act(async () => { const r = await api(`${base}/targets/${t.id}/connect`, { method: 'POST' }); window.location.href = r.url; })}>{t.needs_connect ? 'Connect' : 'Reconnect'}</button> : null}
                {!t.needs_connect && <button type="button" className="btn small ghost" onClick={() => act(() => api(`${base}/targets/${t.id}/test`, { method: 'POST' }), 'It’s working.')}>Test</button>}
                {!t.needs_connect && <button type="button" className="btn small ghost" aria-expanded={browse === t.id} onClick={() => setBrowse(browse === t.id ? null : t.id)}>Files</button>}
                <button type="button" className="btn small ghost danger" onClick={() => window.confirm(`Remove ${t.name}? Backups already there stay where they are.`) && act(() => api(`${base}/targets/${t.id}`, { method: 'DELETE' }), 'Removed.')}>Remove</button>
              </span>
              {browse === t.id && <div className="full-width"><FilesOnDestination base={base} target={t} onRestore={onRestore} /></div>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- schedules
export function ScheduleEditor({ plan, options, onSave, label = 'Backups', testid }) {
  const targetOf = (pl) => pl?.target_id || (options.some((o) => o.value === 'platform') ? 'platform' : options[0]?.value || '');
  const [p, setP] = useState(() => ({ frequency: 'off', at_hour: 2, weekday: 0, monthday: 1, keep: 7, ...(plan || {}), target_id: targetOf(plan) }));
  useEffect(() => { if (plan) setP((x) => ({ ...x, ...plan, target_id: targetOf(plan) })); }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!p.target_id && options.length) setP((x) => ({ ...x, target_id: targetOf(plan) })); }, [options]); // eslint-disable-line react-hooks/exhaustive-deps
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setP((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => { setMsg(null); try { await onSave({ ...p, at_hour: Number(p.at_hour), weekday: Number(p.weekday), monthday: Number(p.monthday), keep: Number(p.keep) }); setMsg({ ok: true, text: 'Schedule saved.' }); } catch (e) { setMsg({ ok: false, text: e.message }); } };
  return (
    <div className="schedule" data-testid={testid}>
      <div className="grid-3">
        <label className="field"><span className="label">{label}</span>
          <select aria-label="How often" value={p.frequency} onChange={set('frequency')}>
            <option value="off">Off</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option>
          </select></label>
        {p.frequency === 'weekly' && <label className="field"><span className="label">On</span><select aria-label="Day of the week" value={p.weekday} onChange={set('weekday')}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>}
        {p.frequency === 'monthly' && <label className="field"><span className="label">On day</span><select aria-label="Day of the month" value={p.monthday} onChange={set('monthday')}>{Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>}
        {p.frequency !== 'off' && <label className="field"><span className="label">At</span><select aria-label="Time" value={p.at_hour} onChange={set('at_hour')}>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{hourLabel(i)}</option>)}</select></label>}
        {p.frequency !== 'off' && <label className="field"><span className="label">To</span>
          <select aria-label="Destination" value={p.target_id} onChange={set('target_id')}>
            {!options.length && <option value="">Add a destination first</option>}
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select></label>}
        {p.frequency !== 'off' && <label className="field"><span className="label">Keep the last</span><input aria-label="Keep" type="number" min={1} max={365} value={p.keep} onChange={set('keep')} /></label>}
      </div>
      {msg && <div className={`notice small ${msg.ok ? 'info' : 'error'}`} role="status">{msg.text}</div>}
      <div className="row-actions"><button type="button" className="btn small primary" onClick={save}>Save schedule</button></div>
    </div>
  );
}

// ---------------------------------------------------------------- the list of backups
function Runs({ base, runs, showTeam, onRestore, reload }) {
  const [err, setErr] = useState('');
  if (!runs.length) return <Empty>No backups yet.</Empty>;
  const remove = async (r) => {
    if (!window.confirm(`Remove ${r.file_name}? It’s deleted from ${r.target_name}.`)) return;
    setErr('');
    try { await api(`${base}/runs/${r.id}`, { method: 'DELETE' }); reload(); } catch (e) { setErr(e.message); }
  };
  return (
    <>
      {err && <div className="notice error small">{err}</div>}
      <div className="table-wrap">
        <table className="table" data-testid="backup-runs">
          <thead><tr><th>When</th>{showTeam && <th>What</th>}<th>Where</th><th className="num">Size</th><th>Status</th><th /></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} data-testid="backup-run">
                <td>{fmtDateTime(r.started_at)}<span className="row-sub">{r.kind === 'export' ? `Export (${String(r.format || '').toUpperCase()})` : TRIGGER[r.trigger] || r.trigger}{r.created_by_name ? ` · ${r.created_by_name}` : ''}</span></td>
                {showTeam && <td>{r.scope === 'full' ? <b>Everything</b> : r.tenant_name}{r.kind === 'export' && <span className="row-sub">Export ({String(r.format || '').toUpperCase()})</span>}</td>}
                <td>{r.target_name}{r.encrypted && <span className="row-sub">Encrypted</span>}</td>
                <td className="num">{fmtBytes(r.size)}</td>
                <td>{r.status === 'ok' ? <Pill level="ok">Done</Pill> : r.status === 'running' ? <Pill level="info">Running</Pill> : <Pill level="bad" title={r.error}>Failed</Pill>}
                  {r.status === 'failed' && r.error && <span className="row-sub error-text">{r.error}</span>}</td>
                <td className="num">
                  {r.status === 'ok' && (
                    <span className="inline-row end">
                      <a className="btn small ghost" href={`/api${base}/runs/${r.id}/download?token=${encodeURIComponent(token() || '')}`}>Download</a>
                      {r.kind === 'backup' && <button type="button" className="btn small ghost" onClick={() => onRestore({ source: 'run', run_id: r.id, label: `${r.scope === 'full' ? 'the full backup' : 'the backup'} from ${fmtDateTime(r.started_at)}` })}>Restore…</button>}
                    </span>
                  )}
                  {r.status !== 'running' && <button type="button" className="btn small ghost danger" onClick={() => remove(r)}>Remove</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- restore (platform admin)
function AdminRestore({ source, onClose, onDone }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('');
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [source]);
  const [team, setTeam] = useState('');
  const [confirm, setConfirm] = useState('');
  const [op, start] = useOp(onDone);
  useEffect(() => {
    if (source.header) { setInfo({ header: source.header, teams: source.teams }); return; }
    api('/admin/backups/inspect', { method: 'POST', body: source }).then(setInfo).catch((e) => setErr(e.message));
  }, [source]);
  useEffect(() => { if (info) setMode(info.header.scope === 'team' ? 'team' : ''); if (info?.header.scope === 'team') setTeam(info.teams[0]?.id || ''); }, [info]);
  const h = info?.header;
  const chosen = info?.teams.find((t) => t.id === team);
  const go = () => start(() => api('/admin/backups/restore', { method: 'POST', body: { ...source, mode, tenant_id: team || undefined, confirm } }));
  return (
    <Section title="Restore" className="restore-panel" actions={<button type="button" className="btn small ghost" onClick={onClose}>Close</button>}>
      <div data-testid="restore-panel">
        {err && <div className="notice error">{err}</div>}
        {!info && !err && <p className="muted">Checking {source.label}…</p>}
        {h && (
          <>
            <p>{h.scope === 'full' ? 'A full backup' : <>A backup of <b>{h.tenant?.name}</b></>} made <b>{fmtDateTime(h.created_at)}</b> (RaceOps {h.app_version}){h.encrypted ? ', encrypted' : ''}.
              {h.counts?.records !== undefined && <> {h.counts.records} records, {h.counts.files || 0} files.</>}</p>
            {h.scope === 'full' && (
              <div className="restore-modes" role="radiogroup" aria-label="What to restore">
                <label className="check-row"><input type="radio" name="mode" checked={mode === 'team'} onChange={() => setMode('team')} /> <span><b>One team</b>, as it was then — the team’s data is replaced; everything else stays as it is</span></label>
                <label className="check-row"><input type="radio" name="mode" checked={mode === 'full'} onChange={() => setMode('full')} /> <span><b>Everything</b> — every team, user and setting on this server is replaced by the backup</span></label>
              </div>
            )}
            {mode === 'team' && h.scope === 'full' && (
              <label className="field"><span className="label">Team</span>
                <select aria-label="Team to restore" value={team} onChange={(e) => setTeam(e.target.value)}>
                  <option value="">Choose…</option>
                  {info.teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.here ? '' : ' (not on this server now — it will be brought back)'}</option>)}
                </select></label>
            )}
            {mode === 'team' && chosen && <p className="small">{chosen.here === false ? <>{chosen.name} isn’t on this server now. It will be brought back, with you as an owner and its members matched by email.</> : <>{chosen.name}’s records, files, forms, roles and settings go back to how they were. Members stay as they are now. A safety backup of the team is taken first.</>}</p>}
            {mode === 'full' && (
              <>
                <div className="notice warn">Everything on this server is replaced: teams, users, settings, backup destinations and files. Anything since {fmtDateTime(h.created_at)} is lost (a safety backup is taken first, into the server’s backup folder). Everyone is signed out while it runs.</div>
                <label className="field"><span className="label">Type RESTORE to confirm</span><input aria-label="Confirm full restore" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></label>
              </>
            )}
            <OpStatus op={op} done={(r) => (mode === 'full'
              ? <>Restored the backup from {fmtDateTime(r.created_at)}. <button type="button" className="btn small" onClick={() => window.location.reload()}>Reload RaceOps</button></>
              : <>{r.name} is back as it was at {fmtDateTime(r.created_at)}. Devices download the team again next time they sync.{r.safety ? ` Safety backup: ${r.safety}.` : ''}</>)} />
            <div className="row-actions">
              <button type="button" className="btn primary danger" disabled={op?.status === 'running' || (mode === 'full' ? confirm !== 'RESTORE' : !(mode === 'team' && team))} onClick={go}>
                {mode === 'full' ? 'Restore everything' : mode === 'team' ? 'Restore the team' : 'Restore'}</button>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

function UploadBackup({ base, onUploaded, label = 'Restore from a file' }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (file) => {
    setErr(''); setBusy(true);
    const fd = new FormData(); fd.append('file', file);
    try { const r = await api(`${base}/upload`, { method: 'POST', form: fd }); onUploaded({ source: 'upload', upload_id: r.upload_id, label: file.name, header: r.header, teams: r.teams }); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <span className="inline-row">
      <label className={`btn small ghost file-btn${busy ? ' disabled' : ''}`}>{busy ? 'Checking the file…' : label}
        <input type="file" hidden accept=".raceops" aria-label="Backup file" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) pick(f); }} /></label>
      {err && <span className="error-text small">{err}</span>}
    </span>
  );
}

function useConnectNotice() {
  const [params, setParams] = useSearchParams();
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    const c = params.get('connected'), f = params.get('connect');
    if (!c && !f) return;
    setMsg(c && c !== 'error' ? { ok: true, text: 'Connected. Backups can go there now.' }
      : c === 'error' ? { ok: false, text: 'Connected, but RaceOps couldn’t use it. See the destination for the reason.' }
        : f === 'cancelled' ? { ok: false, text: 'Not connected: the sign-in was cancelled.' }
          : f === 'failed' ? { ok: false, text: `Not connected: ${params.get('why') || 'the sign-in didn’t work.'}` } : null);
    setParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return msg && <div className={`notice ${msg.ok ? 'info' : 'error'}`} role="status" data-testid="connect-notice">{msg.text}</div>;
}

function EncryptionNote({ on }) {
  return on
    ? <p className="small muted">Backups are encrypted with this server’s backup passphrase (BACKUP_KEY). Keep a copy of it somewhere safe, away from the server: without it, the backups can’t be opened.</p>
    : <div className="notice warn small" data-testid="no-encryption">Backups aren’t encrypted, because BACKUP_KEY isn’t set on this server. They contain everything, including your team’s data, so keep them somewhere private — or ask your administrator to set BACKUP_KEY.</div>;
}

// ---------------------------------------------------------------- Platform admin → Backups
export function AdminBackups() {
  const [state, reload] = useLoad(() => api('/admin/backups'), []);
  const [restore, setRestore] = useState(null);
  const [now, setNow] = useState('');
  const [teamNow, setTeamNow] = useState({ tid: '', target: '' });
  const [op, start] = useOp(() => reload());
  const notice = useConnectNotice();
  const d = state.data;
  const opts = useMemo(() => (d?.targets || []).filter((t) => !t.needs_connect).map((t) => ({ value: t.id, label: t.name })), [d]);
  useEffect(() => { if (opts.length && !now) setNow(opts[0].value); }, [opts]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <div><PageHeader title="Backups" /><p className="muted">{state.err || 'Loading…'}</p></div>;
  const savePlan = (scope) => async (p) => { await api(`/admin/backups/plans/${scope}`, { method: 'PUT', body: { ...p, target_id: p.target_id || null } }); reload(); };
  return (
    <div>
      <PageHeader title="Backups" sub="Back up everything, restore it or move RaceOps to a new server, and set where team backups go" />
      {notice}
      <EncryptionNote on={d.encryption} />
      {restore && <AdminRestore source={restore} onClose={() => setRestore(null)} onDone={() => reload()} />}
      <div className="grid-2 admin-cols">
        <Section title="Full backup">
          <p className="small">Everything on this server: every team, user and setting, and every uploaded file. Use it to restore the platform, bring back one team as it was, or move RaceOps to new infrastructure.</p>
          <div className="inline-row wrap" data-testid="full-now">
            <select aria-label="Back up to" value={now} onChange={(e) => setNow(e.target.value)}>
              {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              <option value="download">Download to this computer</option>
            </select>
            <button type="button" className="btn primary" disabled={op?.status === 'running'} onClick={() => start(() => api('/admin/backups/run', { method: 'POST', body: { target_id: now === 'download' ? null : now } }))}>Back up now</button>
          </div>
          <OpStatus op={op} done={(r) => <>Backed up: {r.file_name} ({fmtBytes(r.size)}).</>} />
          <h4>Schedule</h4>
          <ScheduleEditor plan={d.plans.full} options={opts} onSave={savePlan('full')} label="Full backups" testid="full-schedule" />
          <p className="small muted">Times are the server’s ({d.timezone}). {d.plans.full?.next_run_at ? `Next: ${fmtDateTime(d.plans.full.next_run_at)}.` : ''}</p>
        </Section>
        <Section title="Team backups">
          <p className="small">A backup of each team on its own, which the team can restore itself. Teams can set their own schedule and destination; this one covers every team that hasn’t.</p>
          <ScheduleEditor plan={d.plans.teams} options={opts} onSave={savePlan('teams')} label="Every team" testid="teams-schedule" />
          <p className="small muted">The destination chosen here is offered to teams as <b>Platform storage</b>. {d.team_plans.length ? `${d.team_plans.length} team${d.team_plans.length === 1 ? ' has' : 's have'} their own schedule.` : ''}</p>
          <h4>Back up one team now</h4>
          <div className="inline-row wrap" data-testid="team-now">
            <select aria-label="Team" value={teamNow.tid} onChange={(e) => setTeamNow((x) => ({ ...x, tid: e.target.value }))}>
              <option value="">Choose a team…</option>
              {d.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select aria-label="Team backup to" value={teamNow.target} onChange={(e) => setTeamNow((x) => ({ ...x, target: e.target.value }))}>
              <option value="">Download to this computer</option>
              {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button type="button" className="btn" disabled={!teamNow.tid || op?.status === 'running'} onClick={() => start(() => api(`/admin/backups/teams/${teamNow.tid}/run`, { method: 'POST', body: { target_id: teamNow.target || null } }))}>Back up</button>
          </div>
        </Section>
      </div>
      <Destinations base="/admin/backups" data={d} reload={reload} onRestore={setRestore}
        intro={<p className="small muted">Where the platform’s backups go. Keep at least one away from this server, so a lost server doesn’t take its backups with it.</p>} />
      <Section title="Backups" actions={<UploadBackup base="/admin/backups" onUploaded={setRestore} />}>
        <Runs base="/admin/backups" runs={d.runs} showTeam onRestore={setRestore} reload={reload} />
        <p className="small muted">Moving to a new server? Install RaceOps there with the same BACKUP_KEY, then either restore a downloaded backup on its first-run screen, or add the same destination here and restore from its <b>Files</b>.</p>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Team Management → Backups & export
function ExportData({ base, options, onDone }) {
  const [f, setF] = useState({ format: 'csv', files: false, target_id: 'download' });
  const [op, start] = useOp(onDone);
  return (
    <Section title="Export your data">
      <p className="small">A copy of the team’s records to use elsewhere: in a spreadsheet, another program, or your own archive. Unlike a backup, an export can’t be restored into RaceOps.</p>
      <div className="export-formats" role="radiogroup" aria-label="Format">
        {[['csv', 'CSV', 'A spreadsheet for each kind of record (cars, setup sheets, parts…), in a ZIP. Opens in Excel, Numbers or Google Sheets.'],
          ['xml', 'XML', 'One structured file, for importing into other programs.'],
          ['json', 'JSON', 'One structured file, for developers and data tools.']].map(([k, l, d]) => (
          <label key={k} className="check-row"><input type="radio" name="export-format" checked={f.format === k} onChange={() => setF((x) => ({ ...x, format: k }))} aria-label={l} /> <span><b>{l}</b> — <span className="small">{d}</span></span></label>
        ))}
      </div>
      <label className="check-row"><input type="checkbox" checked={f.files} onChange={(e) => setF((x) => ({ ...x, files: e.target.checked }))} /> Include attached photos and files (makes a ZIP)</label>
      <div className="inline-row wrap" data-testid="export-now">
        <select aria-label="Export to" value={f.target_id} onChange={(e) => setF((x) => ({ ...x, target_id: e.target.value }))}>
          <option value="download">Download to this computer</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" className="btn primary" disabled={op?.status === 'running'} onClick={() => start(() => api(`${base}/export`, { method: 'POST', body: f }))}>Export</button>
      </div>
      <OpStatus op={op} done={(r) => <>Exported: {r.file_name} ({fmtBytes(r.size)}). {f.target_id === 'download' && <a className="btn small" href={`/api${base}/runs/${r.run}/download?token=${encodeURIComponent(token() || '')}`}>Download</a>}</>} />
    </Section>
  );
}

function TeamRestore({ base, source, onClose, onDone }) {
  const [ok, setOk] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [source]);
  const [op, start] = useOp(onDone);
  return (
    <Section title="Restore the team" actions={<button type="button" className="btn small ghost" onClick={onClose}>Close</button>}>
      <div data-testid="restore-panel">
        <p>Put the team back as it was in {source.header ? <>the backup made <b>{fmtDateTime(source.header.created_at)}</b></> : <b>{source.label}</b>}.</p>
        <ul className="small">
          <li>Records, setup sheets, parts, files, forms, roles and team settings go back to how they were then. Anything added or changed since is lost.</li>
          <li>Members stay as they are now. A safety backup of the team as it is now is taken first.</li>
          <li>Everyone’s devices download the team again the next time they sync. Changes still waiting on a device are sent afterwards.</li>
        </ul>
        <label className="check-row"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} aria-label="I understand the team’s data will be replaced" /> I understand the team’s data will be replaced</label>
        <OpStatus op={op} done={(r) => <>Restored. The team is back as it was at {fmtDateTime(r.created_at)}.</>} />
        <div className="row-actions">
          <button type="button" className="btn primary danger" disabled={!ok || op?.status === 'running'} onClick={() => start(() => api(`${base}/restore`, { method: 'POST', body: { ...source, header: undefined, confirm: true } }))}>Restore the team</button>
        </div>
      </div>
    </Section>
  );
}

export function TeamBackups() {
  const { tid } = useSession();
  const base = `/t/${tid}/backup`;
  const [state, reload] = useLoad(() => api(base), [tid]);
  const [restore, setRestore] = useState(null);
  const [now, setNow] = useState('');
  const [op, start] = useOp(() => reload());
  const notice = useConnectNotice();
  const d = state.data;
  const opts = useMemo(() => [
    ...(d?.platform ? [{ value: 'platform', label: `Platform storage (${d.platform.name})` }] : []),
    ...(d?.targets || []).filter((t) => !t.needs_connect).map((t) => ({ value: t.id, label: t.name })),
  ], [d]);
  useEffect(() => { if (!now && d) setNow(opts[0]?.value || 'download'); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <div><PageHeader title="Backups & export" /><p className="muted">{state.err || 'Loading…'}</p></div>;
  const own = d.plan && d.plan.frequency !== 'off';
  return (
    <div>
      <PageHeader title="Backups & export" sub="Keep a copy of your team’s data where you choose, put it back if something goes wrong, or export it" />
      {notice}
      <EncryptionNote on={d.encryption} />
      {restore && <TeamRestore base={base} source={restore} onClose={() => setRestore(null)} onDone={() => reload()} />}
      <div className="grid-2 admin-cols">
        <Section title="Back up now">
          <p className="small">Everything in the team: records, setup sheets, parts, attached files, forms, roles and settings.</p>
          <div className="inline-row wrap" data-testid="team-backup-now">
            <select aria-label="Back up to" value={now} onChange={(e) => setNow(e.target.value)}>
              {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              <option value="download">Download to this computer</option>
            </select>
            <button type="button" className="btn primary" disabled={op?.status === 'running'} onClick={() => start(() => api(`${base}/run`, { method: 'POST', body: { target_id: now } }))}>Back up now</button>
          </div>
          <OpStatus op={op} done={(r) => <>Backed up: {r.file_name} ({fmtBytes(r.size)}).</>} />
        </Section>
        <Section title="Schedule">
          {!own && d.platform?.schedule && <p className="small" data-testid="platform-schedule">Your platform admin backs up every team: <b>{scheduleText(d.platform.schedule)}</b>, to platform storage. Set your own schedule to choose when and where instead.</p>}
          {!own && !d.platform?.schedule && <p className="small">No scheduled backups yet.</p>}
          <ScheduleEditor plan={d.plan} options={opts} label="Team backups" testid="team-schedule"
            onSave={async (p) => { await api(`${base}/plan`, { method: 'PUT', body: p }); reload(); }} />
          <p className="small muted">Times are the server’s ({d.timezone}).{d.plan?.next_run_at ? ` Next: ${fmtDateTime(d.plan.next_run_at)}.` : ''}</p>
        </Section>
      </div>
      <Destinations base={base} data={d} reload={reload} onRestore={setRestore}
        intro={<p className="small muted">Your team’s own places for backups: a cloud account you control, such as the team’s Google Drive or Dropbox.{d.platform ? ` You can also use platform storage (${d.platform.name}), which your platform admin looks after.` : ''}</p>} />
      <Section title="Backups" actions={<UploadBackup base={base} onUploaded={setRestore} />}>
        <Runs base={base} runs={d.runs} onRestore={setRestore} reload={reload} />
      </Section>
      <ExportData base={base} options={opts} onDone={() => reload()} />
    </div>
  );
}

/** First-run screen on a new server: restore a full backup instead of starting from scratch. */
export function SetupRestore() {
  const [file, setFile] = useState(null);
  const [op, start] = useOp();
  const go = () => start(async () => { const fd = new FormData(); fd.append('file', file); return api('/setup/restore', { method: 'POST', form: fd }); });
  return (
    <div className="stack" data-testid="setup-restore">
      <p className="small">Moving RaceOps from another server? Restore a <b>full backup</b> instead. Set the same BACKUP_KEY on this server first if the backup is encrypted.</p>
      <input type="file" accept=".raceops" aria-label="Full backup file" onChange={(e) => setFile(e.target.files[0] || null)} />
      <OpStatus op={op} done={() => <>Restored. <a href="/login">Sign in</a> with your usual account.</>} />
      <button type="button" className="btn" disabled={!file || op?.status === 'running'} onClick={go}>Restore from this backup</button>
    </div>
  );
}
