import { cpSync, existsSync, mkdirSync, rmSync, statSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { MOUNTS } from './lib/site.mjs';
import { codeHash, stampWorker } from './lib/stamp.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = arg('--out', 'build/site');

const missing = MOUNTS.map((m) => m.file ?? m.dir).filter((p) => !existsSync(p));
if (missing.length) {
  console.error('FATAL: nothing to copy from:');
  for (const p of missing) console.error(`  ${p}`);
  console.error('\nBuild the data and assets first (see README).');
  process.exit(1);
}

const tmp = `${out}.tmp`;
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

for (const m of MOUNTS) {
  const rel = m.url.replace(/^\/+/, '').replace(/\/+$/, '');
  const dest = rel ? join(tmp, rel) : tmp;
  if (m.page) {
    mkdirSync(dest, { recursive: true });
    cpSync(m.file, join(dest, 'index.html'));
  } else if (m.file) {
    mkdirSync(resolve(dest, '..'), { recursive: true });
    cpSync(m.file, dest);
  } else {
    cpSync(m.dir, dest, { recursive: true });
  }
}

const worker = join(tmp, 'sw.js');
const hash = codeHash(tmp);
writeFileSync(worker, stampWorker(readFileSync(worker, 'utf8'), hash));

rmSync(out, { recursive: true, force: true });
cpSync(tmp, out, { recursive: true });
rmSync(tmp, { recursive: true, force: true });

let bytes = 0;
let files = 0;
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else { bytes += statSync(p).size; files++; }
  }
}(out));

console.log(`-> ${out}   ${files} files, ${(bytes / 1048576).toFixed(1)} MB, code ${hash}`);
console.log('   upload as-is. Requirements: HTTPS, and HTTP Range support for .pmtiles.');
