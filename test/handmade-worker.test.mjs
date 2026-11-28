import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_DAY, LIMITS, LONGEST, PER_DAY, parseHandmade, postHandmade } from '../worker/handmade.mjs';
import { playerKey } from '../worker/results.mjs';
import { localD1 } from '../scripts/lib/d1.mjs';
import { dailySet, setId } from '../app/daily.mjs';
import worker from '../worker/index.mjs';
import { fixture } from './fixture.mjs';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const secret = (n) => n.toString(16).padStart(32, '0');
const slot = (n) => ({ target: `Område ${n}`, type: 'point', seed: 1 });
const good = {
  player: secret(1),
  slots: [...Array.from({ length: 9 }, (_, n) => slot(n)), { target: 'Kaféet', type: 'identify', seed: 4, at: [12.97, 55.585] }],
  notes: [{ target: 'Kaféet', what: 'add', text: '', at: [12.97, 55.585] }, { target: 'Gata 3', what: 'fix', text: 'Gränsen är fel.' }],
  name: 'Kim',
  title: 'Broarnas dag',
  remark: '',
};

let env;
const fresh = () => { env = { DB: localD1() }; };
const post = (body, now = NOW, method = 'POST') => postHandmade(new Request('http://x/api/handmade', { method, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined }), env, now);
const rows = () => env.DB.prepare('SELECT * FROM handmade ORDER BY id').all().then((r) => r.results);

test('a day sent in is a player, ten questions, the suggestions, a name, a title and a remark', () => {
  assert.deepEqual(parseHandmade(good), good);
  assert.deepEqual(parseHandmade({ ...good, name: ' Kim ', title: ' Broar ', remark: ' Hej ' }), { ...good, name: 'Kim', title: 'Broar', remark: 'Hej' });
  assert.deepEqual(parseHandmade({ ...good, name: undefined, title: undefined, remark: undefined }), { ...good, name: '', title: '', remark: '' });
  const extra = { ...good, slots: good.slots.map((s) => ({ ...s, q: 'built' })) };
  assert.deepEqual(parseHandmade(extra).slots, good.slots);
  assert.equal(parseHandmade({ ...good, remark: 'En rad.\nEn till.' }).remark, 'En rad.\nEn till.');
  for (const bad of [
    { ...good, player: 'short' },
    { ...good, player: undefined },
    { ...good, slots: good.slots.slice(1) },
    { ...good, slots: [...good.slots, slot(10)] },
    { ...good, slots: [{ ...slot(0), type: 'guess' }, ...good.slots.slice(1)] },
    { ...good, slots: [{ ...slot(0), type: ['point'] }, ...good.slots.slice(1)] },
    { ...good, slots: [{ ...slot(0), seed: 1.5 }, ...good.slots.slice(1)] },
    { ...good, slots: [{ ...slot(0), target: '' }, ...good.slots.slice(1)] },
    { ...good, slots: [{ ...slot(0), target: 'x'.repeat(LIMITS.target + 1) }, ...good.slots.slice(1)] },
    { ...good, slots: [{ ...slot(0), at: [12.97] }, ...good.slots.slice(1)] },
    { ...good, notes: [{ target: 'Gata 3', what: 'toString', text: '' }] },
    { ...good, notes: [{ target: 'Gata 3', what: 'fix' }] },
    { ...good, notes: [{ target: 'Gata 3', what: 'fix', text: 'x'.repeat(LIMITS.note + 1) }] },
    { ...good, notes: undefined },
    { ...good, name: 'x'.repeat(LIMITS.name + 1) },
    { ...good, remark: 'x'.repeat(LIMITS.remark + 1) },
    { ...good, name: 7 },
    { ...good, title: 'x'.repeat(LIMITS.title + 1) },
    { ...good, title: 'Broar\nBroar' },
    { ...good, title: 'Broar\u202e' },
    { ...good, name: 'Kim\u001b[8m' },
    { ...good, name: 'Kim\u202e' },
    { ...good, name: 'Kim\nKim' },
    { ...good, remark: 'Hej\u001b]52;c;eA==\u0007' },
    { ...good, slots: [{ ...slot(0), target: 'Område\u200b 0' }, ...good.slots.slice(1)] },
    { ...good, notes: [{ target: 'Gata 3', what: 'fix', text: '\u001b[2K\rbra' }] },
    { ...good, notes: Array.from({ length: LIMITS.notes + 1 }, () => ({ target: 'Gata 3', what: 'fix', text: '' })) },
    null,
  ]) assert.equal(parseHandmade(bad), null, JSON.stringify(bad)?.slice(0, 200));
});

