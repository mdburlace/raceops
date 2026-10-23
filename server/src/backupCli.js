#!/usr/bin/env node
// Backups from the command line — for moving RaceOps to new infrastructure, or when the app won't start.
// Uses the same settings as the app (DATABASE_URL, UPLOAD_DIR, BACKUP_DIR, BACKUP_KEY).
//
//   node server/src/backupCli.js backup  <file>              full backup to a file
//   node server/src/backupCli.js team    <team id> <file>    one team's backup to a file
//   node server/src/backupCli.js inspect <file>              what's in a backup (checks it can be read in full)
//   node server/src/backupCli.js restore <file> [--yes]      replace everything with a full backup
//
// In Docker: docker compose exec app node server/src/backupCli.js backup /data/backups/manual.raceops
// Restore with the app stopped or freshly started on an empty database, then (re)start the app.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, pool, q } from './db.js';
import { loadSettings } from './settings.js';
import { configure, writeFull, writeTeam, runFullRestore, teamsIn } from './backup.js';
import { verify, encryptionOn } from './backupFile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const [cmd, a, b] = process.argv.slice(2);
const say = (s) => process.stdout.write(`${s}\n`);
const step = (s) => say(`  … ${s}`);

async function main() {
  if (!['backup', 'team', 'inspect', 'restore'].includes(cmd)) {
    say('Usage: backupCli.js backup <file> | team <team id> <file> | inspect <file> | restore <file> [--yes]');
    process.exit(2);
  }
  await migrate();
  await loadSettings();
  configure({ UPLOAD_DIR });
  if (cmd === 'backup') {
    if (!a) throw new Error('Give the file to write');
    const out = await writeFull(path.resolve(a), step);
    say(`Full backup written: ${a} (${(out.size / 1048576).toFixed(1)} MB, ${out.encrypted ? 'encrypted' : 'NOT encrypted — set BACKUP_KEY'})`);
  } else if (cmd === 'team') {
    if (!a || !b) throw new Error('Give the team id and the file to write');
    const out = await writeTeam(path.resolve(b), a, step);
    say(`Team backup written: ${b} (${(out.size / 1048576).toFixed(1)} MB${out.encrypted ? ', encrypted' : ''})`);
  } else if (cmd === 'inspect') {
    const h = await verify(path.resolve(a));
    say(`${h.scope === 'full' ? 'Full' : 'Team'} backup made ${h.created_at} by RaceOps ${h.app_version} (schema ${h.migration})${h.encrypted ? ', encrypted' : ''}`);
    if (h.scope === 'team') say(`Team: ${h.tenant.name} (${h.tenant.id})`);
    else for (const t of await teamsIn(path.resolve(a))) say(`  team ${t.name} (${t.id})`);
    say(`Contents: ${Object.entries(h.counts || {}).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  } else if (cmd === 'restore') {
    const { rows } = await q('SELECT count(*)::int AS n FROM users');
    if (rows[0].n > 0 && b !== '--yes') {
      say('This server already has data. Everything will be replaced by the backup (a safety backup is taken first).');
      say('Run again with --yes to go ahead.');
      process.exit(1);
    }
    const r = await runFullRestore(path.resolve(a), { safety: rows[0].n > 0, step });
    say(`Restored the backup made ${r.created_at}.${r.safety ? ` Safety backup: ${r.safety} (in BACKUP_DIR/safety).` : ''}`);
    say('Start (or restart) the app now.');
  }
  if (!encryptionOn() && cmd !== 'inspect') say('Note: BACKUP_KEY isn’t set, so backups made here are not encrypted.');
}

main().then(() => pool.end()).catch((e) => { process.stderr.write(`Failed: ${e.message}\n`); pool.end(); process.exit(1); });
