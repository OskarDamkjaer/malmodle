import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alongEvery, angleGap, bearing, midpoint, pickAlong, pickBest, samplePoints, streetAhead } from '../scripts/lib/photos.mjs';

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

test('a deep pass also samples the street at a fixed spacing', () => {
  assert.equal(alongEvery(ns.geometry, 200).length, 6);
  assert.ok(samplePoints(ns, [ns], 60, 200).length > samplePoints(ns, [ns]).length);
});

test('the best photos cover both ways, then only strong ones fill up', () => {
  const photo = (id, lat, heading, score, extra = {}) => ({
    id, sequence: id, point: [13, lat], heading, captured: '2024-05-01', ahead: 200, offLine: 2, at: 'mitten',
    review: { sharp: true, framing: 'centred', score }, ...extra,
  });
  const picked = pickBest([
    photo('north-5', 55.603, 0, 5),
    photo('north-4-near', 55.6031, 0, 4),
    photo('north-4-far', 55.607, 2, 4, { at: 'vid Väst' }),
    photo('south-3', 55.606, 180, 3),
    photo('north-3', 55.608, 0, 3),
    photo('blurry', 55.604, 0, 5, { review: { sharp: false, framing: 'centred', score: 5 } }),
    photo('short', 55.604, 0, 5, { ahead: 20 }),
    photo('basket', 55.604, 0, 5, { review: { sharp: true, framing: 'blocked', score: 5 } }),
  ], ns.geometry);
  assert.deepEqual(picked.map((p) => p.id), ['north-5', 'south-3', 'north-4-far']);
});
