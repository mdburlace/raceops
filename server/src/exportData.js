// Team data export: a team's records in CSV (one file per kind of record, in a ZIP), XML or JSON, optionally with
// the attached files, for the team to keep or use elsewhere. Unlike a backup, it's meant to be read: field labels
// from the team's forms head the CSV columns, and links to other records show the linked record's name.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { q } from './db.js';
import { RECORD_TYPES } from '../../shared/catalog.js';

export const FORMATS = { csv: 'CSV (a ZIP of spreadsheets)', xml: 'XML', json: 'JSON' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const typeLabel = (t) => t.replace(/_/g, ' ');

// ---------------------------------------------------------------- a small ZIP writer (deflate, no ZIP64)
export function zipWriter(file) {
  const fd = fs.openSync(file, 'w');
  let offset = 0;
  const entries = [];
  const write = (buf) => { fs.writeSync(fd, buf); offset += buf.length; };
  const dosTime = (d) => ({ time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() });
  return {
    add(name, data) {
      const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      const comp = zlib.deflateRawSync(raw);
      const crc = zlib.crc32(raw) >>> 0;
      const nameBuf = Buffer.from(name, 'utf8');
      const { time, date } = dosTime(new Date());
      const h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
      h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14);
      h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nameBuf.length, 26); h.writeUInt16LE(0, 28);
      entries.push({ nameBuf, crc, csize: comp.length, size: raw.length, offset, time, date });
      write(h); write(nameBuf); write(comp);
    },
    close() {
      const start = offset;
      for (const e of entries) {
        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
        c.writeUInt16LE(e.time, 12); c.writeUInt16LE(e.date, 14); c.writeUInt32LE(e.crc, 16); c.writeUInt32LE(e.csize, 20); c.writeUInt32LE(e.size, 24);
        c.writeUInt16LE(e.nameBuf.length, 28); c.writeUInt32LE(e.offset, 42);
        write(c); write(e.nameBuf);
      }
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
      end.writeUInt32LE(offset - start, 12); end.writeUInt32LE(start, 16);
      write(end);
      fs.closeSync(fd);
      return offset;
    },
  };
}

// ---------------------------------------------------------------- shaping the data
const titleOf = (r) => {
  const v = r?.data?.values || {};
  if (!r) return '';
  if (r.type === 'form') return r.data.name || 'Form';
  if (r.type === 'car') return [v.number && `#${v.number}`, v.name].filter(Boolean).join(' ') || 'Car';
  return v.name || v.title || v.job_no || v.number || v.session || v.kind || typeLabel(r.type);
};

async function teamData(tid) {
  const { rows: [team] } = await q('SELECT id, name FROM tenants WHERE id=$1', [tid]);
  const { rows } = await q(`SELECT r.id, r.type, r.data, r.created_at, r.updated_at, cu.name AS created_by, uu.name AS updated_by
     FROM records r LEFT JOIN users cu ON cu.id=r.created_by LEFT JOIN users uu ON uu.id=r.updated_by
     WHERE r.tenant_id=$1 AND NOT r.deleted ORDER BY r.type, r.created_at`, [tid]);
  const { rows: globals } = await q("SELECT id, type, data FROM records WHERE tenant_id IS NULL AND NOT deleted AND type IN ('track','series','fixture','contact','supplier')");
  const byId = new Map([...globals, ...rows].map((r) => [r.id, r]));
  // field labels from the team's forms (the default form for each type)
  const labels = {};
  for (const f of rows.filter((r) => r.type === 'form')) {
    const t = f.data.target;
    if (!t || (labels[t] && !f.data.base)) continue;
    labels[t] = Object.fromEntries((f.data.sections || []).flatMap((s) => (s.fields || []).filter((x) => x.key && x.type !== 'heading').map((x) => [x.key, x.label || x.key])));
  }
  const { rows: files } = await q('SELECT id, record_id, filename, mime, size, storage_path, caption, created_at FROM attachments WHERE tenant_id=$1 ORDER BY created_at', [tid]);
  return { team, records: rows.filter((r) => r.type !== 'form'), byId, labels, files };
}

/** A value as text for a spreadsheet cell: links show the linked record's name. */
function cell(val, byId) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return UUID.test(val) && byId.has(val) ? titleOf(byId.get(val)) : val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.every((x) => x === null || typeof x !== 'object') ? val.map((x) => cell(x, byId)).join('; ') : JSON.stringify(val);
  if (typeof val === 'object' && 'asset' in val && Object.keys(val).length === 1) return cell(val.asset, byId);
  if (typeof val === 'object' && 'done' in val) return [val.done ? 'Yes' : 'No', val.value, val.note].filter((x) => x !== undefined && x !== null && x !== '').join(' · ');
  // per-corner and similar small groups: "LF: 12; RF: 14; …"
  const flat = Object.entries(val).filter(([, x]) => x !== null && x !== undefined && x !== '');
  if (flat.every(([, x]) => typeof x !== 'object' || (x && 'asset' in x && Object.keys(x).length === 1))) return flat.map(([k, x]) => `${k}: ${cell(x, byId)}`).join('; ');
  return JSON.stringify(val);
}
const csvEsc = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const fileName = (f) => `files/${f.id}-${f.filename.replace(/[\\/:*?"<>|]+/g, '_')}`;

