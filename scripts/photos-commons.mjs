import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { osmWikidata, wikipediaQid, wikidataClaims, categoryFiles, files, filesNear, toPhoto, usable, rank } from './lib/commons.mjs';
import { distanceTo, metersBetween, bounds } from '../app/geo.mjs';
import { alongEvery } from './lib/photos.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const placesFile = arg('--places', 'places/places.json');
const only = arg('--only', '').split(',').filter(Boolean);
const categories = args.filter((a, i) => !a.startsWith('--') && !['--places', '--only'].includes(args[i - 1]));
const PER_GROUP = 12;

if (!categories.length) {
  console.error('usage: node scripts/photos-commons.mjs [--places places/places.json] <kategori>... (bro för broarna)');
  process.exit(1);
}

const { items } = JSON.parse(await readFile('build/data/quiz.json', 'utf8'));
const { places } = JSON.parse(await readFile(placesFile, 'utf8'));
const byName = new Map(places.map((p) => [p.name, p]));

for (const category of categories) {
  const NEAR_M = category === 'gata' ? 15 : 50;
  const kind = { bro: 'bridge', gata: 'street' }[category] ?? 'landmark';
  const chosen = items.filter((i) => i.kind === kind && (kind !== 'landmark' || byName.get(i.name)?.category === category) && (!only.length || only.includes(i.name)));
  const qids = {};
  for (const item of chosen) {
    let qid = null;
    for (const ref of byName.get(item.name)?.osm ?? []) qid ??= await osmWikidata(ref);
    qid ??= await wikipediaQid(item.source);
    qids[item.name] = qid;
  }
  const claims = await wikidataClaims([...new Set(Object.values(qids).filter(Boolean))]);

  const out = [];
  for (const item of chosen) {
    const qid = qids[item.name];
    const c = claims[qid] ?? {};
    const seen = new Set();
    const groups = [];
    const addGroup = (label, pages, found) => {
      const photos = rank(pages.map(toPhoto).filter(usable).filter((p) => !seen.has(p.id))).slice(0, PER_GROUP);
      for (const p of photos) seen.add(p.id);
      groups.push({ label, point: item.point, found, directions: [{ heading: null, images: photos }] });
    };

    if (c.image) addGroup('Wikidata-bild', await files([c.image]), 1);
    const cat = c.category ?? c.commonswiki?.replace(/^Category:/, '');
    if (cat) {
      const pages = await categoryFiles(cat);
      addGroup(`Kategori: ${cat}`, pages, pages.length);
    }
    const keep = (p) => distanceTo(item.geometry, p) <= NEAR_M;
    let near;
    if (kind === 'street') {
      const byTitle = new Map();
      for (const p of [item.point, ...alongEvery(item.geometry, 100)]) for (const f of await filesNear(p, 60, keep)) byTitle.set(f.title, f);
      near = [...byTitle.values()];
    } else {
      const [sw, ne] = bounds([item.geometry]);
      near = await filesNear(item.point, Math.min(2000, Math.round(metersBetween(sw, ne) / 2 + NEAR_M)), keep);
    }
    addGroup(`Tagna på platsen (inom ${NEAR_M} m)`, near, near.length);

    const n = groups.reduce((s, g) => s + g.directions[0].images.length, 0);
    console.log(`${item.name.padEnd(30)} ${(qid ?? '-').padEnd(10)} ${cat ? 'kategori' : '        '} ${n} kandidater`);
    out.push({
      key: `${item.kind}:${item.name}`, kind: item.kind, name: item.name, label: item.label,
      wikidata: qid, geometry: item.geometry, samples: groups,
    });
  }

  await mkdir('data/cache/photos/candidates', { recursive: true });
  const file = `data/cache/photos/candidates/${category}.json`;
  await writeFile(file, JSON.stringify({ source: 'commons', items: out }));
  console.log(`wrote ${file}`);
}
