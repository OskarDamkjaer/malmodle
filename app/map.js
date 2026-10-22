import { Marker } from './vendor/maplibre-gl.mjs';
import { around, bounds, contains, union } from './geo.mjs';
import { DEFAULT_STYLE, STYLES, paintFor } from './palette.mjs';

let COLOR = {};
let HALO = '#ffffff';

const EMPTY = { type: 'FeatureCollection', features: [] };

const feature = (geometry, properties) => ({ type: 'Feature', geometry, properties });

let map = null;
let pin = null;
let drawing = 0;
let labelLayers = [];

const isPolygon = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const isLine = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const isPoint = ['==', ['geometry-type'], 'Point'];
const fade = ['coalesce', ['feature-state', 'fade'], 1];
const roleColor = () => ['match', ['get', 'role'], 'context', COLOR.context, 'hit', COLOR.hit, COLOR.answer];

const markPaint = () => ({
  'focus-fill': { 'fill-color': roleColor() },
  'focus-line': { 'line-color': roleColor() },
  'focus-ask': { 'line-color': COLOR.answer },
  'tap-line': { 'line-color': COLOR.tap },
  'scored-points': { 'circle-stroke-color': HALO },
  'scored-labels': { 'text-color': COLOR.tap, 'text-halo-color': HALO },
  'focus-circle': { 'circle-color': roleColor(), 'circle-stroke-color': HALO },
  'tap-point': { 'circle-color': COLOR.tap, 'circle-stroke-color': HALO },
  'focus-label': { 'text-color': roleColor(), 'text-halo-color': HALO },
});

export function applyPalette(mapInstance, style = STYLES[DEFAULT_STYLE]) {
  map = mapInstance;
  COLOR = style.marks;
  HALO = style.map.halo;
  const marks = markPaint();
  for (const layer of map.getStyle().layers) {
    for (const [property, value] of Object.entries(marks[layer.id] ?? paintFor(layer, style.map))) {
      map.setPaintProperty(layer.id, property, value);
    }
  }
  if (pin) paintPin(pin.getElement());
}

function paintPin(element) {
  element.style.setProperty('--pin', COLOR.tap);
  element.style.setProperty('--ring', COLOR.hit);
  element.style.setProperty('--halo', HALO);
}

export function setupLayers(mapInstance) {
  map = mapInstance;
  labelLayers = map.getStyle().layers.filter((l) => l.type === 'symbol').map((l) => l.id);
  const paint = markPaint();

  map.addSource('focus', { type: 'geojson', data: EMPTY, promoteId: 'role' });
  map.addSource('focus-labels', { type: 'geojson', data: EMPTY, promoteId: 'role' });
  map.addSource('tap', { type: 'geojson', data: EMPTY });

  map.addLayer({
    id: 'focus-fill', type: 'fill', source: 'focus', filter: isPolygon,
    paint: { ...paint['focus-fill'], 'fill-opacity': ['*', 0.22, fade] },
  });
  map.addLayer({
    id: 'focus-line', type: 'line', source: 'focus', filter: ['all', ['!', isPoint], ['!=', ['get', 'role'], 'ask']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { ...paint['focus-line'], 'line-width': ['case', isPolygon, 2.5, 6], 'line-opacity': fade },
  });
  map.addLayer({
    id: 'focus-ask', type: 'line', source: 'focus', filter: ['all', ['!', isPoint], ['==', ['get', 'role'], 'ask']],
    layout: { 'line-join': 'round' },
    paint: { ...paint['focus-ask'], 'line-width': ['case', isPolygon, 2.5, 6], 'line-dasharray': [1.5, 1.5] },
  });
  map.addLayer({
    id: 'tap-line', type: 'line', source: 'tap', filter: isLine,
    paint: { ...paint['tap-line'], 'line-width': 1.5, 'line-dasharray': [2, 2] },
  });

  map.addSource('scored', { type: 'geojson', data: EMPTY });
  map.addSource('scored-labels', { type: 'geojson', data: EMPTY });
  addScored({
    id: 'scored-glow-line', type: 'line', source: 'scored', filter: glowing(null, ['!', isPoint]),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['case', isPolygon, 12, 20], 'line-blur': 10, 'line-opacity': 0.6 },
  });
  addScored({
    id: 'scored-glow-point', type: 'circle', source: 'scored-labels', filter: glowing(null, ['!=', ['get', 'kind'], 'area']),
    paint: { 'circle-radius': 22, 'circle-color': ['get', 'color'], 'circle-blur': 0.8, 'circle-opacity': 0.6 },
  });
  addScored({
    id: 'scored-fill', type: 'fill', source: 'scored', filter: isPolygon,
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.28 },
  });
  addScored({
    id: 'scored-line', type: 'line', source: 'scored', filter: ['!', isPoint],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['case', isPolygon, 2.5, 6] },
  });
  addScored({
    id: 'scored-points', type: 'circle', source: 'scored-labels', filter: ['!=', ['get', 'kind'], 'area'],
    paint: { ...paint['scored-points'], 'circle-radius': 8, 'circle-color': ['get', 'color'], 'circle-stroke-width': 2.5 },
  });
  addScored({
    id: 'scored-labels', type: 'symbol', source: 'scored-labels',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Roboto Medium'],
      'text-size': 13,
      'text-anchor': ['case', ['==', ['get', 'kind'], 'area'], 'center', 'top'],
      'text-offset': ['case', ['==', ['get', 'kind'], 'area'], ['literal', [0, 0]], ['literal', [0, 0.9]]],
      'text-max-width': 9,
    },
    paint: { ...paint['scored-labels'], 'text-halo-width': 2 },
  });

  map.addLayer({
    id: 'focus-circle', type: 'circle', source: 'focus', filter: isPoint,
    paint: { ...paint['focus-circle'], 'circle-radius': 8, 'circle-stroke-width': 2.5, 'circle-opacity': fade, 'circle-stroke-opacity': fade },
  });
  map.addLayer({
    id: 'tap-point', type: 'circle', source: 'tap', filter: isPoint,
    paint: { ...paint['tap-point'], 'circle-radius': 6, 'circle-stroke-width': 2 },
  });
  map.addLayer({
    id: 'focus-label', type: 'symbol', source: 'focus-labels',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Roboto Medium'],
      'text-size': 14,
      'text-anchor': 'top',
      'text-offset': [0, 0.9],
      'text-max-width': 10,
      'text-allow-overlap': true,
    },
    paint: { ...paint['focus-label'], 'text-halo-width': 2, 'text-opacity': fade },
  });
}

