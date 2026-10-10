import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIX, dailySet, dateKey, hash, random, shareText, square } from '../app/daily.mjs';
import { MAX_SCORE, TYPES } from '../app/questions.mjs';
import { metersBetween } from '../app/geo.mjs';
import { fixture } from './fixture.mjs';

const items = fixture();
const days = Array.from({ length: 60 }, (_, i) => dateKey(new Date(2027, 0, 1 + i)));

test('the date key is the local calendar day', () => {
  assert.equal(dateKey(new Date(2026, 9, 10, 23, 59)), '2026-10-10');
  assert.equal(dateKey(new Date(2026, 0, 2, 0, 1)), '2026-01-02');
});

test('the seed is stable', () => {
  assert.equal(hash('malmo:2026-10-10'), hash('malmo:2026-10-10'));
  assert.notEqual(hash('malmo:2026-10-10'), hash('malmo:2026-10-11'));
  const a = random(42);
  const b = random(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});

test('the same day gives the same set', () => {
  const describe = (set) => set.map((q) => `${q.type}:${q.target.name}:${q.options?.join(',') ?? ''}`);
  assert.deepEqual(describe(dailySet(items, '2026-10-10')), describe(dailySet(items, '2026-10-10')));
});

test('different days give different sets', () => {
  const firsts = new Set(days.map((d) => dailySet(items, d).map((q) => q.target.name).join()));
  assert.equal(firsts.size, days.length);
});

test('a set is mostly pointing, starts with it, and has one special', () => {
  for (const day of days) {
    const set = dailySet(items, day);
    assert.equal(set.length, MIX.length);
    assert.equal(TYPES[set[0].type].input, 'map');
    const count = (...types) => set.filter((q) => types.includes(q.type)).length;
    assert.ok(count('point', 'area') > count('identify'));
    assert.equal(count('nearest', 'neighbour'), 1);
  }
});

test('every day asks to point at at least two areas', () => {
  for (const day of days) {
    const pointing = dailySet(items, day).filter((q) => TYPES[q.type].input === 'map');
    assert.ok(pointing.filter((q) => q.target.kind === 'area').length >= 2, day);
  }
});

test('both specials turn up', () => {
  const seen = new Set(days.flatMap((d) => dailySet(items, d).map((q) => q.type)));
  assert.ok(seen.has('nearest') && seen.has('neighbour'));
});

test('no target is asked twice in a day', () => {
  for (const day of days) {
    const names = dailySet(items, day).map((q) => q.target.name);
    assert.equal(new Set(names).size, names.length);
  }
});

test('choice questions offer the answer once', () => {
  for (const day of days) {
    for (const q of dailySet(items, day)) {
      if (TYPES[q.type].input !== 'choice') continue;
      const right = q.target.name;
      assert.equal(q.options.filter((o) => o === right).length, 1);
      assert.equal(new Set(q.options).size, q.options.length);
    }
  }
});

test('identify offers things of the same kind', () => {
  for (const day of days) {
    for (const q of dailySet(items, day).filter((x) => x.type === 'identify')) {
      for (const name of q.options) assert.equal(items.find((it) => it.name === name).kind, q.target.kind);
    }
  }
});

test('the nearest answer is clearly the nearest', () => {
  for (const day of days) {
    for (const q of dailySet(items, day).filter((x) => x.type === 'nearest')) {
      const d = (name) => metersBetween(items.find((it) => it.name === name).point, q.anchor.point);
      const answer = d(q.target.name);
      for (const name of q.options) if (name !== q.target.name) assert.ok(d(name) > answer * 1.5);
    }
  }
});

test('the neighbour answer is the one area on that side, and no decoy is on that side', () => {
  for (const day of days) {
    for (const q of dailySet(items, day).filter((x) => x.type === 'neighbour')) {
      assert.equal(q.from.beside[q.side], q.target.name);
      for (const name of q.options) {
        if (name === q.target.name) continue;
        assert.notEqual(q.from.beside[q.side], name);
        assert.notEqual(name, q.from.name);
      }
    }
  }
});

test('the shared result is the day, the score and a square per question', () => {
  const text = shareText({ key: '2026-10-10', scores: [100, 50, 0], url: 'https://example.org' });
  assert.equal(text, `Lär dig Malmö 2026-10-10\n150/${3 * MAX_SCORE}\n🟩🟨🟥\nhttps://example.org`);
  assert.equal(square(80), '🟩');
  assert.equal(square(79), '🟨');
  assert.equal(square(39), '🟥');
});
