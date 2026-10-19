import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { bboxGap, bboxOf, distance, interiorPoint } from './lib/geo.mjs';
import { layerFeatures, tiles } from './lib/pmtiles.mjs';
import { neighbourhood } from './lib/adjacency.mjs';
import { closest, contains } from '../app/geo.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outFile = arg('--out', 'build/data/quiz.json');
const archive = arg('--pmtiles', 'data/cache/malmo.pmtiles');
const everything = args.includes('--all');

const STREET_ZOOM = 14;
const STREET_LINK_M = 500;

const json = async (f) => JSON.parse(await readFile(f, 'utf8'));

const [districts, placesDoc, bridgesDoc, streetsDoc, aboutDoc, streetIndex, coreDoc, sourcesDoc, shapesDoc] = await Promise.all([
  json('build/data/districts.geojson'),
  json('places/places.json'),
  json('learn/bridges.json'),
  json('learn/streets.json'),
  json('learn/about.json'),
  json('data/cache/streets.json'),
  json('learn/core.json'),
  json('learn/sources.json'),
  json('data/cache/shapes.json'),
]);

const problems = [];
const fail = (msg) => problems.push(msg);

const round = (v) => Math.round(v * 1e5) / 1e5;
const roundCoords = (c) => (typeof c[0] === 'number' ? [round(c[0]), round(c[1])] : c.map(roundCoords));