function toCsv(type, recs, d) {
  const lab = d.labels[type] || {};
  const seen = new Set();
  for (const r of recs) for (const k of Object.keys(r.data?.values || {})) seen.add(k);
  // the form's order first, then anything the form doesn't have
  const keys = [...Object.keys(lab).filter((k) => seen.has(k)), ...[...seen].filter((k) => !(k in lab))];
  const used = new Set();
  const head = keys.map((k) => { let h = lab[k] || k; if (used.has(h)) h = `${h} (${k})`; used.add(h); return h; });
  const lines = [['id', ...head, 'created', 'created by', 'updated', 'updated by'].map(csvEsc).join(',')];
  for (const r of recs) {
    const v = r.data?.values || {};
    lines.push([r.id, ...keys.map((k) => cell(v[k], d.byId)), new Date(r.created_at).toISOString(), r.created_by || '', new Date(r.updated_at).toISOString(), r.updated_by || ''].map((x) => csvEsc(String(x))).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`; // a byte-order mark so Excel reads the text as UTF-8
}

function xmlValue(name, val, d, pad) {
  const n = xmlEsc(name);
  if (val === null || val === undefined || val === '') return `${pad}<field name="${n}"/>`;
  if (Array.isArray(val)) return `${pad}<field name="${n}">\n${val.map((x) => (x && typeof x === 'object' ? `${pad}  <item>\n${Object.entries(x).map(([k, y]) => xmlValue(k, y, d, `${pad}    `)).join('\n')}\n${pad}  </item>` : `${pad}  <item>${xmlEsc(cell(x, d.byId))}</item>`)).join('\n')}\n${pad}</field>`;
  if (typeof val === 'object') return `${pad}<field name="${n}">\n${Object.entries(val).map(([k, y]) => xmlValue(k, y, d, `${pad}  `)).join('\n')}\n${pad}</field>`;
  const linked = typeof val === 'string' && UUID.test(val) && d.byId.has(val);
  return `${pad}<field name="${n}"${linked ? ` ref="${val}"` : ''}>${xmlEsc(linked ? titleOf(d.byId.get(val)) : val)}</field>`;
}

/**
 * Write a team's export to `file` (a temporary path; the extension is chosen here). Returns
 * { file, ext, size, counts }.
 */
export async function writeExport(file, tid, { format = 'json', files: withFiles = false, UPLOAD_DIR }) {
  const d = await teamData(tid);
  const groups = {};
  for (const r of d.records) (groups[r.type] ||= []).push(r);
  const types = RECORD_TYPES.filter((t) => groups[t]);
  const counts = Object.fromEntries(types.map((t) => [t, groups[t].length]));
  const meta = { format: 'raceops-export', version: 1, team: d.team, exported_at: new Date().toISOString() };
  let body = null;
  if (format === 'json') {
    body = JSON.stringify({ ...meta, records: Object.fromEntries(types.map((t) => [t, groups[t].map((r) => ({ id: r.id, ...r.data.values, _created: r.created_at, _created_by: r.created_by, _updated: r.updated_at, _updated_by: r.updated_by }))])),
      fields: d.labels, files: d.files.map((f) => ({ id: f.id, record: f.record_id, name: f.filename, type: f.mime, size: f.size, caption: f.caption, path: withFiles ? fileName(f) : undefined })) }, null, 2);
  } else if (format === 'xml') {
    const out = [`<?xml version="1.0" encoding="UTF-8"?>`, `<raceops-export version="1" team="${xmlEsc(d.team.name)}" team-id="${d.team.id}" exported="${meta.exported_at}">`];
    for (const t of types) {
      out.push(`  <records type="${t}">`);
      for (const r of groups[t]) {
        out.push(`    <record id="${r.id}" created="${new Date(r.created_at).toISOString()}" updated="${new Date(r.updated_at).toISOString()}">`);
        for (const [k, v] of Object.entries(r.data?.values || {})) out.push(xmlValue(k, v, d, '      '));
        out.push('    </record>');
      }
      out.push('  </records>');
    }
    out.push('  <files>', ...d.files.map((f) => `    <file id="${f.id}" record="${f.record_id}" name="${xmlEsc(f.filename)}" type="${xmlEsc(f.mime)}" size="${f.size}"${withFiles ? ` path="${xmlEsc(fileName(f))}"` : ''}/>`), '  </files>', '</raceops-export>');
    body = `${out.join('\n')}\n`;
  }
  const zip = format === 'csv' || withFiles;
  const out = `${file}.${zip ? 'zip' : format}`;
  if (!zip) {
    fs.writeFileSync(out, body);
  } else {
    const z = zipWriter(out);
    if (format === 'csv') {
      for (const t of types) z.add(`${t}.csv`, toCsv(t, groups[t], d));
      z.add('files.csv', toCsv('_files', d.files.map((f) => ({ id: f.id, data: { values: { record: f.record_id, name: f.filename, type: f.mime, size: f.size, caption: f.caption, ...(withFiles ? { path: fileName(f) } : {}) } }, created_at: f.created_at, updated_at: f.created_at })), d));
      z.add('README.txt', `RaceOps export of ${d.team.name}, ${meta.exported_at}.\r\nOne spreadsheet per kind of record (${types.map(typeLabel).join(', ')}).\r\nLinks to other records show the linked record's name. Each row's id is the record's id.\r\n`);
    } else {
      z.add(`${format === 'json' ? 'data.json' : 'data.xml'}`, body);
    }
    if (withFiles) for (const f of d.files) {
      const p = path.join(UPLOAD_DIR, f.storage_path);
      if (fs.existsSync(p)) z.add(fileName(f), fs.readFileSync(p));
    }
    z.close();
  }
  return { file: out, ext: zip ? 'zip' : format, size: fs.statSync(out).size, counts: { ...counts, files: d.files.length } };
}

