import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { distance } from './lib/geo.mjs';

const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const CACHE = 'data/cache/places';
const OUT = 'places/longlist.json';
const OUT_MD = 'places/longlist.md';

const USER_AGENT = 'malmoemaps-build/1.0 (Malmökoll, a daily map quiz; contact via repo)';
const BROWSER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

const { bbox } = JSON.parse(await readFile('config/bbox.json', 'utf8'));
const inBbox = (lat, lon) => lat >= bbox.south && lat <= bbox.north && lon >= bbox.west && lon <= bbox.east;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastByHost = new Map();

async function cached(name, url, { agent = USER_AGENT, gap = 1000, body } = {}) {
  const file = `${CACHE}/${name}`;
  if (!refresh) {
    try {
      return await readFile(file, 'utf8');
    } catch { }
  }
  const host = new URL(url).host;
  let res;
  for (let attempt = 1; ; attempt++) {
    const wait = (lastByHost.get(host) ?? 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastByHost.set(host, Date.now());
    res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      body,
      headers: { 'User-Agent': agent, Accept: 'application/json, text/html;q=0.9', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    });
    if (res.status !== 429 || attempt === 4) break;
    const after = Number(res.headers.get('retry-after')) || 10 * attempt;
    console.log(`  ${host}: 429, waiting ${after}s`);
    await sleep(after * 1000);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const text = await res.text();
  if (!text) throw new Error(`empty response for ${url}`);
  await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  await writeFile(file, text);
  return text;
}

const STOP = new Set(['restaurang', 'restaurant', 'bar', 'cafe', 'kafe', 'café', 'the', 'och', 'and', 'malmo', 'krog', 'pub', 'och', 'i', 'pa', 'vid', 'kyrka', 'kyrkan']);

function norm(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(' ');
}

const sameName = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return short.length >= 4 && ` ${long} `.includes(` ${short} `);
};

const CATEGORIES = {
  torg: 'Torg',
  park: 'Parker och natur',
  bad: 'Bad och strand',
  scen: 'Scener och nöje',
  museum: 'Museer och bibliotek',
  kyrka: 'Kyrkor och gudshus',
  byggnad: 'Byggnader och platser',
  konst: 'Konst och minnesmärken',
  idrott: 'Idrott',
  handel: 'Handel och marknad',
  krog: 'Krogar',
  kafe: 'Kaféer',
};

