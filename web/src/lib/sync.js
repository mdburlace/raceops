import { api } from './api.js';
import { db, getMeta, setMeta } from './store.js';

// ---- observable status ----
// stuck: sync keeps failing as "offline" while the server answers its health check — something stale on this
// device (usually its browser cache), which Repair this device fixes.
let status = { state: navigator.onLine ? 'idle' : 'offline', pending: 0, lastSync: null, error: null, stuck: false };
const listeners = new Set();
const emit = (patch) => { status = { ...status, ...patch }; listeners.forEach((l) => l()); };
export const subscribeSync = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const getSyncStatus = () => status;

let running = null;
let again = false;
let tenantId = null;
let failures = 0; // sync attempts in a row that failed with no answer from the server

/** True when the server answers its health check (straight from the network, never a cached copy). */
async function serverAnswers() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function countPending(tid) {
  return tid ? db.records.where('[tenant_id+dirty]').equals([tid, 1]).count() : 0;
}

const fromServer = (tid, r) => ({
  id: r.id, tenant_id: tid, type: r.type, data: r.data, deleted: r.deleted ? 1 : 0, dirty: 0,
  client_updated_at: new Date(r.client_updated_at).toISOString(), seq: r.seq,
  created_at: r.created_at, created_by: r.created_by, updated_by: r.updated_by, updated_at: r.updated_at,
  global: r.global || r.tenant_id === null ? 1 : 0,
});

async function push(tid) {
  const dirty = await db.records.where('[tenant_id+dirty]').equals([tid, 1]).toArray();
  for (let i = 0; i < dirty.length; i += 200) {
    const batch = dirty.slice(i, i + 200);
    const { results } = await api(`/t/${tid}/sync`, {
      method: 'POST',
      body: { changes: batch.map((r) => ({ id: r.id, type: r.type, data: r.data, deleted: !!r.deleted, client_updated_at: r.client_updated_at })) },
    });
    await db.transaction('rw', db.records, async () => {
      for (const res of results) {
        const sent = batch.find((b) => b.id === res.id);
        const local = await db.records.get(res.id);
        // edited again while this push was in flight: leave it dirty for the next round
        if (local && sent && local.client_updated_at !== sent.client_updated_at) continue;
        if (res.record) await db.records.put(fromServer(tid, res.record));
        else if (res.status === 'denied') await db.records.delete(res.id);
        else if (local) await db.records.put({ ...local, dirty: 0 });
        if (res.status === 'denied') window.dispatchEvent(new CustomEvent('raceops:denied', { detail: res }));
      }
    });
  }
}

// Bumped by fullResync. A pull that started before a reset stops without saving its records or its
// cursor, so it can't overwrite the reset (which would leave the device "Synced" but missing data).
const resets = new Map();

async function pull(tid) {
  const gen = resets.get(tid) || 0;
  const stale = () => (resets.get(tid) || 0) !== gen;
  let since = await getMeta(`since:${tid}`, 0);
  let checked = false;
  for (;;) {
    const res = await api(`/t/${tid}/sync?since=${since}`);
    if (stale()) return;
    // the team was restored from a backup: drop this device's copy (keeping unsent changes) and download it again
    if (!checked && res.epoch) {
      checked = true;
      const had = await getMeta(`epoch:${tid}`, null);
      if (had !== res.epoch) {
        // a device that synced before (since > 0) and hasn't seen this epoch drops its copy, even if it never saw one.
        // The epoch is saved only after the copy is gone, so an interrupted sync tries again next time.
        if (since > 0) {
          await db.records.where('[tenant_id+dirty]').equals([tid, 0]).delete();
          since = 0;
          await setMeta(`since:${tid}`, 0);
          await setMeta(`epoch:${tid}`, res.epoch);
          window.dispatchEvent(new CustomEvent('raceops:restored', { detail: { tid } }));
          continue;
        }
        await setMeta(`epoch:${tid}`, res.epoch);
      }
    }
    await db.transaction('rw', db.records, async () => {
      const locals = await db.records.bulkGet(res.records.map((r) => r.id));
      const puts = res.records.filter((r, i) => !(locals[i]?.dirty && locals[i].client_updated_at > new Date(r.client_updated_at).toISOString()))
        .map((r) => fromServer(tid, r));
      if (puts.length && !stale()) await db.records.bulkPut(puts);
    });
    if (stale()) return;
    since = res.since;
    await setMeta(`since:${tid}`, since);
    if (!res.more) break;
  }
}

