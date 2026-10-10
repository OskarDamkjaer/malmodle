import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SCORE, TYPES, distanceScore, formatDistance, tappedOn } from '../app/questions.mjs';
import { fixture } from './fixture.mjs';

const items = fixture();
const byName = (name) => items.find((it) => it.name === name);

test('a tap inside an area scores full marks', () => {
  assert.equal(distanceScore(0, 'area'), MAX_SCORE);
});

test('points and streets get a tolerance before the score falls', () => {
  assert.equal(distanceScore(30, 'street'), MAX_SCORE);
  assert.equal(distanceScore(140, 'landmark'), MAX_SCORE);
  assert.ok(distanceScore(400, 'landmark') < MAX_SCORE);
});

test('the score falls with distance and never goes below zero', () => {
  let previous = MAX_SCORE;
  for (let d = 0; d <= 20000; d += 250) {
    const s = distanceScore(d, 'area');
    assert.ok(s <= previous && s >= 0);
    previous = s;
  }
  assert.equal(distanceScore(20000, 'area'), 0);
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
