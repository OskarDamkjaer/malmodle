import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { distanceTo } from '../app/geo.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const pbf = arg('--pbf', 'data/cache/malmo.osm.pbf');
const outFile = arg('--out', 'data/cache/shapes.json');
const tmp = 'data/cache';

const NEAR_M = 250;

const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
const places = [
  ...json('landmarks/landmarks.json').landmarks
    .filter((l) => l._resolved?.osm && l.lat != null)
    .map((l) => ({ name: l.name, kind: 'landmark', ids: [l._resolved.osm], point: [l.lon, l.lat] })),
  ...json('learn/bridges.json').bridges
    .filter((b) => b.osm?.length && b.lat != null)
    .map((b) => ({ name: b.name, kind: 'bridge', ids: b.osm, point: [b.lon, b.lat] })),
];

const short = (id) => { const [type, n] = id.split('/'); return `${type[0]}${n}`; };
writeFileSync(`${tmp}/shapes-ids.txt`, `${[...new Set(places.flatMap((p) => p.ids.map(short)))].join('\n')}\n`);

execFileSync('osmium', ['getid', '-r', pbf, '-i', `${tmp}/shapes-ids.txt`,
  '-o', `${tmp}/shapes.osm.pbf`, '--overwrite'], { stdio: 'inherit' });
execFileSync('osmium', ['export', `${tmp}/shapes.osm.pbf`, '-o', `${tmp}/shapes-raw.geojson`,
  '-f', 'geojson', '-a', 'type,id', '--geometry-types=linestring,polygon', '--overwrite'], { stdio: 'inherit' });

const byId = new Map();
for (const f of json(`${tmp}/shapes-raw.geojson`).features) {
  const id = `${f.properties['@type']}/${f.properties['@id']}`;
  if (!byId.has(id)) byId.set(id, []);
  byId.get(id).push(f.geometry);
}

function shapeOf(place) {
  const found = place.ids.flatMap((id) => byId.get(id) ?? []);
  const polygons = found.flatMap((g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []));
  if (polygons.length) {
    const near = polygons.filter((p) => distanceTo({ type: 'Polygon', coordinates: p }, place.point) <= NEAR_M);
    return near.length ? { type: 'MultiPolygon', coordinates: near } : null;
  }
  const lines = found.flatMap((g) => (g.type === 'LineString' ? [g.coordinates] : []));
  return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
}

const shapes = {};
const missing = [];
for (const place of places) {
  const shape = shapeOf(place);
  if (shape) shapes[`${place.kind}:${place.name}`] = shape;
  else missing.push(place.name);
}

writeFileSync(outFile, JSON.stringify({ shapes }));
console.log(`build-shapes → ${outFile}: ${Object.keys(shapes).length} of ${places.length} places have a shape`);
if (missing.length) console.log(`  points only: ${missing.join(', ')}`);
