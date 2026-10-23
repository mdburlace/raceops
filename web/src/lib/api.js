const KEY = 'raceops.session';

export function loadSession() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
export function saveSession(s) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
export const token = () => loadSession()?.token;

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const t = token();
  if (t) headers.authorization = `Bearer ${t}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res;
  try {
    // no-store: always ask the server, never the browser cache. The app keeps its own copy of the data, and a
    // stale cached answer (such as a cached redirect) would otherwise leave the device stuck "Offline".
    res = await fetch(`/api${path}`, { method, headers, cache: 'no-store', body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError(0, 'You appear to be offline');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && t) window.dispatchEvent(new Event('raceops:unauthorized'));
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  }
  return data;
}

/**
 * A long request (AI reading files): the server runs it in the background and we poll for the
 * answer, so a proxy timeout in front of the server can't cut it off. Same result as api().
 */
export async function apiJob(path, body) {
  const start = await api(path, { method: 'POST', body: { ...body, async: true } });
  if (!start?.running) return start;
  const tid = path.match(/^\/t\/([^/]+)/)[1];
  let misses = 0;
  for (;;) {
    await new Promise((ok) => setTimeout(ok, 1500));
    let r;
    try { r = await api(`/t/${tid}/jobs/${start.job}`); misses = 0; } catch (e) {
      // a dropped connection or a proxy hiccup while waiting: keep waiting a little
      if ([0, 502, 503, 504].includes(e.status) && ++misses < 20) continue;
      throw e;
    }
    if (!r?.running) return r;
  }
}

export const fileUrl = (tid, id, download) =>
  `/api/t/${tid}/attachments/${id}/file?token=${encodeURIComponent(token() || '')}${download ? '&download' : ''}`;
