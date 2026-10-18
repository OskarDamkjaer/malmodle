import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const UNHASHED = new Set(['sw.js', 'malmo.pmtiles']);
const CODE = "const CODE = 'malmo-code';";
const MAP = "const MAP = 'malmo-map';";

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = join(dir, entry.name);
    return entry.isDirectory() ? files(p) : [p];
  });
}

export function codeHash(dir) {
  const hash = createHash('sha256');
  for (const file of files(dir).map((p) => relative(dir, p).split(sep).join('/')).sort()) {
    if (UNHASHED.has(file)) continue;
    hash.update(`${file}\0`).update(readFileSync(join(dir, file))).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

export function mapHash(dir) {
  return createHash('sha256').update(readFileSync(join(dir, 'malmo.pmtiles'))).digest('hex').slice(0, 12);
}

export function stampWorker(source, code, map) {
  for (const line of [CODE, MAP]) if (!source.includes(line)) throw new Error(`sw.js has no ${line}`);
  return source
    .replace(CODE, `const CODE = 'malmo-code-${code}';`)
    .replace(MAP, `const MAP = 'malmo-map-${map}';`);
}
