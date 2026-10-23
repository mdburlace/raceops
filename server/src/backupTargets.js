// Backup destinations ("targets"): where backup files are kept. One driver per kind, all with the same shape:
//   put(localFile, name) → { ref }      get(ref, localFile)      list() → [{ ref, name, size, modified }]
//   remove(ref)                          test() → true (or throws a message for the person setting it up)
//
// Kinds: local (a folder under BACKUP_DIR on the server), s3 (AWS S3 and S3-compatible: Backblaze B2, Wasabi,
// Cloudflare R2, MinIO), gdrive (Google Drive), dropbox, onedrive. Google Drive, Dropbox and OneDrive connect with
// OAuth (a Connect button); the app registrations' IDs are environment variables:
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, DROPBOX_APP_KEY / DROPBOX_APP_SECRET,
//   ONEDRIVE_CLIENT_ID / ONEDRIVE_CLIENT_SECRET (/ ONEDRIVE_TENANT, default "common"). Redirect URI:
//   <APP_URL>/api/backup/oauth/callback.
// BACKUP_CLOUD_MOCK=1 (automated tests only) keeps every cloud kind in a local folder and fakes the sign-in.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { HttpError } from './auth.js';
import { unseal } from './backupFile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
export const WORK_DIR = path.join(BACKUP_DIR, '.work');
const mock = () => process.env.BACKUP_CLOUD_MOCK === '1';
const appUrl = () => (process.env.APP_URL || '').replace(/\/$/, '');
export const redirectUri = () => `${appUrl()}/api/backup/oauth/callback`;
const fail = (msg, status = 400) => { throw new HttpError(status, msg); };
const safeName = (s) => String(s || '').replace(/[^A-Za-z0-9 ._-]+/g, '-').replace(/^[.\s-]+|[.\s-]+$/g, '').slice(0, 120);

export const KINDS = {
  local: { label: 'Server folder', oauth: false },
  s3: { label: 'S3-compatible storage (AWS, Backblaze B2, Wasabi, Cloudflare R2…)', oauth: false },
  gdrive: { label: 'Google Drive', oauth: true, env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
  dropbox: { label: 'Dropbox', oauth: true, env: ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET'] },
  onedrive: { label: 'OneDrive', oauth: true, env: ['ONEDRIVE_CLIENT_ID', 'ONEDRIVE_CLIENT_SECRET'] },
};
/** Which kinds this server can use: OAuth kinds need their app registration (and APP_URL). */
export function available() {
  return Object.fromEntries(Object.entries(KINDS).map(([k, v]) => {
    let ready = true, why = '';
    if (v.oauth && !mock()) {
      const missing = v.env.filter((e) => !process.env[e]);
      if (missing.length) { ready = false; why = `Not set up on this server: ${missing.join(' and ')} must be set.`; }
      else if (!appUrl()) { ready = false; why = 'Not set up on this server: APP_URL must be set.'; }
    }
    return [k, { label: v.label, oauth: v.oauth, ready, why }];
  }));
}

/** Clean the non-secret settings for a kind. */
export function cleanConfig(kind, c = {}) {
  const s = (x, n = 300) => String(x ?? '').trim().slice(0, n);
  if (kind === 'local') return { folder: safeName(c.folder) || 'raceops' };
  if (kind === 's3') {
    const endpoint = s(c.endpoint).replace(/\/$/, '');
    if (endpoint && !/^https?:\/\//.test(endpoint)) fail('The endpoint must start with https:// (or http:// for a server on your own network).');
    if (!s(c.bucket)) fail('Enter the bucket name.');
    return { endpoint, region: s(c.region) || 'us-east-1', bucket: s(c.bucket), prefix: s(c.prefix).replace(/^\/+|\/+$/g, ''), path_style: endpoint ? c.path_style !== false : false };
  }
  return { folder: s(c.folder).replace(/^\/+|\/+$/g, '') || 'RaceOps backups', folder_id: c.folder_id || null };
}
export function cleanSecret(kind, x = {}) {
  if (kind === 's3') {
    const k = String(x.access_key_id || '').trim(), sk = String(x.secret_access_key || '').trim();
    if (!k || !sk) fail('Enter the access key ID and secret access key.');
    return { access_key_id: k, secret_access_key: sk };
  }
  return null;
}

// ---------------------------------------------------------------- helpers
async function http(url, opts = {}, what = 'the storage service') {
  let res;
  try { res = await fetch(url, opts); } catch (e) { fail(`Couldn’t reach ${what}: ${e.cause?.code || e.message}`, 502); }
  return res;
}
async function ok(res, what) {
  if (res.ok) return res;
  let body = '';
  try { body = (await res.text()).slice(0, 300); } catch { /* ignore */ }
  const hint = res.status === 401 || res.status === 403 ? ' The connection was refused: check the keys, or connect it again.' : '';
  fail(`${what} answered ${res.status}.${hint}${body ? ` (${body.replace(/\s+/g, ' ')})` : ''}`, 502);
}
const toFile = async (res, file) => { await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file)); };
const fileBody = (file, start = 0, end) => Readable.toWeb(fs.createReadStream(file, { start, end }));

// ---------------------------------------------------------------- local folder (and the cloud mock)
function folderDriver(dir) {
  const under = (ref) => {
    const p = path.resolve(dir, ref);
    if (!p.startsWith(path.resolve(dir) + path.sep)) fail('Not found', 404);
    return p;
  };
  return {
    async test() { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return true; },
    async put(file, name) {
      fs.mkdirSync(dir, { recursive: true });
      let ref = name;
      for (let i = 2; fs.existsSync(under(ref)); i++) ref = name.replace(/\.raceops$/, `-${i}.raceops`); // never overwrite
      fs.copyFileSync(file, under(ref));
      return { ref };
    },
    async get(ref, file) { const p = under(ref); if (!fs.existsSync(p)) fail('That backup isn’t in the folder any more.', 404); fs.copyFileSync(p, file); },
    async list() {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).filter((n) => n.endsWith('.raceops')).map((n) => { const st = fs.statSync(path.join(dir, n)); return { ref: n, name: n, size: st.size, modified: st.mtime.toISOString() }; });
    },
    async remove(ref) { fs.rmSync(under(ref), { force: true }); },
  };
}

