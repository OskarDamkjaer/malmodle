import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIN, binOf, bins, placing, spread } from '../app/scores.mjs';
import worker, { plausibleDay, validTotal } from '../worker/worker.js';

test('totals fall into bins of equal width, a full score in the last', () => {
  const counts = bins([[0, 2], [49, 1], [50, 3], [999, 1], [1000, 4]], 1000);
  assert.equal(counts.length, 1000 / BIN);
  assert.equal(counts[0], 3);
  assert.equal(counts[1], 3);
  assert.equal(counts.at(-1), 5);
  assert.equal(binOf(1000, 1000), counts.length - 1);
  assert.equal(binOf(120, 1000), 2);
});

test('the placing counts only lower totals and leaves out a counted player', () => {
  const counts = [[300, 2], [500, 3], [700, 5]];
  assert.deepEqual(placing(counts, 500, true), { others: 9, beaten: 22 });
  assert.deepEqual(placing(counts, 500, false), { others: 10, beaten: 20 });
  assert.deepEqual(placing([[500, 1]], 500, true), { others: 0, beaten: 0 });
});

test('without an address nothing is sent', async () => {
  assert.equal(await spread('2026-10-11', 500, ''), null);
});

test('a day is accepted only near the present', () => {
  const now = Date.parse('2026-10-11T08:00:00Z');
  assert.ok(plausibleDay('2026-10-11', now));
  assert.ok(plausibleDay('2026-10-10', now));
  assert.ok(plausibleDay('2026-10-12', now));
  assert.ok(!plausibleDay('2026-10-14', now));
  assert.ok(!plausibleDay('2026-1-11', now));
  assert.ok(!plausibleDay(20261011, now));
});

test('a total is a whole number from 0 to 1000', () => {
  assert.ok(validTotal(0));
  assert.ok(validTotal(1000));
  assert.ok(!validTotal(1001));
  assert.ok(!validTotal(-1));
  assert.ok(!validTotal(500.5));
  assert.ok(!validTotal('500'));
});

function fakeDB() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              const k = `${args[0]}|${args[1]}`;
              rows.set(k, (rows.get(k) ?? 0) + 1);
            },
            async all() {
              const results = [...rows]
                .map(([k, n]) => { const [day, total] = k.split('|'); return { day, total: Number(total), n }; })
                .filter((r) => r.day === args[0])
                .sort((a, b) => a.total - b.total)
                .map(({ total, n }) => ({ total, n }));
              return { results, sql };
            },
          };
        },
      };
    },
  };
}

const ORIGIN = 'https://malmoe.damk.eu';
const today = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const post = (body) => new Request('https://w.example/scores', {
  method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('the worker counts posted totals and returns the day', async () => {
  const env = { DB: fakeDB(), ORIGINS: ORIGIN };
  const day = today();
  await worker.fetch(post({ day, total: 640 }), env);
  const res = await worker.fetch(post({ day, total: 640 }), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepEqual(await res.json(), { day, counts: [[640, 2]] });

  const got = await worker.fetch(new Request(`https://w.example/scores?day=${day}`, { headers: { Origin: ORIGIN } }), env);
  assert.deepEqual((await got.json()).counts, [[640, 2]]);
});

test('the worker turns away bad scores and other origins', async () => {
  const env = { DB: fakeDB(), ORIGINS: ORIGIN };
  assert.equal((await worker.fetch(post({ day: today(), total: 5000 }), env)).status, 400);
  assert.equal((await worker.fetch(post({ day: '1999-01-01', total: 10 }), env)).status, 400);
  assert.equal(env.DB.rows.size, 0);
  const other = await worker.fetch(new Request('https://w.example/scores', { method: 'OPTIONS', headers: { Origin: 'https://elsewhere.example' } }), env);
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
});
