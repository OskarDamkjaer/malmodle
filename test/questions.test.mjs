import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE_SCORE, MAX_SCORE, TYPES, closeTo, distanceScore, formatDistance, tappedOn } from '../app/questions.mjs';
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
  assert.equal(distanceScore(20, point), MAX_SCORE);
  assert.ok(distanceScore(20) < MAX_SCORE);
  assert.ok(distanceScore(40, point) < MAX_SCORE);
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

test('a tap within the grace of a point names nothing else', () => {
  const target = { name: 'Krog', kind: 'landmark', geometry: { type: 'Point', coordinates: [12.9522, 55.5711] } };
  const r = TYPES.point.grade({ target }, [12.952, 55.5711], items);
  assert.equal(r.score, MAX_SCORE);
  assert.equal(tappedOn(items, [12.952, 55.5711], 'landmark').name, 'Plats 0');
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
  assert.equal(TYPES.point.grade({ target }, tap, items, null).hit, null);
});

test('a wrong pick that is close to the answer scores a little', () => {
  const plats = byName('Plats 5');
  assert.equal(TYPES.identify.grade({ target: plats }, 'Plats 5', items).score, MAX_SCORE);
  assert.equal(TYPES.identify.grade({ target: plats }, 'Plats 15', items).score, 0);
  const area = byName('Område 2-2');
  assert.equal(TYPES.identify.grade({ target: area }, 'Område 2-3', items).score, CLOSE_SCORE);
  assert.equal(TYPES.identify.grade({ target: area }, 'Område 5-5', items).score, 0);
  const street = byName('Gata 3');
  assert.equal(TYPES.identify.grade({ target: street }, 'Gata 4', items).score, 0);
});

test('streets that cross are close even with no corner near the crossing', () => {
  const across = { name: 'Tvärgata', kind: 'street', geometry: { type: 'LineString', coordinates: [[12.98, 55.57], [12.98, 55.6]] } };
  assert.ok(closeTo(byName('Gata 3'), across));
});

test('a street from A to B is named by what lies at its ends, and no decoy runs between them', () => {
  const target = byName('Gata 3');
  const q = TYPES.route.build({ target, items, rng: () => 0.3, avoid: new Set() });
  assert.ok(q);
  assert.notEqual(q.from.name, q.to.name);
  assert.equal(q.options.length, 4);
  assert.equal(q.options.filter((o) => o === target.name).length, 1);
  assert.equal(TYPES.route.grade(q, target.name, items).score, MAX_SCORE);
});

test('a neighbour that also borders the answer scores a little', () => {
  const from = byName('Område 2-2');
  const target = byName(from.beside.norr);
  const grade = (name) => TYPES.neighbour.grade({ from, target }, name, items).score;
  assert.equal(grade(target.name), MAX_SCORE);
  assert.equal(grade('Område 1-3'), CLOSE_SCORE);
  assert.equal(grade(from.beside.söder), 0);
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
