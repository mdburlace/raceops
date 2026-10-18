import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fileUrl } from '../lib/api.js';
import { getSyncStatus, subscribeSync, syncNow } from '../lib/sync.js';
import { useSession } from '../lib/session.jsx';
import { fmtDateTime } from '../lib/data.js';

export function PageHeader({ title, sub, back, children }) {
  const nav = useNavigate();
  return (
    <header className="page-header">
      <div className="ph-title">
        {back === -1 && <button type="button" className="back" aria-label="Back" onClick={() => nav(-1)}>‹</button>}
        {back && back !== -1 && <Link to={back} className="back" aria-label="Back">‹</Link>}
        <div>
          <h1>{title}</h1>
          {sub && <p className="sub">{sub}</p>}
        </div>
      </div>
      {children && <div className="ph-actions">{children}</div>}
    </header>
  );
}

export const Empty = ({ children }) => <div className="empty">{children}</div>;

export const Pill = ({ level = 'ok', children }) => <span className={`pill pill-${level}`}>{children}</span>;

export function LifeBar({ pct, level }) {
  if (pct === null || pct === undefined) return null;
  return (
    <span className={`lifebar lb-${level}`} title={`${Math.round(pct * 100)}% of life used`}>
      <span style={{ width: `${Math.min(100, pct * 100)}%` }} />
    </span>
  );
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const u = () => setOn(navigator.onLine);
    window.addEventListener('online', u); window.addEventListener('offline', u);
    return () => { window.removeEventListener('online', u); window.removeEventListener('offline', u); };
  }, []);
  return on;
}

export function SyncBadge() {
  const s = useSyncExternalStore(subscribeSync, getSyncStatus);
  const label = s.state === 'offline' ? 'Offline'
    : s.state === 'syncing' ? 'Syncing…'
      : s.state === 'error' ? 'Sync error'
        : s.pending ? `${s.pending} to sync` : 'Synced';
  return (
    <button type="button" className={`sync-badge sb-${s.state}${s.pending ? ' has-pending' : ''}`} onClick={() => syncNow()}
      title={s.error || (s.lastSync ? `Last synced ${fmtDateTime(s.lastSync)}` : 'Tap to sync')}>
      <span className="dot" />{label}{s.state === 'offline' && s.pending ? ` · ${s.pending} queued` : ''}
    </button>
  );
}

export function Section({ title, children, actions, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <div className="card-head"><h3>{title}</h3>{actions}</div>}
      {children}
    </section>
  );
}