// ---------------------------------------------------------------- S3 (Signature Version 4)
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
/** Sign a request (AWS Signature Version 4). Exported for its test. */
export function sigv4({ method, url, region, service = 's3', headers = {}, accessKey, secretKey, payloadHash = 'UNSIGNED-PAYLOAD', now = new Date() }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const h = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host: u.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash };
  const names = Object.keys(h).sort();
  const canonPath = u.pathname.split('/').map((seg) => rfc3986(decodeURIComponent(seg))).join('/') || '/';
  const query = [...u.searchParams.entries()].map(([k, v]) => [rfc3986(k), rfc3986(v)]).sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&');
  const canon = [method, canonPath, query, names.map((n) => `${n}:${h[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canon)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return { ...h, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`, signature };
}

function s3Driver(cfg, secret) {
  const base = cfg.endpoint
    ? (cfg.path_style ? `${cfg.endpoint}/${cfg.bucket}` : cfg.endpoint.replace('://', `://${cfg.bucket}.`))
    : `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  const keyOf = (name) => (cfg.prefix ? `${cfg.prefix}/${name}` : name);
  const urlOf = (key, qs = '') => `${base}/${key.split('/').map(rfc3986).join('/')}${qs}`;
  const send = async (method, url, { headers = {}, body, what = 'The storage service' } = {}) => {
    const signed = sigv4({ method, url, region: cfg.region, headers, accessKey: secret.access_key_id, secretKey: secret.secret_access_key });
    delete signed.signature;
    return ok(await http(url, { method, headers: signed, body, ...(body ? { duplex: 'half' } : {}) }, 'the storage service'), what);
  };
  const listAll = async () => {
    const out = [];
    let token = '';
    for (;;) {
      const qs = new URLSearchParams({ 'list-type': '2', ...(cfg.prefix ? { prefix: `${cfg.prefix}/` } : {}), ...(token ? { 'continuation-token': token } : {}) });
      const xml = await (await send('GET', `${base}/?${qs}`)).text();
      for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const tag = (t) => (new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(m[1]) || [])[1] || '';
        const key = tag('Key').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        if (!key.endsWith('.raceops')) continue;
        out.push({ ref: key, name: key.split('/').pop(), size: Number(tag('Size')), modified: tag('LastModified') });
      }
      token = (/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml) || [])[1];
      if (!/<IsTruncated>true<\/IsTruncated>/.test(xml) || !token) return out;
    }
  };
  return {
    async test() { await listAll(); return true; },
    async put(file, name) {
      const key = keyOf(name);
      const size = fs.statSync(file).size;
      if (size > 5 * 1024 ** 3) fail('Backups larger than 5 GB can’t go to S3 storage in one piece. Use a server folder for this one.');
      await send('PUT', urlOf(key), { headers: { 'content-length': String(size), 'content-type': 'application/octet-stream' }, body: fileBody(file) });
      return { ref: key };
    },
    async get(ref, file) { await toFile(await send('GET', urlOf(ref), { what: 'Downloading the backup' }), file); },
    list: listAll,
    async remove(ref) { await send('DELETE', urlOf(ref)); },
  };
}

// ---------------------------------------------------------------- OAuth clouds
const OAUTH = {
  gdrive: {
    authorize: (state) => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', state })}`,
    token: 'https://oauth2.googleapis.com/token',
    client: () => ({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET }),
  },
  dropbox: {
    authorize: (state) => `https://www.dropbox.com/oauth2/authorize?${new URLSearchParams({ client_id: process.env.DROPBOX_APP_KEY, redirect_uri: redirectUri(), response_type: 'code', token_access_type: 'offline', state })}`,
    token: 'https://api.dropboxapi.com/oauth2/token',
    client: () => ({ client_id: process.env.DROPBOX_APP_KEY, client_secret: process.env.DROPBOX_APP_SECRET }),
  },
  onedrive: {
    authorize: (state) => `https://login.microsoftonline.com/${process.env.ONEDRIVE_TENANT || 'common'}/oauth2/v2.0/authorize?${new URLSearchParams({ client_id: process.env.ONEDRIVE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code', scope: 'offline_access Files.ReadWrite.AppFolder', state })}`,
    token: `https://login.microsoftonline.com/${process.env.ONEDRIVE_TENANT || 'common'}/oauth2/v2.0/token`,
    client: () => ({ client_id: process.env.ONEDRIVE_CLIENT_ID, client_secret: process.env.ONEDRIVE_CLIENT_SECRET }),
    scope: 'offline_access Files.ReadWrite.AppFolder',
  },
};
/** Where to send the browser to connect an account. */
export function authorizeUrl(kind, state) {
  if (mock()) return `/api/backup/oauth/mock?state=${encodeURIComponent(state)}`;
  return OAUTH[kind].authorize(state);
}
/** Swap the code from the sign-in page for a refresh token (what we keep). */
export async function exchangeCode(kind, code) {
  if (mock()) return { refresh_token: `mock-${crypto.randomBytes(6).toString('hex')}` };
  const o = OAUTH[kind];
  const res = await http(o.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...o.client(), grant_type: 'authorization_code', code, redirect_uri: redirectUri(), ...(o.scope ? { scope: o.scope } : {}) }) }, KINDS[kind].label);
  const j = await (await ok(res, `${KINDS[kind].label} sign-in`)).json();
  if (!j.refresh_token) fail(`${KINDS[kind].label} didn’t give RaceOps lasting access. Remove RaceOps from your account’s connected apps, then connect again.`);
  return { refresh_token: j.refresh_token };
}

