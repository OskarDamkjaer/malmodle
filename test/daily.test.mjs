import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, GROUP, PRACTICE, PRACTICE_SIZE, SET_SIZE, SHOWN_GAP, SOON_DAYS, SOON_SHARE, SPACED, SPLITS, dailySet, setId, dateKey, hash, laterKey, plan, practiceSet, random, recall, remember, shareText, carry, arrive, square, upcoming, issue, played } from '../app/daily.mjs';
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

test('the days before the spaced deal keep the sets they were played with', () => {
  const played = [
    ['2026-10-10', '6c675d36'],
    ['2026-10-11', '34f968ca'],
    ['2026-10-12', 'c60ec4c4'],
    ['2026-10-13', '16f6f239'],
    ['2026-10-14', 'f14deab8'],
    ['2026-10-15', '1b82f48'],
    ['2026-10-16', '94fa6bf4'],
    ['2026-10-17', 'aeec37a8'],
    ['2026-10-18', '2fe3685c'],
    ['2026-10-19', 'd0e04b1c'],
    ['2026-10-20', '7e12f4db'],
    ['2026-10-21', '24dabb6a'],
  ];
  for (const [day, id] of played) assert.equal(setId(dailySet(items, day)), id, day);
  assert.equal(laterKey(played.at(-1)[0], 1), SPACED);
});

test('a target waits before it is asked again, from the spaced deal on', () => {
  const wait = { area: 5, street: 3, place: 2 };
  const last = new Map();
  for (let n = 0; n < 120; n++) {
    for (const q of dailySet(items, laterKey(SPACED, n))) {
      const since = n - (last.get(q.target.name) ?? -Infinity);
      assert.ok(since >= wait[GROUP[q.target.kind]], `${q.target.name} again after ${since} days`);
      last.set(q.target.name, n);
    }
  }
});

test('what a question names on the map is not asked days before or after', () => {
  const sets = Array.from({ length: 60 }, (_, n) => dailySet(items, laterKey(SPACED, n)));
  sets.forEach((set, n) => {
    for (const q of set) {
      for (const shown of [q.from, q.to].filter(Boolean)) {
        for (let m = Math.max(0, n - SHOWN_GAP); m <= Math.min(sets.length - 1, n + SHOWN_GAP); m++) {
          assert.ok(!sets[m].some((x) => x.target.name === shown.name), `${shown.name} shown ${n}, asked ${m}`);
        }
      }
    }
  });
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
  assert.equal(text, `Malmödle 2026-10-10\n150/${3 * MAX_SCORE}\n🟩🟧🟥\nhttps://example.org`);
  assert.equal(square(MAX_SCORE), '🟩');
  assert.equal(square(99), '🟨');
  assert.equal(square(80), '🟨');
  assert.equal(square(79), '🟧');
  assert.equal(square(40), '🟧');
  assert.equal(square(39), '🟥');
  assert.equal(square(0), '🟥');
});

test('days count on across months and years', () => {
  assert.equal(laterKey('2026-10-31', 1), '2026-11-01');
  assert.equal(laterKey('2026-12-28', 7), '2027-01-04');
});

test('the coming days are the targets ahead, each with the first day it is asked', () => {
  const soon = upcoming(items, '2026-10-20');
  const first = new Map();
  for (let n = SOON_DAYS; n >= 1; n--) for (const q of dailySet(items, laterKey('2026-10-20', n))) first.set(q.target.name, n);
  assert.deepEqual([...soon].sort(), [...first].sort());
});

test('practice takes what is asked soonest', () => {
  const soon = upcoming(items, '2026-10-20');
  for (const kind of PRACTICE.filter((k) => ['area', 'street'].includes(k.id))) {
    for (const seed of [1, 2, 3]) {
      const set = practiceSet(items, { key: '2026-10-20', category: kind.id, seed });
      const picked = set.map((q) => q.target.name).filter((name) => soon.has(name));
      const days = picked.map((name) => soon.get(name)).sort((a, b) => a - b);
      const passed = items.filter((it) => kind.has(it) && soon.has(it.name) && !picked.includes(it.name));
      for (const it of passed) assert.ok(soon.get(it.name) >= days[SOON_SHARE - 1], `${it.name} is sooner than what practice took`);
    }
  }
});

