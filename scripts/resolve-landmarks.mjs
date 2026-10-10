import { readFileSync, writeFileSync } from 'node:fs';
import { geocode } from './lib/nominatim.mjs';

const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const srcFile = 'landmarks/landmarks.json';

const src = JSON.parse(readFileSync(srcFile, 'utf8'));
const { bbox } = JSON.parse(readFileSync('config/bbox.json', 'utf8'));
const viewbox = [bbox.west, bbox.south, bbox.east, bbox.north];

const pending = src.landmarks.filter((l) => typeof l.lat !== 'number' || typeof l.lon !== 'number');
console.log(`resolving ${pending.length} landmarks without coordinates`);

for (const l of pending) {
  const query = l.query ?? `${l.name}, Malmö`;
  let results;
  try {
    results = await geocode(query, { viewbox, refresh });
  } catch (err) {
    console.log(`  ✗ ${l.name}: ${err.message}`);
    continue;
  }
  if (!results.length) {
    console.log(`  ✗ ${l.name}: nothing in the bbox for "${query}"`);
    continue;
  }
  const hit = results[0];
  l.lat = Number(Number(hit.lat).toFixed(5));
  l.lon = Number(Number(hit.lon).toFixed(5));
  l.verified = false;
  l._resolved = { display_name: hit.display_name, type: hit.type, osm: `${hit.osm_type}/${hit.osm_id}` };
  console.log(`  · ${l.name}: ${hit.display_name}`);
}

writeFileSync(srcFile, `${JSON.stringify(src, null, 2)}\n`);

const unverified = src.landmarks.filter((l) => l.verified !== true).map((l) => l.name);
if (unverified.length) {
  console.log('\nnot yet checked by hand (set "verified": true once checked on the map):');
  for (const n of unverified) console.log(`  · ${n}`);
}