const scoredLayers = [];

const glowing = (name, filter) => ['all', filter, ['==', ['get', 'name'], name ?? '']];

export function glowScored(name) {
  map.setFilter('scored-glow-line', glowing(name, ['!', isPoint]));
  map.setFilter('scored-glow-point', glowing(name, ['!=', ['get', 'kind'], 'area']));
}

function addScored(layer) {
  map.addLayer({ ...layer, layout: { ...layer.layout, visibility: 'none' } });
  scoredLayers.push(layer.id);
}

export function showScored(marks) {
  const at = (item, color) => ({ name: item.name, kind: item.kind, color });
  map.getSource('scored').setData({
    type: 'FeatureCollection',
    features: marks.map(({ item, color }) => feature(item.geometry, at(item, color))),
  });
  map.getSource('scored-labels').setData({
    type: 'FeatureCollection',
    features: marks.map(({ item, color }) => feature({ type: 'Point', coordinates: item.point }, at(item, color))),
  });
  const visibility = marks.length ? 'visible' : 'none';
  for (const id of scoredLayers) map.setLayoutProperty(id, 'visibility', visibility);
}

export function hideLabels() {
  for (const id of labelLayers) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
}

export function show(marks) {
  map.getSource('focus').setData({
    type: 'FeatureCollection',
    features: marks.map(({ item, role }) => feature(item.geometry, { name: item.name, role })),
  });
  map.getSource('focus-labels').setData({
    type: 'FeatureCollection',
    features: marks
      .filter((m) => m.named)
      .map(({ item, role }) => feature({ type: 'Point', coordinates: item.point }, { name: item.name, role })),
  });
}

