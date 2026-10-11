import { readFile, writeFile } from 'node:fs/promises';
import { pickBest } from './lib/photos.mjs';

const PICKS = 'photos/photos.json';
const keep = process.argv.slice(2);
const verdicts = JSON.parse(await readFile('data/cache/photos/verdicts/streets.json', 'utf8'));
const { items, licence } = JSON.parse(await readFile('data/cache/photos/candidates/streets.json', 'utf8'));
const picks = JSON.parse(await readFile(PICKS, 'utf8').catch(() => '{}'));

const hand = (entry) => entry.photos.filter((p) => keep.includes(p.id));
let total = 0;
const empty = [];
for (const item of items) {
  const candidates = item.samples.flatMap((s) => s.directions.flatMap((d) => d.images.map((img) => ({
    ...img, at: s.label, direction: d.heading, review: verdicts[img.id],
  }))));
  const chosen = pickBest(candidates, item.geometry);
  const entry = picks[item.key] ?? { photos: [], reviewed: false };
  const kept = hand(entry);
  entry.photos = [...kept, ...chosen.filter((c) => !kept.some((k) => k.id === c.id)).map((c) => ({
    source: 'mapillary', id: c.id, point: c.point, heading: c.heading, captured: c.captured,
    licence, author: c.author, url: `https://www.mapillary.com/app/?pKey=${c.id}`, thumb: null, title: null, at: c.at,
  }))];
  picks[item.key] = entry;
  total += entry.photos.length;
  if (!entry.photos.length) empty.push(item.name);
}

const sorted = Object.fromEntries(Object.entries(picks).sort(([a], [b]) => a.localeCompare(b, 'sv')));
await writeFile(PICKS, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`${total} photos kept for ${items.length - empty.length} of ${items.length} streets`);
if (empty.length) console.log(`no photo: ${empty.join(', ')}`);
