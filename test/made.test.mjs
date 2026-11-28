import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dailySet, laterKey } from '../app/daily.mjs';
import { APART, fitTogether, problems, schedule } from '../scripts/lib/made.mjs';

const QUIZ = 'build/data/quiz.json';
const skip = existsSync(QUIZ) ? false : `${QUIZ} is missing; run node scripts/build-quiz.mjs`;
const quiz = skip ? { items: [], decoys: [] } : JSON.parse(readFileSync(QUIZ, 'utf8'));
const FROM = '2027-06-01';

const entryFrom = (day) => ({ by: null, slots: dailySet(quiz.items, day, quiz.decoys, quiz.made).map((q) => ({ target: q.target.name, type: q.type, seed: 1 })) });
const gap = (a, b) => Math.abs(Math.round((Date.parse(b) - Date.parse(a)) / 86400000));

test('days scheduled together each fit, apart from each other and from the days already made', { skip }, () => {
  const entries = [entryFrom(laterKey(FROM, 40)), entryFrom(laterKey(FROM, 50)), entryFrom(laterKey(FROM, 60))];
  const dates = schedule(quiz, entries, FROM);
  assert.ok(dates.every(Boolean), String(dates));
  for (const day of dates) assert.ok(day >= FROM, day);
  const known = [...dates, ...Object.keys(quiz.made ?? {})];
  for (const [n, a] of known.entries()) for (const b of known.slice(n + 1)) assert.ok(gap(a, b) >= APART, `${a} and ${b}`);
  assert.deepEqual(fitTogether(quiz, dates.map((day, n) => ({ day, entry: entries[n], label: `#${n}` }))), []);
});

test('days are suggested a week apart, and two days on one date do not fit together', { skip }, () => {
  const a = entryFrom(laterKey(FROM, 40));
  const b = entryFrom(laterKey(FROM, 70));
  const [first, second] = schedule(quiz, [a, b], FROM);
  assert.equal(gap(first, second), APART);
  const twice = fitTogether(quiz, [{ day: first, entry: a, label: '#1' }, { day: first, entry: b, label: '#2' }]);
  assert.match(twice.join('\n'), /#2: .* already has a day made by hand/);
  assert.deepEqual(problems(quiz, laterKey(first, 1), a), []);
});
