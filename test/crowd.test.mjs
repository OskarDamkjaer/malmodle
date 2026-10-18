import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BINS, EXACT_BELOW, aside, beatenText, belowText, columns, countBelow, field, firstRound, highlight, highlightText,
  place, rankLabel, standing, strongest, strongestText, summarize, waiting,
} from '../app/crowd.mjs';

const at = (players, rank, tied = 0) => ({ players, you: { total: 500, scores: [], above: rank - 1, below: players - rank - tied } });
const rowsOf = (totals, scores = () => []) => totals.map((total, i) => ({ total, scores: scores(i) }));

test('the summary counts totals in bins of ten, who is above and below you, and how each question went', () => {
  const rows = [
    { total: 0, scores: [0, 0] },
    { total: 180, scores: [100, 80] },
    { total: 1000, scores: [100, 79] },
    { total: 500, scores: [50, 100] },
    { total: 500, scores: [50, 90] },
  ];
  const s = summarize(rows, rows[3]);
  assert.equal(s.players, 5);
  assert.equal(s.histogram.length, BINS);
  assert.equal(BINS, 100);
  assert.equal(s.histogram[0], 1);
  assert.equal(s.histogram[18], 1);
  assert.equal(s.histogram[50], 2);
  assert.equal(s.histogram[99], 1);
  assert.deepEqual([s.you.above, s.you.below], [1, 2]);
  assert.deepEqual(s.totals, [0, 180, 500, 500, 1000]);
  assert.deepEqual(s.atLeast, [4, 1]);
  assert.deepEqual(s.better, [2, 0]);
});

test('the list of totals is only sent while the crowd is small', () => {
  const few = summarize(rowsOf(Array(EXACT_BELOW - 1).fill(300)), { total: 300, scores: [] });
  const many = summarize(rowsOf(Array(EXACT_BELOW).fill(300)), { total: 300, scores: [] });
  assert.equal(few.totals.length, EXACT_BELOW - 1);
  assert.equal(many.totals, null);
});

test('the curve leaves you out unless asked, and is scaled to its peak', () => {
  const s = summarize(rowsOf([100, 105, 500]), { total: 500, scores: [] });
  const ys = columns(s, 20);
  assert.equal(ys.length, 50);
  assert.equal(ys[5], 1);
  assert.equal(ys[25], 0);
  assert.equal(columns(s, 20, true)[25], 0.5);
});

test('below a score is counted exactly from totals, and estimated from bins', () => {
  assert.equal(countBelow({ totals: [100, 200, 300] }, 250), 2);
  const histogram = Array(BINS).fill(0);
  histogram[20] = 10;
  assert.equal(countBelow({ histogram, totals: null }, 205), 5);
  assert.equal(belowText(2, 5), '40 %');
});

test('the place is named near the top: the top quarter of the first ten, or the top half percent', () => {
  assert.equal(place(at(10, 3)).head, 'Tredje bäst');
  assert.equal(place(at(10, 4)), null);
  assert.equal(place(at(400, 10)).head, 'Tionde bäst');
  assert.equal(place(at(400, 11)), null);
  assert.equal(place(at(5000, 23)).head, 'Plats 23');
  assert.equal(place(at(5000, 27)), null);
  assert.deepEqual(place(at(12, 1)), { head: 'Bäst', dek: 'Av tolv spelare idag.' });
  assert.deepEqual(place(at(250, 1, 2)), { head: 'Delad förstaplats', dek: 'Med två andra, av 250 spelare idag.' });
  assert.equal(place(at(5000, 12, 1)).head, 'Delad 12:e plats');
});

test('otherwise the headline says which part of the field you landed in', () => {
  const band = (below) => field({ players: 1001, you: { above: 0, below } }).head;
  assert.equal(band(970), 'Bland de allra bästa');
  assert.equal(band(700), 'Översta tredjedelen');
  assert.equal(band(300), 'Understa tredjedelen');
  assert.equal(band(0), 'Understa fjärdedelen');
  assert.equal(field(at(200, 150)).dek, 'Totalt 200 spelare idag.');
  assert.equal(standing(at(400, 2)).head, 'Näst bäst');
  assert.equal(standing(at(400, 200)).head, 'Övre halvan');
});

test('your share and place read the same way everywhere', () => {
  assert.equal(beatenText(at(5000, 600)), '88 %');
  assert.equal(beatenText(at(400, 2)), '99,7 %');
  assert.equal(rankLabel(at(400, 2)), 'plats 2');
  assert.equal(rankLabel(at(40, 3, 3)), 'delad plats 3');
  assert.equal(aside(at(20, 1)), 'snyggt jobbat');
  assert.equal(aside(at(300, 300)), 'men du är säkert bra på annat');
  assert.equal(aside(at(300, 150)), null);
  assert.match(firstRound(742), /742 poäng\.$/);
});

test('the wait counts down in words', () => {
  assert.match(waiting(1).text, /^Statistiken visas automatiskt när nio till har spelat\.\n/);
  assert.match(waiting(9).text, /när en till har spelat/);
});

test('the highlight is the rarest question you did well on, once ten have played', () => {
  const crowd = { players: 300, you: { scores: [100, 88, 30, 100] }, atLeast: [200, 30, 2, 60], better: [0, 20, 1, 0] };
  assert.equal(highlight(crowd).i, 1);
  assert.equal(highlight({ ...crowd, atLeast: [200, 200, 2, 200] }), null);
  assert.equal(highlight({ ...crowd, players: 9 }), null);
});

test('highlights are put in words, with ties counted in your favour', () => {
  const near = (n, better, players = 300) => highlightText('Möllan', { score: 88, count: n, better, share: n / players }, players);
  const hit = (n, players = 300) => highlightText('Möllan', { score: 100, count: n, better: 0, share: n / players }, players);
  assert.equal(hit(1).text, 'Du är först med att pricka Möllan idag.');
  assert.equal(hit(4).text, 'Du är en av fyra som prickat Möllan idag.');
  assert.deepEqual(hit(61), { kicker: 'Mitt i prick', text: 'Du hör till de 20 % som prickat Möllan idag.', detail: 'Ni är 61 stycken.' });
  assert.equal(near(1, 0).text, 'Du var närmast Möllan av alla idag.');
  assert.deepEqual(near(4, 0), { kicker: 'Nära nog', text: 'Ingen var närmare Möllan än du.', detail: 'Tre andra var lika nära.' });
  assert.equal(near(2, 1).text, 'Bara en spelare var närmare Möllan än du.');
  assert.equal(near(10, 8).detail, 'En annan var lika nära.');
  assert.deepEqual(near(108, 107, 1500), { kicker: 'Nära nog', text: 'Du var närmare Möllan än 93 % av spelarna idag.', detail: 'Bara 107 var närmare.' });
});

test('without a highlight, the strongest question is the one where you beat the most others', () => {
  const crowd = { players: 301, you: { scores: [100, 60, 0] }, atLeast: [250, 100, 301] };
  const s = strongest(crowd);
  assert.equal(s.i, 1);
  assert.equal(strongestText('Möllan', s).text, 'Möllan gick bättre för dig än för 67 % av spelarna.');
  assert.equal(strongest({ ...crowd, atLeast: [301, 301, 301] }), null);
  assert.equal(strongest({ ...crowd, players: 9 }), null);
});
