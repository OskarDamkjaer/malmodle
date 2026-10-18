import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResult, playerKey, postResult } from '../worker/results.mjs';
import { catchUp, fileKey } from '../worker/live.mjs';
import { localR2 } from '../scripts/lib/r2.mjs';
import { FEWEST_TO_RANK, summarize, tally } from '../app/crowd.mjs';
import { localD1 } from '../scripts/lib/d1.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
const postAt = (now, body, ctx = null) => postResult(new Request('http://x/api/result', { method: 'POST', body: JSON.stringify(body) }), env, ctx, now);
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

test('finish times are kept while fewer than ten have played, and a repeat is not one', async () => {
  fresh();
  const times = [];
  for (let p = 1; p <= FEWEST_TO_RANK + 2; p++) {
    const at = NOW + p * 1000;
    const { day } = await (await postAt(at, { ...good, player: secret(p) })).json();
    if (p < FEWEST_TO_RANK) times.push(at);
    if (p < FEWEST_TO_RANK) assert.deepEqual(day.finished, times);
    else assert.equal(day.finished, null);
    if (p === 1) {
      const again = await (await postAt(at + 500, { ...good, player: secret(1) })).json();
      assert.equal(again.day.players, 1);
      assert.deepEqual(again.day.finished, [at]);
    }
  }
  const row = await env.DB.prepare('SELECT players, finished FROM days').first();
  assert.equal(row.players, FEWEST_TO_RANK + 2);
  assert.equal(JSON.parse(row.finished).length, FEWEST_TO_RANK);
});

test('the threshold in the trigger is the one the client ranks by', () => {
  const dir = 'worker/migrations';
  const last = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .filter((sql) => sql.includes('CREATE TRIGGER results_count')).at(-1);
  const numbers = [...last.matchAll(/players < (\d+)/g)].map((m) => Number(m[1]));
  assert.ok(numbers.length >= 2);
  for (const n of numbers) assert.equal(n, FEWEST_TO_RANK);
});

test('the migrations carry an existing database over with its results and counts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'malmodle-'));
  const path = join(dir, 'd1.sqlite');
  const old = new DatabaseSync(path);
  for (const file of ['0001_results.sql', '0002_days.sql']) old.exec(readFileSync(join('worker/migrations', file), 'utf8'));
  const insert = old.prepare('INSERT INTO results (day, player, set_id, total, scores, at) VALUES (?, ?, ?, ?, ?, ?)');
  const scores = JSON.stringify(good.scores);
  for (const [p, at] of [[1, NOW + 30], [2, NOW + 10], [3, NOW + 20]]) insert.run(good.day, `a${p}`, good.set, 700, scores, at);
  for (let p = 1; p <= FEWEST_TO_RANK + 1; p++) insert.run(good.day, `b${p}`, 'ffff', 700, scores, NOW + p);
  const before = old.prepare('SELECT day, set_id, players, totals, questions FROM days ORDER BY set_id').all();
  old.close();

  try {
    env = { DB: localD1(path), LIVE: localR2(), LIVE_URL: 'https://data.example' };
    const db = env.DB;
    assert.equal((await db.prepare('SELECT count(*) AS n FROM results').first()).n, 3 + FEWEST_TO_RANK + 1);
    const after = (await db.prepare('SELECT day, set_id, players, totals, questions, finished FROM days ORDER BY set_id').all()).results;
    assert.deepEqual(after.map(({ finished, ...rest }) => ({ ...rest })), before.map((r) => ({ ...r })));
    assert.deepEqual(JSON.parse(after.find((r) => r.set_id === good.set).finished), [NOW + 10, NOW + 20, NOW + 30]);
    const schema = (await db.prepare("SELECT name, sql FROM sqlite_master WHERE tbl_name = 'results'").all()).results;
    assert.deepEqual(schema.map((r) => r.name).sort(), ['results', 'results_count']);
    assert.match(schema.find((r) => r.name === 'results').sql, /WITHOUT ROWID/);

    const { day } = await (await postAt(NOW + 40, { ...good, player: secret(4) })).json();
    assert.equal(day.players, 4);
    assert.deepEqual(day.finished, [NOW + 10, NOW + 20, NOW + 30, NOW + 40]);
    const other = await (await postAt(NOW + 50, { ...good, set: 'ffff', player: secret(5) })).json();
    assert.equal(other.day.players, FEWEST_TO_RANK + 2);
    assert.equal(other.day.finished, null);

    const again = localD1(path);
    assert.equal((await again.prepare('SELECT count(*) AS n FROM results').first()).n, 3 + FEWEST_TO_RANK + 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function counted(db) {
  const outside = [];
  const wrap = (statement) => ({
    ...statement,
    bind: (...values) => wrap(statement.bind(...values)),
    first: () => { outside.push(statement.sql); return statement.first(); },
    all: () => { outside.push(statement.sql); return statement.all(); },
    run: () => { outside.push(statement.sql); return statement.run(); },
  });
  let batches = 0;
  return {
    outside,
    batches: () => batches,
    db: { prepare: (sql) => wrap(db.prepare(sql)), batch: (statements) => { batches++; return db.batch(statements); } },
  };
}

test('a post asks the database once', async () => {
  for (const live of [true, false]) {
    fresh();
    if (!live) delete env.LIVE;
    const count = counted(env.DB);
    env.DB = count.db;
    await postAt(NOW, good);
    await postAt(NOW + 1, good);
    await postAt(NOW + 30000, { ...good, player: secret(2) });
    assert.deepEqual(count.outside, []);
    assert.equal(count.batches(), 3);
  }
});

test('a replay from another set answers with the set it first played', async () => {
  fresh();
  await postAt(NOW, good);
  const again = await (await postAt(NOW + 30000, { ...good, set: 'ffff', scores: Array(10).fill(0) })).json();
  assert.equal(again.day.set, good.set);
  assert.equal(again.day.players, 1);
  assert.equal(again.you.total, 700);
  assert.equal(again.poll, `https://data.example/${good.day}/${good.set}.json`);
  assert.equal(await file('ffff'), null);
});

test('a batch that fails takes its insert back with it', async () => {
  fresh();
  const db = env.DB;
  const insert = db.prepare('INSERT INTO results (day, player, set_id, total, scores, at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(good.day, 'p', good.set, 700, JSON.stringify(good.scores), NOW);
  await assert.rejects(db.batch([insert, db.prepare('SELECT 1'), insert]), /UNIQUE/);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM results').first()).n, 0);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM days').first()).n, 0);

  const [stored, row, claimed] = await db.batch([insert, db.prepare('SELECT players FROM days'),
    db.prepare('UPDATE days SET written = 1 RETURNING written')]);
  assert.equal(stored.success, true);
  assert.equal(stored.meta.changes, 1);
  assert.deepEqual(row.results.map((r) => ({ ...r })), [{ players: 1 }]);
  assert.deepEqual(claimed.results.map((r) => ({ ...r })), [{ written: 1 }]);
});

test('a slow write never replaces a newer file', async () => {
  fresh();
  const put = env.LIVE.put;
  let release;
  const held = new Promise((r) => { release = r; });
  env.LIVE.put = async (...args) => { await held; return put(...args); };
  const writes = [];
  await postAt(NOW, good, { waitUntil: (p) => writes.push(p) });
  env.LIVE.put = put;
  await postAt(NOW + 20000, { ...good, player: secret(2) });
  assert.equal((await file()).players, 2);
  release();
  await Promise.all(writes);
  assert.equal((await file()).players, 2);
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
