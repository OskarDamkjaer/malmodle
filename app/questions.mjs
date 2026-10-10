import { closest, contains, distanceTo, metersBetween, offset } from './geo.mjs';

export const MAX_SCORE = 100;

const TOLERANCE = { area: 0, street: 40, bridge: 100, landmark: 150 };
const FALLOFF = 900;

export function distanceScore(meters, kind) {
  const over = meters - (TOLERANCE[kind] ?? 0);
  if (over <= 0) return MAX_SCORE;
  return Math.round(MAX_SCORE * Math.exp(-over / FALLOFF));
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

const REACH = { street: 60, bridge: 200, landmark: 200 };

export function tappedOn(items, point, kind) {
  const sameKind = items.filter((it) => it.kind === kind);
  if (kind === 'area') {
    const area = sameKind.find((it) => contains(it.geometry, point));
    if (area) return area;
  } else {
    let best = null;
    for (const it of sameKind) {
      const d = distanceTo(it.geometry, point);
      if (d <= REACH[kind] && (!best || d < best.d)) best = { it, d };
    }
    if (best) return best.it;
  }
  return items.find((it) => it.kind === 'area' && contains(it.geometry, point)) ?? null;
}

const PLACES = ['area', 'landmark', 'bridge'];

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
  build({ pick }) {
    const target = pick(() => true);
    return target && { target };
  },
  prompt: (q) => ({ title: `Var ligger ${q.target.name}?`, detail: q.target.label }),
  showing: () => [],
  view: () => 'home',
  grade(q, tap, items) {
    const { distance, point: near } = closest(q.target.geometry, tap);
    const score = distanceScore(distance, q.target.kind);
    const hit = tappedOn(items, tap, q.target.kind);
    return {
      score,
      tap,
      near,
      distance,
      hit: hit && hit.name !== q.target.name ? hit : null,
    };
  },
};

const identify = {
  input: 'choice',
  build({ pick, items, rng }) {
    const target = pick((it) => items.filter((o) => o.kind === it.kind).length >= 4);
    if (!target) return null;
    const others = items
      .filter((it) => it.kind === target.kind && it.name !== target.name)
      .sort((a, b) => metersBetween(a.point, target.point) - metersBetween(b.point, target.point))
      .slice(0, 7);
    return { target, options: shuffle([target, ...others], rng).map((it) => it.name) };
  },
  prompt: (q) => ({ title: 'Vad är det här?', detail: q.target.label }),
  showing: (q) => [{ item: q.target, named: false }],
  view: (q) => ({ items: [q.target], context: 1500 }),
  grade(q, choice) {
    return { score: choice === q.target.name ? MAX_SCORE : 0, choice, answer: q.target.name };
  },
};

const nearest = {
  input: 'choice',
  build({ pick, items, rng, used }) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const anchor = pick((it) => PLACES.includes(it.kind), { peek: true });
      if (!anchor) return null;
      const kind = rng() < 0.5 ? 'landmark' : 'area';
      const ranked = items
        .filter((it) => it.kind === kind && it.name !== anchor.name)
        .filter((it) => !contains(it.geometry, anchor.point) && !contains(anchor.geometry, it.point))
        .map((it) => ({ it, d: metersBetween(it.point, anchor.point) }))
        .sort((a, b) => a.d - b.d);
      if (ranked.length < 6) continue;
      const open = ranked.filter((r) => !used.has(r.it.name));
      if (!open.length) continue;
      const answer = open[Math.floor(rng() * Math.min(3, open.length))];
      const decoys = ranked.filter((r) => r.d >= answer.d * 1.6 + 300 && r.d <= 6000);
      if (decoys.length < 3) continue;
      pick((it) => it === anchor);
      used.add(answer.it.name);
      const chosen = shuffle(decoys, rng).slice(0, 3);
      return {
        target: answer.it,
        anchor,
        options: shuffle([answer, ...chosen], rng).map((r) => r.it.name),
      };
    }
    return null;
  },
  prompt: (q) => ({ title: `Vad ligger närmast ${q.anchor.name}?`, detail: q.target.label }),
  showing: (q) => [{ item: q.anchor, named: true }],
  view: (q) => ({ items: [q.anchor], context: 2500 }),
  grade(q, choice) {
    return { score: choice === q.target.name ? MAX_SCORE : 0, choice, answer: q.target.name };
  },
};

const area = {
  ...point,
  build({ pick }) {
    const target = pick((it) => it.kind === 'area');
    return target && { target };
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
  build({ pick, items, rng, used }) {
    const byName = new Map(items.map((it) => [it.name, it]));
    for (let attempt = 0; attempt < 30; attempt++) {
      const from = pick((it) => it.kind === 'area' && Object.keys(it.beside ?? {}).length > 0, { peek: true });
      if (!from) return null;
      const open = Object.entries(from.beside).filter(([, name]) => byName.has(name) && !used.has(name));
      if (!open.length) continue;
      const [side, name] = open[Math.floor(rng() * open.length)];
      const answer = byName.get(name);
      const adjacent = (from.neighbours ?? []).filter((n) => n !== name && byName.has(n)).map((n) => byName.get(n));
      const nearby = items
        .filter((it) => it.kind === 'area' && it.name !== from.name && it.name !== name && !adjacent.includes(it))
        .sort((a, b) => metersBetween(a.point, from.point) - metersBetween(b.point, from.point));
      const decoys = [...shuffle(adjacent, rng), ...nearby]
        .filter((it) => !towards(from, it, side))
        .slice(0, 3);
      if (decoys.length < 3) continue;
      pick((it) => it === from);
      used.add(name);
      return {
        target: answer,
        from,
        side,
        options: shuffle([answer, ...decoys], rng).map((it) => it.name),
      };
    }
    return null;
  },
  prompt: (q) => ({ title: `Vilket område ligger direkt ${q.side} om ${q.from.name}?`, detail: q.target.label }),
  showing: (q) => [{ item: q.from, named: true }],
  view: (q) => ({ items: [q.from], context: 1200 }),
  grade(q, choice) {
    return { score: choice === q.target.name ? MAX_SCORE : 0, choice, answer: q.target.name };
  },
};

export const TYPES = { point, area, identify, nearest, neighbour };