/** Access tokens are short-lived; each driver gets one from the stored refresh token (and keeps a rotated one). */
function tokenSource(kind, secret, onSecret) {
  let cached = null;
  return async () => {
    if (cached && cached.until > Date.now()) return cached.token;
    const o = OAUTH[kind];
    const res = await http(o.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...o.client(), grant_type: 'refresh_token', refresh_token: secret.refresh_token, ...(o.scope ? { scope: o.scope } : {}) }) }, KINDS[kind].label);
    if (res.status === 400 || res.status === 401) fail(`${KINDS[kind].label} no longer accepts this connection (it may have been removed from the account). Connect it again.`, 409);
    const j = await (await ok(res, `${KINDS[kind].label} sign-in`)).json();
    if (j.refresh_token && j.refresh_token !== secret.refresh_token) { secret.refresh_token = j.refresh_token; await onSecret?.(secret); }
    cached = { token: j.access_token, until: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000 };
    return cached.token;
  };
}

function gdriveDriver(cfg, secret, { onSecret, onConfig }) {
  const tok = tokenSource('gdrive', secret, onSecret);
  const api = async (url, opts = {}, what = 'Google Drive') => ok(await http(url, { ...opts, headers: { authorization: `Bearer ${await tok()}`, ...(opts.headers || {}) } }, 'Google Drive'), what);
  const folder = async () => {
    if (cfg.folder_id) return cfg.folder_id;
    const r = await (await api('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: cfg.folder, mimeType: 'application/vnd.google-apps.folder' }) })).json();
    cfg.folder_id = r.id; await onConfig?.(cfg);
    return r.id;
  };
  return {
    async test() { await folder(); return true; },
    async put(file, name) {
      const size = fs.statSync(file).size;
      const start = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', { method: 'POST',
        headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'application/octet-stream', 'x-upload-content-length': String(size) },
        body: JSON.stringify({ name, parents: [await folder()] }) });
      const loc = start.headers.get('location');
      const up = await (await ok(await http(loc, { method: 'PUT', headers: { 'content-length': String(size) }, body: fileBody(file), duplex: 'half' }, 'Google Drive'), 'Uploading to Google Drive')).json();
      return { ref: up.id };
    },
    async get(ref, file) { await toFile(await api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ref)}?alt=media`, {}, 'Downloading the backup'), file); },
    async list() {
      const out = [];
      let page = '';
      const q = `'${await folder()}' in parents and trashed = false`;
      do {
        const r = await (await api(`https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, pageSize: '1000', fields: 'nextPageToken,files(id,name,size,modifiedTime)', ...(page ? { pageToken: page } : {}) })}`)).json();
        for (const f of r.files || []) if (f.name.endsWith('.raceops')) out.push({ ref: f.id, name: f.name, size: Number(f.size || 0), modified: f.modifiedTime });
        page = r.nextPageToken;
      } while (page);
      return out;
    },
    async remove(ref) { const r = await http(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ref)}`, { method: 'DELETE', headers: { authorization: `Bearer ${await tok()}` } }, 'Google Drive'); if (r.status !== 404) await ok(r, 'Google Drive'); },
  };
}

