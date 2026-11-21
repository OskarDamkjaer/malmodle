import { DECKS, GROUP, MIXES, SET_SIZE, SPLITS, random } from '/daily.mjs';
import { TYPES, several } from '/questions.mjs';

export const TYPE_NAMES = { point: 'Peka ut', identify: 'Vad ligger här?', neighbour: 'Direkt … om', route: 'Från A till B' };
export const GROUP_NAMES = { area: ['område', 'områden'], street: ['gata', 'gator'], place: ['plats', 'platser'] };

export const TYPES_FOR = {
  area: ['point', 'identify', MIXES.area.type],
  street: ['point', 'identify', MIXES.street.type],
  place: ['point', 'identify'],
};

const WHY = {
  identify: 'För få andra av samma slag att välja bland.',
  neighbour: 'Inget område har det ensamt åt något håll.',
  route: 'Gatans ändar når inte två namngivna platser, eller så går en annan gata bättre mellan dem.',
};

const CHAIN = 'Det finns på flera ställen, så kartan kan inte visa ett av dem.';

const TAKEN = {
  neighbour: 'Området den skulle utgå från frågas redan i dagen.',
  route: 'Det vid gatans ändar frågas redan i dagen.',
};

const make = (type, seed, item, items, decoys, avoid) => TYPES[type].build({ target: item, items, rng: random(seed), avoid, decoys, own: () => random(seed) });

function why(type, seed, item, items, decoys) {
  if (type === 'identify' && several(item)) return CHAIN;
  return TAKEN[type] && make(type, seed, item, items, decoys, new Set([item.name])) ? TAKEN[type] : WHY[type];
}

export function assemble(slots, items, decoys = [], find = () => null) {
  const byName = new Map(items.map((it) => [it.name, it]));
  const avoid = new Set(slots.map((s) => s.target));
  return slots.map((slot) => {
    const { target, type, seed } = slot;
    const inside = byName.get(target);
    const item = inside ?? find(slot) ?? null;
    const base = {
      target, type, seed, at: slot.at ?? null, item, outside: Boolean(item && !inside),
      group: item && GROUP[item.kind], food: Boolean(item && DECKS.food(item)), apart: item?.apart ?? null, q: null, types: [],
    };
    if (!item) return { ...base, problem: 'Det här finns inte på kartan.' };
    const before = new Set(avoid);
    const types = TYPES_FOR[base.group].map((t) => {
      if (make(t, seed, item, items, decoys, before)) return { type: t, ok: true };
      return { type: t, ok: false, why: why(t, seed, item, items, decoys) };
    });
    const entry = { ...base, types, avoid: before };
    if (!TYPES_FOR[base.group].includes(type)) return { ...entry, problem: `${TYPE_NAMES[type] ?? type} går inte att fråga om ${GROUP_NAMES[base.group][1]}.` };
    const q = make(type, seed, item, items, decoys, before);
    if (!q) return { ...entry, problem: types.find((t) => t.type === type).why };
    for (const shown of [q.from, q.to]) if (shown) avoid.add(shown.name);
    return { ...entry, q: { type, ...q } };
  });
}

const variant = (q) => [q.region?.name, q.from?.name, q.side, q.to?.name, ...[...(q.options ?? [])].sort()].join('|');

export function another(entry, items, decoys = []) {
  if (!entry.q) return null;
  const was = variant(entry.q);
  for (let n = 1; n <= 24; n++) {
    const q = make(entry.type, entry.seed + n, entry.item, items, decoys, entry.avoid);
    if (q && variant(q) !== was) return entry.seed + n;
  }
  return null;
}

const span = (group) => {
  const counts = SPLITS.map((s) => s[group]);
  return [Math.min(...counts), Math.max(...counts)];
};
const of = (entries, group) => entries.filter((e) => e.group === group);
const tally = (entries, type) => entries.filter((e) => e.type === type).length;
const PLACE_IDENTIFY = (n) => [1, n >= 5 ? 2 : 1];

export const FOOD_MOST = 2;

