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

const AXES = {
  north: { words: ['norr', 'söder'], question: 'norr eller söder' },
  east: { words: ['öster', 'väster'], question: 'öster eller väster' },
};

const compass = {
  input: 'choice',
  build({ pick, items, rng }) {
    const places = items.filter((it) => PLACES.includes(it.kind));
    for (let attempt = 0; attempt < 40; attempt++) {
      const target = pick((it) => PLACES.includes(it.kind), { peek: true });
      if (!target) return null;
      const reference = places[Math.floor(rng() * places.length)];
      if (reference.name === target.name) continue;
      if (contains(reference.geometry, target.point) || contains(target.geometry, reference.point)) continue;
      const { east, north } = offset(reference.point, target.point);
      const axis = Math.abs(north) >= Math.abs(east) ? 'north' : 'east';
      const along = axis === 'north' ? north : east;
      const across = axis === 'north' ? east : north;
      if (Math.abs(along) < 800 || Math.abs(along) < 1.5 * Math.abs(across)) continue;
      pick((it) => it === target);
      const [positive, negative] = AXES[axis].words;
      return {
        target,
        reference,
        axis,
        options: [positive, negative],
        answer: along > 0 ? positive : negative,
      };
    }
    return null;
  },
  prompt: (q) => ({ title: `Ligger ${q.target.name} ${AXES[q.axis].question} om ${q.reference.name}?` }),
  showing: (q) => [{ item: q.reference, named: true }],
  view: (q) => ({ items: [q.reference], context: 3000 }),
  grade(q, choice) {
    return { score: choice === q.answer ? MAX_SCORE : 0, choice, answer: q.answer };
  },
};

export const TYPES = { point, identify, nearest, compass };