function categorise(t) {
  const name = t.name ?? '';
  if (t.place === 'square' || (/torg(et)?$/i.test(name) && (t.highway === 'pedestrian' || t.area === 'yes' || t.place))) return ['torg', 'square'];
  if (t.amenity === 'public_bath' || t.leisure === 'bathing_place' || t.natural === 'beach' || t.leisure === 'beach_resort' || t.leisure === 'water_park') return ['bad', t.amenity ?? t.leisure ?? t.natural];
  if (t.leisure === 'sports_centre' && /swimming/.test(t.sport ?? '')) return ['bad', 'swimming'];
  if (['park', 'garden', 'nature_reserve'].includes(t.leisure) || t.boundary === 'national_park') return ['park', t.leisure];
  if (['theatre', 'cinema', 'nightclub', 'events_venue', 'music_venue', 'concert_hall', 'arts_centre', 'casino'].includes(t.amenity)) return ['scen', t.amenity];
  if (['zoo', 'aquarium', 'theme_park'].includes(t.tourism) || t.leisure === 'amusement_arcade') return ['scen', t.tourism ?? t.leisure];
  if (['museum', 'gallery'].includes(t.tourism) || ['library', 'planetarium'].includes(t.amenity)) return ['museum', t.tourism ?? t.amenity];
  if (t.amenity === 'place_of_worship') return ['kyrka', t.religion ?? 'worship'];
  if (t.tourism === 'artwork' || ['memorial', 'monument', 'rune_stone'].includes(t.historic) || (t.amenity === 'fountain' && name)) return ['konst', t.artwork_type ?? t.historic ?? t.tourism ?? t.amenity];
  if (['stadium', 'sports_centre', 'sports_hall', 'ice_rink', 'golf_course'].includes(t.leisure) || (t.leisure === 'track' && t.sport === 'horse_racing')) return ['idrott', t.leisure];
  if (['mall', 'department_store'].includes(t.shop) || ['marketplace', 'food_court'].includes(t.amenity) || (t.landuse === 'retail' && t.wikidata)) return ['handel', t.shop ?? t.amenity ?? 'retail'];
  if (['restaurant', 'pub', 'bar', 'biergarten', 'fast_food'].includes(t.amenity)) return ['krog', t.amenity];
  if (['cafe', 'ice_cream'].includes(t.amenity) || ['pastry', 'confectionery'].includes(t.shop)) return ['kafe', t.amenity ?? t.shop];
  if (['castle', 'manor', 'building', 'ship', 'archaeological_site', 'fort', 'tower', 'city_gate'].includes(t.historic)) return ['byggnad', t.historic];
  if (['lighthouse', 'water_tower', 'windmill', 'tower'].includes(t.man_made) && name) return ['byggnad', t.man_made];
  if (['townhall', 'courthouse', 'university', 'college'].includes(t.amenity)) return ['byggnad', t.amenity];
  if (t.railway === 'station' && t.public_transport === 'station') return ['byggnad', 'station'];
  if (['attraction', 'viewpoint'].includes(t.tourism)) return ['byggnad', t.tourism];
  if (t.wikidata && (t.building || t.man_made || t.historic)) return ['byggnad', t.building ?? t.man_made ?? t.historic];
  return null;
}

const CHAIN_CATEGORIES = new Set(['krog', 'kafe', 'handel', 'scen', 'idrott']);

async function overpass() {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const filters = {
    place: 'square',
    highway: 'pedestrian',
    amenity: 'public_bath|theatre|cinema|nightclub|events_venue|music_venue|concert_hall|arts_centre|casino|library|planetarium|place_of_worship|fountain|marketplace|food_court|restaurant|pub|bar|biergarten|fast_food|cafe|ice_cream|townhall|courthouse|university|college',
    leisure: 'bathing_place|beach_resort|water_park|sports_centre|park|garden|nature_reserve|amusement_arcade|stadium|sports_hall|ice_rink|golf_course|track',
    tourism: 'zoo|aquarium|theme_park|museum|gallery|artwork|attraction|viewpoint',
    historic: '.',
    natural: 'beach',
    man_made: 'lighthouse|water_tower|windmill|tower',
    shop: 'mall|department_store|pastry|confectionery',
    railway: 'station',
  };
  const parts = Object.entries(filters).map(([k, v]) => `nwr[${k}~"^(${v})$"][name];`.replace('^(.)$', '.'));
  const q = `[out:json][timeout:180][bbox:${b}];(${parts.join('')}nwr[wikidata][building];nwr[wikidata][landuse=retail];);out center tags;`;
  const body = `data=${encodeURIComponent(q)}`;
  for (let attempt = 1; ; attempt++) {
    try {
      return JSON.parse(await cached('overpass.json', 'https://overpass-api.de/api/interpreter', { body })).elements;
    } catch (err) {
      if (attempt === 3) throw err;
      console.log(`  overpass: ${err.message}, retrying`);
      await sleep(30000);
    }
  }
}

