import { Map, addProtocol } from '/vendor/maplibre-gl.mjs';
import { BAND_COLORS, SET_SIZE } from '/daily.mjs';
import { MAX_SCORE, TYPES, answerOf, formatDistance, several } from '/questions.mjs';
import { around, bounds, metersBetween, union } from '/geo.mjs';
import { applyPalette, clear, setupLayers, show, showTap } from '/map.js';
import { LEVELS, reach } from '/bygg/falloff.js';
import { GROUP_NAMES, LIMITS, TYPE_NAMES, WHAT, another, assemble, flags, pack, proposals, ready, sending, typical, unpack } from '/bygg/handmade.mjs';

const el = (id) => document.getElementById(id);

function make(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key in node && !key.includes('-')) node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return node;
}

const DRAFT = 'malmodle-bygg';
const GUIDE_KEY = 'malmodle-bygg-riktlinjer';
const VIEW_KEY = 'malmodle-bygg-visa';
const KINDS = { area: 'Områden', street: 'Gator', bridge: 'Broar', landmark: 'Platser' };
const KIND_ONE = { area: 'område', street: 'gata', bridge: 'bro', landmark: 'plats' };
const COLOR = { area: '#2b6cb0', street: '#7b3fa6', bridge: '#0f7f7a', landmark: '#a0521d' };
const BROKEN = '#8f8a80';
const TIERS = { core: 'Kan frågas', out: 'Frågas aldrig', long: 'Visas aldrig' };
const TIER_TIPS = {
  core: 'Det spelet frågar om. Allt här kan bli en fråga en vanlig dag.',
  out: 'Finns i spelet men frågas aldrig om. En del kan stå som fel svar i ”Vad ligger här?”. Tar du med något härifrån föreslås det för spelet.',
  long: 'Platser från en längre lista som aldrig syns i spelet. Tar du med något härifrån föreslås det för spelet.',
};
const TYPE_TIPS = {
  point: 'Spelaren sätter en nål där målet ligger och får poäng efter hur nära den hamnar.',
  identify: 'Kartan visar målet, och spelaren väljer dess namn bland flera.',
  neighbour: 'Vilket område ligger direkt norr, söder, öster eller väster om ett annat?',
  route: 'Vilken gata går från en plats till en annan?',
};
const POOL_COLOR = { decoy: '#6f6a62', long: '#b9b2a5' };
const SAME_PLACE = 50;
const DECOY_SAY = 'Kan stå bland svarsalternativen i ”Vad ligger här?”.';
const PLAYER_KEY = 'malmodle-player';
const SENT = { 413: 'long', 429: 'many' };
const SENT_SAY = {
  sending: 'Skickar …',
  sent: 'Tack! Dagen är inskickad.',
  long: 'Kommentarerna är för långa. Korta ner några.',
  many: 'Du har skickat många dagar i dag. Försök igen i morgon.',
  error: 'Det gick inte att skicka. Försök igen om en stund.',
};
const TIER_RANK = { core: 0, out: 1, long: 2 };
const SEARCH_KINDS = [['all', 'Alla'], ...Object.entries(KINDS)];

const load = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const [quiz, all, longlist, style] = await Promise.all([
  load('/data/quiz.json'), load('/bygg/data/all.json'), load('/bygg/data/longlist.json'), load('/style.json'),
]);

const items = quiz.items;
const decoys = quiz.decoys ?? [];
const core = new globalThis.Map(items.map((it) => [it.name, it]));
const others = (all?.items ?? []).filter((it) => !core.has(it.name));
const known = new globalThis.Map([...others.map((it) => [it.name, { it, tier: 'out' }]), ...items.map((it) => [it.name, { it, tier: 'core' }])]);
const decoyItems = new globalThis.Map(decoys.map((d) => [d.name, { ...d, kind: 'landmark', geometry: { type: 'Point', coordinates: d.point } }]));

const CATS = {};
const pool = decoys.map((d) => ({ name: d.name, cat: d.category, point: d.point, tier: 'out', decoy: 1 }));
const curated = new Set([...known.keys()].map((n) => n.toLowerCase()));
const placed = new globalThis.Map();
for (const d of pool) placed.set(d.name.toLowerCase(), [...(placed.get(d.name.toLowerCase()) ?? []), d.point]);
for (const [cat, { label, places }] of Object.entries(longlist?.categories ?? {})) {
  CATS[cat] = label;
  for (const p of places) {
    const name = p.name.toLowerCase();
    const point = [p.lon, p.lat];
    if (p.inGame || p.lat == null || curated.has(name)) continue;
    if ((placed.get(name) ?? []).some((at) => metersBetween(at, point) < SAME_PLACE)) continue;
    placed.set(name, [...(placed.get(name) ?? []), point]);
    pool.push({ name: p.name, cat, point, tier: 'long', decoy: 0 });
  }
}
for (const { it } of known.values()) if (it.kind === 'landmark') CATS[it.category] = it.label;
const poolItems = pool.map((p) => ({
  name: p.name, kind: 'landmark', category: p.cat, label: CATS[p.cat], point: p.point,
  geometry: { type: 'Point', coordinates: p.point }, tier: p.tier, decoy: p.decoy, pool: true,
}));
const sameAt = (a, b) => (!a && !b) || Boolean(a && b && metersBetween(a, b) < 1);
const sameRef = (a, b) => a.target === b.target && sameAt(a.at, b.at);

function find({ target, at }) {
  if (at) return poolItems.find((p) => p.name === target && sameAt(p.point, at)) ?? null;
  return known.get(target)?.it ?? poolItems.find((p) => p.name === target) ?? null;
}

function tierOf(ref) {
  if (!ref.at && known.has(ref.target)) return known.get(ref.target).tier;
  return find(ref)?.tier ?? 'long';
}
const coreCount = (test) => items.filter(test).length;
const catOrder = Object.keys(CATS).sort((a, b) => coreCount((it) => it.category === b) - coreCount((it) => it.category === a) || CATS[a].localeCompare(CATS[b], 'sv'));
const things = [
  ...[...known.values()].map(({ it, tier }) => ({ tier, kind: it.kind, cat: it.kind === 'landmark' ? it.category : null })),
  ...pool.map((p) => ({ tier: p.tier, kind: 'landmark', cat: p.cat })),
];

function counted(group, key) {
  const fits = (t) => (group === 'tiers' ? t.tier === key : view.tiers[t.tier])
    && (group === 'kinds' ? t.kind === key : view.kinds[t.kind])
    && (group === 'cats' ? t.cat === key : t.kind !== 'landmark' || view.cats[t.cat]);
  return things.filter(fits).length;
}

const DEFAULT_VIEW = {
  tiers: { core: true, out: true, long: false },
  kinds: { area: true, street: true, bridge: true, landmark: true },
  cats: Object.fromEntries(catOrder.map((c) => [c, true])),
  catsOpen: false,
};

function loadView() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY));
    if (!saved) return DEFAULT_VIEW;
    const kept = (group) => Object.fromEntries(Object.entries(DEFAULT_VIEW[group]).map(([k, v]) => [k, typeof saved[group]?.[k] === 'boolean' ? saved[group][k] : v]));
    return { tiers: kept('tiers'), kinds: kept('kinds'), cats: kept('cats'), catsOpen: saved.catsOpen === true };
  } catch {
    return DEFAULT_VIEW;
  }
}

let view = loadView();
let slots = [];
let notes = [];
let credit = '';
let remark = '';
let outcome = null;
let sessionPlayer;
let entries = [];
let flagged = [];
let aboutOpen = false;
let selected = -1;
let swapping = false;
let searchKind = 'all';
let active = -1;
let found = [];
let previewing = null;
let dragFrom = -1;
const past = [];
const future = [];

