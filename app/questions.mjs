import { closest, contains, distanceTo, gap, metersBetween, offset } from './geo.mjs';

export const MAX_SCORE = 100;
export const CLOSE_SCORE = 25;

const GRACE = { shape: 10, point: 100 };
const FALLOFF = 900;

export function distanceScore(meters, geometry) {
  const grace = geometry?.type === 'Point' ? GRACE.point : GRACE.shape;
  const over = Math.max(0, meters - grace);
  return Math.round(MAX_SCORE * Math.exp(-over / FALLOFF));
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

const REACH = { street: 60, bridge: 200, landmark: 200 };

export function tappedOn(items, point, kind) {
  const sameKind = items.filter((it) => it.kind === kind);
  if (kind === 'area') return sameKind.find((it) => contains(it.geometry, point)) ?? null;
  let best = null;
  for (const it of sameKind) {
    const d = distanceTo(it.geometry, point);
    if (d <= REACH[kind] && (!best || d < best.d)) best = { it, d };
  }
  return best?.it ?? null;
}

const CLOSE_M = { street: 20, landmark: 300, bridge: 300 };

export function closeTo(target, other) {
  if (!other || other.kind !== target.kind) return false;
  if (target.kind === 'area') return (target.neighbours ?? []).includes(other.name);
  return gap(target.geometry, other.geometry) <= (CLOSE_M[target.kind] ?? 0);
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const point = {
  input: 'map',
  build: ({ target }) => ({ target }),
  prompt: (q) => ({ title: `Var ligger ${q.target.name}?`, detail: q.target.label }),
  showing: () => [],
  view: () => 'home',
  grade(q, tap, items, street) {
    const { distance, point: near } = closest(q.target.geometry, tap);
    const score = distanceScore(distance, q.target.geometry);
    const hit = street === undefined ? tappedOn(items, tap, q.target.kind) : street;
    return {
      score,
      tap,
      near,
      distance,
      hit: score < MAX_SCORE && hit && hit.name !== q.target.name ? hit : null,
    };
  },
};

const identify = {
  input: 'choice',
  build({ target, items, rng }) {
    const others = items
      .filter((it) => it.kind === target.kind && it.name !== target.name)
      .sort((a, b) => metersBetween(a.point, target.point) - metersBetween(b.point, target.point))
      .slice(0, 7);
    if (others.length < 3) return null;
    return { target, options: shuffle([target, ...others], rng).map((it) => it.name) };
  },
  prompt: (q) => ({ title: 'Vad ligger här?', detail: q.target.label }),
  showing: (q) => [{ item: q.target, named: false }],
  view: (q) => ({ items: [q.target], context: 1500 }),
  grade(q, choice, items) {
    const picked = items?.find((it) => it.name === choice);
    const score = choice === q.target.name ? MAX_SCORE : closeTo(q.target, picked) ? CLOSE_SCORE : 0;
    return { score, choice, answer: q.target.name };
  },
};

const SIDES = { norr: [0, 1], söder: [0, -1], öster: [1, 0], väster: [-1, 0] };

function towards(from, to, side) {
  const { east, north } = offset(from.point, to.point);
  const [x, y] = SIDES[side];
  const along = east * x + north * y;
  return along > 0.5 * Math.hypot(east, north);
}

const neighbour = {
  input: 'choice',
  build({ target, items, rng, avoid }) {
    const byName = new Map(items.map((it) => [it.name, it]));
    const sources = items.flatMap((from) => Object.entries(from.beside ?? {})
      .filter(([, name]) => name === target.name && !avoid.has(from.name))
      .map(([side]) => ({ from, side })));
    for (const { from, side } of shuffle(sources, rng)) {
      const adjacent = (from.neighbours ?? []).filter((n) => n !== target.name && byName.has(n)).map((n) => byName.get(n));
      const nearby = items
        .filter((it) => it.kind === 'area' && it.name !== from.name && it.name !== target.name && !adjacent.includes(it))
        .sort((a, b) => metersBetween(a.point, from.point) - metersBetween(b.point, from.point));
      const decoys = [...shuffle(adjacent, rng), ...nearby]
        .filter((it) => !towards(from, it, side))
        .slice(0, 3);
      if (decoys.length < 3) continue;
      return { target, from, side, options: shuffle([target, ...decoys], rng).map((it) => it.name) };
    }
    return null;
  },
  prompt: (q) => ({ title: `Vilket område ligger direkt ${q.side} om ${q.from.name}?`, detail: q.target.label }),
  showing: (q) => [{ item: q.from, named: true }],
  view: (q) => ({ items: [q.from], context: 1200 }),
  grade(q, choice, items) {
    const picked = items?.find((it) => it.name === choice);
    const score = choice === q.target.name ? MAX_SCORE : closeTo(q.target, picked) ? CLOSE_SCORE : 0;
    return { score, choice, answer: q.target.name };
  },
};

const END_REACH = 150;
const ROUTE_MIN = 250;
const ROUTE_NEAR = END_REACH;
const END_RANK = ['torg', 'park', 'byggnad', 'scen', 'idrott', 'handel', 'bad', 'kyrka', 'museum'];

function ends(geometry) {
  const tips = (geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates)
    .flatMap((line) => [line[0], line[line.length - 1]]);
  let best = null;
  for (let i = 0; i < tips.length; i++) {
    for (let j = i + 1; j < tips.length; j++) {
      const d = metersBetween(tips[i], tips[j]);
      if (!best || d > best.d) best = { a: tips[i], b: tips[j], d };
    }
  }
  return best;
}

function landmarkAt(end, items, avoid) {
  const rank = (it) => END_RANK.indexOf(it.category);
  const near = items
    .filter((it) => it.kind === 'landmark' && rank(it) >= 0 && !avoid.has(it.name))
    .map((it) => ({ it, d: distanceTo(it.geometry, end) }))
    .filter((x) => x.d <= END_REACH)
    .sort((a, b) => rank(a.it) - rank(b.it) || a.d - b.d)[0];
  if (near) return near.it;
  return items.find((it) => it.kind === 'area' && !avoid.has(it.name) && contains(it.geometry, end)) ?? null;
}

const route = {
  input: 'choice',
  build({ target, items, rng, avoid }) {
    const tips = ends(target.geometry);
    if (!tips || tips.d < ROUTE_MIN) return null;
    const from = landmarkAt(tips.a, items, avoid);
    const to = landmarkAt(tips.b, items, avoid);
    if (!from || !to || from === to || metersBetween(from.point, to.point) < ROUTE_MIN) return null;
    const fit = (it) => gap(it.geometry, from.geometry) + gap(it.geometry, to.geometry);
    const own = fit(target);
    const joins = (it) => gap(it.geometry, from.geometry) <= ROUTE_NEAR && gap(it.geometry, to.geometry) <= ROUTE_NEAR;
    if (items.some((it) => it.kind === 'street' && it !== target && joins(it) && fit(it) < own)) return null;
    const middle = [(tips.a[0] + tips.b[0]) / 2, (tips.a[1] + tips.b[1]) / 2];
    const decoys = items
      .filter((it) => it.kind === 'street' && it.name !== target.name)
      .filter((it) => !joins(it))
      .sort((a, b) => distanceTo(a.geometry, middle) - distanceTo(b.geometry, middle))
      .slice(0, 3);
    if (decoys.length < 3) return null;
    const [a, b] = rng() < 0.5 ? [from, to] : [to, from];
    return { target, from: a, to: b, options: shuffle([target, ...decoys], rng).map((it) => it.name) };
  },
  prompt: (q) => ({ title: `Vilken gata går från ${q.from.name} till ${q.to.name}?`, detail: q.target.label }),
  showing: (q) => [{ item: q.from, named: true }, { item: q.to, named: true }],
  view: (q) => ({ items: [q.from, q.to], context: 400 }),
  grade(q, choice, items) {
    const picked = items?.find((it) => it.name === choice);
    const score = choice === q.target.name ? MAX_SCORE : closeTo(q.target, picked) ? CLOSE_SCORE : 0;
    return { score, choice, answer: q.target.name };
  },
};

export const TYPES = { point, identify, neighbour, route };
