import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { DECKS, GROUP, SPLITS, dailySet, laterKey, plan, random } from '../app/daily.mjs';
import { fixture } from './fixture.mjs';
import { parseHandmade } from '../worker/handmade.mjs';

register('../scripts/lib/resolve.mjs', import.meta.url);
const { LIMITS, TYPES_FOR, another, assemble, flags, pack, proposals, ready, sending, typical, unpack } = await import('../bygg/handmade.mjs');

const QUIZ = 'build/data/quiz.json';
const skip = existsSync(QUIZ) ? false : `${QUIZ} is missing; run node scripts/build-quiz.mjs`;
const { items: real, decoys } = skip ? { items: [], decoys: [] } : JSON.parse(readFileSync(QUIZ, 'utf8'));

const items = fixture();
const slot = (target, type = 'point', seed = 1) => ({ target, type, seed });
const cells = (t) => t.rows.flatMap((r) => [r, ...r.types]);
const unusual = (entries) => {
  const t = typical(entries);
  return [...cells(t).filter((c) => !c.usual).map((c) => `${c.group ?? c.type}:${c.n}`), ...(t.lead.usual ? [] : ['lead']), ...(t.food.usual ? [] : ['food'])];
};
const warned = (entries) => flags(entries).map((f) => f.filter(([kind]) => kind === 'warn').map(([, text]) => text));
const row = (entries, group) => typical(entries).rows.find((r) => r.group === group);
const groups = (a, s, p) => [...Array(a).fill('area'), ...Array(s).fill('street'), ...Array(p).fill('place')].map((group) => ({ group, type: 'point' }));

test('every day the game plans for itself is usual in its split, its types and its first question', () => {
  for (let seed = 0; seed < 5000; seed++) {
    const entries = plan(random(seed)).map((s) => ({ group: s.group, type: s.type, food: s.deck === 'food' }));
    assert.deepEqual(unusual(entries).filter((u) => u !== 'food'), [], `seed ${seed}`);
  }
});

test('a full day is usual in its split exactly when the game deals that split', () => {
  for (let a = 0; a <= 10; a++) {
    for (let s = 0; a + s <= 10; s++) {
      const p = 10 - a - s;
      const dealt = SPLITS.some((x) => x.area === a && x.street === s && x.place === p);
      assert.equal(typical(groups(a, s, p)).rows.every((r) => r.usual), dealt, `${a}–${s}–${p}`);
    }
  }
});

test('while a day is being built, only too many is unusual', () => {
  const four = groups(4, 0, 0);
  assert.deepEqual(unusual(four), ['point:4']);
  assert.equal(row(four, 'street').usual, true);
  assert.equal(row(four, 'area').types.find((c) => c.type === 'identify').usual, true);
  const full = [...groups(4, 2, 4)];
  assert.ok(unusual(full).includes('identify:0'));
});

test('an empty day is usual and says nothing about the first question', () => {
  assert.deepEqual(unusual([]), []);
  assert.equal(typical([]).lead.now, null);
});

test('the days dealt to players never ask one thing twice or two that belong together, and start with an area', { skip }, () => {
  let key = '2026-10-21';
  for (let n = 0; n < 200; n++, key = laterKey(key, 1)) {
    const entries = dailySet(real, key, decoys).map((q) => ({ target: q.target.name, group: GROUP[q.target.kind], type: q.type, food: DECKS.food(q.target), apart: q.target.apart }));
    assert.deepEqual(warned(entries).flat(), [], key);
    assert.equal(typical(entries).lead.usual, true, key);
  }
});

test('the first question usually points at an area', () => {
  assert.equal(typical([{ group: 'place', type: 'point' }]).lead.usual, false);
  assert.equal(typical([{ group: 'area', type: 'identify' }]).lead.usual, false);
  assert.equal(typical([{ group: 'area', type: 'identify' }]).lead.now, 'Vad ligger här?, område');
  assert.equal(typical([{ group: 'area', type: 'point' }]).lead.usual, true);
});

test('three restaurants are unusual but not wrong', () => {
  const food = (n) => Array.from({ length: n }, () => ({ group: 'place', type: 'point', food: true }));
  assert.equal(typical(food(2)).food.usual, true);
  assert.deepEqual(typical(food(3)).food, { n: 3, range: [0, 2], usual: false });
  assert.deepEqual(warned(food(3).map((e, i) => ({ ...e, target: `Krog ${i}` }))), [[], [], []]);
});