test('practice asks ten of one kind, some of them coming soon', () => {
  const soon = upcoming(items, '2026-10-10');
  for (const kind of PRACTICE.filter((k) => ['area', 'street'].includes(k.id))) {
    for (const seed of [1, 2, 3]) {
      const set = practiceSet(items, { key: '2026-10-10', category: kind.id, seed });
      assert.equal(set.length, PRACTICE_SIZE);
      assert.equal(new Set(set.map((q) => q.target.name)).size, PRACTICE_SIZE);
      for (const q of set) assert.ok(kind.has(q.target), q.target.name);
      const today = new Set(dailySet(items, '2026-10-10').map((q) => q.target.name));
      const later = items.filter((it) => kind.has(it) && !soon.has(it.name) && !today.has(it.name)).length;
      const coming = set.filter((q) => soon.has(q.target.name)).length;
      if (later >= PRACTICE_SIZE - SOON_SHARE) assert.equal(coming, SOON_SHARE, kind.id);
      else assert.equal(coming, PRACTICE_SIZE - later, kind.id);
    }
  }
});

test('practice mixes in the other question types', () => {
  const types = new Set(practiceSet(items, { key: '2026-10-10', category: 'area', seed: 1 }).map((q) => q.type));
  assert.ok(types.has('point') && types.has('identify'));
});

const answer = (q, score) => ({ q, result: { score, distance: 120, choice: q.options?.[0], tap: [13, 55], hit: q.target } });
const stored = (value) => JSON.parse(JSON.stringify(value));

test('a finished day comes back on the same day only', () => {
  const key = '2026-10-10';
  const set = dailySet(items, key);
  const results = set.map((q) => answer(q, 80));
  const saved = stored(remember(null, { key, set, results, finished: true }));
  const back = recall(saved, key, set);
  assert.equal(back.length, set.length);
  assert.deepEqual(back.map((r) => r.q), set);
  assert.deepEqual(back.map((r) => r.result.score), results.map((r) => r.result.score));
  assert.equal(back[0].result.hit, undefined);
  assert.deepEqual(recall(saved, '2026-10-11', dailySet(items, '2026-10-11')), []);
});

test('a round in progress resumes where it stopped', () => {
  const key = '2026-10-10';
  const set = dailySet(items, key);
  const saved = stored(remember(null, { key, set, results: set.slice(0, 4).map((q) => answer(q, 50)), finished: false }));
  assert.equal(recall(saved, key, set).length, 4);
});

test('a replay in progress keeps the finished day until it ends', () => {
  const key = '2026-10-10';
  const set = dailySet(items, key);
  const done = stored(remember(null, { key, set, results: set.map((q) => answer(q, 100)), finished: true }));
  const replay = stored(remember(done, { key, set, results: [answer(set[0], 0)], finished: false }));
  assert.equal(replay.done.length, set.length);
  assert.equal(recall(replay, key, set).length, 1);
  const again = stored(remember(replay, { key, set, results: set.map((q) => answer(q, 0)), finished: true }));
  assert.equal(again.playing, undefined);
  assert.deepEqual(recall(again, key, set).map((r) => r.result.score), set.map(() => 0));
});

test('the number of the day counts from launch day as the first', () => {
  assert.equal(issue('2026-10-10'), 1);
  assert.equal(issue('2026-10-18'), 9);
  assert.equal(issue('2026-11-01'), 23);
});

test('a finished round carried in a link comes back on the same day and set', () => {
  const key = '2026-10-10';
  const set = dailySet(items, key);
  const results = set.map((q, i) => answer(q, i * 10));
  const code = carry({ key, set, results });
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const saved = stored(arrive(null, code, key, set));
  assert.deepEqual(recall(saved, key, set).map((r) => r.result.score), results.map((r) => r.result.score));
  const tomorrow = '2026-10-11';
  assert.equal(arrive(null, code, tomorrow, dailySet(items, tomorrow)), null);
  assert.equal(arrive(null, 'inte-en-runda', key, set), null);
  assert.equal(arrive(null, carry({ key, set, results: results.slice(0, 4) }), key, set), null);
});

