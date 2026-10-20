#!/usr/bin/env node
// Checks that docs/design/DESIGN.md keeps up with the code: every migration, every environment
// variable the server or compose file reads, every server module and every record type must be
// mentioned. Runs in `npm run build` (and so in the Docker build). See DESIGN.md §20.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECORD_TYPES } from '../shared/catalog.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const doc = read('docs/design/DESIGN.md');
const missing = [];
const need = (what, name, token = name) => { if (!doc.includes(token)) missing.push(`${what} ${name}`); };

for (const f of fs.readdirSync(path.join(root, 'server/migrations')).filter((f) => f.endsWith('.sql')).sort()) need('migration', f, `\`${f}\``);

const srcDir = path.join(root, 'server/src');
const env = new Set();
for (const f of fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'))) {
  need('server module', `server/src/${f}`, f);
  for (const m of fs.readFileSync(path.join(srcDir, f), 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)) env.add(m[1]);
}
for (const m of read('docker-compose.yml').matchAll(/\$\{([A-Z0-9_]+)/g)) env.add(m[1]);
for (const v of [...env].sort()) need('environment variable', v, `\`${v}\``);

for (const t of RECORD_TYPES) need('record type', t, `\`${t}\``);

const last = fs.readdirSync(path.join(root, 'server/migrations')).filter((f) => f.endsWith('.sql')).sort().pop();
if (!new RegExp(`Last schema migration \\| \`${last.replace('.', '\\.')}\``).test(doc)) missing.push(`header "Last schema migration" should be ${last}`);

if (missing.length) {
  console.error(`Design document check: docs/design/DESIGN.md is behind the code:\n  - ${missing.join('\n  - ')}`);
  console.error('Update the design document (see its section 20) in the same change.');
  process.exit(1);
}
console.log(`Design document check: ${env.size} environment variables, ${RECORD_TYPES.length} record types, migrations up to ${last} — all documented.`);
