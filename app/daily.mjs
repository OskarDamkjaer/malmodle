import { MAX_SCORE, TYPES } from './questions.mjs';

export const SPLITS = [
  { area: 4, street: 2, place: 4, weight: 4 },
  { area: 3, street: 2, place: 5, weight: 1 },
  { area: 3, street: 3, place: 4, weight: 1 },
  { area: 4, street: 1, place: 5, weight: 1 },
  { area: 4, street: 3, place: 3, weight: 1 },
  { area: 5, street: 1, place: 4, weight: 1 },
  { area: 5, street: 2, place: 3, weight: 1 },
];

export const SET_SIZE = 10;

export const EPOCH = '2026-01-01';

export const GROUP = { area: 'area', street: 'street', landmark: 'place', bridge: 'place' };

export const DECKS = {
  area: (it) => it.kind === 'area',
  street: (it) => it.kind === 'street',
  food: (it) => it.kind === 'landmark' && it.category === 'krog',
  place: (it) => GROUP[it.kind] === 'place' && it.category !== 'krog',
};

const FOOD_SHARE = 0.2;
const APART_GAP = 6;

const MIXES = {
  area: { point: [1, 3], identify: [1, 2], special: [0, 1], type: 'neighbour' },
  street: { point: [1, 3], identify: [0, 2], special: [0, 1], type: 'route' },
};

export function dateKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function weighted(list, rng) {
  let roll = rng() * list.reduce((sum, x) => sum + (x.weight ?? 1), 0);
  for (const x of list) {
    roll -= x.weight ?? 1;
    if (roll < 0) return x;
  }
  return list[0];
}

function mixFor(group, n, rng) {
  if (group === 'place') {
    const identify = n >= 5 && rng() < 0.5 ? 2 : 1;
    return [...Array(n - identify).fill('point'), ...Array(identify).fill('identify')];
  }
  const m = MIXES[group];
  const options = [];
  for (let p = m.point[0]; p <= m.point[1]; p++) {
    for (let i = m.identify[0]; i <= m.identify[1]; i++) {
      const sp = n - p - i;
      if (sp >= m.special[0] && sp <= m.special[1]) options.push({ p, i, sp });
    }
  }
  const { p, i, sp } = options.length ? options[Math.floor(rng() * options.length)] : { p: n, i: 0, sp: 0 };
  return [...Array(p).fill('point'), ...Array(i).fill('identify'), ...Array(sp).fill(m.type)];
}

export function plan(rng) {
  const split = weighted(SPLITS, rng);
  const slots = [];
  for (const group of ['area', 'street', 'place']) {
    for (const type of shuffle(mixFor(group, split[group], rng), rng)) {
      const deck = group === 'place' ? (rng() < FOOD_SHARE ? 'food' : 'place') : group;
      slots.push({ group, deck, type });
    }
  }
  const first = slots.findIndex((x) => x.group === 'area' && x.type === 'point');
  const [lead] = slots.splice(first, 1);
  return [lead, ...shuffle(slots, rng)];
}

const dayRandom = (key) => random(hash(`malmo:plan:${key}`));