function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(points[i], points[a], points[b]);
      if (d > worst) { worst = d; index = i; }
    }
    if (worst > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function segmentDistance(p, a, b) {
  const kx = 111320 * Math.cos((a[1] * Math.PI) / 180);
  const ky = 111320;
  const px = (p[0] - a[0]) * kx;
  const py = (p[1] - a[1]) * ky;
  const bx = (b[0] - a[0]) * kx;
  const by = (b[1] - a[1]) * ky;
  const len = bx * bx + by * by;
  const t = len ? Math.max(0, Math.min(1, (px * bx + py * by) / len)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}

function simplifyPolygonal(geometry) {
  const ring = (r) => {
    const s = simplifyLine(r, 4);
    return s.length >= 4 ? s : r;
  };
  if (geometry.type === 'Polygon') return { type: 'Polygon', coordinates: roundCoords(geometry.coordinates.map(ring)) };
  return { type: 'MultiPolygon', coordinates: roundCoords(geometry.coordinates.map((p) => p.map(ring))) };
}

function shapeOr(kind, name, point) {
  const shape = shapesDoc.shapes[`${kind}:${name}`];
  if (!shape) return { type: 'Point', coordinates: roundCoords(point) };
  if (shape.type === 'Point') return { type: 'Point', coordinates: roundCoords(shape.coordinates) };
  if (shape.type === 'MultiLineString') {
    return { type: 'MultiLineString', coordinates: shape.coordinates.map((line) => roundCoords(simplifyLine(line, 3))) };
  }
  return simplifyPolygonal(shape);
}

const text = (entry) => ({ about: entry?.text ?? null, source: entry?.source ?? null });

const delomraden = districts.features;
const areaItems = delomraden.map((f) => {
  const { name } = f.properties;
  const point = interiorPoint(f.geometry);
  if (!point) fail(`${name}: no interior point`);
  return {
    name,
    kind: 'area',
    label: 'Delområde',
    point: point && roundCoords(point),
    geometry: simplifyPolygonal(f.geometry),
    ...text(aboutDoc.areas[name]),
  };
});

const PLACE_LABEL = {
  torg: 'Torg', park: 'Park', bad: 'Bad', scen: 'Scen', museum: 'Museum', kyrka: 'Kyrka', byggnad: 'Byggnad',
  konst: 'Konstverk', idrott: 'Idrott', handel: 'Handel', krog: 'Krog', kafe: 'Kafé', vatten: 'Vatten', omrade: 'Område', skola: 'Skola',
};

const districtByName = new Map(delomraden.map((f) => [f.properties.name, f]));

function placeGeometry(p) {
  if (p.district) {
    const f = districtByName.get(p.district);
    if (!f) { fail(`${p.name}: no district ${p.district}`); return null; }
    return { geometry: simplifyPolygonal(f.geometry), point: interiorPoint(f.geometry) };
  }
  const shape = shapesDoc.shapes[`place:${p.name}`];
  const middle = (line) => line[Math.floor(line.length / 2)];
  const point = p.lat != null ? [p.lon, p.lat]
    : shape?.type === 'Point' ? shape.coordinates
    : shape?.type === 'MultiLineString' ? middle(shape.coordinates.reduce((a, b) => (b.length > a.length ? b : a)))
    : shape ? interiorPoint(shape) : null;
  if (!point) { fail(`${p.name}: no point or shape`); return null; }
  return { geometry: shapeOr('place', p.name, point), point };
}

const landmarkItems = placesDoc.places.map((p) => {
  if (!PLACE_LABEL[p.category]) fail(`${p.name}: unknown category ${p.category}`);
  const where = placeGeometry(p);
  if (!where) return null;
  return {
    name: p.name,
    kind: 'landmark',
    label: PLACE_LABEL[p.category],
    category: p.category,
    ...(p.apart && { apart: p.apart }),
    point: roundCoords(where.point),
    geometry: where.geometry,
    about: p.description ?? null,
    source: p.source ?? null,
  };
}).filter(Boolean);

const bridgeItems = bridgesDoc.bridges.map((b) => {
  if (b.lat == null || b.lon == null) fail(`${b.name}: bridge without coordinates`);
  return {
    name: b.name,
    kind: 'bridge',
    label: 'Bro',
    point: roundCoords([b.lon, b.lat]),
    geometry: shapeOr('bridge', b.name, [b.lon, b.lat]),
    about: b.description ?? null,
    source: b.source ?? null,
  };
});

const STREET_LABEL = { 1: 'Motorväg', 2: 'Huvudgata', 3: 'Genomfartsgata' };

const streetPieces = new Map();
for (const tile of tiles(archive, { zoom: STREET_ZOOM })) {
  for (const f of layerFeatures(tile.data, 'transportation_name', tile)) {
    const name = f.properties.name;
    if (!name) continue;
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates
      : f.geometry.type === 'LineString' ? [f.geometry.coordinates] : [];
    if (!streetPieces.has(name)) streetPieces.set(name, []);
    for (const line of lines) if (line.length > 1) streetPieces.get(name).push(line);
  }
}

function streetGeometry(name, near) {
  const pieces = (streetPieces.get(name) ?? []).map((line) => ({ line, box: bboxOf(line) }));
  if (!pieces.length) return null;
  const seed = pieces.reduce((best, p, i) => {
    const d = Math.min(...p.line.map((c) => distance(c, near)));
    return d < best.d ? { d, i } : best;
  }, { d: Infinity, i: -1 });
  if (seed.d > STREET_LINK_M) return null;
  const keep = new Set([seed.i]);
  const queue = [seed.i];
  while (queue.length) {
    const i = queue.pop();
    for (let j = 0; j < pieces.length; j++) {
      if (keep.has(j) || bboxGap(pieces[i].box, pieces[j].box) > STREET_LINK_M) continue;
      keep.add(j);
      queue.push(j);
    }
  }
  const seen = new Set();
  const lines = [];
  for (const i of keep) {
    const line = roundCoords(simplifyLine(pieces[i].line, 3));
    const key = JSON.stringify(line);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return { type: 'MultiLineString', coordinates: lines };
}

const streetByName = new Map();
for (const st of streetIndex) {
  const prev = streetByName.get(st.name);
  if (!prev || st.rank < prev.rank) streetByName.set(st.name, st);
}

const streetItems = streetsDoc.streets.map((s) => {
  const hit = streetByName.get(s.name);
  if (!hit) { fail(`${s.name}: street not in the street index`); return null; }
  const geometry = streetGeometry(s.name, hit.point);
  if (!geometry) { fail(`${s.name}: no geometry in the basemap`); return null; }
  return {
    name: s.name,
    kind: 'street',
    label: STREET_LABEL[hit.rank] ?? 'Gata',
    point: roundCoords(hit.point),
    geometry,
    about: s.description ?? null,
    source: s.source ?? null,
  };
}).filter(Boolean);

const PRECEDENCE = ['landmark', 'area', 'bridge', 'street'];
const byName = new Map();
for (const it of [...areaItems, ...landmarkItems, ...bridgeItems, ...streetItems]) {
  const prev = byName.get(it.name);
  if (!prev) { byName.set(it.name, it); continue; }
  const [keep, drop] = PRECEDENCE.indexOf(it.kind) < PRECEDENCE.indexOf(prev.kind) ? [it, prev] : [prev, it];
  if (!keep.about && drop.about) { keep.about = drop.about; keep.source = drop.source; }
  byName.set(keep.name, keep);
}
const items = [...byName.values()];

const sources = sourcesDoc.sources ?? {};
for (const it of items) if (!it.source && sources[it.name]) it.source = sources[it.name];

const CORE_KIND = { areas: 'area', streets: 'street', bridges: 'bridge', landmarks: 'landmark' };
const core = new Set();
for (const [section, names] of Object.entries(coreDoc.core)) {
  const kind = CORE_KIND[section];
  if (!kind) { fail(`core.json: unknown section ${section}`); continue; }
  for (const name of names) {
    const it = byName.get(name);
    if (!it) { fail(`core.json: ${name} is not in the data`); continue; }
    if (it.kind !== kind) fail(`core.json: ${name} is listed under ${section} but is a ${it.kind}`);
    if (core.has(name)) fail(`core.json: ${name} is listed twice`);
    core.add(name);
  }
}

for (const it of items) {
  if (!it.point || !Number.isFinite(it.point[0])) fail(`${it.name}: no point`);
  if (!it.geometry) fail(`${it.name}: no geometry`);
}

const OFF_SHAPE_M = 20;

function onShape(geometry, point) {
  if (geometry.type === 'Point') return geometry.coordinates;
  const near = closest(geometry, point);
  if (near.distance <= OFF_SHAPE_M) return point;
  return roundCoords(geometry.type.endsWith('LineString') ? near.point : interiorPoint(geometry));
}

for (const it of items) if (it.point && it.geometry) it.point = onShape(it.geometry, it.point);

const ROAD_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']);
const PATH_SUBCLASSES = new Set(['path', 'footway', 'cycleway', 'pedestrian']);
const OPEN_SPACE = new Set(['bad', 'vatten', 'torg', 'konst', 'omrade']);
const ROAD_REACH_M = 300;
const PATH_REACH_M = 150;

const roads = [];
const paths = [];
for (const tile of tiles(archive, { zoom: STREET_ZOOM })) {
  for (const f of layerFeatures(tile.data, 'transportation', tile)) {
    const { class: kind, subclass } = f.properties;
    const into = ROAD_CLASSES.has(kind) ? roads : kind === 'path' && PATH_SUBCLASSES.has(subclass) ? paths : null;
    if (!into) continue;
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates
      : f.geometry.type === 'LineString' ? [f.geometry.coordinates] : [];
    for (const line of lines) for (let i = 1; i < line.length; i++) into.push([line[i - 1], line[i]]);
  }
}

function nearest(segments, point, within) {
  let best = { point: null, distance: Infinity };
  for (const segment of segments) {
    const c = closest({ type: 'LineString', coordinates: segment }, point);
    if (c.distance < best.distance && (!within || contains(within, c.point))) best = c;
  }
  return best;
}

const reached = (hit, reach) => (hit?.point && hit.distance <= reach ? hit.point : null);

function streetMiddle(geometry) {
  const [minX, minY, maxX, maxY] = bboxOf(geometry.coordinates.flat());
  return closest(geometry, [(minX + maxX) / 2, (minY + maxY) / 2]).point;
}

function onAddressStreet(it) {
  const pieces = streetPieces.get(shapesDoc.streets?.[`place:${it.name}`]);
  return pieces ? closest({ type: 'MultiLineString', coordinates: pieces }, it.point) : null;
}

function streetviewPoint(it) {
  if (it.kind === 'street') return streetMiddle(it.geometry);
  if (it.kind === 'bridge') return it.point;
  if (it.kind === 'area') return nearest(roads, it.point, it.geometry).point ?? nearest(roads, it.point).point;
  if (it.category === 'park') {
    const outline = it.geometry.type.endsWith('Polygon') ? it.geometry : null;
    return reached(nearest(paths, it.point, outline), PATH_REACH_M);
  }
  if (OPEN_SPACE.has(it.category)) {
    const hits = [[nearest(roads, it.point), ROAD_REACH_M], [nearest(paths, it.point), PATH_REACH_M]]
      .filter(([hit, reach]) => reached(hit, reach))
      .map(([hit]) => hit);
    return hits.reduce((a, b) => (b.distance < a.distance ? b : a), hits[0])?.point;
  }
  return reached(onAddressStreet(it), ROAD_REACH_M) ?? reached(nearest(roads, it.point), ROAD_REACH_M);
}

for (const it of items) if (it.point && it.geometry) it.streetview = roundCoords(streetviewPoint(it) ?? it.point);

if (problems.length) {
  console.error(`build-quiz: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const chosen = everything ? items : items.filter((it) => core.has(it.name));
const kept = new Set(chosen.map((it) => it.name));
const around = neighbourhood(items.filter((it) => it.kind === 'area'), kept);
for (const it of chosen) if (around.has(it.name)) Object.assign(it, around.get(it.name));
const out = { items: chosen };
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(out));

const kinds = [...new Set(chosen.map((it) => it.kind))];
console.log(`build-quiz → ${outFile} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
for (const kind of kinds) console.log(`  ${kind.padEnd(9)} ${chosen.filter((it) => it.kind === kind).length}`);
