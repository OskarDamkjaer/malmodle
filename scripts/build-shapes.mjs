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
  ...json('learn/bridges.json').bridges
    .filter((b) => b.osm?.length && b.lat != null)
    .map((b) => ({ name: b.name, kind: 'bridge', ids: b.osm, point: [b.lon, b.lat] })),
  ...json('places/places.json').places
    .filter((p) => p.osm.length)
    .map((p) => ({ name: p.name, kind: 'place', ids: p.osm, point: p.lat != null ? [p.lon, p.lat] : null })),
];

const short = (id) => { const [type, n] = id.split('/'); return `${type[0]}${n}`; };
writeFileSync(`${tmp}/shapes-ids.txt`, `${[...new Set(places.flatMap((p) => p.ids.map(short)))].join('\n')}\n`);

execFileSync('osmium', ['getid', '-r', pbf, '-i', `${tmp}/shapes-ids.txt`,
  '-o', `${tmp}/shapes.osm.pbf`, '--overwrite'], { stdio: 'inherit' });
execFileSync('osmium', ['export', `${tmp}/shapes.osm.pbf`, '-o', `${tmp}/shapes-raw.geojson`,
  '-f', 'geojson', '-a', 'type,id', '--overwrite'], { stdio: 'inherit' });

const byId = new Map();
const streetOf = new Map();
for (const f of json(`${tmp}/shapes-raw.geojson`).features) {
  const id = `${f.properties['@type']}/${f.properties['@id']}`;
  if (!byId.has(id)) byId.set(id, []);
  byId.get(id).push(f.geometry);
  if (f.properties['addr:street'] && !streetOf.has(id)) streetOf.set(id, f.properties['addr:street']);
}

function shapeOf(place) {
  const found = place.ids.flatMap((id) => byId.get(id) ?? []);
  const polygons = found.flatMap((g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []));
  if (polygons.length) {
    const near = place.point ? polygons.filter((p) => distanceTo({ type: 'Polygon', coordinates: p }, place.point) <= NEAR_M) : polygons;
    return near.length ? { type: 'MultiPolygon', coordinates: near } : null;
  }
  const lines = found.flatMap((g) => (g.type === 'LineString' ? [g.coordinates] : []));
  if (lines.length) return { type: 'MultiLineString', coordinates: lines };
  const points = found.filter((g) => g.type === 'Point');
  return points.length ? points[0] : null;
}

const shapes = {};
const streets = {};
const missing = [];
for (const place of places) {
  const shape = shapeOf(place);
  if (shape) shapes[`${place.kind}:${place.name}`] = shape;
  else missing.push(place.name);
  const street = place.ids.map((id) => streetOf.get(id)).find(Boolean);
  if (street) streets[`${place.kind}:${place.name}`] = street;
}

writeFileSync(outFile, JSON.stringify({ shapes, streets }));
const outlined = Object.values(shapes).filter((s) => s.type !== 'Point').length;
console.log(`build-shapes → ${outFile}: ${outlined} of ${places.length} places have a shape, ${Object.keys(streets).length} a street address`);
if (missing.length) console.log(`  not found: ${missing.join(', ')}`);