test('a day sent in is stored under the player key, never the secret', async () => {
  fresh();
  const reply = await post(good);
  assert.equal(reply.status, 200);
  assert.deepEqual(await reply.json(), { ok: true });
  const [row] = await rows();
  assert.equal(row.player, await playerKey(secret(1)));
  assert.equal(row.at, NOW);
  assert.equal(row.name, 'Kim');
  assert.equal(row.title, 'Broarnas dag');
  assert.deepEqual(JSON.parse(row.slots), good.slots);
  assert.deepEqual(JSON.parse(row.notes), good.notes);
  assert.ok(!JSON.stringify(row).includes(secret(1)));
});

test('the sender is the same player their results are kept under', async () => {
  fresh();
  const items = fixture();
  const day = new Date().toISOString().slice(0, 10);
  env.ASSETS = { fetch: async () => Response.json({ items }) };
  const result = { day, set: setId(dailySet(items, day)), player: secret(1), scores: Array(10).fill(100) };
  await worker.fetch(new Request('http://x/api/result', { method: 'POST', body: JSON.stringify(result) }), env);
  await worker.fetch(new Request('http://x/api/handmade', { method: 'POST', body: JSON.stringify(good) }), env);
  await worker.fetch(new Request('http://x/api/handmade', { method: 'POST', body: JSON.stringify({ ...good, player: secret(2) }) }), env);
  const joined = await env.DB.prepare('SELECT h.name, r.total FROM handmade h JOIN results r USING (player)').all();
  assert.deepEqual(joined.results.map((r) => [r.name, r.total]), [['Kim', 1000]]);
});

test('what is not a day is refused, and nothing is stored', async () => {
  fresh();
  assert.equal((await post(good, NOW, 'GET')).status, 405);
  assert.equal((await post('{')).status, 400);
  assert.equal((await post({ ...good, slots: [] })).status, 400);
  assert.equal((await post({ ...good, remark: 'x'.repeat(LONGEST) })).status, 413);
  assert.equal((await post({ ...good, notes: Array.from({ length: LIMITS.notes }, () => ({ target: 'Gata 3', what: 'fix', text: 'å'.repeat(LIMITS.note) })) })).status, 413);
  assert.deepEqual(await rows(), []);
});

test('a player can send a few days a day, and more once a day has passed', async () => {
  fresh();
  for (let n = 0; n < PER_DAY; n++) assert.equal((await post(good, NOW + n)).status, 200);
  const refused = await post(good, NOW + PER_DAY);
  assert.equal(refused.status, 429);
  assert.deepEqual(await refused.json(), { error: 'many' });
  assert.equal((await post({ ...good, player: secret(2) }, NOW + PER_DAY)).status, 200);
  assert.equal((await post(good, NOW + 86400000)).status, 200);
  assert.equal((await rows()).length, PER_DAY + 2);
});

test('all players together can send only so many days a day', async () => {
  fresh();
  for (let n = 0; n < ALL_DAY; n++) assert.equal((await post({ ...good, player: secret(n + 1) }, NOW + n)).status, 200);
  assert.equal((await post({ ...good, player: secret(ALL_DAY + 1) }, NOW + ALL_DAY)).status, 429);
  assert.equal((await post({ ...good, player: secret(ALL_DAY + 1) }, NOW + 86400000 + ALL_DAY)).status, 200);
});
