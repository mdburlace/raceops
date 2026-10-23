// Backup files: one file per backup, written as a stream so a backup never has to fit in memory.
//
//   bytes 0–7   "RACEOPS1"
//   byte  8     flags: bit 0 = encrypted
//   encrypted:  16-byte scrypt salt, 12-byte AES-256-GCM nonce, ciphertext, 16-byte GCM tag (at the very end)
//   payload     gzip of newline-delimited JSON:
//                 {"type":"header", format, scope:"full"|"team", created_at, app_version, migration, tenant?, encrypted}
//                 {"type":"table", name}            then one {"r":{…row as row_to_json…}} per row
//                 {"type":"file", path, size}       then {"d":"<base64 chunk>"} lines, then {"type":"end-file"}
//                 {"type":"end", counts}
//
// The key is BACKUP_KEY (environment variable, any long passphrase). Without it, backups are written unencrypted.
// The same passphrase (with JWT_SECRET as a fallback) protects stored cloud credentials — see seal()/unseal().
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { PassThrough } from 'node:stream';
import { HttpError } from './auth.js';

const MAGIC = Buffer.from('RACEOPS1');
const HEAD = MAGIC.length + 1;
export const backupKey = () => process.env.BACKUP_KEY || '';
export const encryptionOn = () => !!backupKey();
const fileKey = (salt) => crypto.scryptSync(backupKey(), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

// ---------------------------------------------------------------- credentials at rest
const credKey = (which) => crypto.createHash('sha256').update(`raceops-credentials:${which === 'b' ? backupKey() : (process.env.JWT_SECRET || 'dev-secret-change-me')}`).digest();
/** Encrypt a secret (cloud keys, refresh tokens) for the database. */
export function seal(obj) {
  if (obj === null || obj === undefined) return null;
  const which = backupKey() ? 'b' : 'j';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', credKey(which), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return `v1:${which}:${iv.toString('base64')}:${ct.toString('base64')}:${c.getAuthTag().toString('base64')}`;
}
export function unseal(s) {
  if (!s) return null;
  const [v, which, iv, ct, tag] = String(s).split(':');
  if (v !== 'v1') return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', credKey(which), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8'));
  } catch {
    throw new HttpError(409, which === 'b'
      ? 'The saved connection details can’t be read: BACKUP_KEY has changed since they were saved. Connect this destination again.'
      : 'The saved connection details can’t be read: JWT_SECRET has changed since they were saved. Connect this destination again.');
  }
}

// ---------------------------------------------------------------- writing
/**
 * Start a backup file at `file`. Returns { line(obj), addFile(rel, abs), close() → { size, encrypted } }.
 * `line` waits for the stream to drain, so callers can await it in loops over millions of rows.
 */
export function createWriter(file) {
  const out = fs.createWriteStream(file);
  const encrypted = encryptionOn();
  const gz = zlib.createGzip({ level: 6 });
  let cipher = null;
  const head = Buffer.alloc(HEAD); MAGIC.copy(head); head[MAGIC.length] = encrypted ? 1 : 0;
  out.write(head);
  if (encrypted) {
    const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
    out.write(salt); out.write(iv);
    cipher = crypto.createCipheriv('aes-256-gcm', fileKey(salt), iv);
  }
  const chain = encrypted ? pipeline(gz, cipher, out, { end: false }) : pipeline(gz, out, { end: false });
  let failed = null;
  chain.catch((e) => { failed = e; });
  const write = (s) => new Promise((resolve, reject) => {
    if (failed) return reject(failed);
    if (gz.write(s)) resolve(); else gz.once('drain', resolve);
  });
  return {
    encrypted,
    line: (obj) => write(`${JSON.stringify(obj)}\n`),
    async addFile(rel, abs) {
      if (!fs.existsSync(abs)) return false;
      const size = fs.statSync(abs).size;
      await write(`${JSON.stringify({ type: 'file', path: rel, size })}\n`);
      for await (const chunk of fs.createReadStream(abs, { highWaterMark: 48 * 1024 })) await write(`${JSON.stringify({ d: chunk.toString('base64') })}\n`);
      await write('{"type":"end-file"}\n');
      return true;
    },
    async close() {
      gz.end();
      await chain;
      if (failed) throw failed;
      if (cipher) out.write(cipher.getAuthTag());
      await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
      return { size: fs.statSync(file).size, encrypted };
    },
  };
}

