import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, loadSession, saveSession } from './api.js';
import { db, getMeta, setMeta } from './store.js';
import { fullResync, setSyncTenant, syncNow } from './sync.js';
import { can as canP, canType as canT } from '@shared/catalog.js';

const Ctx = createContext(null);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(loadSession);

  const update = useCallback((s) => { saveSession(s); setSession(s); }, []);

  const login = useCallback((payload) => {
    const prev = loadSession();
    const tenantId = payload.tenantId || payload.memberships.find((m) => m.tenant_id === prev?.tenantId)?.tenant_id
      || payload.memberships[0]?.tenant_id || null;
    update({ ...payload, tenantId });
  }, [update]);

  const logout = useCallback(async (force) => {
    const pending = await db.records.filter((r) => r.dirty === 1).count().catch(() => 0);
    if (pending && !force && !window.confirm(`${pending} change(s) have not synced yet and will be lost. Sign out anyway?`)) return false;
    await db.records.clear();
    await db.meta.clear();
    update(null);
    return true;
  }, [update]);

  // refresh memberships/permissions when online; full resync if permissions changed
  const refresh = useCallback(async () => {
    const s = loadSession();
    if (!s?.token || !navigator.onLine) return;
    try {
      const me = await api('/me');
      const next = { ...s, user: me.user, memberships: me.memberships };
      if (!me.memberships.some((m) => m.tenant_id === s.tenantId)) next.tenantId = me.memberships[0]?.tenant_id || null;
      update(next);
      const m = me.memberships.find((x) => x.tenant_id === next.tenantId);
      if (m) {
        const sig = JSON.stringify([m.role.is_owner, [...m.role.permissions].sort()]);
        const old = await getMeta(`perm:${m.tenant_id}`);
        await setMeta(`perm:${m.tenant_id}`, sig);
        if (old && old !== sig) fullResync(m.tenant_id);
      }
    } catch { /* offline or expired: handled elsewhere */ }
  }, [update]);

  useEffect(() => {
    const onUnauth = () => { alert('Your session has expired. Please sign in again.'); logout(true); };
    window.addEventListener('raceops:unauthorized', onUnauth);
    window.addEventListener('online', refresh);
    refresh();
    return () => { window.removeEventListener('raceops:unauthorized', onUnauth); window.removeEventListener('online', refresh); };
  }, [refresh, logout]);

  const membership = session?.memberships?.find((m) => m.tenant_id === session.tenantId) || null;

  useEffect(() => {
    setSyncTenant(membership?.tenant_id || null);
    if (membership) syncNow();
  }, [membership?.tenant_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({
    session,
    user: session?.user,
    memberships: session?.memberships || [],
    membership,
    tid: membership?.tenant_id,
    role: membership?.role,
    can: (p) => canP(membership?.role, p),
    canType: (t, a) => canT(membership?.role, t, a),
    login, logout, refresh,
    switchTenant: (id) => update({ ...loadSession(), tenantId: id }),
  }), [session, membership, login, logout, refresh, update]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
