import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, GROUP, SET_SIZE, SPLITS, dailySet, dateKey, hash, plan, random, shareText, square } from '../app/daily.mjs';
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

test('a set is at least half pointing', () => {
  for (const day of days) {
    const set = dailySet(items, day);
    assert.equal(set.length, SET_SIZE);
    const count = (...types) => set.filter((q) => types.includes(q.type)).length;
    assert.ok(count('point') >= count('identify', 'neighbour', 'route'));
  }
});

test('each kind keeps to its share of question types', () => {
  for (let i = 0; i < 500; i++) {
    const slots = plan(random(i));
    const of = (group, type) => slots.filter((x) => x.group === group && x.type === type).length;
    assert.ok(of('area', 'point') >= 1 && of('area', 'point') <= 3);
    assert.ok(of('area', 'identify') >= 1 && of('area', 'identify') <= 2);
    assert.ok(of('area', 'neighbour') <= 1);
    assert.ok(of('street', 'point') >= 1 && of('street', 'identify') <= 2 && of('street', 'route') <= 1);
    const places = slots.filter((x) => x.group === 'place').length;
    assert.ok(of('place', 'identify') >= 1 && of('place', 'identify') <= Math.ceil(places / 3));
    assert.equal(slots.filter((x) => x.group === 'place').length, of('place', 'point') + of('place', 'identify'));
  }
});

test('every day starts by pointing at an area', () => {
  for (const day of days) {
    const [first] = dailySet(items, day);
    assert.equal(first.type, 'point', day);
    assert.equal(first.target.kind, 'area', day);
  }
});

test('every day has 3–5 areas, 1–3 streets and 3–5 places', () => {
  for (const day of days) {
    const groups = dailySet(items, day).map((q) => GROUP[q.target.kind]);
    const count = (g) => groups.filter((x) => x === g).length;
    assert.ok(count('area') >= 3 && count('area') <= 5, day);
    assert.ok(count('street') >= 1 && count('street') <= 3, day);
    assert.ok(count('place') >= 3 && count('place') <= 5, day);
  }
});

test('every split fills a set, and 4–2–4 is the most common', () => {
  for (const s of SPLITS) assert.equal(s.area + s.street + s.place, SET_SIZE);
  const seen = {};
  for (let i = 0; i < 2000; i++) {
    const slots = plan(random(i));
    const key = ['area', 'street', 'place'].map((g) => slots.filter((x) => x.group === g).length).join('-');
    seen[key] = (seen[key] ?? 0) + 1;
  }
  const [top] = Object.entries(seen).sort((a, b) => b[1] - a[1]);
  assert.equal(top[0], '4-2-4');
});

test('places that sit together are never asked on the same day', () => {
  for (const day of days) {
    const set = dailySet(items, day);
    const groups = set.map((q) => q.target.apart).filter(Boolean);
    assert.equal(new Set(groups).size, groups.length, day);
  }
});

test('both special questions turn up', () => {
  const seen = new Set(days.flatMap((d) => dailySet(items, d).map((q) => q.type)));
  assert.ok(seen.has('neighbour') && seen.has('route'));
});

test('everything is asked within two rounds of its deck', () => {
  const asked = new Set(days.flatMap((d) => dailySet(items, d).map((q) => q.target.name)));
  for (const it of items) if (Object.values(DECKS).some((d) => d(it))) assert.ok(asked.has(it.name), it.name);
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
  assert.equal(text, `Malmökoll 2026-10-10\n150/${3 * MAX_SCORE}\n🟩🟨🟥\nhttps://example.org`);
  assert.equal(square(80), '🟩');
  assert.equal(square(79), '🟨');
  assert.equal(square(39), '🟥');
});