const protocol = new pmtiles.Protocol();
addProtocol('pmtiles', protocol.tile);
const archive = await fetch('/malmo.pmtiles').then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`malmo.pmtiles: ${r.status}`))));
protocol.add(new pmtiles.PMTiles(new pmtiles.FileSource(new File([archive], 'malmo.pmtiles'))));
style.sprite = location.origin + style.sprite;
style.glyphs = location.origin + style.glyphs;

const map = new Map({
  container: 'buildmap',
  style,
  center: [13.0, 55.59],
  zoom: 12,
  dragRotate: false,
  pitchWithRotate: false,
  attributionControl: false,
  maplibreLogo: false,
});
map.touchZoomRotate.disableRotation();
map.keyboard.disable();
window.map = map;

await new Promise((resolve) => map.on('load', resolve));
applyPalette(map);
const baseLabels = map.getStyle().layers.filter((l) => l.type === 'symbol').map((l) => l.id);
setupLayers(map);
for (const [layer, prop] of [['focus-fill', 'fill-color'], ['focus-line', 'line-color'], ['focus-circle', 'circle-color'], ['focus-label', 'text-color']]) {
  map.setPaintProperty(layer, prop, ['match', ['get', 'role'], 'close', BAND_COLORS.orange, map.getPaintProperty(layer, prop)]);
}

const feature = (geometry, properties) => ({ type: 'Feature', geometry, properties });
const collection = (features) => ({ type: 'FeatureCollection', features });
const props = (it, tier) => ({ name: it.name, kind: it.kind, cat: it.kind === 'landmark' ? it.category : it.kind, tier });

map.addSource('atlas', { type: 'geojson', data: collection([...known.values()].map(({ it, tier }) => feature(it.geometry, props(it, tier)))) });
const spots = (it) => (several(it) ? it.geometry.coordinates : [it.point]);
map.addSource('atlas-points', { type: 'geojson', data: collection([...known.values()].flatMap(({ it, tier }) => spots(it).map((c) => feature({ type: 'Point', coordinates: c }, props(it, tier))))) });
map.addSource('pool', { type: 'geojson', data: collection(pool.map((p) => feature({ type: 'Point', coordinates: p.point }, { name: p.name, kind: 'landmark', cat: p.cat, tier: p.tier, decoy: p.decoy }))) });
map.addSource('day', { type: 'geojson', data: collection([]) });
map.addSource('day-points', { type: 'geojson', data: collection([]) });
map.addSource('peek', { type: 'geojson', data: collection([]) });
map.addSource('noted', { type: 'geojson', data: collection([]) });

const poly = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const line = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const isKind = (...kinds) => ['in', ['get', 'kind'], ['literal', kinds]];
const isTier = (tier) => ['==', ['get', 'tier'], tier];
const isCore = isTier('core');
const isDecoy = ['==', ['get', 'decoy'], 1];
const byKind = ['match', ['get', 'kind'], 'area', COLOR.area, 'street', COLOR.street, 'bridge', COLOR.bridge, COLOR.landmark];
const broken = ['==', ['get', 'broken'], true];
const halo = { 'text-halo-color': '#fbfaf6', 'text-halo-width': 1.6 };
const label = (font, size) => ({
  'text-field': ['get', 'name'],
  'text-font': [font],
  'text-size': size,
  'text-anchor': ['case', isKind('area'), 'center', 'top'],
  'text-offset': ['case', isKind('area'), ['literal', [0, 0]], ['literal', [0, 0.6]]],
  'text-max-width': 9,
  'text-optional': true,
});

const ATLAS = [
  { id: 'atlas-area-fill', type: 'fill', source: 'atlas', base: ['all', isKind('area'), poly], paint: { 'fill-color': COLOR.area }, fade: [['fill-opacity', ['case', isCore, 0.07, 0.03]]] },
  { id: 'atlas-area-core', type: 'line', source: 'atlas', base: ['all', isKind('area'), isCore], paint: { 'line-color': COLOR.area, 'line-width': 1.4 }, fade: [['line-opacity', 0.8]] },
  { id: 'atlas-area-out', type: 'line', source: 'atlas', base: ['all', isKind('area'), isTier('out')], paint: { 'line-color': COLOR.area, 'line-width': 1, 'line-dasharray': [3, 2] }, fade: [['line-opacity', 0.55]] },
  { id: 'atlas-place-fill', type: 'fill', source: 'atlas', base: ['all', isKind('landmark', 'bridge'), poly], paint: { 'fill-color': byKind }, fade: [['fill-opacity', ['case', isCore, 0.22, 0.08]]] },
  { id: 'atlas-place-line', type: 'line', source: 'atlas', base: ['all', isKind('landmark', 'bridge'), poly], paint: { 'line-color': byKind, 'line-width': 1.2 }, fade: [['line-opacity', ['case', isCore, 0.85, 0.4]]] },
  {
    id: 'atlas-line-core', type: 'line', source: 'atlas', base: ['all', isKind('street', 'bridge'), line, isCore],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': byKind, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 15, 5] },
    fade: [['line-opacity', 0.7]],
  },
  {
    id: 'atlas-line-out', type: 'line', source: 'atlas', base: ['all', isKind('street', 'bridge'), line, isTier('out')],
    paint: { 'line-color': byKind, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 15, 3], 'line-dasharray': [2, 1.5] },
    fade: [['line-opacity', 0.55]],
  },
  {
    id: 'pool-circle', type: 'circle', source: 'pool', base: null,
    paint: { 'circle-radius': ['case', isDecoy, 3.5, 2.5], 'circle-color': ['case', isDecoy, POOL_COLOR.decoy, POOL_COLOR.long], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.8 },
    fade: [['circle-opacity', 0.9], ['circle-stroke-opacity', 0.9]],
  },
  {
    id: 'atlas-point', type: 'circle', source: 'atlas-points', base: isKind('landmark', 'bridge'),
    paint: { 'circle-radius': ['case', isCore, 4.5, 3.5], 'circle-color': ['case', isCore, byKind, '#ffffff'], 'circle-stroke-color': ['case', isCore, '#ffffff', byKind], 'circle-stroke-width': 1.5 },
    fade: [['circle-opacity', 1], ['circle-stroke-opacity', 1]],
  },
  {
    id: 'atlas-label-street', type: 'symbol', source: 'atlas', base: ['all', isKind('street'), line],
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['case', isCore, ['literal', ['Roboto Medium']], ['literal', ['Roboto Regular']]], 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 15, 13], 'text-offset': [0, 0.15], 'text-optional': true },
    paint: { 'text-color': ['case', isCore, COLOR.street, '#7a756c'], ...halo }, fade: [['text-opacity', 1]],
  },
  { id: 'pool-label', type: 'symbol', source: 'pool', base: null, minzoom: 15, layout: label('Roboto Regular', 11), paint: { 'text-color': POOL_COLOR.decoy, ...halo }, fade: [['text-opacity', 1]] },
  { id: 'atlas-label-area', type: 'symbol', source: 'atlas-points', base: isKind('area'), layout: label('Roboto Condensed Italic', 13), paint: { 'text-color': ['case', isCore, COLOR.area, '#7d8da3'], ...halo }, fade: [['text-opacity', 1]] },
  { id: 'atlas-label-out', type: 'symbol', source: 'atlas-points', base: ['all', ['!', isKind('area', 'street')], isTier('out')], layout: label('Roboto Regular', 11.5), paint: { 'text-color': '#7a756c', ...halo }, fade: [['text-opacity', 1]] },
  { id: 'atlas-label-core', type: 'symbol', source: 'atlas-points', base: ['all', ['!', isKind('area', 'street')], isCore], layout: label('Roboto Medium', 12), paint: { 'text-color': byKind, ...halo }, fade: [['text-opacity', 1]] },
];

