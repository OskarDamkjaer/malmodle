import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { bboxGap, bboxOf, dissolve, distance, interiorPoint } from './lib/geo.mjs';
import { layerFeatures, tiles } from './lib/pmtiles.mjs';
import { neighbourhood } from './lib/adjacency.mjs';
import { closest, contains, metersBetween } from '../app/geo.mjs';
import { SET_SIZE } from '../app/daily.mjs';
import { TYPES } from '../app/questions.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outFile = arg('--out', 'build/data/quiz.json');
const archive = arg('--pmtiles', 'data/cache/malmo.pmtiles');
const everything = args.includes('--all');
const coreFile = arg('--core', 'learn/core.json');
const pendingFile = arg('--pending', 'learn/pending.json');
const placesFile = arg('--places', 'places/places.json');

const STREET_ZOOM = 14;
const STREET_LINK_M = 500;

const json = async (f) => JSON.parse(await readFile(f, 'utf8'));

const [districts, placesDoc, bridgesDoc, streetsDoc, aboutDoc, streetIndex, coreDoc, pendingDoc, sourcesDoc, shapesDoc, longlist, bboxDoc, regionsDoc, daysDoc] = await Promise.all([
  json('build/data/districts.geojson'),
  json(placesFile),
  json('learn/bridges.json'),
  json('learn/streets.json'),
  json('learn/about.json'),
  json('data/cache/streets.json'),
  json(coreFile),
  json(pendingFile),
  json('learn/sources.json'),
  json('data/cache/shapes.json'),
  json('places/longlist.json'),
  json('config/bbox.json'),
  json('learn/regions.json'),
  json('learn/days.json'),
]);

const problems = [];
const fail = (msg) => problems.push(msg);

const round = (v) => Math.round(v * 1e5) / 1e5;
const roundCoords = (c) => (typeof c[0] === 'number' ? [round(c[0]), round(c[1])] : c.map(roundCoords));