test('two things that belong together, or one asked twice, are flagged on both questions', () => {
  assert.deepEqual(warned([{ target: 'Parken', apart: 'Parken' }, { target: 'Teatern', apart: 'Parken' }]), [['hör ihop med fråga 2'], ['hör ihop med fråga 1']]);
  assert.deepEqual(warned([{ target: 'Torget' }, { target: 'Torget' }]), [['samma som fråga 2'], ['samma som fråga 1']]);
});

test('a question is built from its target and type the way the game builds it', () => {
  const area = items.find((it) => it.kind === 'area');
  const [entry] = assemble([slot(area.name, 'identify')], items);
  assert.equal(entry.group, 'area');
  assert.equal(entry.q.type, 'identify');
  assert.equal(entry.q.options.length, 8);
  assert.ok(entry.q.options.includes(area.name));
  assert.deepEqual(entry.types.map((t) => t.type), TYPES_FOR.area);
});

test('a target missing from the map, or a type its kind cannot take, is a problem and not a crash', () => {
  const street = items.find((it) => it.kind === 'street');
  const [missing, wrong] = assemble([slot('Ingenstans'), slot(street.name, 'neighbour')], items);
  assert.equal(missing.q, null);
  assert.match(missing.problem, /finns inte/);
  assert.equal(wrong.q, null);
  assert.match(wrong.problem, /gator/);
  assert.deepEqual(warned([missing, wrong]).map((w) => w.length), [1, 1]);
});

test('a neighbour question is not built from an area the day already asks about', () => {
  const target = items.find((it) => it.kind === 'area' && assemble([slot(it.name, 'neighbour')], items)[0].q);
  const sources = items.filter((it) => Object.values(it.beside ?? {}).includes(target.name));
  const [alone] = assemble([slot(target.name, 'neighbour')], items);
  assert.ok(sources.some((s) => s.name === alone.q.from.name));
  const crowded = assemble([slot(target.name, 'neighbour'), ...sources.map((s) => slot(s.name))], items);
  assert.equal(crowded[0].q, null);
  assert.match(crowded[0].problem, /frågas redan/);
});

test('what a neighbour question names on the map is kept out of later questions', () => {
  const target = items.find((it) => it.kind === 'area' && assemble([slot(it.name, 'neighbour')], items)[0].q);
  const [first] = assemble([slot(target.name, 'neighbour')], items);
  const [, later] = assemble([slot(target.name, 'neighbour'), slot(target.name === 'Område 0-0' ? 'Område 5-5' : 'Område 0-0', 'neighbour')], items);
  assert.ok(later.avoid.has(first.q.from.name));
});

test('another variant changes what the question shows, and a point has none', () => {
  const pointing = assemble([slot(items[0].name)], items)[0];
  assert.equal(another(pointing, items), null);
  const turning = items.map((it) => assemble([slot(it.name, 'neighbour')], items)[0]).find((e) => e.q && another(e, items));
  const seed = another(turning, items);
  const [next] = assemble([slot(turning.target, 'neighbour', seed)], items);
  assert.notDeepEqual([next.q.from.name, next.q.side, [...next.q.options].sort()], [turning.q.from.name, turning.q.side, [...turning.q.options].sort()]);
});

test('something the game never asks about can be in the day, built like the rest and proposed for the game', () => {
  const cafe = { name: 'Kaféet', kind: 'landmark', category: 'kafe', label: 'Kafé', point: [12.97, 55.585], geometry: { type: 'Point', coordinates: [12.97, 55.585] } };
  const find = (s) => (s.target === cafe.name ? cafe : null);
  const entries = assemble([slot(items[0].name), slot(cafe.name, 'identify')], items, [], find);
  assert.equal(entries[0].outside, false);
  assert.equal(entries[1].outside, true);
  assert.equal(entries[1].q.type, 'identify');
  assert.ok(entries[1].q.options.includes(cafe.name));
  assert.deepEqual(flags(entries)[1], [['note', 'finns inte i spelet än']]);
  assert.deepEqual(proposals(entries, []).map((p) => [p.what, p.target, p.question]), [['add', 'Kaféet', 2]]);
  const said = proposals(entries, [{ target: 'Kaféet', what: 'add', text: 'Alla känner till det.' }]);
  assert.deepEqual(said.map((p) => [p.what, p.text, p.question]), [['add', 'Alla känner till det.', 2]]);
});

