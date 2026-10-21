import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SCORE, NEAR_SCORE, TYPES, distanceScore, formatDistance, nearScore, tappedOn } from '../app/questions.mjs';
import { band } from '../app/daily.mjs';
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
  assert.equal(TYPES.point.grade({ target }, tap, items, null).hit, null);
});

test('tapping the asked street on the map scores full marks however far from its middle', () => {
  const target = byName('Gata 1');
  const tap = [12.97, 55.5772];
  const seen = { name: 'Gata 1', kind: 'street', point: tap, geometry: target.geometry };
  assert.ok(TYPES.point.grade({ target }, tap, items, null).score < MAX_SCORE);
  const r = TYPES.point.grade({ target }, tap, items, seen);
  assert.equal(r.score, MAX_SCORE);
  assert.equal(r.hit, null);
});

test('a full-marks tap names nothing else, even inside a park around the answer', () => {
  const target = byName('Plats 0');
  const park = {
    name: 'Parken', kind: 'landmark', point: target.point,
    geometry: { type: 'Polygon', coordinates: [[[12.951, 55.570], [12.953, 55.570], [12.953, 55.572], [12.951, 55.572], [12.951, 55.570]]] },
  };
  const r = TYPES.point.grade({ target }, target.point, [park, ...items]);
  assert.equal(r.score, MAX_SCORE);
  assert.equal(r.hit, null);
});

const NORTH = 111320;
const EAST = NORTH * Math.cos((55.6 * Math.PI) / 180);
const at = (east, north) => [13 + east / EAST, 55.6 + north / NORTH];
const place = (name, north) => ({ name, kind: 'landmark', point: at(0, north), geometry: { type: 'Point', coordinates: at(0, north) } });
const street = (name, coordinates) => ({ name, kind: 'street', geometry: { type: 'LineString', coordinates } });

test('a wrong pick scores less the further it lies from the answer, and stays in the red band', () => {
  const target = place('Mål', 0);
  const scores = [30, 150, 250, 1500].map((m) => nearScore(target, place(`${m} m`, m)));
  assert.ok(scores[0] > scores[1] && scores[1] > scores[2] && scores[2] > 0, scores.join());
  assert.equal(scores[3], 0);
  assert.ok(scores[0] <= NEAR_SCORE);
  assert.equal(band(NEAR_SCORE), 'red');
});

test('a wrong pick is graded by the answer it was mistaken for', () => {
  const plats = byName('Plats 5');
  assert.equal(TYPES.identify.grade({ target: plats }, 'Plats 5', items).score, MAX_SCORE);
  assert.equal(TYPES.identify.grade({ target: plats }, 'Plats 15', items).score, 0);
  const area = byName('Område 2-2');
  assert.ok(TYPES.identify.grade({ target: area }, 'Område 2-3', items).score > 0);
  assert.equal(TYPES.identify.grade({ target: area }, 'Område 5-5', items).score, 0);
});

test('a street alongside the answer scores more than one that only crosses it', () => {
  const target = street('Mål', [at(-200, 0), at(200, 0)]);
  const alongside = nearScore(target, street('Bredvid', [at(-200, 60), at(200, 60)]));
  const crossing = nearScore(target, street('Tvärs', [at(0, -200), at(0, 200)]));
  const far = nearScore(target, street('Långt bort', [at(-200, 1500), at(200, 1500)]));
  assert.ok(alongside > crossing && crossing > far, [alongside, crossing, far].join());
  assert.equal(far, 0);
});

const area = (name, west, east, side) => ({
  name, kind: 'area', point: at((west + east) / 2, 0),
  geometry: { type: 'Polygon', coordinates: [[at(west, -side / 2), at(east, -side / 2), at(east, side / 2), at(west, side / 2), at(west, -side / 2)]] },
});

test('a bordering area scores the same either way round, and as much in the outskirts as in the centre', () => {
  const small = area('Liten', 0, 400, 400);
  const large = area('Stor', -4000, 0, 4000);
  assert.equal(nearScore(small, large), nearScore(large, small));
  const centre = nearScore(area('A', 0, 500, 500), area('B', -500, 0, 500));
  const outskirts = nearScore(area('C', 0, 3000, 3000), area('D', -3000, 0, 3000));
  assert.ok(outskirts > 0 && Math.abs(centre - outskirts) <= 5, [centre, outskirts].join());
  assert.equal(nearScore(area('E', 0, 500, 500), area('F', -2500, -2000, 500)), 0);
});

test('a place beside a larger one scores either way round', () => {
  const beach = { name: 'Stranden', kind: 'landmark', point: at(0, 0), geometry: { type: 'Polygon', coordinates: [[at(-100, -20), at(100, -20), at(100, 20), at(-100, 20), at(-100, -20)]] } };
  const point = { name: 'Udden', kind: 'landmark', point: at(800, 0), geometry: { type: 'Polygon', coordinates: [[at(250, -400), at(1350, -400), at(1350, 400), at(250, 400), at(250, -400)]] } };
  assert.ok(nearScore(beach, point) > 0);
  assert.equal(nearScore(beach, point), nearScore(point, beach));
});

test('what is shown is not offered alongside a place that holds it or that it holds', () => {
  const park = { name: 'Parken', kind: 'landmark', point: at(0, 300), geometry: { type: 'Polygon', coordinates: [[at(-400, -400), at(400, -400), at(400, 400), at(-400, 400), at(-400, -400)]] } };
  const theatre = place('Teatern', 0);
  const others = [600, 700, 800, 900].map((m) => place(`${m} m`, m));
  const offered = (target) => TYPES.identify.build({ target, items: [park, theatre, ...others], rng: () => 0.5 }).options;
  assert.ok(!offered(theatre).includes('Parken'));
  assert.ok(!offered(park).includes('Teatern'));
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
  assert.ok(grade('Område 1-3') > 0);
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

test('a place can be asked for by another phrase than its name', () => {
  const target = { ...byName('Plats 1'), asked: 'det ursprungliga Plats 1' };
  assert.equal(TYPES.point.prompt({ target }).title, 'Var ligger det ursprungliga Plats 1?');
  assert.equal(TYPES.point.prompt({ target: byName('Plats 1') }).title, 'Var ligger Plats 1?');
});

test('every type can describe itself', () => {
  for (const [name, type] of Object.entries(TYPES)) {
    assert.ok(['map', 'choice'].includes(type.input), name);
    for (const fn of ['build', 'prompt', 'showing', 'view', 'grade']) assert.equal(typeof type[fn], 'function', `${name}.${fn}`);
  }
});