const DAY_LAYERS = [
  { id: 'day-line', type: 'line', source: 'day', filter: ['any', poly, line], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', broken, BROKEN, byKind], 'line-width': ['case', poly, 2.5, 6], 'line-opacity': 0.9 } },
];

const TOP_LAYERS = [
  { id: 'noted-ring', type: 'circle', source: 'noted', paint: { 'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#c8102e', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.8 } },
  { id: 'peek-fill', type: 'fill', source: 'peek', filter: poly, paint: { 'fill-color': '#c8102e', 'fill-opacity': 0.12 } },
  { id: 'peek-line', type: 'line', source: 'peek', filter: ['any', poly, line], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#c8102e', 'line-width': 4, 'line-opacity': 0.85 } },
  { id: 'peek-circle', type: 'circle', source: 'peek', filter: ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]], paint: { 'circle-radius': 9, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#c8102e', 'circle-stroke-width': 3 } },
  {
    id: 'day-badge', type: 'circle', source: 'day-points',
    paint: {
      'circle-radius': 11,
      'circle-translate': [13, -13],
      'circle-color': ['case', broken, BROKEN, byKind],
      'circle-stroke-color': ['case', ['==', ['get', 'selected'], true], '#111111', '#ffffff'],
      'circle-stroke-width': ['case', ['==', ['get', 'selected'], true], 3, 2],
    },
  },
  {
    id: 'day-num', type: 'symbol', source: 'day-points',
    layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Roboto Medium'], 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': '#ffffff', 'text-translate': [13, -13] },
  },
];

const bare = ({ base, fade, ...layer }) => layer;
for (const layer of [...ATLAS, ...DAY_LAYERS]) {
  const paint = { ...layer.paint, ...Object.fromEntries(layer.fade ?? []) };
  map.addLayer({ ...bare(layer), paint }, 'focus-fill');
}
for (const layer of TOP_LAYERS) map.addLayer(layer);

const fold = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const usedAt = (name, at = null) => slots.findIndex((s) => s.target === name && sameAt(s.at, at)) + 1;
const visible = (id, on) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
const on = (flags) => Object.keys(flags).filter((k) => flags[k]);
const labelOf = (it) => it.label ?? KIND_ONE[it.kind];

function applyView() {
  const shown = ['all',
    ['in', ['get', 'tier'], ['literal', on(view.tiers)]],
    ['in', ['get', 'kind'], ['literal', on(view.kinds)]],
    ['any', ['!=', ['get', 'kind'], 'landmark'], ['in', ['get', 'cat'], ['literal', on(view.cats)]]],
  ];
  const playing = Boolean(previewing);
  for (const layer of ATLAS) {
    map.setFilter(layer.id, layer.base ? ['all', layer.base, shown] : shown);
    visible(layer.id, !playing);
  }
  el('osmlink').hidden = playing;
  for (const id of baseLabels) visible(id, false);
  for (const id of [...DAY_LAYERS, ...TOP_LAYERS].map((l) => l.id)) visible(id, !playing);
  fade();
  renderFilters();
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch {}
}

function fade() {
  const f = selected >= 0 && !previewing ? 0.45 : 1;
  for (const layer of ATLAS) {
    for (const [prop, value] of layer.fade) map.setPaintProperty(layer.id, prop, typeof value === 'number' ? value * f : ['*', f, value]);
  }
}

function setView(change) {
  change(view);
  applyView();
  renderSelection();
}

function chip({ key, text, pressed, onclick, swatch, count, tip }) {
  return make('button', { type: 'button', 'data-key': key, 'aria-pressed': String(pressed), 'data-tip': tip, onclick },
    swatch ? make('i', { className: swatch.className ?? '', style: swatch.color ? `--sw: ${swatch.color}` : null }) : null,
    text,
    count != null ? make('span', { className: 'count' }, String(count)) : null);
}

function toggle(group, key, alone) {
  setView((v) => {
    if (alone) for (const k of Object.keys(v[group])) v[group][k] = k === key;
    else v[group][key] = !v[group][key];
  });
}

function renderFilters() {
  const focused = document.activeElement?.closest?.('#filters') ? document.activeElement.dataset.key : null;
  const tierSwatch = { core: { color: '#111111' }, out: { className: 'out' }, long: { className: 'dot', color: POOL_COLOR.long } };
  const hiddenCats = catOrder.filter((c) => !view.cats[c]).length;
  const rows = [
    make('div', { className: 'strip' },
      make('span', { className: 'lbl' }, 'Visa'),
      Object.entries(TIERS).map(([tier, text]) => chip({
        key: `tier-${tier}`, text, pressed: view.tiers[tier], swatch: tierSwatch[tier], count: counted('tiers', tier), tip: TIER_TIPS[tier],
        onclick: (e) => toggle('tiers', tier, e.altKey),
      }))),
    make('div', { className: 'strip' },
      make('span', { className: 'lbl' }, 'Slag'),
      Object.entries(KINDS).map(([kind, text]) => chip({
        key: `kind-${kind}`, text, pressed: view.kinds[kind], swatch: { color: COLOR[kind] }, count: counted('kinds', kind),
        onclick: (e) => toggle('kinds', kind, e.altKey),
      })),
      view.kinds.landmark ? [make('span', { className: 'sep' }), chip({
        key: 'cats', text: `Kategorier${hiddenCats ? ` · ${hiddenCats} dolda` : ''} ${view.catsOpen ? '▴' : '▾'}`, pressed: view.catsOpen,
        onclick: () => setView((v) => { v.catsOpen = !v.catsOpen; }),
      })] : null),
  ];
  if (view.kinds.landmark && view.catsOpen) {
    rows.push(make('div', { className: 'strip' },
      make('span', { className: 'lbl' }, 'Platser'),
      catOrder.map((cat) => chip({
        key: `cat-${cat}`, text: CATS[cat], pressed: view.cats[cat], count: counted('cats', cat),
        onclick: (e) => toggle('cats', cat, e.altKey),
      }))));
  }
  el('filters').replaceChildren(...rows);
  if (focused) el('filters').querySelector(`[data-key="${focused}"]`)?.focus();
}

function renderDay() {
  const placed = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.item);
  const day = (geometry, { e, i }) => feature(geometry, { n: i + 1, name: e.target, kind: e.item.kind, selected: i === selected, broken: Boolean(e.problem) });
  map.getSource('day').setData(collection(placed.map((x) => day(x.e.item.geometry, x))));
  const badgeAt = (e) => (e.q?.region ? answerOf(e.q).coordinates[0] ?? e.item.point : e.item.point);
  map.getSource('day-points').setData(collection(placed.map((x) => day({ type: 'Point', coordinates: badgeAt(x.e) }, x))));
}

function marksFor(entry) {
  if (!entry?.item) return [];
  const { q } = entry;
  const marks = [{ item: q?.region ? { ...entry.item, geometry: answerOf(q) } : entry.item, role: 'answer', named: true }];
  if (!q) return marks;
  for (const it of [q.from, q.to, q.region]) if (it) marks.push({ item: it, role: 'context', named: true });
  for (const option of q.options ?? []) {
    if (option === q.target.name) continue;
    const item = core.get(option) ?? decoyItems.get(option);
    if (!item) continue;
    const { score } = TYPES[q.type].grade(q, option, items);
    marks.push(score ? { item: { ...item, name: `${option} · ${score} p` }, role: 'close', named: true } : { item, role: 'hit', named: true });
  }
  return marks;
}

function frame(marks) {
  if (!marks.length) return;
  const [sw, ne] = bounds(marks.map((m) => m.item.geometry));
  const shown = map.getBounds();
  if (shown.contains(sw) && shown.contains(ne)) return;
  const camera = map.cameraForBounds([sw, ne], { padding: 80, maxZoom: 15.5 });
  if (camera) map.easeTo({ center: camera.center, zoom: Math.min(camera.zoom, Math.max(map.getZoom(), 13)), duration: 400 });
}

