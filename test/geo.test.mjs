import { test } from 'node:test';
import assert from 'node:assert/strict';
import { along, around, bounds, closest, contains, distanceTo, meanDistance, metersBetween, offset, radius } from '../app/geo.mjs';

const square = {
  type: 'Polygon',
  coordinates: [[[13, 55.6], [13.01, 55.6], [13.01, 55.61], [13, 55.61], [13, 55.6]]],
};

test('a point inside a polygon is at distance zero', () => {
  assert.ok(contains(square, [13.005, 55.605]));
  assert.equal(distanceTo(square, [13.005, 55.605]), 0);
});

test('a point outside a polygon is measured to its edge', () => {
  const d = distanceTo(square, [13.005, 55.62]);
  assert.ok(Math.abs(d - metersBetween([13.005, 55.62], [13.005, 55.61])) < 1);
});

test('holes are outside', () => {
  const ring = {
    type: 'Polygon',
    coordinates: [
      square.coordinates[0],
      [[13.004, 55.604], [13.006, 55.604], [13.006, 55.606], [13.004, 55.606], [13.004, 55.604]],
    ],
  };
  assert.equal(contains(ring, [13.005, 55.605]), false);
  assert.equal(contains(ring, [13.001, 55.601]), true);
});

test('the closest point on a line lies on the line', () => {
  const line = { type: 'MultiLineString', coordinates: [[[13, 55.6], [13.02, 55.6]]] };
  const c = closest(line, [13.01, 55.601]);
  assert.ok(Math.abs(c.point[1] - 55.6) < 1e-9);
  assert.ok(Math.abs(c.distance - 111.32) < 1);
});

test('metres are metres', () => {
  assert.ok(Math.abs(metersBetween([13, 55.6], [13, 55.61]) - 1113.2) < 1);
  const { east, north } = offset([13, 55.6], [13.01, 55.6]);
  assert.ok(east > 600 && east < 650);
  assert.equal(north, 0);
});

test('bounds and around enclose what they are given', () => {
  const [[w, s], [e, n]] = bounds([square, { type: 'Point', coordinates: [13.02, 55.59] }]);
  assert.deepEqual([w, s, e, n], [13, 55.59, 13.02, 55.61]);
  const [[aw, as], [ae, an]] = around([13, 55.6], 1000);
  assert.ok(Math.abs(metersBetween([aw, 55.6], [ae, 55.6]) - 2000) < 1);
  assert.ok(Math.abs(metersBetween([13, as], [13, an]) - 2000) < 1);
});

test('points along a line are spread evenly by length, not by corner', () => {
  const north = (m) => [13, 55.6 + m / 111320];
  const line = { type: 'LineString', coordinates: [north(0), north(100), north(400)] };
  const points = along(line, 4);
  assert.deepEqual(points.map((p) => Math.round(metersBetween(north(0), p))), [50, 150, 250, 350]);
  assert.equal(Math.round(meanDistance(line, { type: 'Point', coordinates: north(0) })), 200);
});

test('the radius of a ring is how far its outline lies from the centre', () => {
  const centre = [13, 55.6];
  const ring = Array.from({ length: 65 }, (_, i) => [
    13 + (300 * Math.cos((i / 64) * 2 * Math.PI)) / (111320 * Math.cos((55.6 * Math.PI) / 180)),
    55.6 + (300 * Math.sin((i / 64) * 2 * Math.PI)) / 111320,
  ]);
  assert.equal(Math.round(radius({ type: 'Polygon', coordinates: [ring] }, centre) / 10), 30);
});
