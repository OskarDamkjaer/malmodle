import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binOf, standing, standouts } from '../app/crowd.mjs';

const crowd = (players, below, total = 500) => ({ players, you: { total, below, scores: [] } });

test('the standing is put in words', () => {
  assert.match(standing(crowd(1, 0)), /^Ingen annan har spelat/);
  assert.equal(standing(crowd(5, 4)), 'Bäst av 5 spelare idag.');
  assert.equal(standing(crowd(5, 0)), 'Längst ner av 5 spelare idag.');
  assert.equal(standing(crowd(5, 2)), 'Bättre än 50 % av 5 spelare idag.');
  assert.match(standing(crowd(5, 2), 800), /första omgång idag, 500 poäng\.$/);
});

test('totals land in their bin, a full score in the last', () => {
  assert.equal(binOf(0, 20), 0);
  assert.equal(binOf(49, 20), 0);
  assert.equal(binOf(50, 20), 1);
  assert.equal(binOf(1000, 20), 19);
});

test('standouts name what few others cleared, then what most did and you did not', () => {
  const names = ['A', 'B', 'C', 'D', 'E'];
  const c = { players: 50, you: { scores: [100, 90, 0, 100, 0] }, cleared: [0.1, 0.3, 0.9, 0.9, 0.5] };
  assert.deepEqual(standouts(names, c), [
    'Bara 10 % klarade A. Du gjorde det.',
    'Bara 30 % klarade B. Du gjorde det.',
    '90 % klarade C, men inte du.',
  ]);
  assert.deepEqual(standouts(names, { ...c, players: 3 }), []);
});
