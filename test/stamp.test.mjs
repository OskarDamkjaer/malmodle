import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codeHash, mapHash, stampWorker } from '../scripts/lib/stamp.mjs';

test('the code cache is named after every built file but the worker and the map', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stamp-'));
  mkdirSync(join(dir, 'data'));
  writeFileSync(join(dir, 'app.js'), 'a');
  writeFileSync(join(dir, 'data', 'quiz.json'), '{}');
  writeFileSync(join(dir, 'sw.js'), 'x');
  writeFileSync(join(dir, 'malmo.pmtiles'), 'm');
  const first = codeHash(dir);
  assert.match(first, /^[0-9a-f]{12}$/);
  writeFileSync(join(dir, 'sw.js'), 'y');
  writeFileSync(join(dir, 'malmo.pmtiles'), 'n');
  assert.equal(codeHash(dir), first);
  writeFileSync(join(dir, 'data', 'quiz.json'), '{"items":[]}');
  assert.notEqual(codeHash(dir), first);
});

test('the map cache is named after the map alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stamp-'));
  writeFileSync(join(dir, 'app.js'), 'a');
  writeFileSync(join(dir, 'malmo.pmtiles'), 'm');
  const first = mapHash(dir);
  assert.match(first, /^[0-9a-f]{12}$/);
  writeFileSync(join(dir, 'app.js'), 'b');
  assert.equal(mapHash(dir), first);
  writeFileSync(join(dir, 'malmo.pmtiles'), 'n');
  assert.notEqual(mapHash(dir), first);
});

test('the worker in the repo carries the name the build replaces', () => {
  const stamped = stampWorker(readFileSync('app/sw.js', 'utf8'), 'abc123abc123', 'def456def456');
  assert.match(stamped, /^const CODE = 'malmo-code-abc123abc123';$/m);
  assert.match(stamped, /^const MAP = 'malmo-map-def456def456';$/m);
  assert.throws(() => stampWorker("const CODE = 'malmo-code';\nconst MAP = 'malmo-map-2';", 'abc123abc123', 'def456def456'));
});
