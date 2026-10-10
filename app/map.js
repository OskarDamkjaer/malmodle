import { around, bounds, union } from './geo.mjs';
import { paintFor } from './themes.mjs';

let COLOR = {};
let HALO = '#ffffff';

const EMPTY = { type: 'FeatureCollection', features: [] };

const feature = (geometry, properties) => ({ type: 'Feature', geometry, properties });

let map = null;
let labelLayers = [];
const freeLayers = [];

function shapesOf(items, extra = () => ({})) {
  return {
    type: 'FeatureCollection',
    features: items.map((it) => feature(it.geometry, { name: it.name, kind: it.kind, label: it.label, ...extra(it) })),
  };
}

function labelsOf(items, extra = () => ({})) {
  return {
    type: 'FeatureCollection',
    features: items
      .filter((it) => it.kind !== 'street')
      .map((it) => feature({ type: 'Point', coordinates: it.point }, { name: it.name, kind: it.kind, ...extra(it) })),
  };
}

const isPolygon = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const isLine = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const isPoint = ['==', ['geometry-type'], 'Point'];
const roleColor = () => ['match', ['get', 'role'], 'context', COLOR.context, 'hit', COLOR.hit, COLOR.answer];

function addFree(layer) {
  map.addLayer({ ...layer, layout: { ...layer.layout, visibility: 'none' } });
  freeLayers.push(layer.id);
}

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

export function setupLayers(mapInstance, items) {
  map = mapInstance;
  labelLayers = map.getStyle().layers.filter((l) => l.type === 'symbol').map((l) => l.id);

  map.addSource('quiz-shapes', { type: 'geojson', data: shapesOf(items) });
  map.addSource('quiz-labels', { type: 'geojson', data: labelsOf(items) });
  map.addSource('today', { type: 'geojson', data: EMPTY });
  map.addSource('focus', { type: 'geojson', data: EMPTY });
  map.addSource('focus-labels', { type: 'geojson', data: EMPTY });
  map.addSource('tap', { type: 'geojson', data: EMPTY });

  addFree({
    id: 'all-area-fill', type: 'fill', source: 'quiz-shapes', filter: isPolygon,
    paint: { 'fill-color': COLOR.outline, 'fill-opacity': 0.03 },
  });
  addFree({
    id: 'all-area-line', type: 'line', source: 'quiz-shapes', filter: isPolygon,
    paint: { 'line-color': COLOR.outline, 'line-width': 1.2, 'line-opacity': 0.8 },
  });
  addFree({
    id: 'all-street', type: 'line', source: 'quiz-shapes', filter: isLine,
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': COLOR.answer, 'line-width': 14, 'line-opacity': 0.01 },
  });
  addFree({
    id: 'today-fill', type: 'fill', source: 'today', filter: isPolygon,
    paint: { 'fill-color': COLOR.answer, 'fill-opacity': 0.12 },
  });
  addFree({
    id: 'today-line', type: 'line', source: 'today', filter: ['!', isPoint],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLOR.answer, 'line-width': 3, 'line-opacity': 0.8 },
  });

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

  addFree({
    id: 'all-points', type: 'circle', source: 'quiz-shapes', filter: isPoint,
    paint: {
      'circle-radius': 5,
      'circle-color': HALO,
      'circle-stroke-color': ['match', ['get', 'kind'], 'bridge', COLOR.context, COLOR.answer],
      'circle-stroke-width': 2,
    },
  });
  addFree({
    id: 'today-points', type: 'circle', source: 'today', filter: isPoint,
    paint: { 'circle-radius': 7, 'circle-color': COLOR.answer, 'circle-stroke-color': HALO, 'circle-stroke-width': 2 },
  });
  addFree({
    id: 'all-labels', type: 'symbol', source: 'quiz-labels',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Roboto Medium'],
      'text-size': ['case', ['==', ['get', 'kind'], 'area'], 12, 11],
      'text-transform': ['case', ['==', ['get', 'kind'], 'area'], 'uppercase', 'none'],
      'text-letter-spacing': ['case', ['==', ['get', 'kind'], 'area'], 0.06, 0],
      'text-anchor': ['case', ['==', ['get', 'kind'], 'area'], 'center', 'top'],
      'text-offset': ['case', ['==', ['get', 'kind'], 'area'], ['literal', [0, 0]], ['literal', [0, 0.7]]],
      'text-max-width': 8,
    },
    paint: {
      'text-color': ['case', ['==', ['get', 'kind'], 'area'], COLOR.outline, COLOR.tap],
      'text-halo-color': HALO,
      'text-halo-width': 1.4,
    },
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

export function setLabels(on) {
  const visibility = on ? 'visible' : 'none';
  for (const id of [...labelLayers, ...freeLayers]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
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

export function markToday(items) {
  map.getSource('today').setData(shapesOf(items));
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
  return {
    top: Math.min(top + gap, h * 0.45),
    bottom: Math.min(bottom + gap, h * 0.45),
    left: side,
    right: side,
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

export function pick(point) {
  const layers = ['all-points', 'all-street', 'all-area-fill'];
  const hits = map.queryRenderedFeatures(point, { layers });
  for (const id of layers) {
    const hit = hits.find((h) => h.layer.id === id);
    if (hit) return hit.properties.name;
  }
  return null;
}