function renderSelection() {
  if (previewing) return;
  const entry = entries[selected];
  show(marksFor(entry));
  fade();
}

function render() {
  entries = assemble(slots, items, decoys, find);
  flagged = flags(entries);
  renderTally();
  renderQuestions();
  renderSearch();
  renderTypical();
  renderNotes();
  renderSend();
  renderDay();
  renderSelection();
  el('undo').disabled = !past.length;
  el('redo').disabled = !future.length;
  el('preview').disabled = !entries.length;
}

function renderTally() {
  const look = flagged.flatMap((f, i) => (f.some(([kind]) => kind === 'warn') ? [i] : []));
  el('tally').replaceChildren(...(look.length
    ? [make('button', { type: 'button', onclick: () => select(look[0]) }, `${look.length === 1 ? 'En fråga' : `${look.length} frågor`} att se över`)]
    : []));
}

const spanText = ([lo, hi]) => (lo === hi ? `${lo}` : `${lo}–${hi}`);
const upper = (text) => `${text[0].toUpperCase()}${text.slice(1)}`;

function usualCell(c) {
  if (!c) return make('td', { className: 'none' }, '–');
  const usual = c.range ? spanText(c.range) : 'resten';
  return make('td', { className: c.usual ? null : 'off', 'data-tip': c.usual ? null : `Brukar vara ${usual}` }, make('b', {}, String(c.n)), make('small', {}, usual));
}

function renderTypical() {
  const t = typical(entries);
  el('mixrows').replaceChildren(...t.rows.flatMap((r) => [
    make('tr', {},
      make('th', { scope: 'row' }, upper(GROUP_NAMES[r.group][1])),
      usualCell(r),
      [0, 1, 2].map((k) => usualCell(r.types[k]))),
    r.group === 'place' ? make('tr', { className: 'sub' }, make('th', { scope: 'row' }, 'varav krogar'), usualCell(t.food), make('td', { colSpan: 3 })) : null,
  ].filter(Boolean)));
  el('lead').replaceChildren(...[
    'Första frågan är alltid att peka ut ett område.',
    t.lead.usual ? null : make('small', { className: 'off' }, ` Din: ${t.lead.now}.`),
    ' Fördelningen brukar se ut så här:',
  ].filter(Boolean));
  const off = [...t.rows.flatMap((r) => [r, ...r.types]), t.food].filter((c) => !c.usual).length + (t.lead.usual ? 0 : 1);
  el('guidenote').textContent = off ? `${off} ${off === 1 ? 'skillnad' : 'skillnader'}` : '';
}

function askedAs({ q, type }) {
  if (q?.to) return `Från ${q.from.name} till ${q.to.name}`;
  if (q?.from) return `Direkt ${q.side} om ${q.from.name}`;
  if (q?.region) return `Peka ut i ${q.region.name}`;
  return TYPE_NAMES[type] ?? type;
}

function questionRow(entry, i) {
  const { item } = entry;
  const current = i === selected;
  const meta = [askedAs(entry), item ? labelOf(item) : null].filter(Boolean).join(' · ');
  const marks = flagged[i] ?? [];
  const pick = make('button', { type: 'button', className: 'pick', draggable: true, 'aria-expanded': String(current), onclick: () => select(current ? -1 : i) },
    make('span', { className: 'n' }, String(i + 1)),
    make('span', { className: 'title' }, entry.target),
    make('span', { className: 'meta' }, meta),
    marks.length ? make('span', { className: 'flags' }, marks.map(([kind, text]) => make('span', { className: `flag ${kind}` }, text))) : null);
  const tools = make('div', { className: 'tools' },
    make('button', { type: 'button', title: 'Flytta upp (⌥↑)', 'aria-label': `Flytta fråga ${i + 1} upp`, disabled: i === 0, onclick: () => shift(i, i - 1) }, '↑'),
    make('button', { type: 'button', title: 'Flytta ner (⌥↓)', 'aria-label': `Flytta fråga ${i + 1} ner`, disabled: i === entries.length - 1, onclick: () => shift(i, i + 1) }, '↓'),
    make('button', { type: 'button', title: 'Ta bort (⌫)', 'aria-label': `Ta bort fråga ${i + 1}`, onclick: () => remove(i) }, '✕'));
  const li = make('li', { className: 'q', 'aria-current': current ? 'true' : null, style: `--c: ${item && !entry.problem ? COLOR[item.kind] : BROKEN}` }, pick, tools, current ? editor(entry, i) : null);
  pick.addEventListener('dragstart', (e) => {
    dragFrom = i;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', entry.target);
  });
  pick.addEventListener('dragend', () => { dragFrom = -1; li.classList.remove('dragging'); clearDrops(); });
  li.addEventListener('dragover', (e) => {
    if (dragFrom < 0) return;
    e.preventDefault();
    const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
    clearDrops();
    li.classList.add(after ? 'drop-after' : 'drop-before');
  });
  li.addEventListener('drop', (e) => {
    if (dragFrom < 0) return;
    e.preventDefault();
    const after = li.classList.contains('drop-after');
    const at = after ? i + 1 : i;
    const from = dragFrom;
    clearDrops();
    shift(from, at > from ? at - 1 : at);
  });
  return li;
}

function clearDrops() {
  for (const node of el('questions').querySelectorAll('.drop-before, .drop-after')) node.classList.remove('drop-before', 'drop-after');
}

const section = (title, ...body) => make('div', {}, make('h3', {}, title), body);
const variantButton = (i, seed) => make('div', { className: 'strip', style: 'margin-top: 6px' }, make('button', { type: 'button', onclick: () => setSeed(i, seed) }, '⟳ En annan variant'));

function editor(entry, i) {
  const { item, q } = entry;
  const parts = [];
  if (entry.types.length) {
    parts.push(section('Typ',
      make('div', { className: 'types' }, entry.types.map(({ type, ok, why }) => make('button', {
        type: 'button', 'aria-pressed': String(type === entry.type), disabled: !ok && type !== entry.type, 'data-tip': ok ? TYPE_TIPS[type] : why,
        onclick: () => setType(i, type),
      }, TYPE_NAMES[type]))),
      entry.types.filter((t) => !t.ok).map((t) => make('p', { className: 'why' }, `${TYPE_NAMES[t.type]} går inte: ${t.why}`))));
  } else if (entry.problem) {
    parts.push(section('Problem', make('p', { className: 'why' }, `${entry.problem} Byt mål eller ta bort frågan.`)));
  }
  if (q?.type === 'point') {
    const edge = several(item) ? 'från närmaste ställe' : item.geometry.type === 'Point' ? 'från punkten' : 'från kanten';
    parts.push(section('Poäng',
      make('p', {}, `${LEVELS.map((s) => `${s} p inom ${formatDistance(reach(s, item))}`).join(' · ')} ${edge}.`)));
    if (several(item)) {
      const all = item.geometry.coordinates.length;
      const seed = another(entry, items, decoys);
      parts.push(section('Var',
        make('p', {}, q.region ? `I ${q.region.name}, där ${answerOf(q).coordinates.length} av de ${all} ställena räknas.` : `I hela Malmö, där alla ${all} ställen räknas.`),
        seed ? variantButton(i, seed) : null));
    }
  }
  if (q?.from) {
    parts.push(section('Visas på kartan', make('p', {}, q.to
      ? `${q.from.name} och ${q.to.name}, med namn.`
      : `${q.from.name}, med namn. Svaret ligger direkt ${q.side} om det.`)));
  }
  if (q?.options) {
    const seed = another(entry, items, decoys);
    parts.push(section('Alternativ',
      make('ul', { className: 'options' }, q.options.map((option) => {
        const score = option === q.target.name ? MAX_SCORE : TYPES[q.type].grade(q, option, items).score;
        return make('li', { className: option === q.target.name ? 'answer' : '' }, make('span', {}, option), make('span', { className: 'pts' }, `${score} p`));
      })),
      seed ? variantButton(i, seed) : null));
  }
  if (item) {
    const [lng, lat] = item.streetview ?? item.point;
    const links = [
      ['Källa', item.source],
      ['Gatuvy', `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`],
      ['Google Maps', `https://www.google.com/maps/search/?api=1&query=${item.point[1]},${item.point[0]}`],
      ['OpenStreetMap', `https://www.openstreetmap.org/#map=17/${item.point[1]}/${item.point[0]}`],
    ].filter(([, href]) => href);
    parts.push(make('details', { className: 'more', open: aboutOpen, ontoggle: (e) => { aboutOpen = e.target.open; } },
      make('summary', {}, 'Om målet'),
      make('p', { className: 'soft' }, [labelOf(item), item.apart && item.apart !== item.name ? `hör ihop med ${item.apart}` : null].filter(Boolean).join(' · ')),
      item.about ? make('div', { className: 'about' }, make('p', {}, item.about)) : null,
      make('p', { className: 'links' }, links.map(([text, href]) => make('a', { href, target: '_blank', rel: 'noopener' }, text)))));
  }
  if (entry.outside) {
    parts.unshift(make('p', { className: 'callout' }, 'Finns inte i spelet än, så dagen föreslår att det tas med.'));
  }
  parts.push(make('div', { className: 'strip' },
    make('button', { type: 'button', onclick: startSwap }, 'Byt mål'),
    entry.q ? make('button', { type: 'button', onclick: () => startPreview(i) }, 'Provspela den här') : null));
  if (item) parts.push(suggestions({ target: entry.target, ...(entry.at && { at: entry.at }) }, entry.outside ? 'out' : 'core'));
  return make('div', { className: 'edit' }, parts);
}

