import { THEMES, DEFAULT_THEME } from '/themes.mjs';
import { dailySet, dateKey, random } from '/daily.mjs';
import { CLOSE_SCORE, MAX_SCORE, TYPES, distanceScore } from '/questions.mjs';
import { summarize, tally } from '/crowd.mjs';
import { crowdCard } from '/crowd-view.js';

let days = [];

const SHAPES = { vanlig: 'vanlig', tvådelad: 'två grupper', lätt: 'lätt dag', svår: 'svår dag', bred: 'bred spridning' };

const STATES = [
  { label: 'Ensam', players: 1, place: 1 },
  { label: '3 spelare', players: 3, place: 2 },
  { label: '3 spelare, två senaste kvarten', players: 3, place: 2, recent: 2 },
  { label: '3 spelare, pausad', players: 3, place: 2, paused: true },
  { label: '4 spelare, du bäst', players: 4, place: 1 },
  { label: '5 spelare, du bäst', players: 5, place: 1 },
  { label: '5 spelare, tvåa', players: 5, place: 2 },
  { label: '5 spelare, trea', players: 5, place: 3 },
  { label: '5 spelare, sist', players: 5, place: 5 },
  { label: '8 spelare, delad etta', players: 8, place: 1, tied: 1 },
  { label: '8 spelare, i mitten', players: 8, place: 4 },
  { label: '12 spelare, tvåa', players: 12, place: 2 },
  { label: '19 spelare, sjua', players: 19, place: 7 },
  { label: '19 spelare, tia', players: 19, place: 10 },
  { label: '40 spelare, du bäst', players: 40, place: 1 },
  { label: '40 spelare, delad trea med tre', players: 40, place: 3, tied: 3 },
  { label: '250 spelare, delad bäst med två', players: 250, place: 1, tied: 2 },
  { label: '400 spelare, näst bäst', players: 400, place: 2 },
  { label: '400 spelare, pausad', players: 400, place: 40, paused: true },
  { label: '400 spelare, tia', players: 400, place: 10 },
  { label: '400 spelare, elva', players: 400, place: 11 },
  { label: '5 000 spelare, plats 23', players: 5000, place: 23 },
  { label: '5 000 spelare, delad plats 12', players: 5000, place: 12, tied: 4 },
  { label: '5 000 spelare, plats 27', players: 5000, place: 27 },
  { label: '20 000 spelare, plats 100', players: 20000, place: 100 },
  ...[0.02, 0.07, 0.2, 0.3, 0.4, 0.6, 0.8, 0.88, 0.95, 0.985].map((share) => (
    { label: `1 000 spelare, topp ${Math.round(share * 1000) / 10} %`, players: 1000, share }
  )),
  { label: '300 spelare, sist', players: 300, share: 1 },
  { label: 'Prick: först av 300', players: 300, share: 0.3, hit: 0 },
  { label: 'Prick: en av fyra', players: 300, share: 0.3, hit: 3 },
  { label: 'Prick: en av 20 %', players: 300, share: 0.3, hit: 60 },
  { label: 'Nära: ingen närmare, ingen lika', players: 300, share: 0.4, near: [0, 0] },
  { label: 'Nära: ingen närmare, två lika', players: 300, share: 0.4, near: [0, 2] },
  { label: 'Nära: en spelare närmare', players: 300, share: 0.4, near: [1, 0] },
  { label: 'Nära: åtta närmare, en lika', players: 300, share: 0.4, near: [8, 1] },
  { label: 'Nära: 40 närmare av 300', players: 300, share: 0.4, near: [40, 0] },
  { label: 'Nära: 30 spelare', players: 30, share: 0.4, near: [1, 0] },
  { label: '2 000 spelare, svår dag, nära', players: 2000, share: 0.2, shape: 'svår', near: [60, 3] },
  { label: '300 spelare, inget att lyfta', players: 300, share: 0.8, flop: true },
  { label: '300 spelare, noll på allt', players: 300, share: 1, zero: true },
  ...[200, 5000].flatMap((players) => Object.entries(SHAPES).map(([shape, name]) => (
    { label: `${players.toLocaleString('sv-SE')} spelare, ${name}`, players, shape, share: 0.3 }
  ))),
];

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

