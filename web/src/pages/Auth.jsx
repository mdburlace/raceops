import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';

function AuthCard({ title, sub, children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <div className="brand big"><span className="brand-mark">RO</span><span>RaceOps</span></div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

function useSubmit(fn) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await fn(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return { busy, err, run };
}

export function Login() {
  const { login } = useSession();
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '' });
  const [needsSetup, setNeedsSetup] = useState(false);
  useEffect(() => { api('/status').then((s) => setNeedsSetup(s.needsSetup)).catch(() => {}); }, []);
  const { busy, err, run } = useSubmit(async () => { login(await api('/auth/login', { method: 'POST', body: f })); nav('/'); });
  if (needsSetup) return <Setup />;
  return (
    <AuthCard title="Sign in" sub="Setups, maintenance and assets for your race team.">
      <form onSubmit={run} className="stack">
        <label>Email<input type="email" autoComplete="username" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        {err && <p className="error-text">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small">New team member? Use the invite link your team admin sent you.</p>
      </form>
    </AuthCard>
  );
}

export function Setup() {
  const { login } = useSession();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', team_name: '' });
  const { busy, err, run } = useSubmit(async () => { login(await api('/setup', { method: 'POST', body: f })); nav('/'); });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <AuthCard title="First-time setup" sub="Create the administrator account and your first team. You can invite crew and add more teams afterwards.">
      <form onSubmit={run} className="stack">
        <label>Your name<input required value={f.name} onChange={set('name')} /></label>
        <label>Email<input type="email" required value={f.email} onChange={set('email')} /></label>
        <label>Password<input type="password" minLength={8} required value={f.password} onChange={set('password')} /></label>
        <label>Team name<input required value={f.team_name} onChange={set('team_name')} placeholder="e.g. Burlace Racing #17" /></label>
        {err && <p className="error-text">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create team'}</button>
      </form>
    </AuthCard>
  );
}

export function AcceptInvite() {
  const { token } = useParams();
  const { login } = useSession();
  const nav = useNavigate();
  const [inv, setInv] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [f, setF] = useState({ name: '', password: '' });
  useEffect(() => { api(`/invites/${token}`).then(setInv).catch((e) => setLoadErr(e.message)); }, [token]);
  const { busy, err, run } = useSubmit(async () => {
    const payload = await api(`/invites/${token}/accept`, { method: 'POST', body: f });
    const joined = payload.memberships.find((m) => m.tenant_name === inv.tenant_name);
    login({ ...payload, tenantId: joined?.tenant_id });
    nav('/');
  });
  if (loadErr) return <AuthCard title="Invite problem" sub={loadErr}><Link to="/login" className="btn">Go to sign in</Link></AuthCard>;
  if (!inv) return <AuthCard title="Loading invite…" />;
  return (
    <AuthCard title={`Join ${inv.tenant_name}`} sub={`You've been invited as ${inv.role_name} (${inv.email}).`}>
      <form onSubmit={run} className="stack">
        {inv.has_account ? (
          <p className="muted">You already have an account. Enter your password to add this team to it.</p>
        ) : (
          <label>Your name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        )}
        <label>{inv.has_account ? 'Password' : 'Choose a password'}
          <input type="password" minLength={inv.has_account ? undefined : 8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </label>
        {err && <p className="error-text">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Joining…' : 'Join team'}</button>
      </form>
    </AuthCard>
  );
}
