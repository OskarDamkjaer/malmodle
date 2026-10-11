import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { contains, distanceTo } from '../app/geo.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const pbf = arg('--pbf', 'data/cache/malmo.osm.pbf');
const outFile = arg('--out', 'places/shapes.json');
const tmp = 'data/cache/places/shapes';
mkdirSync(tmp, { recursive: true });

const NEAR_M = 250;
const POINT_CATEGORIES = new Set(['krog', 'kafe', 'konst']);
const MAX_ENCLOSING_M2 = 60000;
const ENCLOSING_TAGS = ['building', 'leisure', 'amenity', 'tourism', 'historic', 'natural', 'railway', 'public_transport'];

const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
const osmium = (...a) => { try { execFileSync('osmium', a, { stdio: ['ignore', 'ignore', 'inherit'] }); } catch {} };

const longlist = json('places/longlist.json');
const entries = Object.values(longlist.categories).flatMap((c) => c.places)
  .filter((p) => p.osm)
  .map((p) => ({ key: `${p.category}:${p.osm}`, name: p.name, category: p.category, ids: p.osm.split(','), point: p.lat != null ? [p.lon, p.lat] : null }));

const short = (id) => { const [type, n] = id.split('/'); return `${type[0]}${n}`; };
writeFileSync(`${tmp}/ids.txt`, `${[...new Set(entries.flatMap((e) => e.ids.map(short)))].join('\n')}\n`);
osmium('getid', '-r', pbf, '-i', `${tmp}/ids.txt`, '-o', `${tmp}/own.osm.pbf`, '--overwrite');
osmium('export', `${tmp}/own.osm.pbf`, '-o', `${tmp}/own.geojson`, '-f', 'geojson', '-a', 'type,id', '--overwrite');
osmium('tags-filter', pbf, ...ENCLOSING_TAGS.map((t) => `wr/${t}`), '-o', `${tmp}/around.osm.pbf`, '--overwrite');
osmium('export', `${tmp}/around.osm.pbf`, '-o', `${tmp}/around.geojson`, '-f', 'geojson', '-a', 'type,id', '--geometry-types=polygon', '--overwrite');

const idOf = (f) => `${f.properties['@type']}/${f.properties['@id']}`;
const own = new Map();
for (const f of json(`${tmp}/own.geojson`).features) {
  if (!own.has(idOf(f))) own.set(idOf(f), []);
  own.get(idOf(f)).push(f.geometry);
}

const rings = (g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]));
function squareMeters(g) {
  let total = 0;
  for (const ring of rings(g)) {
    const kx = 111320 * Math.cos((ring[0][1] * Math.PI) / 180);
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * kx * ring[i + 1][1] * 111320 - ring[i + 1][0] * kx * ring[i][1] * 111320;
    total += Math.abs(sum) / 2;
  }
  return total;
}
function boxOf(g) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const ring of rings(g)) for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}

const around = json(`${tmp}/around.geojson`).features
  .filter((f) => f.properties.boundary !== 'administrative')
  .map((f) => ({ id: idOf(f), geometry: f.geometry, box: boxOf(f.geometry), m2: squareMeters(f.geometry), building: !!f.properties.building, name: f.properties.name ?? null }))
  .filter((a) => a.m2 <= MAX_ENCLOSING_M2);

function enclosing(point, name) {
  const hits = around.filter((a) => point[0] >= a.box[0] && point[0] <= a.box[2] && point[1] >= a.box[1] && point[1] <= a.box[3] && contains(a.geometry, point));
  if (!hits.length) return null;
  const named = hits.filter((a) => a.name && name && a.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]));
  const pool = named.length ? named : hits.filter((a) => a.building);
  return pool.sort((a, b) => a.m2 - b.m2)[0] ?? null;
}

const shapes = {};
const count = {};
for (const e of entries) {
  const found = e.ids.flatMap((id) => (own.get(id) ?? []).map((g) => ({ id, g })));
  const polygons = found.filter(({ g }) => g.type.includes('Polygon'))
    .filter(({ g }) => !e.point || distanceTo(g, e.point) <= NEAR_M);
  const lines = found.filter(({ g }) => g.type.includes('LineString'));
  const node = found.find(({ g }) => g.type === 'Point');
  let shape;
  if (polygons.length) shape = { shape: 'polygon', osm: [...new Set(polygons.map((p) => p.id))], from: 'own' };
  else if (lines.length) shape = { shape: 'line', osm: [...new Set(lines.map((l) => l.id))], from: 'own' };
  else if (node && !POINT_CATEGORIES.has(e.category)) {
    const around = enclosing(node.g.coordinates, e.name);
    shape = around ? { shape: 'polygon', osm: [around.id], from: 'enclosing', m2: Math.round(around.m2) } : { shape: 'point', osm: [node.id], from: 'own' };
  } else if (node) shape = { shape: 'point', osm: [node.id], from: 'own' };
  else shape = { shape: 'none', osm: [], from: 'missing' };
  shapes[e.key] = { name: e.name, ...shape };
  const tally = `${shape.shape}/${shape.from}`;
  count[tally] = (count[tally] ?? 0) + 1;
}

writeFileSync(outFile, `${JSON.stringify({ shapes }, null, 1)}\n`);
console.log(`places-shapes → ${outFile}: ${entries.length} places`, count);
