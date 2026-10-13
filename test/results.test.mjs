import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BINS, parseResult, playerKey, summarize } from '../worker/results.mjs';
import { localD1 } from '../scripts/lib/d1.mjs';
import worker from '../worker/index.mjs';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const secret = (n) => n.toString(16).padStart(32, '0');
const good = { day: '2026-10-13', set: 'a1b2c3d4', player: secret(1), scores: [100, 80, 0, 50, 100, 100, 20, 90, 60, 100] };

test('a result is a day near today, a set, a player and up to ten scores', () => {
  assert.deepEqual(parseResult(good, NOW), good);
  assert.ok(parseResult({ ...good, day: '2026-10-12' }, NOW));
  assert.ok(parseResult({ ...good, day: '2026-10-14' }, NOW));
  for (const bad of [
    { ...good, day: '2026-10-15' },
    { ...good, day: '13 oktober' },
    { ...good, set: 'not hex' },
    { ...good, player: 'short' },
    { ...good, scores: [] },
    { ...good, scores: [...good.scores, 100] },
    { ...good, scores: [101] },
    { ...good, scores: [12.5] },
    null,
  ]) assert.equal(parseResult(bad, NOW), null, JSON.stringify(bad));
});

test('the summary counts totals in bins, who is below you and who cleared each question', () => {
  const rows = [
    { total: 0, scores: [0, 0] },
    { total: 180, scores: [100, 80] },
    { total: 1000, scores: [100, 79] },
    { total: 500, scores: [50, 100] },
  ];
  const s = summarize(rows, { total: 500, scores: [50, 100] });
  assert.equal(s.players, 4);
  assert.equal(s.histogram.length, BINS);
  assert.equal(s.histogram.reduce((a, b) => a + b, 0), 4);
  assert.equal(s.histogram[BINS - 1], 1);
  assert.equal(s.you.below, 2);
  assert.deepEqual(s.cleared, [0.5, 0.5]);
});

test('the player is stored as a hash of the secret', async () => {
  const key = await playerKey(secret(1));
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.notEqual(key, secret(1));
  assert.equal(key, await playerKey(secret(1)));
});

const post = (body) => worker.fetch(new Request('http://x/api/result', { method: 'POST', body: JSON.stringify(body) }), { DB: db });
let db;

test('the first result of the day counts, and replays return it', async (t) => {
  db = localD1();
  const today = new Date().toISOString().slice(0, 10);
  const first = await (await post({ ...good, day: today })).json();
  assert.equal(first.players, 1);
  assert.equal(first.you.total, 700);

  const again = await (await post({ ...good, day: today, scores: Array(10).fill(0) })).json();
  assert.equal(again.players, 1);
  assert.equal(again.you.total, 700);

  await post({ ...good, day: today, player: secret(2), scores: Array(10).fill(0) });
  await post({ ...good, day: today, player: secret(3), set: 'ffff', scores: Array(10).fill(100) });
  const third = await (await post({ ...good, day: today })).json();
  assert.equal(third.players, 2, 'a different set is counted apart');
  assert.equal(third.you.below, 1);
});

test('the API refuses what it cannot read', async () => {
  db = localD1();
  assert.equal((await post({ ...good, day: '1999-01-01' })).status, 400);
  assert.equal((await worker.fetch(new Request('http://x/api/result'), { DB: db })).status, 405);
  assert.equal((await worker.fetch(new Request('http://x/api/other'), { DB: db })).status, 404);
  const huge = await worker.fetch(new Request('http://x/api/result', { method: 'POST', body: 'x'.repeat(5000) }), { DB: db });
  assert.equal(huge.status, 413);
});