export function setSyncTenant(tid) {
  tenantId = tid;
  countPending(tid).then((pending) => emit({ pending }));
}

export async function syncNow() {
  const tid = tenantId;
  if (!tid) return;
  if (!navigator.onLine) { emit({ state: 'offline', pending: await countPending(tid), stuck: false }); return; }
  if (running) { again = true; return running; }
  running = (async () => {
    emit({ state: 'syncing', error: null });
    try {
      await push(tid);
      await pull(tid);
      failures = 0;
      emit({ state: 'idle', lastSync: new Date().toISOString(), pending: await countPending(tid), stuck: false });
    } catch (e) {
      const offline = e.status === 0;
      failures = offline ? failures + 1 : 0;
      // Two "offline" failures in a row while the browser says it's online: is the server actually there?
      const stuck = offline && failures >= 2 && navigator.onLine && await serverAnswers();
      emit({ state: offline ? 'offline' : 'error', error: e.message, pending: await countPending(tid), stuck });
    } finally {
      running = null;
      if (again) { again = false; setTimeout(syncNow, 50); }
    }
  })();
  return running;
}

/** Drop the tenant's cached (already synced) data and pull everything again. */
export async function fullResync(tid) {
  resets.set(tid, (resets.get(tid) || 0) + 1);
  await db.records.where('[tenant_id+dirty]').equals([tid, 0]).delete();
  await setMeta(`since:${tid}`, 0);
  // a sync already running (now stale) is followed by a fresh one from the start
  if (running) { again = true; return running; }
  return syncNow();
}

/**
 * Repair this device: what "Clear site data" does in the browser, but keeping the sign-in and any changes still
 * waiting to sync. Empties the browser's HTTP cache for the site (the server sends Clear-Site-Data), removes the
 * offline app files and the service worker, drops the already-synced copy of the team's data, then reloads —
 * the app comes back fresh from the server, uploads the queued changes and downloads everything again.
 * Stops before changing anything if the server can't be reached, so the app still works offline.
 * Returns the number of queued changes kept (the page reloads, so callers rarely see it).
 */
export async function repairDevice(tid) {
  let res;
  try {
    res = await fetch('/api/device/clear-cache', { method: 'POST', cache: 'no-store' });
  } catch {
    res = null;
  }
  if (!res?.ok) throw new Error("Can't reach the server, so nothing was changed. Try again when you have a connection.");
  const regs = await navigator.serviceWorker?.getRegistrations?.().catch(() => []) || [];
  await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
  if (window.caches) {
    const keys = await caches.keys().catch(() => []);
    await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
  }
  const pending = await countPending(tid);
  if (tid) {
    await db.records.where('[tenant_id+dirty]').equals([tid, 0]).delete(); // queued changes (dirty) stay
    await setMeta(`since:${tid}`, 0);
  }
  failures = 0;
  window.location.reload();
  return pending;
}

let timer;
export function startSyncLoop() {
  const kick = () => syncNow();
  let debounce;
  const onChange = () => {
    countPending(tenantId).then((pending) => emit({ pending }));
    clearTimeout(debounce);
    debounce = setTimeout(kick, 800);
  };
  window.addEventListener('online', kick);
  window.addEventListener('offline', () => emit({ state: 'offline', stuck: false }));
  window.addEventListener('raceops:changed', onChange);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  clearInterval(timer);
  timer = setInterval(kick, 30000);
}