function daysBetween(from, to) {
  const utc = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const out = [];
  for (let t = utc(from); t < utc(to); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function dealt(key) {
  const count = Object.fromEntries(Object.keys(DECKS).map((d) => [d, 0]));
  for (const day of daysBetween(EPOCH, key)) for (const slot of plan(dayRandom(day))) count[slot.deck] += 1;
  return count;
}

function deck(items, name) {
  const cards = items.filter(DECKS[name]).sort((a, b) => (a.name < b.name ? -1 : 1));
  const rounds = new Map();
  const round = (r) => {
    if (!rounds.has(r)) {
      const order = shuffle(cards, random(hash(`malmo:deck:${name}:${r}`)));
      for (let i = 0; i < order.length; i++) {
        const clash = (it) => order.slice(Math.max(0, i - APART_GAP + 1), i).some((o) => o.apart && o.apart === it.apart);
        if (!order[i].apart || !clash(order[i])) continue;
        const j = order.findIndex((it, k) => k > i && (!it.apart || !clash(it)));
        if (j > 0) [order[i], order[j]] = [order[j], order[i]];
      }
      rounds.set(r, order);
    }
    return rounds.get(r);
  };
  return { size: cards.length, at: (n) => round(Math.floor(n / cards.length))[n % cards.length] };
}

export function dailySet(items, key) {
  const slots = plan(dayRandom(key));
  const decks = Object.fromEntries(Object.keys(DECKS).map((d) => [d, deck(items, d)]));
  const next = dealt(key);
  const taken = new Set();
  const apartTaken = new Set();
  const fits = (it) => it && !taken.has(it.name) && !(it.apart && apartTaken.has(it.apart));
  const draw = (name) => {
    const d = decks[name].size ? decks[name] : decks.place;
    const from = d === decks[name] ? name : 'place';
    for (let tries = 0; tries < d.size * 2; tries++) {
      const it = d.at(next[from]++);
      if (fits(it)) return it;
    }
    return null;
  };
  const targets = slots.map((slot) => {
    const it = draw(slot.deck);
    if (it) { taken.add(it.name); if (it.apart) apartTaken.add(it.apart); }
    return it;
  });
  return assemble(slots, targets, items, random(hash(`malmo:${key}`)), new Set(taken));
}

function assemble(slots, targets, items, rng, avoid) {
  const questions = [];
  slots.forEach((slot, i) => {
    if (!targets[i]) return;
    let q = TYPES[slot.type].build({ target: targets[i], items, rng, avoid });
    for (let j = i + 1; !q && j < slots.length; j++) {
      if (slots[j].group !== slot.group || !targets[j]) continue;
      q = TYPES[slot.type].build({ target: targets[j], items, rng, avoid });
      if (q) [targets[i], targets[j]] = [targets[j], targets[i]];
    }
    const type = q ? slot.type : 'point';
    q ??= TYPES.point.build({ target: targets[i] });
    for (const shown of [q.from, q.to]) if (shown) avoid.add(shown.name);
    questions.push({ type, ...q });
  });
  return questions;
}

const among = (...categories) => (it) => it.kind === 'landmark' && categories.includes(it.category);

export const PRACTICE = [
  { id: 'area', label: 'Stadsdelar', group: 'area', has: (it) => it.kind === 'area' },
  { id: 'street', label: 'Gator', group: 'street', has: (it) => it.kind === 'street' },
  { id: 'park', label: 'Parker', group: 'place', has: among('park') },
  { id: 'krog', label: 'Krogar', group: 'place', has: among('krog') },
  { id: 'kafe', label: 'Kaféer & handel', group: 'place', has: among('kafe', 'handel') },
  { id: 'byggnad', label: 'Byggnader & kyrkor', group: 'place', has: among('byggnad', 'kyrka', 'museum', 'skola', 'konst') },
  { id: 'scen', label: 'Scener', group: 'place', has: among('scen') },
  { id: 'torg', label: 'Torg & broar', group: 'place', has: (it) => it.kind === 'bridge' || among('torg', 'vatten', 'omrade')(it) },
  { id: 'idrott', label: 'Idrott & bad', group: 'place', has: among('idrott', 'bad') },
];

export const PRACTICE_SIZE = 10;
export const SOON_DAYS = 7;
export const SOON_SHARE = 2;

export function laterKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function upcoming(items, key, days = SOON_DAYS) {
  const names = new Set();
  for (let n = 1; n <= days; n++) for (const q of dailySet(items, laterKey(key, n))) names.add(q.target.name);
  return names;
}

export function practiceSet(items, { key, category, seed }) {
  const kind = PRACTICE.find((c) => c.id === category);
  const pool = items.filter(kind.has).sort((a, b) => (a.name < b.name ? -1 : 1));
  const soon = upcoming(items, key);
  const today = new Set(dailySet(items, key).map((q) => q.target.name));
  const rng = random(seed);
  const coming = shuffle(pool.filter((it) => soon.has(it.name)), rng).slice(0, SOON_SHARE);
  const later = shuffle(pool.filter((it) => !soon.has(it.name) && !today.has(it.name)), rng);
  const rest = shuffle(pool.filter((it) => !coming.includes(it) && !later.includes(it)), rng);
  const targets = shuffle([...coming, ...later, ...rest].slice(0, PRACTICE_SIZE), rng);
  const half = Math.ceil(targets.length / 2);
  const mix = [...mixFor(kind.group, half, rng), ...mixFor(kind.group, targets.length - half, rng)];
  const slots = shuffle(mix, rng).map((type) => ({ group: kind.group, type }));
  return assemble(slots, targets, items, rng, new Set(targets.map((it) => it.name)));
}

export function band(score) {
  if (score >= MAX_SCORE) return 'green';
  if (score >= 80) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

export const BAND_COLORS = { green: '#2e9e4f', yellow: '#f2c230', orange: '#f08a24', red: '#db3a2f' };

const SQUARES = { green: '🟩', yellow: '🟨', orange: '🟧', red: '🟥' };

export function square(score) {
  return SQUARES[band(score)];
}

export function shareText({ key, scores, url }) {
  const total = scores.reduce((sum, s) => sum + s, 0);
  return [
    `Malmödle ${key}`,
    `${total}/${scores.length * MAX_SCORE}`,
    scores.map(square).join(''),
    url,
  ].filter(Boolean).join('\n');
}

const VERDICTS = [
  [0.9, 'Snyggt!', 'Välkommen tillbaka imorgon.'],
  [0.7, 'Riktigt bra!', 'Ses imorgon.'],
  [0.5, 'Bra jobbat!', 'Ny omgång imorgon.'],
  [0.3, 'På god väg.', 'Försök igen imorgon.'],
  [0, 'Öva en gång till.', 'Försök igen imorgon.'],
];

export function verdict(total, max, daily) {
  const [share, praise, tomorrow] = VERDICTS.find(([least]) => total / max >= least);
  if (!daily) return praise;
  return share ? `${praise} ${tomorrow}` : tomorrow;
}

export const SAVE_KEY = 'malmodle';
const SAVE_VERSION = 1;

const targetsOf = (set) => set.map((q) => q.target.name);

export const setId = (set) => hash(targetsOf(set).join('\n')).toString(16);
const isScore = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;

function parseAnswer(raw, q) {
  if (!isScore(raw?.score)) return null;
  if (TYPES[q.type].input === 'map') {
    return Number.isFinite(raw.distance) && raw.distance >= 0 ? { score: raw.score, distance: raw.distance } : null;
  }
  return typeof raw.choice === 'string' ? { score: raw.score, choice: raw.choice } : null;
}

function parseAnswers(raw, set) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > set.length) return undefined;
  const answers = raw.map((a, i) => parseAnswer(a, set[i]));
  return answers.every(Boolean) ? answers : undefined;
}

function parseSaved(raw, key, set) {
  if (raw?.version !== SAVE_VERSION || raw.key !== key) return null;
  const targets = targetsOf(set);
  if (!Array.isArray(raw.targets) || raw.targets.length !== targets.length) return null;
  if (raw.targets.some((t, i) => t !== targets[i])) return null;
  const done = parseAnswers(raw.done, set);
  const playing = parseAnswers(raw.playing, set);
  const finished = done?.length === set.length ? done : undefined;
  return finished || playing ? { done: finished, playing } : null;
}

export function remember(raw, { key, set, results, finished }) {
  const answers = results.map(({ q, result }) => parseAnswer(result, q));
  const saved = { version: SAVE_VERSION, key, targets: targetsOf(set) };
  if (finished) return { ...saved, done: answers };
  return { ...saved, done: parseSaved(raw, key, set)?.done, playing: answers };
}

export function recall(raw, key, set) {
  const saved = parseSaved(raw, key, set);
  const answers = saved?.playing ?? saved?.done ?? [];
  return answers.map((result, i) => ({ q: set[i], result }));
}

const toCode = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromCode = (code) => new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export function carry({ key, set, results }) {
  const packed = results.map(({ q, result }) => [result.score, TYPES[q.type].input === 'map' ? Math.round(result.distance) : result.choice]);
  return toCode(JSON.stringify([key, setId(set), packed]));
}

export function arrive(raw, code, key, set) {
  let day, id, packed;
  try { [day, id, packed] = JSON.parse(fromCode(code)); } catch { return raw; }
  if (day !== key || id !== setId(set) || parseSaved(raw, key, set)?.done || !Array.isArray(packed)) return raw;
  const done = packed.map((a, i) => Array.isArray(a) && set[i] && (TYPES[set[i].type].input === 'map' ? { score: a[0], distance: a[1] } : { score: a[0], choice: a[1] }));
  const answers = parseAnswers(done, set);
  return answers?.length === set.length ? { version: SAVE_VERSION, key, targets: targetsOf(set), done: answers } : raw;
}
