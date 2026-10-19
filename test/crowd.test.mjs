import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BINS, EXACT_BELOW, aside, beatenText, belowText, columns, countBelow, counted, field, highlight, highlightText,
  pausedText, place, pollDelay, posted, rankLabel, recentOthers, shown, standing, strongest, strongestText, summarize, tally, waiting,
} from '../app/crowd.mjs';
import { SET_SIZE } from '../app/daily.mjs';

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
  const s = summarize(tally(rows), rows[3]);
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
  const few = summarize(tally(rowsOf(Array(EXACT_BELOW - 1).fill(300))), { total: 300, scores: [] });
  const many = summarize(tally(rowsOf(Array(EXACT_BELOW).fill(300))), { total: 300, scores: [] });
  assert.equal(few.totals.length, EXACT_BELOW - 1);
  assert.equal(many.totals, null);
});

test('the curve leaves you out unless asked, and is scaled to its peak', () => {
  const s = summarize(tally(rowsOf([100, 105, 500])), { total: 500, scores: [] });
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
});

test('the wait counts down in words, says who finished lately, and can be skipped once there is someone to compare with', () => {
  assert.match(waiting(1).text, /^Statistiken visas automatiskt när nio till har spelat\.\nKika in igen/);
  assert.match(waiting(9).text, /när en till har spelat/);
  assert.match(waiting(3, { recent: 1 }).text, /\nEn annan spelade klart senaste kvarten\.$/);
  assert.match(waiting(3, { recent: 4 }).text, /\nFyra andra spelade klart senaste kvarten\.$/);
  assert.equal(waiting(3, { recent: 4, paused: true }).text, 'Statistiken visas när sju till har spelat.');
  assert.equal(waiting(1).early, null);
  assert.equal(waiting(2).early, 'Visa ändå');
  assert.equal(shown(9), false);
  assert.equal(shown(10), true);
  assert.equal(shown(1, true), false);
  assert.equal(shown(2, true), true);
});

test('the last quarter hour counts the others who finished in it', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  const ago = (min) => now - min * 60000;
  const day = { finished: [ago(40), ago(14), ago(3), ago(1)] };
  assert.equal(recentOthers(day, { at: ago(1) }, now), 2);
  assert.equal(recentOthers(day, { at: ago(40) }, now), 3);
  assert.equal(recentOthers({ finished: null }, { at: now }, now), 0);
});

test('polling asks often at first, then less, then stops', () => {
  const min = 60000;
  assert.equal(pollDelay(0), 20000);
  assert.equal(pollDelay(4.9 * min), 20000);
  assert.equal(pollDelay(5 * min), min);
  assert.equal(pollDelay(15 * min), 2 * min);
  assert.equal(pollDelay(25 * min), 5 * min);
  assert.equal(pollDelay(30 * min), null);
});

test('a paused card says since when, and offers to update', () => {
  const { text, button } = pausedText(new Date(2026, 9, 18, 14, 32));
  assert.equal(text, 'Automatisk uppdatering pausad 14:32');
  assert.equal(button, 'Uppdatera');
});

test('the day counts each exact total and each score per question', () => {
  const day = tally([{ total: 120, scores: [100, 20] }, { total: 120, scores: [25, 95] }, { total: 7, scores: [7, 0] }]);
  assert.equal(day.players, 3);
  assert.deepEqual(day.totals, { 7: 1, 120: 2 });
  assert.deepEqual(day.questions.slice(0, 2), [{ 100: 1, 25: 1, 7: 1 }, { 20: 1, 95: 1, 0: 1 }]);
  const s = summarize(day, { total: 120, scores: [25, 95] });
  assert.deepEqual([s.you.above, s.you.below], [0, 1]);
  assert.deepEqual(s.atLeast.slice(0, 2), [2, 1]);
  assert.deepEqual(s.better.slice(0, 2), [1, 0]);
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

test('a remembered post is used only for the same day and set, and only while it is whole', () => {
  const scores = Array.from({ length: SET_SIZE }, (_, i) => i * 10);
  const you = { total: scores.reduce((a, b) => a + b, 0), scores, at: 1760000000000 };
  const saved = { day: '2026-10-18', set: 'ab12', you, poll: 'https://data.malmodle.se/2026-10-18/ab12.json', players: 4 };
  assert.deepEqual(posted(saved, '2026-10-18', 'ab12'), { you, poll: saved.poll, players: 4 });
  assert.equal(posted(saved, '2026-10-19', 'ab12'), null);
  assert.equal(posted(saved, '2026-10-18', 'cd34'), null);
  for (const broken of [
    null, 'trasig', {}, { ...saved, poll: null }, { ...saved, poll: '' }, { ...saved, players: 0 }, { ...saved, players: 1.5 },
    { ...saved, you: null }, { ...saved, you: { ...you, total: you.total + 1 } }, { ...saved, you: { ...you, scores: scores.slice(1) } },
    { ...saved, you: { ...you, scores: scores.map(() => 101) } }, { ...saved, you: { ...you, at: 'igår' } },
  ]) assert.equal(posted(broken, '2026-10-18', 'ab12'), null, JSON.stringify(broken));
});

test('the day file counts you once it has at least as many players as your post saw', () => {
  const saved = { players: 4 };
  assert.equal(counted(saved, { players: 4 }), true);
  assert.equal(counted(saved, { players: 9 }), true);
  assert.equal(counted(saved, { players: 3 }), false);
  assert.equal(counted(saved, null), false);
  assert.equal(counted(saved, {}), false);
});