function normal(rng) {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

function rounds(questions, players, seed, shape = 'vanlig') {
  const rng = random(seed);
  const [lo, hi] = { lätt: [0.65, 0.95], svår: [0.05, 0.35] }[shape] ?? [0.2, 0.9];
  const ease = questions.map(() => lo + rng() * (hi - lo));
  return Array.from({ length: players }, (_, p) => {
    const skill = shape === 'tvådelad' ? (p % 2 ? 0.35 : -0.35) + rng() * 0.2 - 0.1
      : shape === 'bred' ? rng() * 1.2 - 0.6
      : rng() * 0.5 - 0.25;
    return questions.map((q, i) => {
      const good = Math.min(0.98, Math.max(0.02, ease[i] + skill));
      if (TYPES[q.type].input === 'choice') return rng() < good ? MAX_SCORE : rng() < 0.35 ? CLOSE_SCORE : 0;
      const meters = 2500 * Math.exp(-3.2 * good) * Math.exp(0.9 * normal(rng));
      return distanceScore(meters, q.target.geometry);
    });
  }).sort((a, b) => sum(b) - sum(a));
}

function crowdFor(state, i) {
  const questions = days[i % days.length];
  const played = rounds(questions, state.players, 1000 + i, state.shape);
  const place = state.place ?? Math.max(1, Math.round(state.share * state.players));
  const isMap = (q) => TYPES[q.type].input === 'map';
  const nearQ = questions.findIndex(isMap);
  const me = place - 1;
  if (state.flop || state.near || state.hit !== undefined) played[me] = played[me].map((s, q) => (isMap(questions[q]) ? Math.min(s, 70) : Math.min(s, CLOSE_SCORE)));
  if (state.near) {
    const [closer, tied] = state.near;
    let k = 0;
    played.forEach((p, j) => {
      if (j === me) return;
      p[nearQ] = k < closer ? 95 : k < closer + tied ? 88 : Math.min(p[nearQ], 30 + (j % 50));
      k += 1;
    });
    played[me][nearQ] = 88;
  }
  if (state.hit !== undefined) {
    let k = 0;
    played.forEach((p, j) => {
      if (j === me) return;
      p[nearQ] = k < state.hit ? 100 : Math.min(p[nearQ], 30 + (j % 50));
      k += 1;
    });
    played[me][nearQ] = 100;
  }
  if (state.zero) played[me] = played[me].map(() => 0);
  for (let t = 0; t < (state.tied ?? 0); t++) played[place + t] = played[place - 1];
  return crowdFrom(questions, played, me);
}

function crowdFrom(questions, played, me) {
  const rows = played.map((scores) => ({ total: sum(scores), scores }));
  return { reply: summarize(tally(rows), rows[me]), names: questions.map((q) => q.target.name) };
}

function liveState() {
  const questions = days[0];
  const pool = rounds(questions, 400, 77);
  const order = random(78);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(order() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const me = pool.findIndex((p) => sum(p) > 300 && sum(p) < 700);
  [pool[0], pool[me]] = [pool[me], pool[0]];
  let n = 1;
  let timer = 0;
  const section = el('section', 'state');
  const card = crowdCard({ onPractise: () => {}, onRefresh: () => { if (paused) pause.click(); } });
  const controls = el('div', 'live');
  const label = el('h3', '', '');
  const set = (count) => {
    n = Math.max(1, Math.min(pool.length, count));
    const { reply, names } = crowdFrom(questions, pool.slice(0, n), 0);
    label.textContent = `Fylls på · ${n} spelare`;
    card.update(reply, names);
  };
  const button = (text, act) => { const b = el('button', '', text); b.type = 'button'; b.addEventListener('click', act); return b; };
  const auto = button('Spela upp', () => {
    if (timer) { clearInterval(timer); timer = 0; auto.textContent = 'Spela upp'; return; }
    auto.textContent = 'Pausa';
    timer = setInterval(() => { set(n + Math.max(1, Math.round(n / 8))); if (n >= pool.length) auto.click(); }, 900);
  });
  let paused = false;
  const pause = button('Pausa uppdatering', () => {
    paused = !paused;
    pause.textContent = paused ? 'Uppdatera igen' : 'Pausa uppdatering';
    card.pause(paused ? new Date() : null);
  });
  controls.append(button('Börja om', () => set(1)), button('+1', () => set(n + 1)), button('+10', () => set(n + 10)), auto, pause);
  section.append(label, controls, card.node);
  set(1);
  return section;
}

function render() {
  document.getElementById('states').replaceChildren(liveState(), ...STATES.map((state, i) => {
    const { reply, names } = crowdFor(state, i);
    const section = el('section', 'state');
    const card = crowdCard({ onPractise: () => {} });
    section.append(el('h3', '', state.label), card.node);
    card.update(reply, names, reply.you.total, { recent: state.recent });
    if (state.paused) card.pause(new Date());
    return section;
  }));
}

const el = (tag, className, textContent = '') => Object.assign(document.createElement(tag), { className, textContent });

const pick = document.getElementById('theme');
for (const name of Object.keys(THEMES)) pick.append(new Option(THEMES[name].label ?? name, name, false, name === DEFAULT_THEME));
pick.addEventListener('change', () => { document.documentElement.dataset.theme = pick.value; });
document.documentElement.dataset.theme = pick.value;
const { items } = await (await fetch('/data/quiz.json')).json();
const today = new Date();
days = Array.from({ length: 14 }, (_, d) => {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);
  return dailySet(items, dateKey(day));
});
render();