export function typical(entries) {
  const full = entries.length >= SET_SIZE;
  const cell = (n, range, applies = true) => ({ n, range, usual: !applies || !range || (n <= range[1] && (!full || n >= range[0])) });
  const rows = Object.keys(GROUP_NAMES).map((group) => {
    const mine = of(entries, group);
    const m = MIXES[group];
    const types = m ? [['point', m.point], ['identify', m.identify], [m.type, m.special]] : [['point', null], ['identify', PLACE_IDENTIFY(mine.length)]];
    return { group, ...cell(mine.length, span(group)), types: types.map(([type, range]) => ({ type, ...cell(tally(mine, type), range, mine.length > 0) })) };
  });
  const [first] = entries;
  const food = entries.filter((e) => e.food).length;
  return {
    rows,
    lead: { usual: !first?.group || (first.group === 'area' && first.type === 'point'), now: first?.group ? `${TYPE_NAMES[first.type]}, ${GROUP_NAMES[first.group][0]}` : null },
    food: { n: food, range: [0, FOOD_MOST], usual: food <= FOOD_MOST },
  };
}

export function flags(entries) {
  return entries.map((entry, i) => {
    const out = [];
    if (entry.problem) out.push(['warn', entry.problem]);
    entries.forEach((other, j) => {
      if (j === i) return;
      if (other.target === entry.target) out.push(['warn', `samma som fråga ${j + 1}`]);
      else if (entry.apart && other.apart === entry.apart) out.push(['warn', `hör ihop med fråga ${j + 1}`]);
      if (other.q?.options?.includes(entry.target) && other.target !== entry.target) out.push(['note', `alternativ i fråga ${j + 1}`]);
    });
    if (entry.outside) out.push(['note', 'finns inte i spelet än']);
    return out;
  });
}

export const WHAT = { add: 'Ta med i spelet', remove: 'Ta bort ur spelet', fix: 'Något ser fel ut' };

export function proposals(entries, notes = []) {
  const asked = (target) => entries.findIndex((e) => e.target === target) + 1 || null;
  const added = entries
    .filter((e) => e.outside && !notes.some((n) => n.what === 'add' && n.target === e.target))
    .map((e) => ({ target: e.target, ...(e.at && { at: e.at }), what: 'add', text: '', auto: true }));
  return [...added, ...notes].map((p) => ({ ...p, question: asked(p.target) }));
}

export const ready = (entries) => entries.length === SET_SIZE && entries.every((e) => e.q);

export const LIMITS = { note: 500, name: 80, remark: 1500 };

export function sending({ slots, entries, notes = [], name = '', remark = '', player }) {
  return {
    player,
    slots: slots.map(({ target, type, seed, at }) => ({ target, type, seed, ...(at && { at }) })),
    notes: proposals(entries, notes).map(({ target, what, text, at }) => ({ target, what, text: text.trim(), ...(at && { at }) })),
    name: name.trim(),
    remark: remark.trim(),
  };
}

const encode = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (code) => new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
const isAt = (at) => at === undefined || (Array.isArray(at) && at.length === 2 && at.every(Number.isFinite));
const row = (fields, at) => (at ? [...fields, at] : fields);

export function pack({ slots, notes = [] }) {
  return encode(JSON.stringify({
    q: slots.map((s) => row([s.target, s.type, s.seed], s.at)),
    n: notes.map((n) => row([n.target, n.what, n.text], n.at)),
  }));
}

export function unpack(code) {
  try {
    const { q, n = [] } = JSON.parse(decode(code));
    if (!Array.isArray(q) || !Array.isArray(n)) return null;
    const slots = q.map(([target, type, seed, at]) => (typeof target === 'string' && typeof type === 'string' && Number.isInteger(seed) && isAt(at)
      ? { target, type, seed, ...(at && { at }) } : null));
    const notes = n.map(([target, what, text, at]) => (typeof target === 'string' && Object.hasOwn(WHAT, what) && typeof text === 'string' && isAt(at)
      ? { target, what, text, ...(at && { at }) } : null));
    return slots.every(Boolean) && notes.every(Boolean) ? { slots, notes } : null;
  } catch {
    return null;
  }
}
