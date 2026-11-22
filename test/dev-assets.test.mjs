import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PIPELINE, PROSE, devAssetsTag, read, sources } from '../scripts/lib/dev-assets.mjs';

test('the map data release covers every step of the deploy that builds it', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  const steps = workflow.slice(workflow.indexOf('Build the map data'), workflow.indexOf('Publish the map data'));
  const run = [...steps.matchAll(/scripts\/[\w-]+\.(?:mjs|sh)/g)].map(([path]) => path).filter((p) => p !== 'scripts/build-quiz.mjs');
  assert.deepEqual([...new Set(run)].sort(), [...PIPELINE].sort());
});

test('the map data release is named after what the pipeline reads', () => {
  const read = sources();
  for (const file of [...PIPELINE, 'places/places.json', 'learn/bridges.json', 'config/bbox.json', 'app/geo.mjs', 'scripts/lib/geo.mjs']) {
    assert.ok(read.includes(file), file);
  }
  assert.ok(!read.some((file) => /^(data|build)\//.test(file)));
  assert.match(devAssetsTag(), /^dev-assets-[0-9a-f]{12}$/);
});

test('a new description or link leaves the map data release as it is, and a new shape does not', () => {
  const place = { name: 'Kaféet', osm: ['node/1'], lat: 55.6, lon: 13, description: 'Ett kafé.', source: 'https://example.org', verified: true, why: 'Known.' };
  const doc = (p) => JSON.stringify({ places: [p] }, null, 1);
  assert.equal(read('places.json', doc({ ...place, description: 'Ett annat kafé.', source: null, verified: false, why: '' })), read('places.json', doc(place)));
  assert.notEqual(read('places.json', doc({ ...place, osm: ['node/2'] })), read('places.json', doc(place)));
  assert.notEqual(read('places.json', doc({ ...place, lat: 55.7 })), read('places.json', doc(place)));
  assert.equal(read('build.mjs', 'const description = 1;'), 'const description = 1;');
  for (const script of PIPELINE.filter((p) => p.endsWith('.mjs'))) {
    const text = readFileSync(script, 'utf8');
    for (const field of PROSE) assert.doesNotMatch(text, new RegExp(`\\b${field}\\b`), `${script} reads ${field}`);
  }
});

test('the fetch and the deploy use the same release name', () => {
  assert.match(readFileSync('scripts/fetch-dev-assets.mjs', 'utf8'), /const TAG = devAssetsTag\(\);/);
  assert.match(readFileSync('.github/workflows/deploy.yml', 'utf8'), /m\.devAssetsTag\(\)/);
});

test('an unquoted path in a pipeline script counts as an input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-assets-'));
  mkdirSync(join(dir, 'scripts/lib'), { recursive: true });
  mkdirSync(join(dir, 'config'));
  for (const file of ['scripts/build-districts.mjs', 'scripts/build-streets.mjs', 'scripts/build-shapes.mjs']) writeFileSync(join(dir, file), '');
  writeFileSync(join(dir, 'scripts/build-basemap.sh'), 'STYLE=config/layers.yml\n');
  writeFileSync(join(dir, 'config/layers.yml'), 'x');
  const script = `import('${join(process.cwd(), 'scripts/lib/dev-assets.mjs')}').then((m) => console.log(JSON.stringify(m.sources())))`;
  const found = JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: dir, encoding: 'utf8' }));
  assert.ok(found.includes('config/layers.yml'), found.join(', '));
});
