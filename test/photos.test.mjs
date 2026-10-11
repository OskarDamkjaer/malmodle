import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleGap, bearing, midpoint, pickAlong, samplePoints, streetAhead } from '../scripts/lib/photos.mjs';

const ns = { name: 'Nord', geometry: { type: 'LineString', coordinates: [[13, 55.60], [13, 55.61]] } };
const ew = { name: 'Väst', geometry: { type: 'LineString', coordinates: [[12.99, 55.608], [13.01, 55.608]] } };

const image = (id, lat, heading, year, extra = {}) => ({
  id, sequence: id, captured_at: Date.UTC(year, 5, 1), compass_angle: heading,
  geometry: { type: 'Point', coordinates: [13, lat] }, ...extra,
});

test('bearings are compass degrees', () => {
  assert.ok(Math.abs(bearing([13, 55.6], [13, 55.61])) < 0.5);
  assert.ok(Math.abs(bearing([13, 55.6], [13.01, 55.6]) - 90) < 0.5);
  assert.equal(angleGap(350, 10), 20);
});

test('a street is sampled at its middle and where it crosses another', () => {
  const points = samplePoints(ns, [ns, ew]);
  assert.deepEqual(points.map((p) => p.label), ['mitten', 'vid Väst']);
  assert.ok(Math.abs(midpoint(ns.geometry)[1] - 55.605) < 1e-9);
});

test('a crossing close to the middle is not sampled twice', () => {
  const near = { name: 'Nära', geometry: { type: 'LineString', coordinates: [[12.99, 55.6052], [13.01, 55.6052]] } };
  assert.equal(samplePoints(ns, [near]).length, 1);
});

test('images are picked per direction, newest era first, one per sequence', () => {
  const p = [13, 55.605];
  const images = [
    image('north-old', 55.6050, 2, 2019),
    image('north-new', 55.6051, 10, 2024),
    image('south', 55.6049, 182, 2022),
    image('sideways', 55.6050, 90, 2024),
    image('too-old', 55.6050, 0, 2015),
    image('pano', 55.6050, 0, 2024, { is_pano: true }),
    image('far', 55.6060, 0, 2024),
    image('same-seq', 55.6052, 25, 2023, { sequence: 'north-new' }),
  ];
  const [north, south] = pickAlong(images, ns, p);
  assert.deepEqual(north.images.map((i) => i.id), ['north-new', 'north-old']);
  assert.deepEqual(south.images.map((i) => i.id), ['south']);
});

test('street ahead is how far the street runs where the camera looks', () => {
  const fromMiddle = streetAhead(ns.geometry, [13, 55.605], 0);
  assert.ok(Math.abs(fromMiddle - 557) < 5);
  assert.ok(streetAhead(ns.geometry, [13, 55.6098], 0) < 40);
  assert.equal(streetAhead(ns.geometry, [13, 55.605], 90), 0);
});
