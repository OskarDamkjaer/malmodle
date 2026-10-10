import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  PolygonIndex, bboxOf, clusterByGap, lineLength, representativePoint, roundPoint,
} from './lib/geo.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const pbf = arg('--pbf', 'data/cache/malmo.osm.pbf');
const districtsFile = arg('--districts', 'build/data/districts.geojson');
const outFile = arg('--out', 'data/cache/streets.json');
const tmp = 'data/cache';

const SKIP = new Set(['platform', 'construction', 'proposed', 'raceway']);

const RANK = {
  motorway: 1, trunk: 1, motorway_link: 1, trunk_link: 1,
  primary: 2, primary_link: 2,
  secondary: 3, secondary_link: 3,
  tertiary: 4, tertiary_link: 4,
  residential: 5, unclassified: 5, living_street: 5, pedestrian: 5,
  service: 6, busway: 6, road: 6,
  cycleway: 7, path: 7, footway: 7, track: 7, steps: 7,
};
const rankOf = (h) => RANK[h] ?? 8;

const CLUSTER_GAP_M = 500;

execFileSync('osmium', ['tags-filter', pbf, 'w/highway',
  '-o', `${tmp}/streets.osm.pbf`, '--overwrite'], { stdio: 'inherit' });
execFileSync('osmium', ['export', `${tmp}/streets.osm.pbf`,
  '-o', `${tmp}/streets-raw.geojson`, '-f', 'geojson',
  '--geometry-types=linestring', '--overwrite'], { stdio: 'inherit' });

const raw = JSON.parse(readFileSync(`${tmp}/streets-raw.geojson`, 'utf8'));

const districts = JSON.parse(readFileSync(districtsFile, 'utf8'));
const al10 = districts.features.filter((f) => f.properties.admin_level === 10);
if (!al10.length) throw new Error(`no admin_level 10 features in ${districtsFile}`);
const index = new PolygonIndex(al10);

const kept = [];
let named = 0, outside = 0;
for (const f of raw.features) {
  const p = f.properties ?? {};
  if (!p.name || SKIP.has(p.highway)) continue;
  if (f.geometry?.type !== 'LineString' || f.geometry.coordinates.length < 2) continue;
  named++;
  const coords = f.geometry.coordinates;
  const district = index.find(coords[Math.floor(coords.length / 2)]);
  if (!district) { outside++; continue; }
  kept.push({
    name: p.name,
    highway: p.highway,
    coords,
  });
}

const byName = new Map();
for (const w of kept) {
  if (!byName.has(w.name)) byName.set(w.name, []);
  byName.get(w.name).push(w);
}

const streets = [];
for (const [name, ways] of byName) {
  const boxes = ways.map((w) => bboxOf(w.coords));
  for (const idx of clusterByGap(boxes, CLUSTER_GAP_M)) {
    const group = idx.map((i) => ways[i]);
    const point = representativePoint(group.map((w) => w.coords));
    if (!point) continue;
    const byClass = new Map();
    for (const w of group) {
      byClass.set(w.highway, (byClass.get(w.highway) ?? 0) + lineLength(w.coords));
    }
    const highway = [...byClass.entries()]
      .sort((a, b) => b[1] - a[1] || rankOf(a[0]) - rankOf(b[0]))[0][0];
    streets.push({
      name,
      point: roundPoint(point),
      highway,
      rank: rankOf(highway),
    });
  }
}
streets.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'sv'));

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(streets));

const uniqueNames = new Set(streets.map((s) => s.name)).size;
const split = streets.length - uniqueNames;
const kb = (statSync(outFile).size / 1024).toFixed(0);
console.log(`\n-> ${outFile}`);
console.log(`   named highway ways:      ${named}`);
console.log(`   dropped (outside Malmö): ${outside}`);
console.log(`   unique names:            ${uniqueNames}`);
console.log(`   entries (name×cluster):  ${streets.length}  (+${split} from same-name splits)`);
console.log(`   ${kb} KB`);