async function wikidata() {
  const q = `SELECT ?i ?links ?inception ?dissolved ?sv ?label (GROUP_CONCAT(DISTINCT ?typeLabel; separator=", ") AS ?types) WHERE {
    SERVICE wikibase:box { ?i wdt:P625 ?c. bd:serviceParam wikibase:cornerSouthWest "Point(${bbox.west} ${bbox.south})"^^geo:wktLiteral. bd:serviceParam wikibase:cornerNorthEast "Point(${bbox.east} ${bbox.north})"^^geo:wktLiteral. }
    ?i wikibase:sitelinks ?links.
    OPTIONAL { ?i wdt:P571 ?inception }
    OPTIONAL { ?i wdt:P576 ?dissolved }
    OPTIONAL { ?sv schema:about ?i; schema:isPartOf <https://sv.wikipedia.org/> }
    OPTIONAL { ?i rdfs:label ?label FILTER(LANG(?label) = "sv") }
    OPTIONAL { ?i wdt:P31 ?type. ?type rdfs:label ?typeLabel FILTER(LANG(?typeLabel) = "sv") }
  } GROUP BY ?i ?links ?inception ?dissolved ?sv ?label`;
  const text = await cached('wikidata.json', `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`);
  const out = new Map();
  for (const r of JSON.parse(text).results.bindings) {
    const id = r.i.value.split('/').pop();
    if (out.has(id)) continue;
    out.set(id, {
      id,
      label: r.label?.value,
      types: r.types?.value,
      sitelinks: Number(r.links.value),
      inception: r.inception?.value?.slice(0, 4),
      dissolved: r.dissolved?.value?.slice(0, 4),
      svTitle: r.sv ? decodeURIComponent(r.sv.value.split('/wiki/')[1]) : undefined,
    });
  }
  return out;
}

async function pageviews(title) {
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/sv.wikipedia/all-access/user/${encodeURIComponent(title)}/monthly/20251001/20260930`;
  try {
    const text = await cached(`views/${encodeURIComponent(title)}.json`, url, { gap: 500 });
    return JSON.parse(text).items.reduce((s, i) => s + i.views, 0);
  } catch {
    return 0;
  }
}

async function osmSince(type, id, name) {
  try {
    const text = await cached(`history/${type}-${id}.json`, `https://api.openstreetmap.org/api/0.6/${type}/${id}/history.json`, { gap: 300 });
    const versions = JSON.parse(text).elements;
    const first = versions.find((v) => v.tags?.name && sameName(v.tags.name, name));
    return (first ?? versions[0]).timestamp.slice(0, 4);
  } catch {
    return undefined;
  }
}

async function whiteGuide() {
  const url = 'https://admin.whiteguide.com/api/reviews?filter[][by]=release_id&filter[][with]=58&filter[][by]=city_id&filter[][with]=30&filter[][by]=type&filter[][with]=Content::Reviews::Restaurant&locale=sv&limit=100';
  const data = JSON.parse(await cached('whiteguide.json', url)).data;
  return data.map((r) => {
    const p = r.attributes['place-attributes'];
    return { source: 'whiteguide', name: p.title.trim(), lat: p.lat, lon: p.lng, note: r.attributes.classification?.total?.label };
  });
}

async function michelin() {
  const out = [];
  for (const [i, path] of ['', '/page/2', '/page/3'].entries()) {
    let html;
    try {
      html = await cached(`michelin-${i + 1}.html`, `https://guide.michelin.com/se/en/skane/malmo/restaurants${path}`, { agent: BROWSER_AGENT });
    } catch {
      break;
    }
    const cards = html.split('data-lat="').slice(1);
    if (!cards.length) break;
    for (const c of cards) {
      const lat = Number(c.slice(0, c.indexOf('"')));
      const lon = Number(/data-lng="([0-9.]+)"/.exec(c)?.[1]);
      const name = /card__menu-content--title[^>]*>\s*<a[^>]*>\s*([^<]+)/.exec(c)?.[1]?.trim();
      const note = /card__menu-footer--score[^>]*>\s*([^<]+)/.exec(c)?.[1]?.replace(/\s+/g, ' ').trim();
      if (name && Number.isFinite(lat) && inBbox(lat, lon)) out.push({ source: 'michelin', name, lat, lon, note });
    }
  }
  return out;
}

