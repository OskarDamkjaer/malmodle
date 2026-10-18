import { MAX_SCORE } from './questions.mjs';
import { SET_SIZE } from './daily.mjs';

export const MAX_TOTAL = SET_SIZE * MAX_SCORE;
export const BIN = 10;
export const BINS = MAX_TOTAL / BIN;
export const EXACT_BELOW = 50;

export const FEWEST_TO_RANK = 10;
export const PLACES_NAMED = 10;
export const TOP_PART = 1 / 4;
export const TOP_ALWAYS = 0.005;
export const LOW_SHARE = 0.03;

export const FEWEST_TO_COMPARE = 10;
export const FEW_HITS = 10;
export const LOWEST_SCORE = 40;
export const RAREST = 0.3;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
export const RECENT = 15 * MINUTE;
export const POLL = [[5 * MINUTE, 20 * SECOND], [10 * MINUTE, MINUTE], [20 * MINUTE, 2 * MINUTE], [30 * MINUTE, 5 * MINUTE]];

const NBSP = ' ';
const BEST = ['Bäst', 'Näst bäst', 'Tredje bäst', 'Fjärde bäst', 'Femte bäst', 'Sjätte bäst', 'Sjunde bäst', 'Åttonde bäst', 'Nionde bäst', 'Tionde bäst'];
const ORDINAL = ['första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde'];
const WORDS = ['noll', 'en', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv'];

const count = (n) => n.toLocaleString('sv-SE');
const say = (n) => WORDS[n] ?? count(n);
const cap = (text) => text[0].toUpperCase() + text.slice(1);
const percent = (share) => `${Math.round(100 * share)}${NBSP}%`;
const others = (n) => `${say(n)} ${n === 1 ? 'annan' : 'andra'}`;

export const binOf = (total) => Math.min(BINS - 1, Math.floor(total / BIN));

export function tally(rows) {
  const totals = {};
  const questions = Array.from({ length: SET_SIZE }, () => ({}));
  for (const row of rows) {
    totals[row.total] = (totals[row.total] ?? 0) + 1;
    row.scores.forEach((score, i) => { questions[i][score] = (questions[i][score] ?? 0) + 1; });
  }
  return { players: rows.length, totals, questions, finished: null };
}

export function summarize(day, you) {
  const histogram = Array(BINS).fill(0);
  const list = [];
  let above = 0;
  let below = 0;
  for (const [key, n] of Object.entries(day.totals)) {
    const total = Number(key);
    histogram[binOf(total)] += n;
    if (total > you.total) above += n;
    if (total < you.total) below += n;
    if (day.players < EXACT_BELOW) for (let k = 0; k < n; k++) list.push(total);
  }
  const atLeast = you.scores.map(() => 0);
  const better = you.scores.map(() => 0);
  you.scores.forEach((mine, i) => {
    for (const [key, n] of Object.entries(day.questions[i] ?? {})) {
      if (Number(key) >= mine) atLeast[i] += n;
      if (Number(key) > mine) better[i] += n;
    }
  });
  return {
    players: day.players,
    you: { total: you.total, scores: you.scores, above, below },
    histogram,
    totals: day.players < EXACT_BELOW ? list.sort((a, b) => a - b) : null,
    atLeast,
    better,
  };
}

export function recentOthers(day, you, now) {
  if (!day.finished) return 0;
  const recent = day.finished.filter((at) => now - at <= RECENT);
  const mine = recent.indexOf(you.at);
  return recent.length - (mine >= 0 ? 1 : 0);
}

export function pollDelay(elapsed) {
  const step = POLL.find(([until]) => elapsed < until);
  return step ? step[1] : null;
}

export function columns({ histogram, you }, width, everyone = false) {
  const merge = width / BIN;
  const counts = histogram.slice();
  if (!everyone) counts[binOf(you.total)] -= 1;
  const grouped = Array.from({ length: BINS / merge }, (_, c) => counts.slice(c * merge, (c + 1) * merge).reduce((a, b) => a + b, 0));
  const peak = Math.max(1, ...grouped);
  return grouped.map((n) => n / peak);
}

export function countBelow({ histogram, totals }, score) {
  if (totals) return totals.filter((t) => t < score).length;
  const f = score / BIN;
  const whole = Math.min(BINS, Math.floor(f));
  const part = whole < BINS ? histogram[whole] * (f - whole) : 0;
  return Math.round(histogram.slice(0, whole).reduce((a, b) => a + b, 0) + part);
}

const tiedWith = ({ players, you }) => players - you.above - you.below - 1;
const beaten = ({ players, you }) => you.below / (players - 1);

export function waiting(players, { recent = 0, paused = false } = {}) {
  const left = Math.max(1, FEWEST_TO_RANK - players);
  const when = `när ${left === 1 ? 'en' : say(left)} till har spelat.`;
  const lately = recent ? `${cap(others(recent))} spelade klart senaste kvarten.` : 'Kika in igen om en stund.';
  return {
    text: paused ? `Statistiken visas ${when}` : `Statistiken visas automatiskt ${when}\n${lately}`,
    invite: 'Dela Malmödle med en vän',
  };
}

export const pausedText = (time) => ({
  text: `Automatisk uppdatering pausad ${time.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`,
  button: 'Uppdatera',
});

export function place(crowd) {
  const { players, you } = crowd;
  const rank = you.above + 1;
  const named = rank <= PLACES_NAMED && rank <= Math.ceil(players * TOP_PART);
  if (!named && rank / players > TOP_ALWAYS) return null;
  const tied = tiedWith(crowd);
  const of = `av ${say(players)} spelare idag.`;
  if (!tied) return { head: BEST[you.above] ?? `Plats ${count(rank)}`, dek: cap(of) };
  const shared = ORDINAL[you.above] ? `Delad ${ORDINAL[you.above]}plats` : `Delad ${count(rank)}:e plats`;
  return { head: shared, dek: `Med ${others(tied)}, ${of}` };
}

export const BANDS = [
  [0.95, 'Bland de allra bästa'],
  [0.9, 'Bland de bästa'],
  [0.75, 'Översta fjärdedelen'],
  [2 / 3, 'Översta tredjedelen'],
  [0.5, 'Övre halvan'],
  [1 / 3, 'Undre halvan'],
  [0.25, 'Understa tredjedelen'],
  [0, 'Understa fjärdedelen'],
];

export function field(crowd) {
  const share = beaten(crowd);
  return { head: BANDS.find(([from]) => share >= from)[1], dek: `Totalt ${say(crowd.players)} spelare idag.` };
}

export const standing = (crowd) => place(crowd) ?? field(crowd);

export const firstRound = (total) => `Räknat på din första omgång idag, ${total} poäng.`;

export function rankLabel(crowd) {
  const rank = count(crowd.you.above + 1);
  return tiedWith(crowd) ? `delad plats ${rank}` : `plats ${rank}`;
}

export function beatenText(crowd) {
  const p = 100 * beaten(crowd);
  const shown = p >= 99 && p < 100 ? Math.floor(p * 10) / 10 : Math.floor(p);
  return `${shown.toLocaleString('sv-SE')}${NBSP}%`;
}

export const belowText = (below, of) => `${Math.floor((100 * below) / of)}${NBSP}%`;

export function aside(crowd) {
  const share = beaten(crowd);
  if (share === 1) return 'snyggt jobbat';
  return share <= LOW_SHARE ? 'men du är säkert bra på annat' : null;
}

export function highlight({ players, you, atLeast, better }) {
  if (players < FEWEST_TO_COMPARE) return null;
  return you.scores
    .map((score, i) => ({ i, score, count: atLeast[i], better: better[i], share: atLeast[i] / players }))
    .filter((q) => q.score >= LOWEST_SCORE && q.share <= RAREST)
    .reduce((a, b) => (!a || b.share < a.share ? b : a), null);
}

export function strongest({ players, you, atLeast }) {
  if (players < FEWEST_TO_COMPARE) return null;
  const best = you.scores
    .map((score, i) => ({ i, beaten: (players - atLeast[i]) / (players - 1) }))
    .reduce((a, b) => (b.beaten > a.beaten ? b : a));
  return best.beaten > 0 ? best : null;
}

export const strongestText = (name, { beaten }) => ({
  kicker: 'Din starkaste fråga',
  text: `${name} gick bättre för dig än för ${percent(beaten)} av spelarna.`,
});

export const practiceTip = {
  kicker: 'Tips',
  before: 'Prova Malmödles ',
  link: 'övningsläge',
  after: '.',
};

export function highlightText(name, { score, count: n, better, share }, players) {
  if (score >= MAX_SCORE) {
    const kicker = 'Mitt i prick';
    if (n === 1) return { kicker, text: `Du är först med att pricka ${name} idag.` };
    if (n < FEW_HITS) return { kicker, text: `Du är en av ${say(n)} som prickat ${name} idag.` };
    return { kicker, text: `Du hör till de ${percent(share)} som prickat ${name} idag.`, detail: `Ni är ${say(n)} stycken.` };
  }
  const kicker = 'Nära nog';
  const tied = n - 1 - better;
  const closer = better === 1 ? 'en spelare' : say(better);
  const alike = tied ? `${cap(others(tied))} var lika nära.` : null;
  if (better === 0) return { kicker, text: tied ? `Ingen var närmare ${name} än du.` : `Du var närmast ${name} av alla idag.`, detail: alike };
  if (better < FEW_HITS) return { kicker, text: `Bara ${closer} var närmare ${name} än du.`, detail: alike };
  return { kicker, text: `Du var närmare ${name} än ${percent((players - n) / (players - 1))} av spelarna idag.`, detail: `Bara ${closer} var närmare.` };
}