test('a chain is asked within a district, never shown as one place, and its other district is another variant', () => {
  const [a, b] = ['Område 2-2', 'Område 0-0'].map((name) => items.find((it) => it.name === name));
  const near = ([x, y]) => [[x, y], [x + 0.001, y], [x, y + 0.001]];
  const coordinates = [...near(a.point), ...near(b.point)];
  const chain = {
    name: 'Kedjan', kind: 'landmark', category: 'kafe', label: 'Kafé', asked: 'en Kedja', point: coordinates[0],
    geometry: { type: 'MultiPoint', coordinates },
    regions: [a, b].map((r) => ({ name: r.name, point: r.point, geometry: r.geometry })),
  };
  const find = (s) => (s.target === chain.name ? chain : null);
  const [entry] = assemble([slot(chain.name)], items, [], find);
  assert.ok([a.name, b.name].includes(entry.q.region.name));
  assert.match(entry.types.find((t) => t.type === 'identify').why, /flera ställen/);
  const seed = another(entry, items);
  assert.ok(seed);
  const [other] = assemble([slot(chain.name, 'point', seed)], items, [], find);
  assert.notEqual(other.q.region.name, entry.q.region.name);
});

test('a day can be sent in once it has ten questions that all build', () => {
  const ten = items.filter((it) => it.kind === 'area').slice(0, 10).map((it) => slot(it.name));
  assert.equal(ready(assemble(ten.slice(0, 9), items)), false);
  assert.equal(ready(assemble([...ten.slice(0, 9), slot('Ingenstans')], items)), false);
  assert.equal(ready(assemble(ten, items)), true);
});

test('what is sent in is the day, every suggestion with the ones the day makes, the name and the player', () => {
  const cafe = { name: 'Kaféet', kind: 'landmark', category: 'kafe', label: 'Kafé', point: [12.97, 55.585], geometry: { type: 'Point', coordinates: [12.97, 55.585] } };
  const find = (s) => (s.target === cafe.name ? cafe : null);
  const slots = [...items.filter((it) => it.kind === 'area').slice(0, 9).map((it) => slot(it.name)), { ...slot(cafe.name, 'identify', 3), at: cafe.point }];
  const entries = assemble(slots, items, [], find);
  const notes = [{ target: 'Gata 3', what: 'remove', text: ' Ingen vet var den är. ' }];
  const player = 'a'.repeat(32);
  const sent = sending({ slots, entries, notes, name: ' Kim ', remark: 'Tack!\n', player });
  assert.deepEqual(sent.slots.at(-1), { target: 'Kaféet', type: 'identify', seed: 3, at: cafe.point });
  assert.deepEqual(sent.notes, [{ target: 'Kaféet', what: 'add', text: '', at: cafe.point }, { target: 'Gata 3', what: 'remove', text: 'Ingen vet var den är.' }]);
  assert.equal(sent.name, 'Kim');
  assert.equal(sent.remark, 'Tack!');
  assert.equal(sent.player, player);
  assert.deepEqual(parseHandmade(JSON.parse(JSON.stringify(sent))), sent);
});

test('the Worker takes the longest the builder lets anyone write', () => {
  const slots = items.filter((it) => it.kind === 'area').slice(0, 10).map((it) => slot(it.name));
  const longest = sending({
    slots,
    entries: assemble(slots, items),
    notes: [{ target: 'Gata 3', what: 'fix', text: 'å'.repeat(LIMITS.note) }],
    name: 'å'.repeat(LIMITS.name),
    remark: 'å'.repeat(LIMITS.remark),
    player: 'a'.repeat(32),
  });
  assert.ok(parseHandmade(JSON.parse(JSON.stringify(longest))));
});

test('a day and its suggestions survive a link, and a broken link gives nothing', () => {
  const day = {
    slots: [slot('Möllevången'), slot('Folkets Park', 'identify', 4), { target: 'Kaféet', type: 'point', seed: 1, at: [12.97, 55.585] }],
    notes: [{ target: 'Ö', what: 'fix', text: 'Gränsen är fel.' }, { target: 'Kaféet', what: 'add', text: '', at: [12.97, 55.585] }],
  };
  assert.deepEqual(unpack(pack(day)), day);
  assert.deepEqual(unpack(pack({ slots: [] })), { slots: [], notes: [] });
  assert.equal(unpack('inte en dag'), null);
  assert.equal(unpack(pack({ slots: [] }).slice(0, 1)), null);
  assert.equal(unpack(pack({ slots: [], notes: [{ target: 'Ö', what: 'toString', text: '' }] })), null);
});