// ---------------------------------------------------------------- reading
function openPayload(file) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const head = Buffer.alloc(HEAD);
  fs.readSync(fd, head, 0, HEAD, 0);
  if (size < HEAD || !head.subarray(0, MAGIC.length).equals(MAGIC)) { fs.closeSync(fd); throw new HttpError(400, 'That isn’t a RaceOps backup file.'); }
  const encrypted = (head[MAGIC.length] & 1) === 1;
  if (!encrypted) {
    fs.closeSync(fd);
    return { encrypted, stream: () => { const out = new PassThrough(); pipeline(fs.createReadStream(file, { start: HEAD }), zlib.createGunzip(), out).catch(() => {}); return out; } };
  }
  if (!backupKey()) { fs.closeSync(fd); throw new HttpError(400, 'This backup is encrypted. Set BACKUP_KEY on this server to the passphrase it was made with, then try again.'); }
  const salt = Buffer.alloc(16), iv = Buffer.alloc(12), tag = Buffer.alloc(16);
  fs.readSync(fd, salt, 0, 16, HEAD);
  fs.readSync(fd, iv, 0, 12, HEAD + 16);
  fs.readSync(fd, tag, 0, 16, size - 16);
  fs.closeSync(fd);
  const key = fileKey(salt);
  return {
    encrypted,
    stream: () => {
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      const gun = zlib.createGunzip();
      const src = fs.createReadStream(file, { start: HEAD + 28, end: size - 17 });
      const out = new PassThrough();
      pipeline(src, d, gun, out).catch(() => {}); // the error reaches the reader through `out` (see lines())
      return out;
    },
  };
}

/** The payload's lines; a failure part-way is reported in words (a wrong key shows up as garbage to gunzip). */
async function* lines(file) {
  const { stream, encrypted } = openPayload(file);
  const s = stream();
  const rl = readline.createInterface({ input: s, crlfDelay: Infinity });
  try {
    for await (const l of rl) yield l;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, encrypted ? 'This backup can’t be opened: it was made with a different BACKUP_KEY, or the file is damaged.' : 'This backup is damaged or incomplete.');
  } finally { rl.close(); s.destroy(); }
}

/** Check a file is ready to restore from: the whole thing decrypts and its header can be read. */
export async function verify(file) {
  let header = null, end = null, n = 0;
  for await (const l of lines(file)) {
    n++;
    if (n === 1) header = JSON.parse(l);
    else if (l.startsWith('{"type":"end"')) end = JSON.parse(l);
  }
  if (!header || header.type !== 'header') throw new HttpError(400, 'That isn’t a RaceOps backup file.');
  if (!end) throw new HttpError(400, 'This backup is incomplete: it ends part-way through. Use an earlier one.');
  return { ...header, counts: end.counts };
}

/** Read just the header (quick: stops after the first line). Encrypted files are checked in full by verify(). */
export async function readHeader(file) {
  for await (const l of lines(file)) { const h = JSON.parse(l); if (h.type !== 'header') break; return h; }
  throw new HttpError(400, 'That isn’t a RaceOps backup file.');
}

/**
 * Walk a backup: onTable(name), onRow(name, row), onFile(rel, chunks[]) where chunks is an async iterator of Buffers.
 * Each callback may be async; rows are delivered in file order (tables in foreign-key order).
 */
export async function read(file, { onHeader, onTable, onRow, onFile, onEnd } = {}) {
  let table = null, fileInfo = null, chunks = null;
  for await (const l of lines(file)) {
    if (!l) continue;
    if (fileInfo) {
      if (l === '{"type":"end-file"}') { await onFile?.(fileInfo.path, chunks); fileInfo = null; chunks = null; } else chunks.push(Buffer.from(JSON.parse(l).d, 'base64'));
      continue;
    }
    if (l.startsWith('{"r":')) { await onRow?.(table, JSON.parse(l).r); continue; }
    const o = JSON.parse(l);
    if (o.type === 'header') await onHeader?.(o);
    else if (o.type === 'table') { table = o.name; await onTable?.(table); }
    else if (o.type === 'file') { fileInfo = o; chunks = []; }
    else if (o.type === 'end') await onEnd?.(o);
  }
}

/** A unique temporary file in the backup work folder. */
export function tempFile(dir, ext = '.raceops') {
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `tmp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
}
