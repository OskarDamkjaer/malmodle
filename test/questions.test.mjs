import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SCORE, TYPES, distanceScore, formatDistance, tappedOn } from '../app/questions.mjs';
import { fixture } from './fixture.mjs';

const items = fixture();
const byName = (name) => items.find((it) => it.name === name);

test('a tap on the target or within ten metres scores full marks', () => {
  assert.equal(distanceScore(0), MAX_SCORE);
  assert.equal(distanceScore(10), MAX_SCORE);
  assert.ok(distanceScore(50) < MAX_SCORE);
});

test('a place known only by a point gets a wider grace', () => {
  const point = { type: 'Point', coordinates: [13, 55.6] };
  assert.equal(distanceScore(90, point), MAX_SCORE);
  assert.ok(distanceScore(90) < MAX_SCORE);
  assert.ok(distanceScore(150, point) < MAX_SCORE);
});

test('the wrong end of town scores nothing', () => {
  assert.equal(distanceScore(8000), 0);
});

test('the score falls with distance and never goes below zero', () => {
  let previous = MAX_SCORE;
  for (let d = 0; d <= 20000; d += 250) {
    const s = distanceScore(d);
    assert.ok(s <= previous && s >= 0);
    previous = s;
  }
  assert.equal(distanceScore(20000), 0);
});

test('distances read as Swedish', () => {
  assert.equal(formatDistance(347), '350 m');
  assert.equal(formatDistance(1234), '1,2 km');
});

test('tapping says what was hit', () => {
  assert.equal(tappedOn(items, [12.955, 55.575], 'area').name, 'Område 0-0');
  assert.equal(tappedOn(items, [12.97, 55.5721], 'street').name, 'Gata 0');
  assert.equal(tappedOn(items, [12.952, 55.5711], 'landmark').name, 'Plats 0');
  assert.equal(tappedOn(items, [12.9, 55.5], 'landmark'), null);
});

test('pointing at the answer scores full marks', () => {
  const target = byName('Område 2-3');
  const r = TYPES.point.grade({ target }, target.point, items);
  assert.equal(r.score, MAX_SCORE);
  assert.equal(r.hit, null);
});

test('pointing elsewhere reports the distance and what was hit', () => {
  const target = byName('Område 0-0');
  const r = TYPES.point.grade({ target }, byName('Område 3-0').point, items);
  assert.ok(r.score < MAX_SCORE);
  assert.ok(r.distance > 1000);
  assert.equal(r.hit.name, 'Område 3-0');
});

test('a street question names the street the map shows under the tap', () => {
  const target = byName('Gata 1');
  const tap = [12.97, 55.5721];
  const seen = { name: 'Okänd gata', kind: 'street', point: tap, geometry: { type: 'Point', coordinates: tap } };
  assert.equal(TYPES.point.grade({ target }, tap, items).hit.name, 'Gata 0');
  assert.equal(TYPES.point.grade({ target }, tap, items, seen).hit.name, 'Okänd gata');
  const between = TYPES.point.grade({ target }, tap, items, null).hit;
  assert.notEqual(between?.kind, 'street');
});

test('choice questions are all or nothing', () => {
  for (const type of ['identify', 'nearest']) {
    const target = byName('Plats 5');
    assert.equal(TYPES[type].grade({ target }, 'Plats 5').score, MAX_SCORE);
    assert.equal(TYPES[type].grade({ target }, 'Plats 6').score, 0);
  }
  const target = byName('Område 1-1');
  assert.equal(TYPES.neighbour.grade({ target }, 'Område 1-1').score, MAX_SCORE);
  assert.equal(TYPES.neighbour.grade({ target }, 'Område 1-2').score, 0);
});

test('areas know who borders them, and in which direction', () => {
  const middle = byName('Område 2-2');
  assert.equal(middle.beside.norr, 'Område 2-3');
  assert.equal(middle.beside['söder'], 'Område 2-1');
  assert.equal(middle.beside['öster'], 'Område 3-2');
  assert.equal(middle.beside['väster'], 'Område 1-2');
  assert.equal(byName('Område 0-0').beside['väster'], undefined);
});

test('every type can describe itself', () => {
  for (const [name, type] of Object.entries(TYPES)) {
    assert.ok(['map', 'choice'].includes(type.input), name);
    for (const fn of ['build', 'prompt', 'showing', 'view', 'grade']) assert.equal(typeof type[fn], 'function', `${name}.${fn}`);
  }
});
