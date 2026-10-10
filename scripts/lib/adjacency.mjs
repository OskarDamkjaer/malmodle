import { bounds, distanceTo, offset } from '../../app/geo.mjs';

const TOUCH_M = 30;
const DOMINANCE = 1.4;

const DIRECTIONS = { north: 'norr', south: 'söder', east: 'öster', west: 'väster' };

function vertices(geometry) {
  const out = [];
  const visit = (c) => (typeof c[0] === 'number' ? out.push(c) : c.forEach(visit));
  visit(geometry.coordinates);
  return out;
}

function centre(geometry) {
  const [[w, s], [e, n]] = bounds([geometry]);
  return [(w + e) / 2, (s + n) / 2];
}

function touches(a, b) {
  const [[aw, as], [ae, an]] = a.box;
  const [[bw, bs], [be, bn]] = b.box;
  const pad = 0.001;
  if (aw > be + pad || bw > ae + pad || as > bn + pad || bs > an + pad) return false;
  return a.vertices.some((v) => distanceTo(b.geometry, v) <= TOUCH_M)
    || b.vertices.some((v) => distanceTo(a.geometry, v) <= TOUCH_M);
}

export function direction(from, to) {
  const { east, north } = offset(from, to);
  if (Math.abs(north) >= DOMINANCE * Math.abs(east)) return north > 0 ? DIRECTIONS.north : DIRECTIONS.south;
  if (Math.abs(east) >= DOMINANCE * Math.abs(north)) return east > 0 ? DIRECTIONS.east : DIRECTIONS.west;
  return null;
}

export function adjacency(areas) {
  const shapes = areas.map((it) => ({
    name: it.name,
    geometry: it.geometry,
    box: bounds([it.geometry]),
    vertices: vertices(it.geometry),
    centre: centre(it.geometry),
  }));
  const result = new Map(shapes.map((s) => [s.name, []]));
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      if (!touches(shapes[i], shapes[j])) continue;
      result.get(shapes[i].name).push({ name: shapes[j].name, direction: direction(shapes[i].centre, shapes[j].centre) });
      result.get(shapes[j].name).push({ name: shapes[i].name, direction: direction(shapes[j].centre, shapes[i].centre) });
    }
  }
  return result;
}

export function neighbourhood(areas, keep) {
  const all = adjacency(areas);
  const out = new Map();
  for (const [name, list] of all) {
    if (!keep.has(name)) continue;
    const beside = {};
    for (const word of Object.values(DIRECTIONS)) {
      const there = list.filter((n) => n.direction === word);
      if (there.length === 1 && keep.has(there[0].name)) beside[word] = there[0].name;
    }
    out.set(name, {
      neighbours: list.map((n) => n.name).filter((n) => keep.has(n)),
      beside,
    });
  }
  return out;
}
