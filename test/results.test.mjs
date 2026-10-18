import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResult, playerKey, postResult } from '../worker/results.mjs';
import { catchUp, fileKey } from '../worker/live.mjs';
import { localR2 } from '../scripts/lib/r2.mjs';
import { summarize, tally } from '../app/crowd.mjs';
import { localD1 } from '../scripts/lib/d1.mjs';
import worker from '../worker/index.mjs';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const secret = (n) => n.toString(16).padStart(32, '0');
const good = { day: '2026-10-13', set: 'a1b2c3d4', player: secret(1), scores: [100, 80, 0, 50, 100, 100, 20, 90, 60, 100] };

test('a result is a day near today, a set, a player and ten scores', () => {
  assert.deepEqual(parseResult(good, NOW), good);
  assert.ok(parseResult({ ...good, day: '2026-10-12' }, NOW));
  assert.ok(parseResult({ ...good, day: '2026-10-14' }, NOW));
  for (const bad of [
    { ...good, day: '2026-10-15' },
    { ...good, day: '13 oktober' },
    { ...good, set: 'not hex' },
    { ...good, player: 'short' },
    { ...good, scores: [] },
    { ...good, scores: good.scores.slice(1) },
    { ...good, scores: [...good.scores, 100] },
    { ...good, scores: [101] },
    { ...good, scores: [12.5] },
    null,
  ]) assert.equal(parseResult(bad, NOW), null, JSON.stringify(bad));
});

test('the player is stored as a hash of the secret', async () => {
  const key = await playerKey(secret(1));
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.notEqual(key, secret(1));
  assert.equal(key, await playerKey(secret(1)));
});

let env;
const post = (body) => worker.fetch(new Request('http://x/api/result', { method: 'POST', body: JSON.stringify(body) }), env);
const postAt = (now, body) => postResult(new Request('http://x/api/result', { method: 'POST', body: JSON.stringify(body) }), env, null, now);
const fresh = () => { env = { DB: localD1(), LIVE: localR2(), LIVE_URL: 'https://data.example' }; };
const file = async (set = good.set) => JSON.parse((await env.LIVE.get(fileKey(good.day, set)))?.body ?? 'null');

test('the first result of the day counts, and replays return it', async () => {
  fresh();
  const today = new Date().toISOString().slice(0, 10);
  const first = await (await post({ ...good, day: today })).json();
  assert.equal(first.day.players, 1);
  assert.equal(first.you.total, 700);
  assert.deepEqual(first.you.scores, good.scores);

  const again = await (await post({ ...good, day: today, scores: Array(10).fill(0) })).json();
  assert.equal(again.day.players, 1);
  assert.equal(again.you.total, 700);

  await post({ ...good, day: today, player: secret(2), scores: Array(10).fill(0) });
  await post({ ...good, day: today, player: secret(3), set: 'ffff', scores: Array(10).fill(100) });
  const third = await (await post({ ...good, day: today })).json();
  assert.equal(third.day.players, 2, 'a different set is counted apart');
  assert.equal(summarize(third.day, third.you).you.below, 1);
});

test('the day keeps a running count that matches the stored results', async () => {
  fresh();
  const rows = [];
  for (let p = 1; p <= 30; p++) {
    const scores = good.scores.map((s, i) => (s * p + i * 7) % 101);
    rows.push({ total: scores.reduce((a, b) => a + b, 0), scores });
    await postAt(NOW + p, { ...good, player: secret(p), scores });
  }
  await postAt(NOW + 99, { ...good, player: secret(1), scores: Array(10).fill(0) });
  const { day } = await (await postAt(NOW + 100, { ...good, player: secret(5) })).json();
  const want = tally(rows);
  assert.equal(day.players, 30);
  assert.deepEqual(day.totals, JSON.parse(JSON.stringify(want.totals)));
  assert.deepEqual(day.questions, JSON.parse(JSON.stringify(want.questions)));
  assert.equal(day.finished, null, 'finish times are only listed while fewer than ten have played');
});

test('the day is written as a file at most every 15 seconds, and the cron catches up', async () => {
  fresh();
  const one = await (await postAt(NOW, good)).json();
  assert.equal(one.poll, `https://data.example/${good.day}/${good.set}.json`);
  const written = await env.LIVE.get(fileKey(good.day, good.set));
  assert.equal(written.httpMetadata.cacheControl, 'public, max-age=15');
  assert.deepEqual(JSON.parse(written.body), one.day);
  assert.deepEqual(one.day.finished, [NOW]);

  const two = await (await postAt(NOW + 5000, { ...good, player: secret(2) })).json();
  assert.equal(two.day.players, 2, 'the answer is fresh');
  assert.equal((await file()).players, 1, 'the file waits');

  await catchUp(env, NOW + 10000);
  assert.equal((await file()).players, 1, 'the cron waits too');
  await catchUp(env, NOW + 60000);
  assert.equal((await file()).players, 2);
  assert.deepEqual((await file()).finished, [NOW, NOW + 5000]);

  await postAt(NOW + 80000, { ...good, player: secret(3) });
  assert.equal((await file()).players, 3, 'after the gap a post writes at once');
});

test('a failed write is tried again by the cron', async () => {
  fresh();
  const put = env.LIVE.put;
  env.LIVE.put = async () => { throw new Error('down'); };
  await postAt(NOW, good);
  assert.equal(await file(), null);
  env.LIVE.put = put;
  await catchUp(env, NOW + 60000);
  assert.equal((await file()).players, 1);
});

test('without a bucket the result is still stored and answered, with nothing to poll', async () => {
  fresh();
  delete env.LIVE;
  const reply = await (await postAt(NOW, good)).json();
  assert.equal(reply.day.players, 1);
  assert.equal(reply.poll, null);
});

test('the API refuses what it cannot read', async () => {
  fresh();
  assert.equal((await post({ ...good, day: '1999-01-01' })).status, 400);
  assert.equal((await worker.fetch(new Request('http://x/api/result'), env)).status, 405);
  assert.equal((await worker.fetch(new Request('http://x/api/other'), env)).status, 404);
  const huge = await worker.fetch(new Request('http://x/api/result', { method: 'POST', body: 'x'.repeat(5000) }), env);
  assert.equal(huge.status, 413);
});
