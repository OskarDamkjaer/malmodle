import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LAUNCH, laterKey } from '../app/daily.mjs';
import { dateProblems, newDates } from '../scripts/lib/dates.mjs';
import { coreWritten, move, pendingWritten, pick, undescribed } from '../scripts/lib/join.mjs';
import { SOONEST } from '../scripts/lib/made.mjs';
import { pin } from '../scripts/lib/played.mjs';
import { fixture } from './fixture.mjs';

test('core.json and pending.json are written back byte for byte', () => {
  const core = readFileSync('learn/core.json', 'utf8');
  const pending = readFileSync('learn/pending.json', 'utf8');
  assert.equal(coreWritten(JSON.parse(core)), core);
  assert.equal(pendingWritten(JSON.parse(pending)), pending);
});

test('a dated core.json wraps its names under since as it wraps them under core', () => {
  const names = Array.from({ length: 12 }, (_, i) => `Namn nummer ${i}`);
  const text = coreWritten({ core: { areas: names }, since: { '2027-01-05': names } });
  const lines = text.split('\n');
  assert.ok(lines.every((line) => line.length <= 79), text);
  assert.equal(lines.filter((line) => line.includes('"Namn nummer 0"')).length, 2);
  assert.deepEqual(JSON.parse(text), { core: { areas: names }, since: { '2027-01-05': names } });
});

const pending = {
  areas: ['Kroksbäck', 'Höja'],
  streets: ['Hamngatan', 'Östergatan'],
  bridges: ['Slussbron'],
  landmarks: [{ name: 'U3', category: 'byggnad' }],
};

test('sections and names are picked in the order they wait', () => {
  assert.deepEqual(pick(pending, ['streets', 'areas'], []), { areas: ['Kroksbäck', 'Höja'], streets: ['Hamngatan', 'Östergatan'] });
  assert.deepEqual(pick(pending, [], ['Östergatan', 'Slussbron', 'Kroksbäck']), { areas: ['Kroksbäck'], streets: ['Östergatan'], bridges: ['Slussbron'] });
  assert.deepEqual(pick(pending, ['bridges'], ['Slussbron', 'Höja']), { areas: ['Höja'], bridges: ['Slussbron'] });
});

test('places, names not waiting, unknown sections and an empty pick are refused', () => {
  assert.throws(() => pick(pending, ['landmarks'], []), /decoys follow dates/);
  assert.throws(() => pick(pending, [], ['U3']), /U3 is a place/);
  assert.throws(() => pick(pending, [], ['Lugnet']), /Lugnet is not waiting/);
  assert.throws(() => pick(pending, ['parks'], []), /parks is not a section/);
  assert.throws(() => pick(pending, [], []), /name the sections/);
  assert.throws(() => pick({ ...pending, bridges: [] }, ['bridges'], []), /nothing waits in bridges/);
});

test('a name joins only with a verified description', () => {
  const docs = {
    about: { areas: { Kroksbäck: { text: 'Radhus.', source: null, verified: true }, Höja: { text: 'Villor.', source: null, verified: false } } },
    streets: { streets: [{ name: 'Hamngatan', description: null, verified: true }] },
    bridges: { bridges: [{ name: 'Slussbron', description: 'En bro.', verified: true }] },
  };
  assert.deepEqual(undescribed({ areas: ['Kroksbäck'], bridges: ['Slussbron'] }, docs), []);
  assert.deepEqual(undescribed({ areas: ['Kroksbäck', 'Höja', 'Annelund'], streets: ['Hamngatan'] }, docs), [
    'Höja\'s description in learn/about.json is not verified',
    'Annelund has no description in learn/about.json',
    'Hamngatan has no description in learn/streets.json',
  ]);
});

test('a batch leaves pending.json for the end of its section in core.json and its date in since', () => {
  const core = { core: { areas: ['Lugnet'], streets: ['Adelgatan'], bridges: [] }, since: { '2027-02-01': ['Gamla'], '2027-01-05': ['Annelund'] } };
  const moved = move(core, pending, { areas: ['Höja'], streets: ['Hamngatan'] }, '2027-01-05');
  assert.deepEqual(moved.core, {
    core: { areas: ['Lugnet', 'Höja'], streets: ['Adelgatan', 'Hamngatan'], bridges: [] },
    since: { '2027-01-05': ['Annelund', 'Höja', 'Hamngatan'], '2027-02-01': ['Gamla'] },
  });
  assert.deepEqual(Object.keys(moved.core.since), ['2027-01-05', '2027-02-01']);
  assert.deepEqual(moved.pending, { ...pending, areas: ['Kroksbäck'], streets: ['Östergatan'] });
  assert.deepEqual(move({ core: { bridges: ['Ön'] } }, pending, { bridges: ['Slussbron'] }, '2027-03-01').core, { core: { bridges: ['Ön', 'Slussbron'] }, since: { '2027-03-01': ['Slussbron'] } });
});