function renderQuestions() {
  el('questions').replaceChildren(...entries.map(questionRow));
}

function renderRest() {
  const full = slots.length >= SET_SIZE;
  el('adder').hidden = full && !swapping;
  el('nextn').textContent = String(swapping && selected >= 0 ? selected + 1 : slots.length + 1);
  const from = slots.length + (full || swapping ? 1 : 2);
  el('rest').replaceChildren(...Array.from({ length: Math.max(0, SET_SIZE - from + 1) }, (_, k) => make('li', {},
    make('button', { type: 'button', className: 'slot', tabIndex: -1, onclick: () => el('search').focus() }, make('span', { className: 'n' }, String(from + k))))));
}

const everything = [...[...known.values()].map(({ it, tier }) => ({ it, tier })), ...poolItems.map((it) => ({ it, tier: it.tier }))];

function results() {
  const query = fold(el('search').value.trim());
  if (!query && searchKind === 'all') return [];
  const fits = everything.filter(({ it }) => (searchKind === 'all' || it.kind === searchKind) && (!query || fold(it.name).includes(query)));
  const starts = (it) => (query && fold(it.name).startsWith(query) ? 0 : 1);
  fits.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || starts(a.it) - starts(b.it) || a.it.name.localeCompare(b.it.name, 'sv'));
  return fits.slice(0, 80).map(({ it, tier }) => {
    const at = it.pool ? it.point : null;
    const n = usedAt(it.name, at);
    const why = n ? `fråga ${n}` : null;
    return { it, tier, at, n, disabled: Boolean(n), why };
  });
}

function renderSearch() {
  found = results();
  if (active >= found.length || found[active]?.disabled) active = found.findIndex((r) => !r.disabled);
  el('searchkinds').replaceChildren(...SEARCH_KINDS.map(([kind, text]) => make('button', {
    type: 'button', 'aria-pressed': String(kind === searchKind),
    onclick: () => { searchKind = kind; active = -1; renderSearch(); el('search').focus(); },
  }, text)));
  el('results').replaceChildren(...found.map((r, i) => make('li', {
    role: 'option', id: `result-${i}`, 'aria-selected': String(i === active), 'aria-disabled': r.disabled ? 'true' : null,
    onmousedown: (e) => { e.preventDefault(); if (!r.disabled) pick(r.it.name, r.at); },
    onmouseenter: () => { peek(r.it.name, r.at); if (!r.disabled) { active = i; markActive(); } },
  }, make('span', {}, r.it.name, r.tier === 'core' ? null : make('span', { className: 'tag' }, 'inte i spelet än')), make('span', { className: 'what' }, [labelOf(r.it), r.why].filter(Boolean).join(' · ')))));
  el('search').setAttribute('aria-expanded', String(found.length > 0));
  el('search').setAttribute('aria-activedescendant', active >= 0 ? `result-${active}` : '');
  el('searchlabel').textContent = swapping && selected >= 0 ? `Byt mål i fråga ${selected + 1}` : 'Lägg till en fråga';
  el('cancelswap').hidden = !swapping;
  renderRest();
}

function markActive() {
  for (const [i, node] of [...el('results').children].entries()) node.setAttribute('aria-selected', String(i === active));
  el('search').setAttribute('aria-activedescendant', active >= 0 ? `result-${active}` : '');
  el('results').children[active]?.scrollIntoView({ block: 'nearest' });
}

function step(direction) {
  if (!found.length) return;
  let i = active;
  for (let n = 0; n < found.length; n++) {
    i = (i + direction + found.length) % found.length;
    if (!found[i].disabled) break;
  }
  active = i;
  markActive();
  peek(found[i]?.it.name, found[i]?.at);
}

function peek(name, point) {
  const geometry = point ? { type: 'Point', coordinates: point } : name ? known.get(name)?.it.geometry ?? decoyItems.get(name)?.geometry : null;
  map.getSource('peek').setData(collection(geometry ? [feature(geometry, {})] : []));
}

const snapshot = () => JSON.stringify({ slots, notes, selected });

function change(fn) {
  if (previewing) stopPreview();
  past.push(snapshot());
  if (past.length > 200) past.shift();
  future.length = 0;
  fn();
  save();
  render();
}

function restoreFrom(from, to) {
  if (!from.length) return;
  if (previewing) stopPreview();
  to.push(snapshot());
  ({ slots, notes, selected } = JSON.parse(from.pop()));
  save();
  render();
  scrollToSelected();
}

const undo = () => restoreFrom(past, future);
const redo = () => restoreFrom(future, past);

function pick(name, at = null) {
  if (!core.has(name) && !find({ target: name, at })) return;
  if (!swapping && slots.length >= SET_SIZE) return;
  const where = at ? { at } : {};
  const into = swapping ? selected : -1;
  swapping = false;
  el('search').value = '';
  active = -1;
  peek(null);
  if (into >= 0) {
    change(() => {
      const keep = assemble([{ ...slots[into], target: name, ...where }], items, decoys, find)[0].types.find((t) => t.type === slots[into].type)?.ok;
      slots[into] = { target: name, type: keep ? slots[into].type : 'point', seed: 1, ...where };
    });
  } else {
    change(() => {
      slots.push({ target: name, type: 'point', seed: 1, ...where });
      selected = slots.length - 1;
    });
  }
  scrollToSelected();
  frame(marksFor(entries[selected]));
}

function add(name, at) {
  swapping = false;
  pick(name, at);
}

function swap(index, name, at) {
  selected = index;
  swapping = true;
  pick(name, at);
}

