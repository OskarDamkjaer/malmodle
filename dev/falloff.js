import { BAND_COLORS } from '/daily.mjs';
import { distanceScore } from '/questions.mjs';
import { around, bounds, closest } from '/geo.mjs';

export const LEVELS = [75, 50, 25];
const GRID = 240;
const MARGIN = 200;
const RAMP = [[100, BAND_COLORS.green], [80, BAND_COLORS.yellow], [40, BAND_COLORS.orange], [0, BAND_COLORS.red]];
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const NOTHING = { type: 'FeatureCollection', features: [] };
const LAYERS = ['falloff', 'falloff-lines', 'falloff-labels'];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function rampColor(score) {
  for (let i = 1; i < RAMP.length; i++) {
    const [hi, upper] = RAMP[i - 1];
    const [lo, lower] = RAMP[i];
    if (score >= lo) {
      const t = (score - lo) / (hi - lo);
      return rgb(lower).map((c, k) => Math.round(c + (rgb(upper)[k] - c) * t));
    }
  }
  return rgb(RAMP.at(-1)[1]);
}

export function reach(score, target) {
  let [lo, hi] = [0, 20000];
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (distanceScore(mid, target) >= score) lo = mid; else hi = mid;
  }
  return lo;
}

function contour(field, size, level, spot) {
  const value = (i, j) => field[j * (size + 1) + i];
  const cross = (a, b, pa, pb) => {
    const t = (level - a) / (b - a);
    return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t];
  };
  const segments = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const points = [];
      for (let k = 0; k < 4; k++) {
        const [a, b] = [corners[k], corners[(k + 1) % 4]];
        const [va, vb] = [value(...a), value(...b)];
        if ((va < level) !== (vb < level)) points.push(cross(va, vb, spot(...a), spot(...b)));
      }
      for (let k = 0; k + 1 < points.length; k += 2) segments.push([points[k], points[k + 1]]);
    }
  }
  return segments;
}

const drawn = new Map();

function draw(target) {
  if (drawn.has(target.name)) return drawn.get(target.name);
  const { geometry } = target;
  const [[w, s], [e, n]] = bounds([geometry]);
  const spread = reach(1, target) + MARGIN;
  const [[west, south]] = around([w, s], spread);
  const [, [east, north]] = around([e, n], spread);
  const spot = (i, j) => [west + ((east - west) * i) / GRID, north - ((north - south) * j) / GRID];
  const field = new Float32Array((GRID + 1) ** 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRID + 1;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(GRID + 1, GRID + 1);
  for (let j = 0; j <= GRID; j++) {
    for (let i = 0; i <= GRID; i++) {
      const k = j * (GRID + 1) + i;
      field[k] = closest(geometry, spot(i, j)).distance;
      const score = distanceScore(field[k], target);
      image.data.set([...rampColor(score), Math.round(255 * 0.5 * Math.min(1, Math.max(0, (score - 3) / 20)))], k * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  const features = LEVELS.flatMap((score) => {
    const segments = contour(field, GRID, reach(score, target), spot);
    if (!segments.length) return [];
    const top = segments.flat().reduce((a, b) => (b[1] > a[1] ? b : a));
    return [
      { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: segments } },
      { type: 'Feature', properties: { label: `${score} p` }, geometry: { type: 'Point', coordinates: top } },
    ];
  });
  const result = {
    url: canvas.toDataURL(),
    coordinates: [[west, north], [east, north], [east, south], [west, south]],
    lines: { type: 'FeatureCollection', features },
  };
  drawn.set(target.name, result);
  return result;
}

export function addFalloff(map, before) {
  map.addSource('falloff', { type: 'image', url: BLANK, coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]] });
  map.addSource('falloff-lines', { type: 'geojson', data: NOTHING });
  map.addLayer({ id: 'falloff', type: 'raster', source: 'falloff', paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, before);
  map.addLayer({
    id: 'falloff-lines', type: 'line', source: 'falloff-lines',
    paint: { 'line-color': 'rgba(20, 20, 20, 0.7)', 'line-width': 1.4, 'line-dasharray': [3, 2] },
  }, before);
  map.addLayer({
    id: 'falloff-labels', type: 'symbol', source: 'falloff-lines', filter: ['==', ['geometry-type'], 'Point'],
    layout: { 'text-field': ['get', 'label'], 'text-font': ['Roboto Medium'], 'text-size': 12, 'text-allow-overlap': true },
    paint: { 'text-color': '#141414', 'text-halo-color': '#fff', 'text-halo-width': 2 },
  });
  const visible = (on) => { for (const id of LAYERS) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
  return {
    show(target) {
      visible(true);
      const { url, coordinates, lines } = draw(target);
      map.getSource('falloff').updateImage({ url, coordinates });
      map.getSource('falloff-lines').setData(lines);
    },
    hide: () => visible(false),
  };
}
