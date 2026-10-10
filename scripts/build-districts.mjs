import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = arg('--out', 'build/data');
const pbf = arg('--pbf', 'data/cache/malmo.osm.pbf');
const tmp = 'data/cache';
mkdirSync(outDir, { recursive: true });

execFileSync('osmium', ['tags-filter', pbf, 'r/admin_level=10',
  '-o', `${tmp}/districts.osm.pbf`, '--overwrite'], { stdio: 'inherit' });

execFileSync('osmium', ['export', `${tmp}/districts.osm.pbf`, '-o', `${tmp}/districts-raw.geojson`,
  '-f', 'geojson', '--geometry-types=polygon', '--overwrite'], { stdio: 'inherit' });

const raw = JSON.parse(readFileSync(`${tmp}/districts-raw.geojson`, 'utf8'));
const features = [];
for (const f of raw.features) {
  const p = f.properties ?? {};
  if (p.boundary !== 'administrative') continue;
  if (p.admin_level !== '10') continue;
  if (!p.name || !f.geometry || !/Polygon/.test(f.geometry.type)) continue;
  features.push({
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      name: p.name,
      osm_id: p['@id'] ?? p.id ?? null,
      admin_level: Number(p.admin_level),
    },
  });
}
const fc = { type: 'FeatureCollection', features };
const file = `${outDir}/districts.geojson`;
writeFileSync(file, JSON.stringify(fc));

const kb = (statSync(file).size / 1024).toFixed(0);
console.log(`-> ${file}   ${features.length} delområden, ${kb} KB`);
