import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PIPELINE, devAssetsTag, sources } from '../scripts/lib/dev-assets.mjs';

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

test('the fetch and the deploy use the same release name', () => {
  assert.match(readFileSync('scripts/fetch-dev-assets.mjs', 'utf8'), /const TAG = devAssetsTag\(\);/);
  assert.match(readFileSync('.github/workflows/deploy.yml', 'utf8'), /m\.devAssetsTag\(\)/);
});