function startSwap() {
  swapping = true;
  renderSearch();
  el('search').focus();
  el('adder').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cancelSwap() {
  swapping = false;
  renderSearch();
}

const setType = (i, type) => change(() => { slots[i] = { ...slots[i], type }; });
const setSeed = (i, seed) => change(() => { slots[i] = { ...slots[i], seed }; });

function remove(i) {
  change(() => {
    slots.splice(i, 1);
    if (selected > i) selected -= 1;
    else if (selected === i) selected = Math.min(i, slots.length - 1);
  });
}

function shift(from, to) {
  if (from < 0 || to < 0 || from >= slots.length || to >= slots.length || from === to) return;
  const wasSelected = slots[selected];
  change(() => {
    const [moved] = slots.splice(from, 1);
    slots.splice(to, 0, moved);
    selected = slots.indexOf(wasSelected ?? moved);
  });
  scrollToSelected();
}

function scrollToSelected() {
  el('questions').children[selected]?.scrollIntoView({ block: 'nearest' });
}

function select(i, { moveMap = true } = {}) {
  if (previewing) {
    if (i >= 0 && entries[i]) { previewing.index = i; askPreview(); }
    return;
  }
  selected = i >= 0 && i < entries.length ? i : -1;
  if (swapping && selected < 0) swapping = false;
  renderQuestions();
  renderSearch();
  renderDay();
  renderSelection();
  scrollToSelected();
  if (moveMap && selected >= 0) frame(marksFor(entries[selected]));
}

function save() {
  const sent = outcome?.state === 'sent' ? outcome.draft : undefined;
  try { localStorage.setItem(DRAFT, JSON.stringify({ day: pack({ slots, notes }), credit, remark, sent })); } catch {}
  history.replaceState(null, '', slots.length || notes.length ? `#dag=${pack({ slots, notes })}` : location.pathname);
}

function restore() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(DRAFT)); } catch {}
  credit = typeof saved?.credit === 'string' ? saved.credit : '';
  remark = typeof saved?.remark === 'string' ? saved.remark : '';
  outcome = typeof saved?.sent === 'string' ? { draft: saved.sent, state: 'sent' } : null;
  const code = new URLSearchParams(location.hash.slice(1)).get('dag');
  return (code && unpack(code)) || (typeof saved?.day === 'string' && unpack(saved.day)) || { slots: [], notes: [] };
}


const HOVER = ['day-badge', 'atlas-point', 'pool-circle', 'atlas-line-core', 'atlas-line-out', 'atlas-place-fill', 'atlas-area-fill'];

function hitsAt(point) {
  const layers = HOVER.filter((id) => map.getLayoutProperty(id, 'visibility') !== 'none');
  if (!layers.length) return [];
  const box = [[point.x - 5, point.y - 5], [point.x + 5, point.y + 5]];
  const hits = map.queryRenderedFeatures(box, { layers }).sort((a, b) => HOVER.indexOf(a.layer.id) - HOVER.indexOf(b.layer.id));
  const seen = new Set();
  const out = [];
  for (const f of hits) {
    const badge = f.layer.id === 'day-badge';
    const key = badge ? `#${f.properties.n}` : f.properties.name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ badge, ...f.properties, point: f.layer.id === 'pool-circle' ? f.geometry.coordinates : null });
  }
  return out;
}

function whatOf(hit) {
  const it = known.get(hit.name)?.it;
  const kind = it ? labelOf(it) : CATS[hit.cat] ?? 'plats';
  const n = usedAt(hit.name, hit.point ?? null);
  return [kind, TIERS[hit.tier], n ? `fråga ${n}` : null].filter(Boolean).join(' · ');
}

function tip(e) {
  const box = el('tip');
  const lines = [];
  const hits = hitsAt(e.point);
  const [top] = hits;
  if (top?.badge) lines.push([`Fråga ${top.n}`, top.name]);
  else if (top) {
    const within = top.kind !== 'area' ? hits.find((h) => h.kind === 'area' && !h.badge) : null;
    lines.push([top.name, whatOf(top) + (within ? ` · i ${within.name}` : '')]);
  }
  const entry = entries[selected];
  if (!previewing && entry?.q?.type === 'point') {
    const { score, distance } = TYPES.point.grade(entry.q, [e.lngLat.lng, e.lngLat.lat], items);
    lines.push([`${score} p`, distance ? `${formatDistance(distance)} från fråga ${selected + 1}` : `på fråga ${selected + 1}`]);
  }
  map.getCanvas().style.cursor = hits.length && !previewing ? 'pointer' : '';
  if (!lines.length || previewing) { box.hidden = true; return; }
  box.replaceChildren(...lines.map(([strong, rest]) => make('div', {}, make('b', {}, strong), rest ? ` · ${rest}` : null)));
  const stage = el('stage');
  box.hidden = false;
  const x = Math.min(e.point.x + 14, stage.clientWidth - box.offsetWidth - 8);
  const y = Math.min(e.point.y + 14, stage.clientHeight - box.offsetHeight - 8);
  box.style.transform = `translate(${x}px, ${y}px)`;
}

function closePop() {
  el('pop').hidden = true;
  peek(null);
}

function suggestions(ref, tier) {
  return make('div', { className: 'suggest' }, 'Föreslå: ', (tier === 'core' ? ['remove', 'fix'] : ['add', 'fix']).map((what) => {
    const made = notes.some((n) => sameRef(n, ref) && n.what === what);
    return make('button', { type: 'button', 'aria-pressed': String(made), onclick: () => { closePop(); suggest(ref, what); } }, WHAT[what]);
  }));
}

function hitCard(hit) {
  const at = hit.point ?? null;
  const ref = { target: hit.name, ...(at && { at }) };
  const it = find(ref);
  const n = usedAt(hit.name, at);
  const actions = n
    ? [make('button', { type: 'button', onclick: () => { closePop(); select(n - 1, { moveMap: false }); } }, `Visa fråga ${n}`)]
    : [
      slots.length < SET_SIZE ? make('button', { type: 'button', className: 'primary', onclick: () => { closePop(); add(hit.name, at); } }, 'Lägg till') : null,
      slots.length >= SET_SIZE && selected < 0 ? make('span', { className: 'soft' }, 'Välj en fråga för att byta mål.') : null,
      selected >= 0 ? make('button', { type: 'button', onclick: () => { closePop(); swap(selected, hit.name, at); } }, `Byt mål i fråga ${selected + 1}`) : null,
    ];
  return make('div', { className: 'hit', onmouseenter: () => peek(hit.name, at), onmouseleave: () => peek(null) },
    make('p', { className: 'name' }, hit.name),
    make('p', { className: 'what' }, make('span', { className: `tier ${hit.tier}`, 'data-tip': TIER_TIPS[hit.tier] }, TIERS[hit.tier]), ' ', [it ? labelOf(it) : CATS[hit.cat], n ? `fråga ${n}` : null].filter(Boolean).join(' · ')),
    hit.decoy === 1 ? make('p', { className: 'say' }, DECOY_SAY) : null,
    it?.about ? make('p', { className: 'say soft' }, it.about) : null,
    make('div', { className: 'strip' }, actions),
    suggestions(ref, hit.tier === 'core' ? 'core' : 'out'));
}

function suggest(ref, what) {
  if (!notes.some((n) => sameRef(n, ref) && n.what === what)) change(() => { notes.push({ ...ref, what, text: '' }); });
  const i = proposals(entries, notes).findIndex((p) => sameRef(p, ref) && p.what === what);
  const row = el('notes').children[i];
  row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row?.querySelector('textarea')?.focus({ preventScroll: true });
}

function noteText(p, text) {
  let note = notes.find((n) => sameRef(n, p) && n.what === p.what);
  if (!note) {
    note = { target: p.target, ...(p.at && { at: p.at }), what: p.what, text: '' };
    notes.push(note);
  }
  note.text = text;
  save();
  renderSend();
}

function showOnMap(ref) {
  const it = core.get(ref.target) ?? find(ref);
  if (!it) return;
  peek(it.name, ref.at);
  map.easeTo({ center: it.point, zoom: Math.max(map.getZoom(), 14), duration: 500 });
}

