import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, loadSession, saveSession } from './api.js';
import { db, getMeta, setMeta } from './store.js';
import { fullResync, setSyncTenant, syncNow } from './sync.js';
import { can as canP, canType as canT, canArea as canA, canModule as canM, entitlements } from '@shared/catalog.js';
import { setMembersCache, setPlatformLists } from './data.js';
import { applyPrefsTheme } from './theme.js';
import { setLinkedUsage } from './compute.js';
import { isShop } from '@shared/shop.js';

// Preference changes made offline wait here (per user) until they reach the server.
const pendingKey = (uid) => `raceops.prefs.pending.${uid}`;
const readPending = (uid) => { try { return JSON.parse(localStorage.getItem(pendingKey(uid)) || 'null'); } catch { return null; } };
const writePending = (uid, p) => { try { if (p) localStorage.setItem(pendingKey(uid), JSON.stringify(p)); else localStorage.removeItem(pendingKey(uid)); } catch { /* private mode */ } };

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
      const waiting = s.user?.id && readPending(s.user.id);
      if (waiting) {
        try { await api('/me', { method: 'PATCH', body: { prefs: waiting } }); writePending(s.user.id, null); } catch (e) { if (e.status === 400) writePending(s.user.id, null); }
      }
      const me = await api('/me');
      const next = { ...s, user: me.user, memberships: me.memberships, platform: me.platform || s.platform };
      if (!me.memberships.some((m) => m.tenant_id === s.tenantId)) next.tenantId = me.memberships[0]?.tenant_id || null;
      update(next);
      const m = me.memberships.find((x) => x.tenant_id === next.tenantId);
      if (m) {
        const sig = JSON.stringify([m.role.is_owner, [...m.role.permissions].sort(), m.plan, m.features]);
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
    // pick up licence, plan and platform changes (announcements, pick-lists) while the app stays open
    const t = setInterval(() => { if (!document.hidden) refresh(); }, 10 * 60 * 1000);
    return () => { clearInterval(t); window.removeEventListener('raceops:unauthorized', onUnauth); window.removeEventListener('online', refresh); };
  }, [refresh, logout]);

  const membership = session?.memberships?.find((m) => m.tenant_id === session.tenantId) || null;
  const uid = session?.user?.id;
  const prefs = useMemo(() => ({ ...(session?.user?.prefs || {}), ...(uid ? readPending(uid) || {} : {}) }), [session?.user, uid]);
  const prefsSig = JSON.stringify(prefs);
  useEffect(() => { if (uid) applyPrefsTheme(prefs); }, [uid, prefsSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save preferences: applied at once, kept on the device, and sent to the server when online.
  const setPrefs = useCallback(async (patch) => {
    const s = loadSession();
    if (!s?.user) return;
    const pending = { ...(readPending(s.user.id) || {}), ...patch };
    writePending(s.user.id, pending);
    update({ ...s, user: { ...s.user, prefs: { ...(s.user.prefs || {}), ...pending } } });
    if (!navigator.onLine) return;
    try {
      const r = await api('/me', { method: 'PATCH', body: { prefs: pending } });
      if (JSON.stringify(readPending(s.user.id)) === JSON.stringify(pending)) writePending(s.user.id, null);
      const cur = loadSession();
      if (r.prefs && cur?.user?.id === s.user.id) update({ ...cur, user: { ...cur.user, prefs: { ...r.prefs, ...(readPending(s.user.id) || {}) } } });
    } catch { /* stays pending; sent on the next refresh */ }
  }, [update]);
  const platform = session?.platform || null;
  setPlatformLists(platform?.lists);
  useEffect(() => { document.title = platform?.app_name || 'RaceOps'; }, [platform?.app_name]);
  const ent = useMemo(() => entitlements(membership), [membership]);
  const [membersVersion, setMembersVersion] = useState(0);

  // Team member list: cached on the device so member fields work offline.
  useEffect(() => {
    const tid = membership?.tenant_id;
    if (!tid) return;
    let cancelled = false;
    getMeta(`members:${tid}`, []).then((list) => { if (!cancelled) { setMembersCache(list); setMembersVersion((v) => v + 1); } });
    if (navigator.onLine) {
      api(`/t/${tid}/members`).then(async (list) => {
        await setMeta(`members:${tid}`, list);
        if (!cancelled) { setMembersCache(list); setMembersVersion((v) => v + 1); }
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [membership?.tenant_id]);

  // engine shops: team laps that count on the shop's service tracker (cached for offline)
  const [linkedVersion, setLinkedVersion] = useState(0);
  const shopTeam = isShop(membership);
  useEffect(() => {
    const tid = membership?.tenant_id;
    setLinkedUsage({});
    if (!tid || !shopTeam) return undefined;
    let cancelled = false;
    const apply = (m) => { if (!cancelled) { setLinkedUsage(m); setLinkedVersion((x) => x + 1); } };
    getMeta(`linked:${tid}`, {}).then(apply);
    const load = () => { if (navigator.onLine) api(`/t/${tid}/engine-usage`).then(async (m) => { await setMeta(`linked:${tid}`, m); apply(m); }).catch(() => {}); };
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
    window.addEventListener('online', load);
    window.addEventListener('raceops:linked-changed', load);
    return () => { cancelled = true; clearInterval(t); window.removeEventListener('online', load); window.removeEventListener('raceops:linked-changed', load); };
  }, [membership?.tenant_id, shopTeam]);

  useEffect(() => {
    setSyncTenant(membership?.tenant_id || null);
    if (membership) syncNow();
  }, [membership?.tenant_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({
    session,
    user: session?.user,
    prefs,
    setPrefs,
    memberships: session?.memberships || [],
    membership,
    tid: membership?.tenant_id,
    role: membership?.role,
    ent,
    membersVersion,
    linkedVersion,
    platform,
    licence: membership?.licence || 'active',
    can: (p) => canP(membership?.role, p),
    canType: (t, a) => canT(membership?.role, ent, t, a),
    canArea: (a) => canA(membership?.role, ent, a),
    canModule: (m, a = 'view') => canM(membership?.role, ent, m, a),
    licensed: (f) => ent.has(f),
    login, logout, refresh,
    switchTenant: (id) => update({ ...loadSession(), tenantId: id }),
  }), [session, membership, ent, membersVersion, linkedVersion, login, logout, refresh, update, prefs, setPrefs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
