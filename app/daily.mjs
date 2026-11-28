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
export const LAUNCH = '2026-10-10';
export const SPACED = '2026-10-21';

export const GROUP = { area: 'area', street: 'street', landmark: 'place', bridge: 'place' };

const food = (it) => it.kind === 'landmark' && it.category === 'krog' && !it.apart;

export const DECKS = {
  area: (it) => it.kind === 'area',
  street: (it) => it.kind === 'street',
  food,
  place: (it) => GROUP[it.kind] === 'place' && !food(it),
};

const FOOD_SHARE = 0.2;
const APART_GAP = 6;
const SPACING = 0.75;
export const SHOWN_GAP = 3;

export const MIXES = {
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

const utc = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const dayCount = (from, to) => Math.max(0, Math.round((utc(to) - utc(from)) / 86400000));

function daysBetween(from, to) {
  const out = [];
  for (let t = utc(from); t < utc(to); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export const issue = (key) => dayCount(LAUNCH, key) + 1;

const tally = [Object.fromEntries(Object.keys(DECKS).map((d) => [d, 0]))];

export function dealt(key) {
  const at = dayCount(EPOCH, key);
  while (tally.length <= at) {
    const count = { ...tally[tally.length - 1] };
    for (const slot of plan(dayRandom(laterKey(EPOCH, tally.length - 1)))) count[slot.deck] += 1;
    tally.push(count);
  }
  return { ...tally[at] };
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

function drawn(items, key, decks) {
  const slots = plan(dayRandom(key));
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
  return { slots, targets };
}

function spacedRound(before, rng) {
  const n = before.length;
  const wait = Math.ceil(n * SPACING);
  const left = before.map((card, p) => ({ card, ready: Math.max(0, p - (n - wait)) }));
  const groups = new Map();
  for (const { card } of left) if (card.apart) groups.set(card.apart, (groups.get(card.apart) ?? 0) + 1);
  const out = [];
  for (let q = 0; q < n; q++) {
    const tail = out.length >= APART_GAP - 1 ? out.slice(1 - APART_GAP) : [...before.slice(before.length - (APART_GAP - 1 - out.length)), ...out];
    const lately = new Set(tail.map((o) => o.apart).filter(Boolean));
    const fits = left.filter((x) => !lately.has(x.card.apart));
    const ready = fits.filter((x) => x.ready <= q);
    const due = fits.filter((x) => x.card.apart && (groups.get(x.card.apart) - 1) * APART_GAP >= n - q - 1);
    const pool = due.length ? due : ready.length ? ready : fits.length ? [fits.reduce((a, b) => (b.ready < a.ready ? b : a))] : left;
    const pick = pool[Math.floor(rng() * pool.length)];
    out.push(pick.card);
    left.splice(left.indexOf(pick), 1);
    if (pick.card.apart) groups.set(pick.card.apart, groups.get(pick.card.apart) - 1);
  }
  return out;
}

function spacedDeck(cards, name, before) {
  const rounds = [];
  const round = (r) => {
    while (rounds.length <= r) {
      const prev = rounds.length ? rounds[rounds.length - 1] : before;
      rounds.push(spacedRound(prev, random(hash(`malmo:spaced:${name}:${rounds.length}`))));
    }
    return rounds[r];
  };
  return { size: cards.length, at: (n) => round(Math.floor(n / cards.length))[n % cards.length] };
}

export const inPlay = (items, key) => items.filter((it) => !it.since || it.since <= key);

export function asOf(it, key) {
  if (!it.changes) return it;
  const change = it.changes.findLast((c) => c.on <= key);
  const { changes, ...base } = it;
  if (!change) return base;
  const { on, ...fields } = change;
  return { ...base, ...fields };
}

export const onDay = (items, key) => items.map((it) => asOf(it, key));

export function grouped(items) {
  const groups = new Set(items.map((it) => it.apart).filter(Boolean));
  return items.map((it) => (!it.apart && groups.has(it.name) ? { ...it, apart: it.name } : it));
}

export const decoysOn = (decoys, key) => decoys.filter((d) => (!d.since || d.since <= key) && (!d.until || key < d.until));

export const lasting = (decoys) => decoys.filter((d) => !d.until);

export const settled = (items) => grouped(items.map((it) => asOf(it, it.changes?.at(-1).on)));

function spread(old, fresh) {
  const out = [];
  let f = 0;
  for (let i = 0; i < old.length + fresh.length; i++) {
    const due = Math.round(((i + 1) * fresh.length) / (old.length + fresh.length));
    out.push(f < due ? fresh[f++] : old[i - f]);
  }
  return out;
}

export const NONE = Object.freeze({});

export const makeQuestion = (type, seed, target, items, decoys, avoid) => TYPES[type].build({ target, items, rng: random(seed), avoid, decoys, own: () => random(seed) });

function madeSet(key, slots, items, decoys) {
  const byName = new Map(items.map((it) => [it.name, it]));
  const avoid = new Set(slots.map((s) => s.target));
  const set = slots.filter((s) => byName.has(s.target)).map(({ target, type, seed }) => {
    const it = byName.get(target);
    const q = makeQuestion(type, seed, it, items, decoys, avoid);
    const built = q ? { type, ...q } : { type: 'point', ...TYPES.point.build({ target: it, own: () => random(seed) }) };
    for (const shown of [built.from, built.to]) if (shown) avoid.add(shown.name);
    return built;
  });
  const most = Math.max(0, ...set.map((q) => q.options?.length ?? 0));
  const places = shuffle([...Array(most).keys()], random(hash(key)));
  const taken = new Set();
  for (const q of set) {
    if (!q.options) continue;
    const fits = places.filter((p) => p < q.options.length);
    const at = fits.find((p) => !taken.has(p)) ?? fits[0];
    taken.add(at);
    const rest = shuffle(q.options.filter((name) => name !== q.target.name), random(hash(`${key}:${q.target.name}`)));
    q.options = [...rest.slice(0, at), q.target.name, ...rest.slice(at)];
  }
  return set;
}

function dealer(items, made) {
  const madeOn = (key) => (key > SPACED && made[key]) || null;
  const afterMade = Object.keys(made).filter(madeOn).map((d) => laterKey(d, 1));
  const starts = [...new Set([SPACED, ...items.map((it) => it.since).filter((d) => d && d > SPACED), ...afterMade])].sort();
  const eraOf = (key) => (key < SPACED ? '' : starts.findLast((s) => s <= key));
  const turns = [...new Set(items.flatMap((it) => (it.changes ?? []).map((c) => c.on)))].sort();
  const turnOf = (key) => turns.findLast((t) => t <= key) ?? '';
  const pools = new Map();
  const version = (key) => {
    const era = eraOf(key);
    const turn = turnOf(key);
    const id = `${era}|${turn}`;
    if (!pools.has(id)) {
      const list = grouped(onDay(era ? inPlay(items, era) : items.filter((it) => !it.since), turn));
      pools.set(id, { list, byName: new Map(list.map((it) => [it.name, it])) });
    }
    return pools.get(id);
  };
  const pool = (key) => version(key).list;
  const days = new Map();
  const shuffled = Object.fromEntries(Object.keys(DECKS).map((d) => [d, deck(pool(''), d)]));
  const on = (key) => {
    if (!days.has(key)) {
      const now = version(key).byName;
      if (madeOn(key)) {
        days.set(key, { slots: null, targets: madeOn(key).slots.map((s) => now.get(s.target) ?? null) });
        return days.get(key);
      }
      const { slots, targets } = key < SPACED ? drawn(pool(key), key, shuffled) : spaced(key);
      days.set(key, { slots, targets: targets.map((it) => it && (now.get(it.name) ?? it)) });
    }
    return days.get(key);
  };
  const eras = new Map();
  const era = (start) => {
    if (eras.has(start)) return eras.get(start);
    const last = new Map();
    for (const day of daysBetween(LAUNCH, start)) {
      const shown = day >= laterKey(start, -SHOWN_GAP) ? dailySet(items, day, [], made) : on(day).targets.filter(Boolean).map((target) => ({ target }));
      for (const q of shown) for (const it of [q.target, q.from, q.to]) if (it) last.set(it.name, day);
    }
    const asked = (it) => last.get(it.name) ?? '';
    const prev = start === SPACED ? null : era(starts[starts.indexOf(start) - 1]);
    const decks = {};
    const carried = {};
    for (const name of Object.keys(DECKS)) {
      const cards = pool(start).filter(DECKS[name]).sort((a, b) => (a.name < b.name ? -1 : 1));
      const fresh = prev ? cards.filter((it) => it.since === start) : [];
      if (prev && !fresh.length && !madeOn(laterKey(start, -1))) {
        decks[name] = prev.decks[name];
        carried[name] = prev.cursor(start)[name];
        continue;
      }
      const old = cards.filter((it) => !fresh.includes(it)).sort((a, b) => (asked(a) < asked(b) ? -1 : asked(a) > asked(b) ? 1 : 0));
      decks[name] = spacedDeck(cards, prev ? `${name}:${start}` : name, spread(old, fresh));
      carried[name] = 0;
    }
    const deckOf = (name) => (decks[name].size ? name : 'place');
    const counts = [carried];
    const cursor = (key) => {
      const at = dayCount(start, key);
      while (counts.length <= at) {
        const next = { ...counts[counts.length - 1] };
        for (const slot of plan(dayRandom(laterKey(start, counts.length - 1)))) next[deckOf(slot.deck)] += 1;
        counts.push(next);
      }
      return { ...counts[at] };
    };
    const deal = (key) => {
      const slots = plan(dayRandom(key));
      const next = cursor(key);
      const targets = slots.map((slot) => {
        const name = deckOf(slot.deck);
        return decks[name].at(next[name]++);
      });
      return { slots, targets };
    };
    const it = { decks, cursor, deal };
    eras.set(start, it);
    return it;
  };
  function spaced(key) {
    return era(eraOf(key)).deal(key);
  }
  const ahead = (from, key) => (eraOf(from) === eraOf(key) && !madeOn(key) ? on(key) : era(eraOf(from)).deal(key)).targets.filter(Boolean);
  return { on, pool, ahead, madeOn };
}

const dealers = new WeakMap();

function dealerFor(items, made = NONE) {
  if (!dealers.has(items)) dealers.set(items, new WeakMap());
  const byMade = dealers.get(items);
  if (!byMade.has(made)) byMade.set(made, dealer(items, made));
  return byMade.get(made);
}

const names = (targets) => new Set(targets.filter(Boolean).map((it) => it.name));

export function targetsOn(items, key, made = NONE) {
  return dealerFor(items, made).on(key).targets.filter(Boolean);
}

export function dailySet(items, key, decoys = [], made = NONE) {
  const { on, pool, ahead, madeOn } = dealerFor(items, made);
  const { slots, targets } = on(key);
  const today = decoysOn(decoys, key);
  if (madeOn(key)) return madeSet(key, madeOn(key).slots, pool(key), today);
  const avoid = names(targets);
  if (key >= SPACED) {
    for (let n = 1; n <= SHOWN_GAP; n++) {
      for (const it of ahead(key, laterKey(key, n))) avoid.add(it.name);
      for (const it of targetsOn(items, laterKey(key, -n), made)) avoid.add(it.name);
    }
  }
  const own = (name) => random(hash(`malmo:${key}:${name}`));
  return assemble(slots, [...targets], pool(key), random(hash(`malmo:${key}`)), avoid, today, own);
}

function assemble(slots, targets, items, rng, avoid, decoys, own) {
  const questions = [];
  slots.forEach((slot, i) => {
    if (!targets[i]) return;
    let q = TYPES[slot.type].build({ target: targets[i], items, rng, avoid, decoys, own });
    for (let j = i + 1; !q && j < slots.length; j++) {
      if (slots[j].group !== slot.group || !targets[j]) continue;
      q = TYPES[slot.type].build({ target: targets[j], items, rng, avoid, decoys, own });
      if (q) [targets[i], targets[j]] = [targets[j], targets[i]];
    }
    const type = q ? slot.type : 'point';
    q ??= TYPES.point.build({ target: targets[i], own });
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
export const SOON_DAYS = 14;
export const SOON_SHARE = 5;

export function laterKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const FRIDAY = 5;

export const guestDay = (key) => (new Date(`${key}T00:00Z`).getUTCDay() === FRIDAY ? 'Gästfredag' : 'Gästdag');

export function upcoming(items, key, days = SOON_DAYS, made = NONE) {
  const soon = new Map();
  for (let n = days; n >= 1; n--) for (const it of targetsOn(items, laterKey(key, n), made)) soon.set(it.name, n);
  return soon;
}

export function practiceSet(all, { key, category, seed, decoys = [], made = NONE }) {
  const items = dealerFor(all, made).pool(key);
  const kind = PRACTICE.find((c) => c.id === category);
  const pool = items.filter(kind.has).sort((a, b) => (a.name < b.name ? -1 : 1));
  const soon = upcoming(all, key, SOON_DAYS, made);
  const today = names(targetsOn(all, key, made));
  const rng = random(seed);
  const coming = shuffle(pool.filter((it) => soon.has(it.name)), rng)
    .sort((a, b) => soon.get(a.name) - soon.get(b.name))
    .slice(0, SOON_SHARE);
  const later = shuffle(pool.filter((it) => !soon.has(it.name) && !today.has(it.name)), rng);
  const rest = shuffle(pool.filter((it) => !coming.includes(it) && !later.includes(it)), rng);
  const targets = shuffle([...coming, ...later, ...rest].slice(0, PRACTICE_SIZE), rng);
  const half = Math.ceil(targets.length / 2);
  const mix = [...mixFor(kind.group, half, rng), ...mixFor(kind.group, targets.length - half, rng)];
  const slots = shuffle(mix, rng).map((type) => ({ group: kind.group, type }));
  const own = (name) => random(hash(`practice:${seed}:${name}`));
  return assemble(slots, targets, items, rng, new Set(targets.map((it) => it.name)), decoysOn(decoys, key), own);
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
const isTotal = (n) => Number.isInteger(n) && n >= 0 && n <= SET_SIZE * MAX_SCORE;
const totalOf = (answers) => answers.reduce((sum, a) => sum + a.score, 0);

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
  const rounds = Array.isArray(raw.rounds) && raw.rounds.every(isTotal) ? raw.rounds : finished ? [totalOf(finished)] : [];
  return finished || playing ? { done: finished, playing, rounds } : null;
}

export function remember(raw, { key, set, results, finished }) {
  const answers = results.map(({ q, result }) => parseAnswer(result, q));
  const before = parseSaved(raw, key, set);
  const saved = { version: SAVE_VERSION, key, targets: targetsOf(set) };
  if (finished) {
    const rounds = before?.playing || !before?.rounds.length ? [...(before?.rounds ?? []), totalOf(answers)] : before.rounds;
    return { ...saved, done: answers, rounds };
  }
  return { ...saved, done: before?.done, playing: answers, rounds: before?.rounds ?? [] };
}

export const played = (raw, key, set) => parseSaved(raw, key, set)?.rounds ?? [];

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
