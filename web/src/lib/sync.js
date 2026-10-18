import { api } from './api.js';
import { db, getMeta, setMeta } from './store.js';

// ---- observable status ----
let status = { state: navigator.onLine ? 'idle' : 'offline', pending: 0, lastSync: null, error: null };
const listeners = new Set();
const emit = (patch) => { status = { ...status, ...patch }; listeners.forEach((l) => l()); };
export const subscribeSync = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const getSyncStatus = () => status;

let running = null;
let again = false;
let tenantId = null;

async function countPending(tid) {
  return tid ? db.records.where('[tenant_id+dirty]').equals([tid, 1]).count() : 0;
}

const fromServer = (tid, r) => ({
  id: r.id, tenant_id: tid, type: r.type, data: r.data, deleted: r.deleted ? 1 : 0, dirty: 0,
  client_updated_at: new Date(r.client_updated_at).toISOString(), seq: r.seq,
  created_at: r.created_at, created_by: r.created_by, updated_by: r.updated_by, updated_at: r.updated_at,
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

async function pull(tid) {
  let since = await getMeta(`since:${tid}`, 0);
  for (;;) {
    const res = await api(`/t/${tid}/sync?since=${since}`);
    await db.transaction('rw', db.records, async () => {
      for (const r of res.records) {
        const local = await db.records.get(r.id);
        if (local?.dirty && local.client_updated_at > new Date(r.client_updated_at).toISOString()) continue;
        await db.records.put(fromServer(tid, r));
      }
    });
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
  if (!navigator.onLine) { emit({ state: 'offline', pending: await countPending(tid) }); return; }
  if (running) { again = true; return running; }
  running = (async () => {
    emit({ state: 'syncing', error: null });
    try {
      await push(tid);
      await pull(tid);
      emit({ state: 'idle', lastSync: new Date().toISOString(), pending: await countPending(tid) });
    } catch (e) {
      emit({ state: e.status === 0 ? 'offline' : 'error', error: e.message, pending: await countPending(tid) });
    } finally {
      running = null;
      if (again) { again = false; setTimeout(syncNow, 50); }
    }
  })();
  return running;
}

/** Drop the tenant's cached (already synced) data and pull everything again. */
export async function fullResync(tid) {
  await db.records.where('[tenant_id+dirty]').equals([tid, 0]).delete();
  await setMeta(`since:${tid}`, 0);
  return syncNow();
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
  window.addEventListener('offline', () => emit({ state: 'offline' }));
  window.addEventListener('raceops:changed', onChange);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  clearInterval(timer);
  timer = setInterval(kick, 30000);
}