function dropboxDriver(cfg, secret, { onSecret }) {
  const tok = tokenSource('dropbox', secret, onSecret);
  const dir = cfg.folder ? `/${cfg.folder}` : '';
  const rpc = async (url, body, what = 'Dropbox') => ok(await http(url, { method: 'POST', headers: { authorization: `Bearer ${await tok()}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }, 'Dropbox'), what);
  const content = async (url, arg, body, extra = {}) => ok(await http(url, { method: 'POST', headers: { authorization: `Bearer ${await tok()}`, 'dropbox-api-arg': JSON.stringify(arg), 'content-type': 'application/octet-stream', ...extra }, body, ...(body ? { duplex: 'half' } : {}) }, 'Dropbox'), 'Dropbox');
  const CHUNK = 64 * 1024 * 1024;
  return {
    async test() { await this.list(); return true; },
    async put(file, name) {
      const size = fs.statSync(file).size;
      const p = `${dir}/${name}`;
      if (size <= 140 * 1024 * 1024) {
        const r = await (await content('https://content.dropboxapi.com/2/files/upload', { path: p, mode: 'add', autorename: true, mute: true }, fileBody(file))).json();
        return { ref: r.path_display || p };
      }
      const s = await (await content('https://content.dropboxapi.com/2/files/upload_session/start', { close: false }, fileBody(file, 0, CHUNK - 1))).json();
      let off = CHUNK;
      for (; off + CHUNK < size; off += CHUNK) await content('https://content.dropboxapi.com/2/files/upload_session/append_v2', { cursor: { session_id: s.session_id, offset: off }, close: false }, fileBody(file, off, off + CHUNK - 1));
      const r = await (await content('https://content.dropboxapi.com/2/files/upload_session/finish', { cursor: { session_id: s.session_id, offset: off }, commit: { path: p, mode: 'add', autorename: true, mute: true } }, fileBody(file, off))).json();
      return { ref: r.path_display || p };
    },
    async get(ref, file) { await toFile(await content('https://content.dropboxapi.com/2/files/download', { path: ref }), file); },
    async list() {
      const out = [];
      let res = await http('https://api.dropboxapi.com/2/files/list_folder', { method: 'POST', headers: { authorization: `Bearer ${await tok()}`, 'content-type': 'application/json' }, body: JSON.stringify({ path: dir, limit: 2000 }) }, 'Dropbox');
      if (res.status === 409) return []; // the folder doesn't exist yet
      let j = await (await ok(res, 'Dropbox')).json();
      for (;;) {
        for (const e of j.entries || []) if (e['.tag'] === 'file' && e.name.endsWith('.raceops')) out.push({ ref: e.path_display, name: e.name, size: e.size, modified: e.server_modified });
        if (!j.has_more) return out;
        j = await (await rpc('https://api.dropboxapi.com/2/files/list_folder/continue', { cursor: j.cursor })).json();
      }
    },
    async remove(ref) { await rpc('https://api.dropboxapi.com/2/files/delete_v2', { path: ref }); },
  };
}

function onedriveDriver(cfg, secret, { onSecret }) {
  const tok = tokenSource('onedrive', secret, onSecret);
  const G = 'https://graph.microsoft.com/v1.0/me/drive';
  const folderPath = cfg.folder ? `/special/approot:/${cfg.folder.split('/').map(encodeURIComponent).join('/')}` : '/special/approot';
  const api = async (url, opts = {}, what = 'OneDrive') => ok(await http(url, { ...opts, headers: { authorization: `Bearer ${await tok()}`, ...(opts.headers || {}) } }, 'OneDrive'), what);
  const CHUNK = 32 * 327680; // 10 MiB, a multiple of 320 KiB as OneDrive requires
  return {
    async test() { await this.list(); return true; },
    async put(file, name) {
      const size = fs.statSync(file).size;
      const target = cfg.folder ? `${G}/special/approot:/${[...cfg.folder.split('/'), name].map(encodeURIComponent).join('/')}:/createUploadSession` : `${G}/special/approot:/${encodeURIComponent(name)}:/createUploadSession`;
      const s = await (await api(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }) })).json();
      let last = null;
      for (let off = 0; off < size; off += CHUNK) {
        const end = Math.min(off + CHUNK, size) - 1;
        last = await ok(await http(s.uploadUrl, { method: 'PUT', headers: { 'content-length': String(end - off + 1), 'content-range': `bytes ${off}-${end}/${size}` }, body: fileBody(file, off, end), duplex: 'half' }, 'OneDrive'), 'Uploading to OneDrive');
      }
      const item = await last.json();
      return { ref: item.id };
    },
    async get(ref, file) { await toFile(await api(`${G}/items/${encodeURIComponent(ref)}/content`, {}, 'Downloading the backup'), file); },
    async list() {
      const out = [];
      let url = `${G}${folderPath}${cfg.folder ? ':' : ''}/children?$select=id,name,size,lastModifiedDateTime&$top=999`;
      while (url) {
        const res = await http(url, { headers: { authorization: `Bearer ${await tok()}` } }, 'OneDrive');
        if (res.status === 404) return out;
        const j = await (await ok(res, 'OneDrive')).json();
        for (const f of j.value || []) if (f.name?.endsWith('.raceops')) out.push({ ref: f.id, name: f.name, size: f.size, modified: f.lastModifiedDateTime });
        url = j['@odata.nextLink'];
      }
      return out;
    },
    async remove(ref) { const r = await http(`${G}/items/${encodeURIComponent(ref)}`, { method: 'DELETE', headers: { authorization: `Bearer ${await tok()}` } }, 'OneDrive'); if (r.status !== 404) await ok(r, 'OneDrive'); },
  };
}

/**
 * The driver for a target row. `hooks.onSecret(secret)` / `hooks.onConfig(config)` persist a rotated refresh
 * token or a created folder id.
 */
export function driverFor(target, hooks = {}) {
  const kind = target.kind;
  if (!KINDS[kind]) fail('Unknown kind of backup destination');
  const cfg = { ...(target.config || {}) };
  if (kind === 'local') return folderDriver(path.join(BACKUP_DIR, cfg.folder || 'raceops'));
  if (mock()) {
    if (kind === 's3') { const sec = unseal(target.secret); if (sec?.secret_access_key === 'wrong') fail('The storage service answered 403. The connection was refused: check the keys, or connect it again.', 502); }
    if (KINDS[kind].oauth && !target.secret) fail('This destination isn’t connected yet. Press Connect.', 409);
    return folderDriver(path.join(BACKUP_DIR, '.mock-cloud', kind, target.id));
  }
  const secret = unseal(target.secret);
  if (!secret) fail(KINDS[kind].oauth ? 'This destination isn’t connected yet. Press Connect.' : 'The keys for this destination are missing. Edit it and enter them again.', 409);
  if (kind === 's3') return s3Driver(cfg, secret);
  if (kind === 'gdrive') return gdriveDriver(cfg, secret, hooks);
  if (kind === 'dropbox') return dropboxDriver(cfg, secret, hooks);
  return onedriveDriver(cfg, secret, hooks);
}