test('pinning keeps the days already pinned and adds the rest through today', () => {
  const items = fixture();
  const today = laterKey(LAUNCH, 3);
  const days = pin({ items, decoys: [] }, { [LAUNCH]: 'kept' }, today);
  assert.deepEqual(Object.keys(days), [0, 1, 2, 3].map((n) => laterKey(LAUNCH, n)));
  assert.equal(days[LAUNCH], 'kept');
  assert.match(days[today], /^[0-9a-f]+$/);
});

const TODAY = '2027-03-10';
const LAST = '2027-03-09';
const ahead = (n) => laterKey(TODAY, n);
const docs = ({ since = {}, changes = {}, days = {} } = {}) => ({
  core: { core: {}, since },
  places: { places: [{ name: 'Konditori Katarina' }, { name: 'Lilla Torg', changes }] },
  days: { days },
});

test('without a new date the check passes, however old the pin', () => {
  const base = docs({ since: { [ahead(-20)]: ['Höja'] }, changes: { [ahead(1)]: { lat: 55.6 } } });
  assert.deepEqual(dateProblems(base, structuredClone(base), ahead(-40), TODAY), { fresh: [], problems: [] });
});

test('a new date far enough ahead passes, and one too close fails', () => {
  const base = docs();
  const far = dateProblems(base, docs({ since: { [ahead(SOONEST)]: ['Höja'] } }), LAST, TODAY);
  assert.deepEqual(far.fresh.map((d) => [d.file, d.how, d.day]), [['learn/core.json', 'new', ahead(SOONEST)]]);
  assert.deepEqual(far.problems, []);
  assert.match(dateProblems(base, docs({ since: { [ahead(SOONEST - 1)]: ['Höja'] } }), LAST, TODAY).problems.join(), /must be 3 or more days ahead/);
  assert.match(dateProblems(base, docs({ days: { [ahead(1)]: { by: null, slots: [] } } }), LAST, TODAY).problems.join(), /learn\/days\.json: new .* is 1 day away/);
  assert.match(dateProblems(base, docs({ changes: { [ahead(0)]: { lat: 55.6 } } }), LAST, TODAY).problems.join(), /places\/places\.json: new .* for Lilla Torg is today/);
  assert.match(dateProblems(base, docs({ since: { [LAST]: ['Höja'] } }), LAST, TODAY).problems.join(), /on or before 2027-03-09/);
});

test('a date that is changed or removed counts as new', () => {
  const base = docs({ since: { [ahead(1)]: ['Höja'] }, changes: { [ahead(2)]: { lat: 55.6 } } });
  const grown = dateProblems(base, docs({ since: { [ahead(1)]: ['Höja', 'Hamngatan'] }, changes: { [ahead(2)]: { lat: 55.6 } } }), LAST, TODAY);
  assert.deepEqual(grown.fresh.map((d) => [d.how, d.day]), [['changed', ahead(1)]]);
  assert.equal(grown.problems.length, 1);
  const moved = newDates(base, docs({ since: { [ahead(1)]: ['Höja'] }, changes: { [ahead(2)]: { lat: 55.7 } } }));
  assert.deepEqual(moved.map((d) => [d.how, d.name]), [['changed', 'Lilla Torg']]);
  assert.deepEqual(newDates(base, docs({ changes: { [ahead(2)]: { lat: 55.6 } } })).map((d) => [d.how, d.day]), [['removed', ahead(1)]]);
});

test('a stale pin fails only when there is a new date', () => {
  const base = docs();
  const stale = laterKey(TODAY, -SOONEST - 1);
  assert.deepEqual(dateProblems(base, docs(), stale, TODAY).problems, []);
  assert.match(dateProblems(base, docs({ since: { [ahead(10)]: ['Höja'] } }), stale, TODAY).problems.join(), /run node scripts\/played\.mjs/);
  assert.deepEqual(dateProblems(base, docs({ since: { [ahead(10)]: ['Höja'] } }), laterKey(TODAY, -SOONEST), TODAY).problems, []);
});

test('a file missing on the base counts every date in it as new', () => {
  const fresh = newDates({ core: null, places: null, days: null }, docs({ days: { [ahead(5)]: { by: null, slots: [] } } }));
  assert.deepEqual(fresh.map((d) => [d.file, d.how]), [['learn/days.json', 'new']]);
});
