import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { imagesNear } from './lib/mapillary.mjs';
import { samplePoints, pickAlong, imagePoint, imageHeading, nearestOnLine, streetAhead } from './lib/photos.mjs';

const RADIUS = 25;
const SKIP_AUTHORS = new Set(['movebybike']);
const OUT = 'data/cache/photos/candidates/streets.json';

const { items } = JSON.parse(await readFile('build/data/quiz.json', 'utf8'));
const streets = items.filter((i) => i.kind === 'street');
const only = process.argv[2];

const out = [];
for (const street of streets) {
  if (only && street.name !== only) continue;
  const samples = [];
  for (const s of samplePoints(street, streets)) {
    const images = (await imagesNear(s.point, RADIUS)).filter((img) => !SKIP_AUTHORS.has(img.creator?.username));
    const directions = pickAlong(images, street, s.point, { radius: RADIUS }).map((d) => ({
      heading: d.heading,
      images: d.images.map((img) => ({
        id: img.id,
        point: imagePoint(img).map((x) => Math.round(x * 1e6) / 1e6),
        heading: Math.round(imageHeading(img)),
        captured: new Date(img.captured_at).toISOString().slice(0, 10),
        author: img.creator?.username ?? null,
        sequence: img.sequence,
        ahead: streetAhead(street.geometry, imagePoint(img), imageHeading(img)),
        offLine: Math.round(nearestOnLine(street.geometry, imagePoint(img)).dist),
      })),
    }));
    samples.push({ label: s.label, point: s.point.map((x) => Math.round(x * 1e6) / 1e6), found: images.length, directions });
  }
  const n = samples.reduce((c, s) => c + s.directions.reduce((d, x) => d + x.images.length, 0), 0);
  console.log(`${street.name.padEnd(24)} ${samples.length} punkter, ${n} kandidater`);
  out.push({ key: `street:${street.name}`, kind: 'street', name: street.name, label: street.label, geometry: street.geometry, samples });
}

await mkdir('data/cache/photos/candidates', { recursive: true });
await writeFile(OUT, JSON.stringify({ source: 'mapillary', licence: 'CC BY-SA 4.0', items: out }));
console.log(`wrote ${OUT}`);