// ---------- change history ----------
function flat(obj, prefix = '', out = {}) {
  for (const [k, val] of Object.entries(obj || {})) {
    if (val && typeof val === 'object' && !Array.isArray(val) && !('asset' in val)) flat(val, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = val && typeof val === 'object' ? JSON.stringify(val) : val;
  }
  return out;
}

export function History({ recordId, labelFor = (k) => k }) {
  const { tid } = useSession();
  const online = useOnline();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || !online) return;
    api(`/t/${tid}/records/${recordId}/history`).then(setRows).catch((e) => setErr(e.status === 404 ? 'Not synced yet.' : e.message));
  }, [open, online, tid, recordId]);

  const entries = (rows || []).map((h, i) => {
    const prevApplied = rows.slice(i + 1).find((x) => x.outcome === 'applied');
    const a = flat(prevApplied?.data?.values); const b = flat(h.data?.values);
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] ?? '') !== (b[k] ?? ''));
    return { ...h, changes: keys.map((k) => ({ k, from: a[k], to: b[k] })) };
  });

  return (
    <section className="card">
      <div className="card-head">
        <h3>Change history</h3>
        <button type="button" className="btn ghost small" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (!online ? <p className="muted">History is available when online.</p>
        : err ? <p className="muted">{err}</p>
          : !rows ? <p className="muted">Loading…</p>
            : (
              <ol className="history">
                {entries.map((h) => (
                  <li key={h.id} className={h.outcome === 'superseded' ? 'superseded' : ''}>
                    <div className="h-meta">
                      <strong>{h.user_name || 'Unknown'}</strong> {h.op}d · {fmtDateTime(h.client_updated_at)}
                      {h.outcome === 'superseded' && <Pill level="warn">overwritten by a newer save</Pill>}
                    </div>
                    {h.changes.length > 0 && h.op !== 'create' && (
                      <ul className="h-changes">
                        {h.changes.slice(0, 12).map((c) => (
                          <li key={c.k}><span className="muted">{labelFor(c.k)}:</span> {String(c.from ?? '—')} → <b>{String(c.to ?? '—')}</b></li>
                        ))}
                        {h.changes.length > 12 && <li className="muted">…and {h.changes.length - 12} more</li>}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            ))}
    </section>
  );
}

// ---------- attachments (online only) ----------
export function Attachments({ record, canEdit }) {
  const { tid } = useSession();
  const online = useOnline();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const synced = record && !record.dirty;
  const load = () => api(`/t/${tid}/attachments?record_id=${record.id}`).then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { if (online && synced) load(); }, [online, synced, record?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (files) => {
    setBusy(true); setErr('');
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append('record_id', record.id);
        fd.append('file', f);
        await api(`/t/${tid}/attachments`, { method: 'POST', form: fd });
      }
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (a) => {
    if (!window.confirm(`Delete ${a.filename}?`)) return;
    await api(`/t/${tid}/attachments/${a.id}`, { method: 'DELETE' }).catch((e) => setErr(e.message));
    load();
  };

  return (
    <section className="card">
      <div className="card-head">
        <h3>Photos & files</h3>
        {canEdit && online && synced && (
          <label className={`btn small${busy ? ' disabled' : ''}`}>
            {busy ? 'Uploading…' : 'Add'}
            <input type="file" multiple hidden accept="image/*,application/pdf,.xlsx,.xls,.csv,.doc,.docx,.txt"
              onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {!online ? <p className="muted">Attachments are available when online.</p>
        : !synced ? <p className="muted">Attachments can be added once this record has synced.</p>
          : !rows ? <p className="muted">Loading…</p>
            : rows.length === 0 ? <p className="muted">No attachments yet.</p>
              : (
                <div className="attachments">
                  {rows.map((a) => (
                    <figure key={a.id} className="att">
                      <a href={fileUrl(tid, a.id)} target="_blank" rel="noreferrer">
                        {a.mime.startsWith('image/')
                          ? <img src={fileUrl(tid, a.id)} alt={a.filename} loading="lazy" />
                          : <span className="file-icon">{a.filename.split('.').pop()?.toUpperCase().slice(0, 4)}</span>}
                      </a>
                      <figcaption>
                        <span title={a.filename}>{a.filename}</span>
                        <small className="muted">{a.uploaded_by} · {fmtDateTime(a.created_at)}</small>
                        {canEdit && <button type="button" className="link small danger" onClick={() => remove(a)}>Delete</button>}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
      {err && <p className="error-text">{err}</p>}
    </section>
  );
}

// ---------- simple line chart (SVG) ----------
export function LineChart({ series, height = 220, specMin, specMax, unit = '' }) {
  const pts = series.flatMap((s) => s.points);
  if (pts.length === 0) return <p className="muted">No data yet.</p>;
  const W = 640, H = height, P = { l: 48, r: 16, t: 12, b: 28 };
  const xs = pts.map((p) => +p.x); const ys = [...pts.map((p) => p.y), specMin, specMax].filter((y) => y !== null && y !== undefined);
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 864e5; x1 += 864e5; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = (y1 - y0) * 0.1 || Math.abs(y0) * 0.1 || 1; y0 -= pad; y1 += pad;
  const sx = (x) => P.l + ((x - x0) / (x1 - x0)) * (W - P.l - P.r);
  const sy = (y) => H - P.b - ((y - y0) / (y1 - y0)) * (H - P.t - P.b);
  const ticks = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);
  const fmt = (n) => (Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2));
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Measurement history chart">
        {specMin != null && specMax != null && (
          <rect x={P.l} width={W - P.l - P.r} y={sy(specMax)} height={Math.max(0, sy(specMin) - sy(specMax))} className="spec-band" />
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} className="grid" />
            <text x={P.l - 6} y={sy(t)} className="tick" textAnchor="end" dominantBaseline="middle">{fmt(t)}</text>
          </g>
        ))}
        <text x={P.l} y={H - 8} className="tick">{new Date(x0).toLocaleDateString()}</text>
        <text x={W - P.r} y={H - 8} className="tick" textAnchor="end">{new Date(x1).toLocaleDateString()}</text>
        {series.map((s, si) => {
          const sorted = [...s.points].sort((a, b) => a.x - b.x);
          return (
            <g key={s.name} className={`series s${si % 6}`}>
              <polyline points={sorted.map((p) => `${sx(+p.x)},${sy(p.y)}`).join(' ')} fill="none" />
              {sorted.map((p, i) => (
                <circle key={i} cx={sx(+p.x)} cy={sy(p.y)} r="4">
                  <title>{`${s.name}: ${p.y}${unit ? ` ${unit}` : ''} — ${new Date(p.x).toLocaleDateString()}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <div className="legend">{series.map((s, si) => <span key={s.name} className={`lg s${si % 6}`}><i />{s.name}</span>)}</div>
      )}
    </div>
  );
}