function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(points[i], points[a], points[b]);
      if (d > worst) { worst = d; index = i; }
    }
    if (worst > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function segmentDistance(p, a, b) {
  const kx = 111320 * Math.cos((a[1] * Math.PI) / 180);
  const ky = 111320;
  const px = (p[0] - a[0]) * kx;
  const py = (p[1] - a[1]) * ky;
  const bx = (b[0] - a[0]) * kx;
  const by = (b[1] - a[1]) * ky;
  const len = bx * bx + by * by;
  const t = len ? Math.max(0, Math.min(1, (px * bx + py * by) / len)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}

function simplifyPolygonal(geometry, tolerance = 4) {
  const ring = (r) => {
    const s = simplifyLine(r, tolerance);
    return s.length >= 4 ? s : r;
  };
  if (geometry.type === 'Polygon') return { type: 'Polygon', coordinates: roundCoords(geometry.coordinates.map(ring)) };
  return { type: 'MultiPolygon', coordinates: roundCoords(geometry.coordinates.map((p) => p.map(ring))) };
}

function shapeOr(kind, name, point) {
  const shape = shapesDoc.shapes[`${kind}:${name}`];
  if (!shape) return { type: 'Point', coordinates: roundCoords(point) };
  if (shape.type === 'Point') return { type: 'Point', coordinates: roundCoords(shape.coordinates) };
  if (shape.type === 'MultiLineString') {
    return { type: 'MultiLineString', coordinates: shape.coordinates.map((line) => roundCoords(simplifyLine(line, 3))) };
  }
  return simplifyPolygonal(shape);
}

const text = (entry) => ({ about: entry?.text ?? null, source: entry?.source ?? null });

const delomraden = districts.features;
const areaItems = delomraden.map((f) => {
  const { name } = f.properties;
  const point = interiorPoint(f.geometry);
  if (!point) fail(`${name}: no interior point`);
  return {
    name,
    kind: 'area',
    label: 'Delområde',
    point: point && roundCoords(point),
    geometry: simplifyPolygonal(f.geometry),
    ...text(aboutDoc.areas[name]),
  };
});

const PLACE_LABEL = {
  torg: 'Torg', park: 'Park', bad: 'Bad', scen: 'Scen', museum: 'Museum', kyrka: 'Kyrka', byggnad: 'Byggnad',
  konst: 'Konstverk', idrott: 'Idrott', handel: 'Handel', krog: 'Krog', kafe: 'Kafé', vatten: 'Vatten', omrade: 'Område', skola: 'Skola',
};

const districtByName = new Map(delomraden.map((f) => [f.properties.name, f]));

const REGION_SIMPLIFY_M = 20;
const REGION_MOST = 3;

const regions = Object.entries(regionsDoc.regions).map(([name, members]) => {
  const parts = members.map((m) => districtByName.get(m)?.geometry);
  members.filter((m, i) => !parts[i]).forEach((m) => fail(`regions.json: ${name} has no delområde ${m}`));
  const outline = dissolve(parts.filter(Boolean));
  return { name, point: roundCoords(interiorPoint(outline)), geometry: simplifyPolygonal(outline, REGION_SIMPLIFY_M) };
});

function branchGeometry(p) {
  const spots = p.branches.map((b) => roundCoords([b.lon, b.lat]));
  if (spots.length < 2) fail(`${p.name}: a place with branches needs at least two`);
  const spread = (c) => spots.reduce((sum, o) => sum + metersBetween(c, o), 0);
  const point = spots.reduce((a, b) => (spread(b) < spread(a) ? b : a));
  return { geometry: { type: 'MultiPoint', coordinates: spots }, point };
}

function regionsFor(geometry) {
  const within = regions.filter((r) => {
    const n = geometry.coordinates.filter((c) => contains(r.geometry, c)).length;
    return n >= 1 && n <= REGION_MOST;
  });
  return within.length ? { regions: within } : {};
}

function placeGeometry(p) {
  if (p.branches) return branchGeometry(p);
  if (p.district) {
    const f = districtByName.get(p.district);
    if (!f) { fail(`${p.name}: no district ${p.district}`); return null; }
    return { geometry: simplifyPolygonal(f.geometry), point: interiorPoint(f.geometry) };
  }
  const shape = shapesDoc.shapes[`place:${p.name}`];
  const middle = (line) => line[Math.floor(line.length / 2)];
  const point = p.lat != null ? [p.lon, p.lat]
    : shape?.type === 'Point' ? shape.coordinates
    : shape?.type === 'MultiLineString' ? middle(shape.coordinates.reduce((a, b) => (b.length > a.length ? b : a)))
    : shape ? interiorPoint(shape) : null;
  if (!point) { fail(`${p.name}: no point or shape`); return null; }
  return { geometry: shapeOr('place', p.name, point), point };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CHANGEABLE = new Set(['asked', 'osm', 'lat', 'lon', 'branches', 'district', 'description', 'source']);
const VARIES = ['asked', 'point', 'geometry', 'regions', 'about', 'source', 'streetview'];

const curated = new Set(placesDoc.places.map((p) => p.name));
const versions = new Map();

function versionsOf(p) {
  if (!curated.has(p.name)) { fail(`pending.json: ${p.name} is not live yet, so change it instead of dating it`); return []; }
  let entry = p;
  return Object.entries(p.changes).sort(([a], [b]) => (a < b ? -1 : 1)).map(([on, change]) => {
    if (!DATE.test(on)) fail(`${p.name}: change ${on} is not a date`);
    for (const field of Object.keys(change)) if (!CHANGEABLE.has(field)) fail(`${p.name}: ${field} cannot change on a date`);
    entry = Object.fromEntries(Object.entries({ ...entry, ...change }).filter(([, v]) => v !== null));
    return { on, item: placeItem(entry), osm: entry.osm ?? [] };
  }).filter((v) => v.item);
}

const allPlaces = [...placesDoc.places, ...pendingDoc.landmarks];
const placeByName = new Map(allPlaces.map((p) => [p.name, p]));

const landmarkItems = allPlaces.map((p) => {
  const it = placeItem(p);
  if (it && p.changes) versions.set(p.name, versionsOf(p));
  return it;
}).filter(Boolean);

const OSM_ID = /^(node|way|relation)\/\d+$/;
for (const p of allPlaces) {
  for (const id of [p.osm, ...Object.values(p.changes ?? {}).map((c) => c.osm)].flat().filter(Boolean)) {
    if (!OSM_ID.test(id)) fail(`${p.name}: ${id} is not an OpenStreetMap id`);
  }
}

for (const p of allPlaces.filter((x) => x.apart)) {
  const partner = placeByName.get(p.apart);
  if (!partner) fail(`${p.name}: apart names ${p.apart}, which is not a place`);
  else if (partner.apart && partner.apart !== partner.name) fail(`${p.name}: apart names ${p.apart}, which belongs with ${partner.apart}`);
  else if (partner.category === 'krog') fail(`${p.name}: apart names ${p.apart}, a krog, which is dealt with the krogar and not with the places that belong with it`);
}

function placeItem(p) {
  if (!PLACE_LABEL[p.category]) fail(`${p.name}: unknown category ${p.category}`);
  const where = placeGeometry(p);
  if (!where) return null;
  return {
    name: p.name,
    kind: 'landmark',
    label: PLACE_LABEL[p.category],
    category: p.category,
    ...(p.apart && { apart: p.apart }),
    ...(p.asked && { asked: p.asked }),
    ...(everything && { osm: p.osm }),
    point: roundCoords(where.point),
    geometry: where.geometry,
    ...(where.geometry.type === 'MultiPoint' && regionsFor(where.geometry)),
    about: p.description ?? null,
    source: p.source ?? null,
  };
}

const bridgeItems = bridgesDoc.bridges.map((b) => {
  if (b.lat == null || b.lon == null) fail(`${b.name}: bridge without coordinates`);
  return {
    name: b.name,
    kind: 'bridge',
    label: 'Bro',
    point: roundCoords([b.lon, b.lat]),
    geometry: shapeOr('bridge', b.name, [b.lon, b.lat]),
    about: b.description ?? null,
    source: b.source ?? null,
  };
});

const STREET_LABEL = { 1: 'Motorväg', 2: 'Huvudgata', 3: 'Genomfartsgata' };

const streetPieces = new Map();
for (const tile of tiles(archive, { zoom: STREET_ZOOM })) {
  for (const f of layerFeatures(tile.data, 'transportation_name', tile)) {
    const name = f.properties.name;
    if (!name) continue;
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates
      : f.geometry.type === 'LineString' ? [f.geometry.coordinates] : [];
    if (!streetPieces.has(name)) streetPieces.set(name, []);
    for (const line of lines) if (line.length > 1) streetPieces.get(name).push(line);
  }
}

function streetGeometry(name, near) {
  const pieces = (streetPieces.get(name) ?? []).map((line) => ({ line, box: bboxOf(line) }));
  if (!pieces.length) return null;
  const seed = pieces.reduce((best, p, i) => {
    const d = Math.min(...p.line.map((c) => distance(c, near)));
    return d < best.d ? { d, i } : best;
  }, { d: Infinity, i: -1 });
  if (seed.d > STREET_LINK_M) return null;
  const keep = new Set([seed.i]);
  const queue = [seed.i];
  while (queue.length) {
    const i = queue.pop();
    for (let j = 0; j < pieces.length; j++) {
      if (keep.has(j) || bboxGap(pieces[i].box, pieces[j].box) > STREET_LINK_M) continue;
      keep.add(j);
      queue.push(j);
    }
  }
  const seen = new Set();
  const lines = [];
  for (const i of keep) {
    const line = roundCoords(simplifyLine(pieces[i].line, 3));
    const key = JSON.stringify(line);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return { type: 'MultiLineString', coordinates: lines };
}

const streetByName = new Map();
for (const st of streetIndex) {
  const prev = streetByName.get(st.name);
  if (!prev || st.rank < prev.rank) streetByName.set(st.name, st);
}

const streetItems = streetsDoc.streets.map((s) => {
  const hit = streetByName.get(s.name);
  if (!hit) { fail(`${s.name}: street not in the street index`); return null; }
  const geometry = streetGeometry(s.name, hit.point);
  if (!geometry) { fail(`${s.name}: no geometry in the basemap`); return null; }
  return {
    name: s.name,
    kind: 'street',
    label: STREET_LABEL[hit.rank] ?? 'Gata',
    point: roundCoords(hit.point),
    geometry,
    about: s.description ?? null,
    source: s.source ?? null,
  };
}).filter(Boolean);

const PRECEDENCE = ['landmark', 'area', 'bridge', 'street'];
const byName = new Map();
for (const it of [...areaItems, ...landmarkItems, ...bridgeItems, ...streetItems]) {
  const prev = byName.get(it.name);
  if (!prev) { byName.set(it.name, it); continue; }
  const [keep, drop] = PRECEDENCE.indexOf(it.kind) < PRECEDENCE.indexOf(prev.kind) ? [it, prev] : [prev, it];
  if (!keep.about && drop.about) { keep.about = drop.about; keep.source = drop.source; }
  byName.set(keep.name, keep);
}
const items = [...byName.values()];

const sources = sourcesDoc.sources ?? {};
const unlinked = new Set(sourcesDoc.unlinked ?? []);
for (const name of unlinked) if (!byName.has(name)) fail(`sources.json: ${name} is unlinked but is not in the data`);
for (const it of items) {
  if (unlinked.has(it.name)) it.source = null;
  else if (!it.source && sources[it.name]) it.source = sources[it.name];
}

const CORE_KIND = { areas: 'area', streets: 'street', bridges: 'bridge', landmarks: 'landmark' };
const core = new Set();
for (const [section, names] of Object.entries(coreDoc.core)) {
  const kind = CORE_KIND[section];
  if (!kind) { fail(`core.json: unknown section ${section}`); continue; }
  for (const name of names) {
    const it = byName.get(name);
    if (!it) { fail(`core.json: ${name} is not in the data`); continue; }
    if (it.kind !== kind) fail(`core.json: ${name} is listed under ${section} but is a ${it.kind}`);
    if (core.has(name)) fail(`core.json: ${name} is listed twice`);
    core.add(name);
  }
}

if (coreDoc.pending) fail('core.json: pending belongs in learn/pending.json');
for (const [section, entries] of Object.entries(pendingDoc)) {
  const kind = CORE_KIND[section];
  if (!kind) { fail(`pending.json: unknown section ${section}`); continue; }
  for (const entry of entries) {
    const name = section === 'landmarks' ? entry.name : entry;
    if (section === 'landmarks' && curated.has(name)) fail(`pending.json: ${name} is already in places.json`);
    const it = byName.get(name);
    if (!it) { fail(`pending.json: ${name} is not in the data`); continue; }
    if (it.kind !== kind) fail(`pending.json: ${name} is listed under ${section} but is a ${it.kind}`);
    if (core.has(name)) fail(`pending.json: ${name} is both in core and pending`);
  }
}

for (const [day, names] of Object.entries(coreDoc.since ?? {})) {
  if (!DATE.test(day)) fail(`core.json: since ${day} is not a date`);
  for (const name of names) {
    if (!core.has(name)) { fail(`core.json: ${name} has a since date but is not in core`); continue; }
    if (byName.get(name).since) fail(`core.json: ${name} has two since dates`);
    byName.get(name).since = day;
  }
}

const BY_MOST = 80;
const UNSEEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;
const made = {};
for (const [day, { by = null, slots, ...rest }] of Object.entries(daysDoc.days)) {
  const where = `days.json: ${day}`;
  if (!DATE.test(day)) fail(`${where} is not a date`);
  for (const field of Object.keys(rest)) fail(`${where} has an unknown field ${field}`);
  if (by !== null && (typeof by !== 'string' || !by.trim() || by.length > BY_MOST || UNSEEN.test(by))) fail(`${where} has no usable name to credit`);
  if (!Array.isArray(slots) || slots.length !== SET_SIZE) { fail(`${where} needs ${SET_SIZE} questions`); continue; }
  const seen = new Set();
  for (const { target, type, seed } of slots) {
    const it = byName.get(target);
    if (!core.has(target)) fail(`${where}: ${target} is not in core.json`);
    else if (it.since && it.since > day) fail(`${where}: ${target} joins only on ${it.since}`);
    if (seen.has(target)) fail(`${where}: ${target} is asked twice`);
    seen.add(target);
    if (!Object.hasOwn(TYPES, type)) fail(`${where}: ${type} is not a question type`);
    if (!Number.isSafeInteger(seed)) fail(`${where}: ${target} has no seed`);
  }
  made[day] = { by, slots: slots.map(({ target, type, seed }) => ({ target, type, seed })) };
}

for (const it of items) {
  if (!it.point || !Number.isFinite(it.point[0])) fail(`${it.name}: no point`);
  if (!it.geometry) fail(`${it.name}: no geometry`);
}

const OFF_SHAPE_M = 20;

function onShape(geometry, point) {
  if (geometry.type === 'Point') return geometry.coordinates;
  const near = closest(geometry, point);
  if (near.distance <= OFF_SHAPE_M) return point;
  return roundCoords(geometry.type.endsWith('LineString') ? near.point : interiorPoint(geometry));
}

for (const it of items) if (it.point && it.geometry) it.point = onShape(it.geometry, it.point);

const ROAD_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']);
const PATH_SUBCLASSES = new Set(['path', 'footway', 'cycleway', 'pedestrian']);
const OPEN_SPACE = new Set(['bad', 'vatten', 'torg', 'konst', 'omrade']);
const ROAD_REACH_M = 300;
const PATH_REACH_M = 150;

const roads = [];
const paths = [];
for (const tile of tiles(archive, { zoom: STREET_ZOOM })) {
  for (const f of layerFeatures(tile.data, 'transportation', tile)) {
    const { class: kind, subclass } = f.properties;
    const into = ROAD_CLASSES.has(kind) ? roads : kind === 'path' && PATH_SUBCLASSES.has(subclass) ? paths : null;
    if (!into) continue;
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates
      : f.geometry.type === 'LineString' ? [f.geometry.coordinates] : [];
    for (const line of lines) for (let i = 1; i < line.length; i++) into.push([line[i - 1], line[i]]);
  }
}

function nearest(segments, point, within) {
  let best = { point: null, distance: Infinity };
  for (const segment of segments) {
    const c = closest({ type: 'LineString', coordinates: segment }, point);
    if (c.distance < best.distance && (!within || contains(within, c.point))) best = c;
  }
  return best;
}

const reached = (hit, reach) => (hit?.point && hit.distance <= reach ? hit.point : null);

function streetMiddle(geometry) {
  const [minX, minY, maxX, maxY] = bboxOf(geometry.coordinates.flat());
  return closest(geometry, [(minX + maxX) / 2, (minY + maxY) / 2]).point;
}

function onAddressStreet(it) {
  const pieces = streetPieces.get(shapesDoc.streets?.[`place:${it.name}`]);
  return pieces ? closest({ type: 'MultiLineString', coordinates: pieces }, it.point) : null;
}

function streetviewPoint(it) {
  if (it.kind === 'street') return streetMiddle(it.geometry);
  if (it.kind === 'bridge') return it.point;
  if (it.kind === 'area') return nearest(roads, it.point, it.geometry).point ?? nearest(roads, it.point).point;
  if (it.category === 'park') {
    const outline = it.geometry.type.endsWith('Polygon') ? it.geometry : null;
    return reached(nearest(paths, it.point, outline), PATH_REACH_M);
  }
  if (OPEN_SPACE.has(it.category)) {
    const hits = [[nearest(roads, it.point), ROAD_REACH_M], [nearest(paths, it.point), PATH_REACH_M]]
      .filter(([hit, reach]) => reached(hit, reach))
      .map(([hit]) => hit);
    return hits.reduce((a, b) => (b.distance < a.distance ? b : a), hits[0])?.point;
  }
  return reached(onAddressStreet(it), ROAD_REACH_M) ?? reached(nearest(roads, it.point), ROAD_REACH_M);
}

for (const it of items) if (it.point && it.geometry) it.streetview = roundCoords(streetviewPoint(it) ?? it.point);

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
for (const [name, list] of versions) {
  const it = byName.get(name);
  if (it?.kind !== 'landmark' || !list.length) continue;
  it.changes = list.map(({ on, item }) => {
    if (unlinked.has(name)) item.source = null;
    else if (!item.source && sources[name]) item.source = sources[name];
    item.point = onShape(item.geometry, item.point);
    item.streetview = roundCoords(streetviewPoint(item) ?? item.point);
    return { on, ...Object.fromEntries(VARIES.filter((k) => !same(item[k], it[k])).map((k) => [k, item[k] ?? null])) };
  });
}

if (problems.length) {
  console.error(`build-quiz: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const chosen = everything ? items : items.filter((it) => core.has(it.name));
const kept = new Set(chosen.map((it) => it.name));
const around = neighbourhood(items.filter((it) => it.kind === 'area'), kept);
for (const it of chosen) if (around.has(it.name)) Object.assign(it, around.get(it.name));

const DECOY_KINDS = {
  kyrka: ['christian'],
  scen: ['theatre', 'cinema', 'arts_centre', 'music_venue', 'events_venue', 'nightclub'],
  krog: ['restaurant', 'pub', 'bar'],
  kafe: ['cafe', 'ice_cream', 'confectionery', 'pastry', 'cafe;bar'],
  byggnad: (kind) => kind !== 'church',
};
const DECOY_SKIP = new Set([
  'Friskis & Svettis', 'Nudism beach', 'Ribersborgs hundbadplats', 'itrim', 'Improv!', 'Rusta', 'ÖoB', 'Tintin',
]);
const DECOY_SAME_M = 50;
const DECOY_PER_PLACE = 10;

const fits = (category, kind) => {
  const rule = DECOY_KINDS[category];
  return !rule || (typeof rule === 'function' ? rule(kind) : rule.includes(kind));
};
const { west, south, east, north } = bboxDoc.bbox;
const asks = (it) => everything || it.kind !== 'landmark' || core.has(it.name);
const named = [...areaItems, ...bridgeItems, ...streetItems].map((it) => it.name);
const asked = items.filter((it) => it.kind === 'landmark' && asks(it));
const several = (it) => it.geometry.type === 'MultiPoint';
const osmIds = (p) => p.osm?.split(',') ?? [];

function placesOn(day) {
  return asked.filter((it) => !it.since || it.since <= day).map((it) => {
    const version = (versions.get(it.name) ?? []).findLast((v) => v.on <= day);
    return { it: version?.item ?? it, osm: version?.osm ?? placeByName.get(it.name).osm ?? [], ties: Boolean(it.since || version || !curated.has(it.name)) };
  });
}

function decoysAt(day) {
  const live = placesOn(day);
  const playing = new Set(live.map(({ it }) => it.name));
  const waiting = new Set(items.filter((it) => it.kind === 'landmark' && !playing.has(it.name)).map((it) => it.name));
  const taken = new Set([...playing, ...named].map((name) => name.toLowerCase()));
  const tied = new Set(live.filter((p) => p.ties).flatMap((p) => p.osm));
  const pool = [];
  for (const [category, { places }] of Object.entries(longlist.categories)) {
    if (!PLACE_LABEL[category]) continue;
    for (const p of places) {
      if (p.lat == null || (p.inGame && !waiting.has(p.inGame)) || DECOY_SKIP.has(p.name) || taken.has(p.name.toLowerCase()) || !fits(category, p.kind)) continue;
      if (p.lon < west || p.lon > east || p.lat < south || p.lat > north) continue;
      if (osmIds(p).some((id) => tied.has(id))) continue;
      const point = roundCoords([p.lon, p.lat]);
      if (live.some(({ it }) => !several(it) && it.category === category && metersBetween(it.point, point) < DECOY_SAME_M)) continue;
      taken.add(p.name.toLowerCase());
      pool.push({ name: p.name, category, point });
    }
  }
  const picked = new Set();
  for (const { it } of live.filter((p) => !several(p.it))) {
    pool
      .filter((d) => d.category === it.category && !contains(it.geometry, d.point))
      .sort((a, b) => metersBetween(a.point, it.point) - metersBetween(b.point, it.point))
      .slice(0, DECOY_PER_PLACE)
      .forEach((d) => picked.add(d));
  }
  return picked;
}

const turns = ['', ...new Set(asked.flatMap((it) => [it.since, ...(versions.get(it.name) ?? []).map((v) => v.on)]).filter(Boolean).sort())];
const spans = new Map();
turns.forEach((day, n) => {
  for (const d of decoysAt(day)) {
    const key = JSON.stringify(d);
    if (!spans.has(key)) spans.set(key, { d, on: [] });
    spans.get(key).on.push(n);
  }
});
const decoys = [];
for (const { d, on } of spans.values()) {
  on.forEach((n, i) => {
    if (i > 0 && on[i - 1] === n - 1) return;
    let last = n;
    while (on.includes(last + 1)) last++;
    decoys.push({ ...d, ...(n > 0 && { since: turns[n] }), ...(last + 1 < turns.length && { until: turns[last + 1] }) });
  });
}
const order = (d) => `${d.name}\u0000${d.since ?? ''}`;
decoys.sort((a, b) => (order(a) < order(b) ? -1 : 1));

const out = { items: chosen, decoys, ...(Object.keys(made).length && { made }) };
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(out));

const kinds = [...new Set(chosen.map((it) => it.kind))];
console.log(`build-quiz → ${outFile} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
for (const kind of kinds) console.log(`  ${kind.padEnd(9)} ${chosen.filter((it) => it.kind === kind).length}`);
console.log(`  ${'decoy'.padEnd(9)} ${decoys.length}${turns.length > 1 ? `, over ${turns.length - 1} date${turns.length > 2 ? 's' : ''}` : ''}`);
if (out.made) console.log(`  ${'made'.padEnd(9)} ${Object.keys(made).length}`);