function renderNotes() {
  const all = proposals(entries, notes);
  el('notecount').textContent = all.length ? ` (${all.length})` : '';
  el('suggested').hidden = all.length === 0;
  el('notes').replaceChildren(...all.map((p) => {
    const what = make('b', {}, WHAT[p.what]);
    const name = make('button', { type: 'button', className: 'linkish', onclick: () => showOnMap(p) }, p.target);
    const where = p.question ? ` · fråga ${p.question}` : '';
    const drop = p.auto ? null : make('button', {
      type: 'button', className: 'drop', 'aria-label': `Ta bort förslaget om ${p.target}`,
      onclick: () => change(() => { notes = notes.filter((n) => !(sameRef(n, p) && n.what === p.what)); }),
    }, '✕');
    const text = make('textarea', {
      rows: 2, maxLength: LIMITS.note, value: p.text,
      placeholder: p.what === 'fix' ? 'Vad ser fel ut?' : 'Varför? (valfritt)',
      'aria-label': `${WHAT[p.what]}: ${p.target}`,
      oninput: (e) => noteText(p, e.target.value),
    });
    return make('li', {}, make('div', { className: 'head' }, what, ' · ', name, where, drop), text);
  }));
  const shown = notes.map((n) => n.at ?? (core.get(n.target) ?? find(n))?.point).filter(Boolean);
  map.getSource('noted').setData(collection(shown.map((point) => feature({ type: 'Point', coordinates: point }, {}))));
}

function newPlayer() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function playerId() {
  try {
    let id = localStorage.getItem(PLAYER_KEY);
    if (!/^[0-9a-f]{32}$/.test(id ?? '')) {
      id = newPlayer();
      localStorage.setItem(PLAYER_KEY, id);
    }
    return id;
  } catch {
    sessionPlayer ??= newPlayer();
    return sessionPlayer;
  }
}

const draft = (player) => JSON.stringify(sending({ slots, entries, notes, name: credit, remark, player }));

async function send() {
  if (!ready(entries) || outcome?.state === 'sending') return;
  const day = draft();
  const body = draft(playerId());
  outcome = { draft: day, state: 'sending' };
  renderSend();
  let state = 'error';
  try {
    const res = await fetch('/api/handmade', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    state = res.ok ? 'sent' : SENT[res.status] ?? 'error';
  } catch {}
  outcome = { draft: day, state };
  save();
  renderSend();
}

function renderSend() {
  const ok = ready(entries);
  const now = ok && outcome?.draft === draft() ? outcome.state : null;
  const broken = entries.filter((e) => !e.q).length;
  const left = SET_SIZE - entries.length;
  const open = el('sendopen');
  open.disabled = !ok || now === 'sent';
  open.textContent = now === 'sent' ? 'Inskickad ✓' : ok ? 'Skicka in' : `Skicka in · ${entries.length}/${SET_SIZE}`;
  open.style.setProperty('--done', `${(100 * Math.min(entries.length, SET_SIZE)) / SET_SIZE}%`);
  open.title = ok ? ''
    : left > 0 ? `${left === 1 ? 'En fråga' : `${left} frågor`} kvar`
      : left < 0 ? `Dagen ska ha ${SET_SIZE} frågor, inte ${entries.length}`
        : `${broken === 1 ? 'En fråga går' : `${broken} frågor går`} inte att bygga`;
  el('sendstate').textContent = now ? SENT_SAY[now] : '';
  el('sendstate').dataset.state = now === 'sent' ? 'ok' : now === 'sending' ? 'wait' : 'error';
  el('submit').hidden = now === 'sent';
  el('submit').disabled = !ok || (now !== null && now !== 'error');
  el('sendclose').textContent = now === 'sent' ? 'Stäng' : 'Avbryt';
  if (!ok && el('sendbox').open) el('sendbox').close();
}

function toggleKeys() {
  const open = el('keys').hidden;
  el('keys').hidden = !open;
  el('keyshelp').setAttribute('aria-expanded', String(open));
}

function updateOsm() {
  const { lng, lat } = map.getCenter();
  el('osmlink').href = `https://www.openstreetmap.org/#map=${Math.round(map.getZoom()) + 1}/${lat.toFixed(5)}/${lng.toFixed(5)}`;
}

function popup(hits, point) {
  const box = el('pop');
  if (!hits.length) { closePop(); return; }
  box.replaceChildren(make('button', { type: 'button', className: 'close', 'aria-label': 'Stäng', onclick: closePop }, '×'), ...hits.slice(0, 4).map(hitCard));
  box.hidden = false;
  const stage = el('stage');
  let x = point.x + 14;
  if (x + box.offsetWidth > stage.clientWidth - 8) x = point.x - box.offsetWidth - 14;
  const y = Math.min(point.y + 14, stage.clientHeight - box.offsetHeight - 8);
  box.style.left = `${Math.max(8, x)}px`;
  box.style.top = `${Math.max(8, y)}px`;
}

function fitBox(box, maxZoom) {
  map.fitBounds(box, { padding: { top: el('player').offsetHeight + 40, bottom: 30, left: 30, right: 30 }, maxZoom, duration: 500 });
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round(q * (sorted.length - 1))];
}

function frameView(q) {
  const shown = TYPES[q.type].view(q);
  if (shown === 'home') {
    const lng = items.map((it) => it.point[0]);
    const lat = items.map((it) => it.point[1]);
    fitBox([[quantile(lng, 0.1), quantile(lat, 0.1)], [quantile(lng, 0.9), quantile(lat, 0.9)]], 13.5);
    return;
  }
  let box = null;
  for (const it of shown.items) {
    const b = union(bounds([it.geometry]), around(it.point, shown.context));
    box = box ? union(box, b) : b;
  }
  fitBox(box, 15.5);
}

function startPreview(from = 0) {
  if (!entries.length) return;
  closePop();
  peek(null);
  el('tip').hidden = true;
  previewing = { index: from, scores: [], done: null };
  applyView();
  el('preview').setAttribute('aria-pressed', 'true');
  el('preview').textContent = 'Sluta spela';
  askPreview();
}

function stopPreview() {
  previewing = null;
  clear();
  el('player').hidden = true;
  el('preview').setAttribute('aria-pressed', 'false');
  el('preview').textContent = 'Provspela';
  applyView();
  render();
}

function playerNav(done) {
  const last = previewing.index + 1 >= entries.length;
  return make('div', { className: 'strip' },
    make('button', { type: 'button', className: done ? 'primary' : '', onclick: nextPreview }, done ? (last ? 'Se resultatet' : 'Nästa ›') : 'Hoppa över ›'),
    done ? make('button', { type: 'button', onclick: askPreview }, 'Igen') : null,
    make('span', { style: 'flex: 1' }),
    make('button', { type: 'button', onclick: stopPreview }, 'Sluta'));
}

function askPreview() {
  const p = previewing;
  const entry = entries[p.index];
  p.done = null;
  clear();
  const box = el('player');
  const count = make('p', { className: 'count' }, `Fråga ${p.index + 1} av ${entries.length}`);
  for (const [i, node] of [...el('questions').children].entries()) node.setAttribute('aria-current', String(i === p.index));
  if (!entry.q) {
    box.replaceChildren(count, make('h2', {}, 'Frågan går inte att bygga'), make('p', { className: 'detail' }, entry.problem), playerNav(false));
    box.hidden = false;
    return;
  }
  const type = TYPES[entry.type];
  const { title, detail } = type.prompt(entry.q);
  const body = type.input === 'choice'
    ? make('div', { className: 'choices' }, entry.q.options.map((option, i) => make('button', {
      type: 'button', title: `${i + 1}`, onclick: (e) => choose(option, e.currentTarget),
    }, option[0].toUpperCase() + option.slice(1))))
    : make('p', { className: 'detail' }, 'Klicka på kartan där du tror att det ligger.');
  box.replaceChildren(...[count, make('h2', {}, title), detail ? make('p', { className: 'detail' }, detail) : null, body, make('p', { className: 'said', id: 'said', hidden: true }), playerNav(false)].filter(Boolean));
  box.hidden = false;
  show(type.showing(entry.q).map(({ item, named, role = 'context' }) => ({ item, named, role })));
  frameView(entry.q);
}

