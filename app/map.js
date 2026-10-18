import { around, bounds, union } from './geo.mjs';
import { paintFor } from './themes.mjs';

let COLOR = {};
let HALO = '#ffffff';

const EMPTY = { type: 'FeatureCollection', features: [] };

const feature = (geometry, properties) => ({ type: 'Feature', geometry, properties });

let map = null;
let labelLayers = [];

const isPolygon = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const isLine = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const isPoint = ['==', ['geometry-type'], 'Point'];
const roleColor = () => ['match', ['get', 'role'], 'context', COLOR.context, 'hit', COLOR.hit, COLOR.answer];

export function applyTheme(mapInstance, theme) {
  map = mapInstance;
  COLOR = theme.marks;
  HALO = theme.map.halo;
  for (const layer of map.getStyle().layers) {
    for (const [property, value] of Object.entries(paintFor(layer, theme.map))) {
      map.setPaintProperty(layer.id, property, value);
    }
  }
}

export function setupLayers(mapInstance) {
  map = mapInstance;
  labelLayers = map.getStyle().layers.filter((l) => l.type === 'symbol').map((l) => l.id);

  map.addSource('focus', { type: 'geojson', data: EMPTY });
  map.addSource('focus-labels', { type: 'geojson', data: EMPTY });
  map.addSource('tap', { type: 'geojson', data: EMPTY });

  map.addLayer({
    id: 'focus-fill', type: 'fill', source: 'focus', filter: isPolygon,
    paint: { 'fill-color': roleColor(), 'fill-opacity': 0.22 },
  });
  map.addLayer({
    id: 'focus-line', type: 'line', source: 'focus', filter: ['!', isPoint],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': roleColor(), 'line-width': ['case', isPolygon, 2.5, 6] },
  });
  map.addLayer({
    id: 'tap-line', type: 'line', source: 'tap', filter: isLine,
    paint: { 'line-color': COLOR.tap, 'line-width': 1.5, 'line-dasharray': [2, 2] },
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
    paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'], 'circle-stroke-color': HALO, 'circle-stroke-width': 2.5 },
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
    paint: { 'text-color': COLOR.tap, 'text-halo-color': HALO, 'text-halo-width': 2 },
  });

  map.addLayer({
    id: 'focus-circle', type: 'circle', source: 'focus', filter: isPoint,
    paint: { 'circle-radius': 8, 'circle-color': roleColor(), 'circle-stroke-color': HALO, 'circle-stroke-width': 2.5 },
  });
  map.addLayer({
    id: 'tap-point', type: 'circle', source: 'tap', filter: isPoint,
    paint: { 'circle-radius': 6, 'circle-color': COLOR.tap, 'circle-stroke-color': HALO, 'circle-stroke-width': 2 },
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
    paint: { 'text-color': roleColor(), 'text-halo-color': HALO, 'text-halo-width': 2 },
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

export function showTap(tap, near) {
  const features = [feature({ type: 'Point', coordinates: tap }, {})];
  if (near && (near[0] !== tap[0] || near[1] !== tap[1])) {
    features.unshift(feature({ type: 'LineString', coordinates: [tap, near] }, {}));
  }
  map.getSource('tap').setData({ type: 'FeatureCollection', features });
}

export function clear() {
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
  return {
    top: above ? Math.min(above + gap, h * 0.7) : Math.min(under + gap, h * 0.45),
    bottom: Math.min(over + gap, h * 0.45),
    left: beside && beside < w * 0.6 ? beside + gap * 5 : side,
    right: right ? right + gap : side,
  };
}

function frame(box, { duration = 500, maxZoom = 15.5 } = {}) {
  map.fitBounds(box, { padding: padding(), maxZoom, duration });
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

export function frameReveal(geometries, points) {
  let box = bounds(geometries);
  for (const p of points) box = union(box, around(p, 150));
  frame(box, { maxZoom: 15 });
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