export function showTap(tap, near, { ms = 0, wait = 0, step } = {}) {
  const run = ++drawing;
  const line = near && (near[0] !== tap[0] || near[1] !== tap[1]);
  const draw = (k) => {
    const features = [feature({ type: 'Point', coordinates: tap }, {})];
    if (line && k > 0) {
      const end = [tap[0] + (near[0] - tap[0]) * k, tap[1] + (near[1] - tap[1]) * k];
      features.unshift(feature({ type: 'LineString', coordinates: [tap, end] }, {}));
    }
    map.getSource('tap').setData({ type: 'FeatureCollection', features });
  };
  if (!line || !ms) {
    draw(1);
    step?.(1);
    return;
  }
  draw(0);
  step?.(0);
  const start = performance.now() + wait;
  const frame = (now) => {
    if (run !== drawing) return;
    const t = Math.min(1, Math.max(0, (now - start) / ms));
    const k = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2;
    draw(k);
    step?.(k);
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function entry(geometry, from, to) {
  const steps = 100;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    if (contains(geometry, [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k])) return k;
  }
  return 1;
}

export function fadeAnswer(k) {
  for (const source of ['focus', 'focus-labels']) map.setFeatureState({ source, id: 'answer' }, { fade: k });
}

export function showPin(tap, ms) {
  clearPin();
  const element = document.createElement('div');
  element.className = 'pin';
  paintPin(element);
  element.style.setProperty('--lock', `${ms}ms`);
  element.innerHTML = '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="track" cx="22" cy="22" r="16"/><circle class="ring" cx="22" cy="22" r="16" pathLength="100"/><circle class="dot" cx="22" cy="22" r="6"/></svg>';
  pin = new Marker({ element }).setLngLat(tap).addTo(map);
}

export function holdPin() {
  pin?.getElement().classList.add('held');
}

export function clearPin() {
  pin?.remove();
  pin = null;
}

export function clear() {
  drawing++;
  fadeAnswer(1);
  map.getSource('focus').setData(EMPTY);
  map.getSource('focus-labels').setData(EMPTY);
  map.getSource('tap').setData(EMPTY);
}

function padding() {
  const gap = 20;
  const top = Math.max(0, ...[...document.querySelectorAll('[data-edge="top"]:not([hidden])')]
    .map((el) => el.getBoundingClientRect().bottom));
  const bottoms = [...document.querySelectorAll('[data-edge="bottom"]:not([hidden])')]
    .map((el) => el.getBoundingClientRect().top);
  const h = map.getContainer().clientHeight;
  const bottom = bottoms.length ? h - Math.min(...bottoms) : 0;
  const w = map.getContainer().clientWidth;
  const side = Math.min(gap * 2, w / 10);
  const shown = (selector) => [...document.querySelectorAll(selector)]
    .filter((el) => !el.hidden && el.getClientRects().length)
    .map((el) => el.getBoundingClientRect());
  const columns = shown('[data-edge="left"]');
  const beside = Math.max(0, ...columns.filter((r) => r.right < w * 0.6).map((r) => r.right));
  const above = Math.max(0, ...columns.filter((r) => r.right >= w * 0.6).map((r) => r.bottom));
  const sides = shown('[data-edge="side"]');
  const tall = (r) => r.left > w * 0.4 && r.height > h / 2;
  const right = Math.max(0, ...sides.filter(tall).map((r) => w - r.left));
  const across = sides.filter((r) => !tall(r));
  const under = Math.max(top, ...across.filter((r) => r.top < h / 2).map((r) => r.bottom));
  const over = Math.max(bottom, ...across.filter((r) => r.top >= h / 2).map((r) => h - r.top));
  const zoom = Math.max(0, ...shown('.maplibregl-ctrl-group').filter((r) => r.left > w / 2).map((r) => w - r.left));
  return {
    top: above ? Math.min(above + gap, h * 0.7) : Math.min(under + gap, h * 0.45),
    bottom: Math.min(over + gap, h * 0.45),
    left: beside && beside < w * 0.6 ? beside + gap * 5 : side,
    right: Math.max(right ? right + gap : side, zoom && zoom + gap),
  };
}

export const FRAMING = 500;
const REVEAL_INSET = 40;

function frame(box, { duration = FRAMING, maxZoom = 15.5, inset = 0 } = {}) {
  const pad = padding();
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const across = Math.min(inset, (w - pad.left - pad.right) / 8);
  const down = Math.min(inset, (h - pad.top - pad.bottom) / 8);
  pad.left += across;
  pad.right += across;
  pad.top += down;
  pad.bottom += down;
  map.fitBounds(box, { padding: pad, maxZoom, duration });
}

export function frameItems(items, context, extra = []) {
  let box = null;
  for (const it of items) {
    const b = union(bounds([it.geometry]), around(it.point, context));
    box = box ? union(box, b) : b;
  }
  for (const p of extra) box = union(box, around(p, 150));
  frame(box);
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
}

export function frameHome(items) {
  const lng = items.map((it) => it.point[0]);
  const lat = items.map((it) => it.point[1]);
  frame([[quantile(lng, 0.1), quantile(lat, 0.1)], [quantile(lng, 0.9), quantile(lat, 0.9)]], { maxZoom: 13.5 });
}

export function frameReveal(geometries, points, roomy = false) {
  let box = bounds(geometries);
  for (const p of points) box = union(box, around(p, 150));
  frame(box, { maxZoom: 15, inset: roomy ? REVEAL_INSET : 0 });
}

export function pickScored(point) {
  const layers = ['scored-points', 'scored-labels', 'scored-line', 'scored-fill'];
  if (map.getLayoutProperty(layers[0], 'visibility') !== 'visible') return null;
  const reach = 10;
  const hits = map.queryRenderedFeatures([[point.x - reach, point.y - reach], [point.x + reach, point.y + reach]], { layers });
  for (const id of layers) {
    const hit = hits.find((h) => h.layer.id === id);
    if (hit) return hit.properties.name;
  }
  return null;
}