function answered(text, score) {
  const p = previewing;
  p.done = score;
  p.scores[p.index] = score;
  const said = el('said');
  said.textContent = `${score} p. ${text}`;
  said.hidden = false;
  el('player').lastElementChild.replaceWith(playerNav(true));
  el('player').querySelector('.strip .primary')?.focus();
}

function guessAt(lngLat) {
  const entry = entries[previewing.index];
  if (!entry?.q || TYPES[entry.type].input !== 'map' || previewing.done != null) return;
  const tap = [lngLat.lng, lngLat.lat];
  const result = TYPES.point.grade(entry.q, tap, items);
  show([{ item: entry.item, role: 'answer', named: true }]);
  showTap(tap, result.near);
  fitBox(union(bounds([entry.item.geometry]), around(tap, 150)), 15);
  const off = result.score === MAX_SCORE ? 'Mitt i prick.' : `${formatDistance(result.distance)} bort.`;
  answered(result.hit ? `${off} Du klickade på ${result.hit.name}.` : off, result.score);
}

function choose(option, button) {
  const entry = entries[previewing.index];
  if (previewing.done != null) return;
  const { score } = TYPES[entry.type].grade(entry.q, option, items);
  for (const b of el('player').querySelectorAll('.choices button')) {
    b.disabled = true;
    if (b.textContent.toLowerCase() === entry.target.toLowerCase()) b.classList.add('right');
  }
  if (score < MAX_SCORE) button.classList.add('wrong');
  const picked = core.get(option) ?? decoyItems.get(option);
  const marks = TYPES[entry.type].showing(entry.q).filter((m) => m.role !== 'ask').map(({ item, named }) => ({ item, named, role: 'context' }));
  marks.push({ item: entry.item, role: 'answer', named: true });
  if (picked && score < MAX_SCORE) marks.push({ item: picked, role: 'hit', named: true });
  show(marks);
  answered(score === MAX_SCORE ? 'Rätt.' : `Rätt svar: ${entry.target}.`, score);
}

function nextPreview() {
  if (previewing.index + 1 < entries.length) {
    previewing.index += 1;
    askPreview();
    return;
  }
  const scores = entries.map((_, i) => previewing.scores[i]);
  const total = scores.reduce((sum, s) => sum + (s ?? 0), 0);
  clear();
  el('player').replaceChildren(
    make('p', { className: 'count' }, 'Klart'),
    make('h2', {}, `${total} av ${entries.length * MAX_SCORE}`),
    make('ol', { className: 'options' }, entries.map((e, i) => make('li', {},
      make('span', {}, `${i + 1}. ${e.target}`),
      make('span', { className: 'pts' }, scores[i] == null ? 'hoppad' : `${scores[i]} p`)))),
    make('div', { className: 'strip', style: 'margin-top: 10px' },
      make('button', { type: 'button', className: 'primary', onclick: () => startPreview(0) }, 'Börja om'),
      make('button', { type: 'button', onclick: stopPreview }, 'Sluta')));
}

map.on('mousemove', tip);
map.getCanvas().addEventListener('mouseleave', () => { el('tip').hidden = true; });
map.on('dragstart', closePop);
map.on('click', (e) => {
  if (previewing) { guessAt(e.lngLat); return; }
  const hits = hitsAt(e.point);
  if (hits[0]?.badge) { closePop(); select(hits[0].n - 1, { moveMap: false }); return; }
  popup(hits.filter((h) => !h.badge), e.point);
});

const search = el('search');
search.addEventListener('input', () => { active = -1; renderSearch(); peek(found[active]?.it.name); });
search.addEventListener('focus', renderSearch);
search.addEventListener('blur', () => peek(null));
search.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const choice = found[active] ?? found.find((r) => !r.disabled);
    if (choice && !choice.disabled) pick(choice.it.name);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (search.value) { search.value = ''; renderSearch(); } else if (swapping) cancelSwap(); else search.blur();
  }
});

el('cancelswap').addEventListener('click', cancelSwap);
el('credit').addEventListener('input', (e) => { credit = e.target.value; save(); renderSend(); });
el('remark').addEventListener('input', (e) => { remark = e.target.value; save(); renderSend(); });
el('submit').addEventListener('click', send);
el('sendopen').addEventListener('click', () => { renderSend(); el('sendbox').showModal(); el('credit').focus(); });
el('sendclose').addEventListener('click', () => el('sendbox').close());
el('guide').addEventListener('toggle', () => { try { localStorage.setItem(GUIDE_KEY, el('guide').open ? 'open' : 'closed'); } catch {} });
el('keyshelp').addEventListener('click', toggleKeys);
map.on('moveend', updateOsm);
el('undo').addEventListener('click', undo);
el('redo').addEventListener('click', redo);
el('clearday').addEventListener('click', () => change(() => { slots = []; selected = -1; }));
el('preview').addEventListener('click', () => (previewing ? stopPreview() : startPreview(Math.max(0, selected))));

addEventListener('keydown', (e) => {
  if (el('sendbox').open) return;
  const typing = e.target.matches?.('input, textarea, select');
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return;
  }
  if (typing || mod) return;
  if (e.key === '?') { toggleKeys(); return; }
  if (e.key === 'Escape') {
    if (!el('keys').hidden) toggleKeys();
    else if (!el('pop').hidden) closePop();
    else if (previewing) stopPreview();
    else if (swapping) cancelSwap();
    else if (selected >= 0) select(-1);
    return;
  }
  if (previewing) {
    const choice = /^[1-9]$/.test(e.key) && el('player').querySelectorAll('.choices button')[Number(e.key) - 1];
    if (choice && !choice.disabled) { e.preventDefault(); choice.click(); }
    return;
  }
  if (e.key === '/') { e.preventDefault(); search.focus(); }
  else if (e.key === 'ArrowDown' || (e.key === 'j' && !e.altKey)) {
    e.preventDefault();
    if (e.altKey) shift(selected, selected + 1); else select(Math.min(entries.length - 1, selected + 1));
  } else if (e.key === 'ArrowUp' || (e.key === 'k' && !e.altKey)) {
    e.preventDefault();
    if (e.altKey) shift(selected, selected - 1); else if (selected > 0) select(selected - 1);
  } else if ((e.key === 'Backspace' || e.key === 'Delete') && selected >= 0) {
    e.preventDefault();
    remove(selected);
  }
});

({ slots, notes } = restore());
try { el('guide').open = localStorage.getItem(GUIDE_KEY) !== 'closed'; } catch {}
const heads = el('mix').tHead.rows[0].cells;
heads[1].dataset.tip = 'Hur många frågor av varje slag. Den lilla siffran är vad dagarna brukar ha.';
heads[2].dataset.tip = TYPE_TIPS.point;
heads[3].dataset.tip = TYPE_TIPS.identify;
heads[4].dataset.tip = `Direkt … om: ${TYPE_TIPS.neighbour}\nFrån A till B: ${TYPE_TIPS.route}`;
heads[4].classList.add('tip-end');
el('credit').maxLength = LIMITS.name;
el('remark').maxLength = LIMITS.remark;
el('credit').value = credit;
el('remark').value = remark;
updateOsm();
selected = slots.length ? 0 : -1;
applyView();
render();
if (selected >= 0) frame(marksFor(entries[selected]));
el('narrowanyway').addEventListener('click', () => { el('narrow').hidden = true; });