function templateParam(body, key) {
  const m = new RegExp(`\\|\\s*${key}\\s*=\\s*([^|}\\n]*)`).exec(body);
  return m?.[1]?.trim() || undefined;
}

async function wikivoyage() {
  const url = 'https://en.wikivoyage.org/w/api.php?action=parse&page=Malm%C3%B6&prop=wikitext&format=json&formatversion=2';
  const text = JSON.parse(await cached('wikivoyage-en.json', url)).parse.wikitext;
  const out = [];
  for (const m of text.matchAll(/\{\{\s*(see|do|buy|eat|drink|listing|go)\s*\|/gi)) {
    let depth = 0;
    let end = m.index;
    for (; end < text.length; end++) {
      if (text.startsWith('{{', end)) depth++, end++;
      else if (text.startsWith('}}', end) && --depth === 0) break;
      else if (text.startsWith('}}', end)) end++;
    }
    const body = `|${text.slice(m.index + m[0].length, end).replace(/\{\{[^{}]*\}\}/g, '')}`;
    const kind = m[1].toLowerCase();
    const name = templateParam(body, 'name');
    const lat = Number(templateParam(body, 'lat'));
    const lon = Number(templateParam(body, 'long'));
    if (!name || kind === 'go' || (kind === 'listing' && !lat)) continue;
    out.push({ source: 'wikivoyage', name, lat: lat || undefined, lon: lon || undefined, note: kind });
  }
  const sv = JSON.parse(await cached('wikivoyage-sv.json', url.replace('en.', 'sv.'))).parse.wikitext;
  return { listings: out, svText: norm(sv) };
}

async function visitMalmo() {
  const out = [];
  for (const [page, note] of [['se-gora', 'se och göra'], ['ata', 'äta']]) {
    const html = await cached(`visitmalmo-${page}.html`, `https://www.visitmalmo.se/${page}/`, { agent: BROWSER_AGENT });
    for (const chunk of html.split('fs-item-action-link').slice(0, -1)) {
      const t = [...chunk.slice(-3000).matchAll(/class="[^"]*(?:title|heading|name)[^"]*"[^>]*>\s*([^<]{2,80})/g)].pop();
      if (t) out.push({ source: 'visitmalmo', name: decode(t[1].trim()), note });
    }
  }
  return out;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"');

async function malmoKonst() {
  const url = 'https://opendata-api.malmo.se/dataset/cf5f830c-0216-43c0-af60-e8385dfef4e2/resource/01c13bc1-861c-4486-85a3-15d50ac6584e/download/offentlig_konst.geojson';
  const features = JSON.parse(await cached('malmo-konst.geojson', url)).features;
  return features
    .filter((f) => f.geometry && f.properties.title)
    .map((f) => ({
      source: 'malmo-konst',
      name: f.properties.title.trim(),
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      note: [f.properties.creator, f.properties.created].filter(Boolean).join(', '),
    }));
}

const landmarks = JSON.parse(await readFile('landmarks/landmarks.json', 'utf8')).landmarks;

console.log('fetching sources');
const [elements, wd, wg, mi, wv, vm, konst] = await Promise.all([overpass(), wikidata(), whiteGuide(), michelin(), wikivoyage(), visitMalmo(), malmoKonst()]);
console.log(`  osm ${elements.length}, wikidata ${wd.size}, whiteguide ${wg.length}, michelin ${mi.length}, wikivoyage ${wv.listings.length}, visitmalmo ${vm.length}, malmö konst ${konst.length}`);

const places = [];
let chains = 0;
for (const e of elements) {
  const t = e.tags ?? {};
  if (!t.name) continue;
  const cat = categorise(t);
  if (!cat) continue;
  if (CHAIN_CATEGORIES.has(cat[0]) && (t.brand || t['brand:wikidata'])) {
    chains++;
    continue;
  }
  if (Object.keys(t).some((k) => /^(disused|was|abandoned):/.test(k))) continue;
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (lat === undefined) continue;
  places.push({
    category: cat[0],
    kind: cat[1],
    name: t.name,
    lat: Math.round(lat * 1e5) / 1e5,
    lon: Math.round(lon * 1e5) / 1e5,
    osm: `${e.type}/${e.id}`,
    wikidata: t.wikidata,
    startDate: t.start_date?.slice(0, 4),
    sources: [],
  });
}

const merged = [];
const byKey = new Map();
for (const p of places) {
  const key = `${p.category}|${norm(p.name)}`;
  const twin = (byKey.get(key) ?? []).find((q) => distance([q.lon, q.lat], [p.lon, p.lat]) < 300);
  if (twin) {
    twin.osm += `,${p.osm}`;
    twin.wikidata ??= p.wikidata;
    twin.startDate ??= p.startDate;
    continue;
  }
  byKey.set(key, [...(byKey.get(key) ?? []), p]);
  merged.push(p);
}

const unmatched = [];
const attach = (place, entry) => {
  if (!place.sources.some((s) => s.source === entry.source)) place.sources.push({ source: entry.source, ...(entry.note ? { note: entry.note } : {}) });
};

function matchByPoint(entry, radius = 250) {
  let best;
  for (const p of merged) {
    const d = distance([p.lon, p.lat], [entry.lon, entry.lat]);
    if (d < radius && sameName(p.name, entry.name) && (!best || d < best.d)) best = { p, d };
  }
  return best?.p;
}

for (const entry of [...wg, ...mi, ...wv.listings]) {
  const hit = entry.lat ? matchByPoint(entry) : merged.find((p) => norm(p.name) === norm(entry.name));
  if (hit) attach(hit, entry);
  else unmatched.push(entry);
}

for (const entry of vm) {
  const hits = merged.filter((p) => norm(p.name) === norm(entry.name));
  const fallback = hits.length ? hits : merged.filter((p) => sameName(p.name, entry.name) && norm(entry.name).length >= 6);
  if (fallback.length && fallback.length <= 3) fallback.forEach((p) => attach(p, entry));
  else unmatched.push(entry);
}

for (const entry of konst) {
  const hit = matchByPoint(entry, 100);
  if (hit) attach(hit, entry);
  else {
    const p = { category: 'konst', kind: 'artwork', name: entry.name, lat: Math.round(entry.lat * 1e5) / 1e5, lon: Math.round(entry.lon * 1e5) / 1e5, sources: [] };
    attach(p, entry);
    merged.push(p);
  }
}

for (const p of merged) {
  const n = norm(p.name);
  if (n.length >= 6 && ` ${wv.svText} `.includes(` ${n} `)) attach(p, { source: 'wikivoyage-sv' });
  const lm = landmarks.find((l) => (l._resolved?.osm && p.osm?.split(',').includes(l._resolved.osm)) || (sameName(l.name, p.name) && distance([l.lon, l.lat], [p.lon, p.lat]) < 300));
  if (lm) p.inGame = lm.name;
}

console.log('wikidata and page views');
for (const p of merged) {
  const w = p.wikidata && wd.get(p.wikidata);
  if (!w) continue;
  p.sitelinks = w.sitelinks;
  p.inception = w.inception;
  if (w.dissolved) p.dissolved = w.dissolved;
  if (w.svTitle) {
    attach(p, { source: 'wikipedia' });
    p.wikipedia = w.svTitle;
    p.views = await pageviews(w.svTitle);
  }
}

const history = merged.filter((p) => ['krog', 'kafe'].includes(p.category) && p.osm);
console.log(`osm history for ${history.length} krogar and kaféer`);
for (const [i, p] of history.entries()) {
  const [type, id] = p.osm.split(',')[0].split('/');
  p.osmSince = await osmSince(type, id, p.name);
  if (i % 100 === 99) console.log(`  ${i + 1}`);
}

const usedWikidata = new Set(merged.map((p) => p.wikidata).filter(Boolean));
const wikidataOnly = [...wd.values()]
  .filter((w) => !usedWikidata.has(w.id) && w.sitelinks >= 3 && !w.dissolved && w.label)
  .sort((a, b) => b.sitelinks - a.sitelinks)
  .map(({ id, label, types, sitelinks, svTitle }) => ({ wikidata: id, name: label, types, sitelinks, wikipedia: svTitle }));

async function intros(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const params = new URLSearchParams({ action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', exlimit: '20', redirects: '1', format: 'json', formatversion: '2', titles: batch.join('|') });
    const text = await cached(`intros/${i / 20}-${batch.length}-${norm(batch[0]).slice(0, 20).replace(/ /g, '-')}.json`, `https://sv.wikipedia.org/w/api.php?${params}`, { gap: 1000 });
    const q = JSON.parse(text).query;
    const back = new Map([...(q.normalized ?? []), ...(q.redirects ?? [])].map((r) => [r.to, r.from]));
    for (const page of q.pages) if (page.extract) out[back.get(page.title) ?? page.title] = page.extract;
  }
  return out;
}

const titles = [...new Set([...merged.map((p) => p.wikipedia), ...wikidataOnly.map((w) => w.wikipedia)].filter(Boolean))].sort();
console.log(`wikipedia intros for ${titles.length} articles`);
await writeFile(`${CACHE}/wikipedia-intros.json`, `${JSON.stringify(await intros(titles), null, 1)}\n`);

const since = (p) => Number(p.inception ?? p.startDate ?? p.osmSince ?? 9999);

function score(p) {
  const guides = p.sources.filter((s) => s.source !== 'malmo-konst').length;
  return guides * 100 + Math.min(p.sitelinks ?? 0, 30) * 3 + Math.log10(1 + (p.views ?? 0)) * 10 + (p.inGame ? 50 : 0) + Math.max(0, 2026 - since(p)) / 5;
}

const out = { categories: {}, unmatched, wikidataOnly };
for (const [key, label] of Object.entries(CATEGORIES)) {
  const list = merged
    .filter((p) => p.category === key && !p.dissolved)
    .map((p) => ({ ...p, score: Math.round(score(p)) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'sv'));
  out.categories[key] = { label, places: list };
}

await mkdir('places', { recursive: true });
await writeFile(OUT, `${JSON.stringify(out, null, 1)}\n`);

const md = ['# Long list', '', 'Generated by `scripts/places-collect.mjs`. Sorted by score within each category.', ''];
for (const { label, places: list } of Object.values(out.categories)) {
  md.push(`## ${label} (${list.length})`, '', '| | Name | Kind | Sources | Since | Wiki | Views |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const p of list) {
    const year = p.inception ?? p.startDate ?? (p.osmSince ? `osm ${p.osmSince}` : '');
    md.push(`| ${p.inGame ? '★' : ''} | ${p.name} | ${p.kind ?? ''} | ${p.sources.map((s) => s.source).join(', ')} | ${year} | ${p.sitelinks ?? ''} | ${p.views ?? ''} |`);
  }
  md.push('');
}
md.push(`## Not matched to OSM (${unmatched.length})`, '', ...unmatched.map((u) => `- ${u.name} (${u.source}${u.note ? `, ${u.note}` : ''})`), '');
md.push(`## On Wikidata, not in the list (${wikidataOnly.length})`, '', ...wikidataOnly.map((w) => `- ${w.name}: ${w.types ?? ''} (${w.sitelinks} sitelinks)`), '');
await writeFile(OUT_MD, md.join('\n'));

console.log(`\n${chains} chain places dropped`);
for (const { label, places: list } of Object.values(out.categories)) console.log(`  ${label}: ${list.length}`);
console.log(`  not matched: ${unmatched.length}, wikidata only: ${wikidataOnly.length}`);
console.log(`wrote ${OUT} and ${OUT_MD}`);
