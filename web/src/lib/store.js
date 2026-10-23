import Dexie from 'dexie';
import { normaliseDays } from '@shared/calendar.js';

// Local-first store: the whole UI reads from IndexedDB so it works the same online or offline.
export const db = new Dexie('raceops');
db.version(1).stores({
  records: 'id, [tenant_id+type], [tenant_id+dirty]',
  meta: 'key',
});

export const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}
export const setMeta = (key, value) => db.meta.put({ key, value });

/** Save locally and mark for sync. Events and shared dates keep their days and date span in step. */
export async function saveRecord(tid, type, id, dataIn, userId) {
  const data = (type === 'event' || type === 'fixture') && dataIn?.values ? { ...dataIn, values: normaliseDays(dataIn.values) } : dataIn;
  const now = new Date().toISOString();
  const existing = id ? await db.records.get(id) : null;
  const rec = {
    ...(existing || {}),
    id: id || uuid(),
    tenant_id: tid,
    type,
    data,
    deleted: 0,
    dirty: 1,
    client_updated_at: now,
    created_at: existing?.created_at || now,
    created_by: existing?.created_by || userId,
    updated_by: userId,
  };
  await db.records.put(rec);
  window.dispatchEvent(new Event('raceops:changed'));
  return rec;
}

export async function deleteRecord(id) {
  const rec = await db.records.get(id);
  if (!rec) return;
  await db.records.put({ ...rec, deleted: 1, dirty: 1, client_updated_at: new Date().toISOString() });
  window.dispatchEvent(new Event('raceops:changed'));
}
