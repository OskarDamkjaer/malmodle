import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { bboxOf, distance, flatCoords, interiorPoint } from './lib/geo.mjs';
import { layerFeatures, tiles } from './lib/pmtiles.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outFile = arg('--out', 'build/data/quiz.json');
const archive = arg('--pmtiles', 'data/cache/malmo.pmtiles');
const everything = args.includes('--all');

const STREET_ZOOM = 14;
const STREET_LINK_M = 500;

const json = async (f) => JSON.parse(await readFile(f, 'utf8'));

const [districts, landmarksDoc, bridgesDoc, streetsDoc, aboutDoc, streetIndex, coreDoc, sourcesDoc] = await Promise.all([
  json('build/data/districts.geojson'),
  json('landmarks/landmarks.json'),
  json('learn/bridges.json'),
  json('learn/streets.json'),
  json('learn/about.json'),
  json('data/cache/streets.json'),
  json('learn/core.json'),
  json('learn/sources.json'),
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

const text = (entry) => ({ about: entry?.text ?? entry?.description ?? null, source: entry?.source ?? null });

const delomraden = districts.features.filter((f) => f.properties.admin_level === 10);
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

const LANDMARK_LABEL = { park: 'Park', nature: 'Park', beach: 'Strand', square: 'Torg', church: 'Kyrka', station: 'Station' };

const landmarkItems = landmarksDoc.landmarks
  .filter((lm) => lm.lat != null && lm.lon != null)
  .map((lm) => ({
    name: lm.name,
    kind: 'landmark',
    label: LANDMARK_LABEL[lm.icon] ?? 'Sevärdhet',
    icon: lm.icon ?? null,
    point: roundCoords([lm.lon, lm.lat]),
    geometry: { type: 'Point', coordinates: roundCoords([lm.lon, lm.lat]) },
    about: lm.description ?? null,
    source: lm.source ?? null,
  }));

const bridgeItems = bridgesDoc.bridges.map((b) => {
  if (b.lat == null || b.lon == null) fail(`${b.name}: bridge without coordinates`);
  return {
    name: b.name,
    kind: 'bridge',
    label: 'Bro',
    point: roundCoords([b.lon, b.lat]),
    geometry: { type: 'Point', coordinates: roundCoords([b.lon, b.lat]) },
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

function gap(a, b) {
  const kx = 111320 * Math.cos((a[1] * Math.PI) / 180);
  const dx = Math.max(0, a[0] - b[2], b[0] - a[2]) * kx;
  const dy = Math.max(0, a[1] - b[3], b[1] - a[3]) * 111320;
  return Math.hypot(dx, dy);
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
      if (keep.has(j) || gap(pieces[i].box, pieces[j].box) > STREET_LINK_M) continue;
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

const PRECEDENCE = ['area', 'bridge', 'street', 'landmark'];
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

if (problems.length) {
  console.error(`build-quiz: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const chosen = everything ? items : items.filter((it) => core.has(it.name));
const out = { items: chosen };
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(out));

const kinds = [...new Set(chosen.map((it) => it.kind))];
console.log(`build-quiz → ${outFile} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
for (const kind of kinds) console.log(`  ${kind.padEnd(9)} ${chosen.filter((it) => it.kind === kind).length}`);
