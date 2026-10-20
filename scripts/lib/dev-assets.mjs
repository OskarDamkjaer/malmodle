import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

export const PIPELINE = [
  'scripts/build-basemap.sh',
  'scripts/build-districts.mjs',
  'scripts/build-streets.mjs',
  'scripts/build-shapes.mjs',
];

const MADE = /^(data|build|tools)\//;
const IMPORT = /from '(\.{1,2}\/[^']+)'/g;
const PATH = /(?:^|[\s'"`(=:,])(?:\.\/)?([a-z][\w-]*\/[\w./-]+\.\w+)/gm;

export function sources() {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const [, rel] of text.matchAll(IMPORT)) visit(normalize(join(dirname(file), rel)));
    for (const [, path] of text.matchAll(PATH)) if (!MADE.test(path) && existsSync(path)) visit(path);
  };
  PIPELINE.forEach(visit);
  return [...seen].sort();
}

export function devAssetsTag() {
  const hash = createHash('sha256');
  for (const file of sources()) hash.update(`${file}\0`).update(readFileSync(file)).update('\0');
  return `dev-assets-${hash.digest('hex').slice(0, 12)}`;
}