test('a carried round does not replace one already finished here', () => {
  const key = '2026-10-10';
  const set = dailySet(items, key);
  const mine = stored(remember(null, { key, set, results: set.map((q) => answer(q, 100)), finished: true }));
  const code = carry({ key, set, results: set.map((q) => answer(q, 0)) });
  assert.equal(arrive(mine, code, key, set), mine);
  const started = stored(remember(null, { key, set, results: [answer(set[0], 50)], finished: false }));
  assert.equal(recall(arrive(started, code, key, set), key, set).length, set.length);
});

test('every finished round of the day is counted once, in order', () => {
  const key = '2026-10-10';
  const set = dailySet(items, key);
  const round = (score) => set.map((q) => answer(q, score));
  const first = stored(remember(stored(remember(null, { key, set, results: round(10).slice(0, 9), finished: false })), { key, set, results: round(10), finished: true }));
  assert.deepEqual(played(first, key, set), [100]);
  const reloaded = stored(remember(first, { key, set, results: round(10), finished: true }));
  assert.deepEqual(played(reloaded, key, set), [100]);
  const replaying = stored(remember(reloaded, { key, set, results: round(30).slice(0, 3), finished: false }));
  assert.deepEqual(played(replaying, key, set), [100]);
  const second = stored(remember(replaying, { key, set, results: round(30), finished: true }));
  assert.deepEqual(played(second, key, set), [100, 300]);
  const old = stored(remember(null, { key, set, results: round(50), finished: true }));
  delete old.rounds;
  assert.deepEqual(played(old, key, set), [500]);
});

test('a saved day for a different set is ignored', () => {
  const key = '2026-10-10';
  const set = dailySet(items, key);
  const saved = stored(remember(null, { key, set, results: set.map((q) => answer(q, 80)), finished: true }));
  saved.targets[0] = 'Någon annanstans';
  assert.deepEqual(recall(saved, key, set), []);
  assert.deepEqual(recall(null, key, set), []);
  assert.deepEqual(recall({ key, targets: set.map((q) => q.target.name), done: 'trasig' }, key, set), []);
});

test('anything else in storage comes back as nothing', () => {
  const key = '2026-10-10';
  const set = dailySet(items, key);
  const good = stored(remember(null, { key, set, results: set.slice(0, 3).map((q) => answer(q, 40)), finished: false }));
  const map = set.findIndex((q) => TYPES[q.type].input === 'map');
  const choice = set.findIndex((q) => TYPES[q.type].input === 'choice');
  const upTo = (i, broken) => set.slice(0, i + 1).map((q, j) => (j === i ? broken : stored(remember(null, { key, set, results: [answer(q, 40)], finished: true }).done[0])));
  const broken = [
    null, 'trasig', 42, [], {},
    { ...good, version: 0 },
    { ...good, version: undefined },
    { ...good, targets: 'alla' },
    { ...good, targets: good.targets.slice(1) },
    { ...good, playing: 'trasig' },
    { ...good, playing: [] },
    { ...good, playing: [null] },
    { ...good, playing: [{ score: 'mycket' }] },
    { ...good, playing: [{ score: MAX_SCORE + 1, distance: 0, choice: 'x' }] },
    { ...good, playing: [{ score: 40.5, distance: 0, choice: 'x' }] },
    { ...good, playing: [...good.playing, ...set.map(() => good.playing[0])] },
    { ...good, playing: upTo(map, { score: 40 }) },
    { ...good, playing: upTo(map, { score: 40, distance: -1 }) },
    { ...good, playing: upTo(choice, { score: 0 }) },
    { ...good, playing: upTo(choice, { score: 0, choice: 7 }) },
    { ...good, playing: undefined, done: good.playing },
  ];
  for (const raw of broken) assert.deepEqual(recall(raw, key, set), [], JSON.stringify(raw));
  assert.equal(recall(good, key, set).length, 3);
});

test('only the parts that parse are kept', () => {
  const key = '2026-10-10';
  const set = dailySet(items, key);
  const done = stored(remember(null, { key, set, results: set.map((q) => answer(q, 100)), finished: true }));
  assert.equal(recall({ ...done, playing: [null] }, key, set).length, set.length);
  for (const { q, result } of recall(done, key, set)) {
    assert.deepEqual(Object.keys(result).sort(), TYPES[q.type].input === 'map' ? ['distance', 'score'] : ['choice', 'score']);
  }
  const replay = stored(remember({ ...done, done: [null] }, { key, set, results: [answer(set[0], 0)], finished: false }));
  assert.equal(replay.done, undefined);
});
