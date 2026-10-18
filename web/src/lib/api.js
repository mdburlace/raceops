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
    res = await fetch(`/api${path}`, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
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

export const fileUrl = (tid, id, download) =>
  `/api/t/${tid}/attachments/${id}/file?token=${encodeURIComponent(token() || '')}${download ? '&download' : ''}`;
