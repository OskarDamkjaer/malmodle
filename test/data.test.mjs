import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { GROUP, PRACTICE, PRACTICE_SIZE, dailySet, dateKey, practiceSet } from '../app/daily.mjs';
import { contains, distanceTo } from '../app/geo.mjs';

const QUIZ = 'build/data/quiz.json';
const skip = existsSync(QUIZ) ? false : `${QUIZ} is missing; run node scripts/build-quiz.mjs`;
const items = skip ? [] : JSON.parse(readFileSync(QUIZ, 'utf8')).items;
const core = JSON.parse(readFileSync('learn/core.json', 'utf8')).core;

test('the app gets exactly the names in core.json', { skip }, () => {
  const expected = Object.values(core).flat().sort();
  assert.deepEqual(items.map((it) => it.name).sort(), expected);
});

test('every kind in core.json is in the app', { skip }, () => {
  const KIND = { areas: 'area', streets: 'street', bridges: 'bridge', landmarks: 'landmark' };
  for (const [section, names] of Object.entries(core)) {
    for (const name of names) assert.equal(items.find((it) => it.name === name).kind, KIND[section], name);
  }
});

test('every item has a name, a label, a point and a geometry', { skip }, () => {
  for (const it of items) {
    assert.ok(it.name && it.label, it.name);
    assert.ok(Number.isFinite(it.point[0]) && Number.isFinite(it.point[1]), it.name);
    assert.ok(it.geometry?.type, it.name);
  }
});

test('an area\'s point is inside it', { skip }, () => {
  for (const it of items.filter((x) => x.kind === 'area')) assert.ok(contains(it.geometry, it.point), it.name);
});

test('a street\'s point is on it', { skip }, () => {
  for (const it of items.filter((x) => x.kind === 'street')) {
    assert.ok(distanceTo(it.geometry, it.point) < 60, `${it.name} is ${Math.round(distanceTo(it.geometry, it.point))} m from its point`);
  }
});

test('every item has a street view point near it', { skip }, () => {
  for (const it of items) {
    assert.ok(Number.isFinite(it.streetview?.[0]) && Number.isFinite(it.streetview?.[1]), it.name);
    const d = distanceTo(it.geometry, it.streetview);
    assert.ok(d < 400, `${it.name} is ${Math.round(d)} m from its street view point`);
  }
});

test('an area\'s street view point is inside it', { skip }, () => {
  for (const it of items.filter((x) => x.kind === 'area')) assert.ok(contains(it.geometry, it.streetview), it.name);
});

test('a year of daily sets can be built from the real data', { skip }, () => {
  for (let i = 0; i < 365; i++) {
    const set = dailySet(items, dateKey(new Date(2027, 0, 1 + i)));
    assert.equal(set.length, 10);
    assert.equal(new Set(set.map((q) => q.target.name)).size, 10);
    assert.equal(set[0].target.kind, 'area');
    const apart = set.map((q) => q.target.apart).filter(Boolean);
    assert.equal(new Set(apart).size, apart.length);
    const count = (g) => set.filter((q) => GROUP[q.target.kind] === g).length;
    assert.ok(count('area') >= 3 && count('area') <= 5 && count('street') >= 1 && count('street') <= 3 && count('place') >= 3 && count('place') <= 5);
  }
});

test('every kind turns up over a month', { skip }, () => {
  const kinds = new Set();
  for (let i = 0; i < 30; i++) for (const q of dailySet(items, dateKey(new Date(2027, 0, 1 + i)))) kinds.add(q.target.kind);
  assert.deepEqual([...kinds].sort(), ['area', 'bridge', 'landmark', 'street']);
});

test('every item is in exactly one practice kind, and each kind fills a round', { skip }, () => {
  for (const it of items) assert.equal(PRACTICE.filter((k) => k.has(it)).length, 1, it.name);
  for (const kind of PRACTICE) {
    assert.ok(items.filter(kind.has).length >= PRACTICE_SIZE, kind.label);
    assert.equal(practiceSet(items, { key: dateKey(), category: kind.id, seed: 1 }).length, PRACTICE_SIZE, kind.label);
  }
});
