import { Map, addProtocol } from '/vendor/maplibre-gl.mjs';
import { THEMES, DEFAULT_THEME } from '/themes.mjs';
import { BAND_COLORS, GROUP, SHOWN_GAP, dailySet, dateKey, issue, laterKey } from '/daily.mjs';
import { TYPES, distanceScore, formatDistance } from '/questions.mjs';
import { around, bounds, closest } from '/geo.mjs';
import { applyTheme, setupLayers, show } from '/map.js';

const el = (id) => document.getElementById(id);
const theme = THEMES[DEFAULT_THEME];
document.documentElement.dataset.theme = DEFAULT_THEME;

const params = new URLSearchParams(location.search);
el('from').value = params.get('from') ?? dateKey();
el('count').value = params.get('days') ?? 8;

const TYPE_NAMES = { point: 'Peka', identify: 'Vad ligger här', neighbour: 'Granne', route: 'Gata mellan' };
const GROUP_NAMES = { area: 'områden', street: 'gator', place: 'platser' };
const dayName = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });

const protocol = new pmtiles.Protocol();
addProtocol('pmtiles', protocol.tile);
const style = await fetch('/style.json').then((r) => r.json());
style.sprite = location.origin + style.sprite;
style.glyphs = location.origin + style.glyphs;
style.sources.openmaptiles.url = `pmtiles://${location.origin}/malmo.pmtiles`;

const map = new Map({
  container: 'weekmap',
  style,
  center: [13.0, 55.59],
  zoom: 11.5,
  dragRotate: false,
  pitchWithRotate: false,
  attributionControl: false,
  maplibreLogo: false,
});
map.touchZoomRotate.disableRotation();
window.map = map;

let items = [];
let byName = new globalThis.Map();
let baseLabels = [];
let rows = [];
let at = -1;

await new Promise((resolve) => map.on('load', resolve));
applyTheme(map, theme);
baseLabels = map.getStyle().layers.filter((l) => l.type === 'symbol').map((l) => l.id);
setupLayers(map);
items = (await fetch('/data/quiz.json').then((r) => r.json())).items;

const LEVELS = [75, 50, 25];
const GRID = 240;
const SPREAD = 3000;
const RAMP = [[100, BAND_COLORS.green], [80, BAND_COLORS.yellow], [40, BAND_COLORS.orange], [0, BAND_COLORS.red]];
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const NOTHING = { type: 'FeatureCollection', features: [] };
const FALLOFF_LAYERS = ['falloff', 'falloff-lines', 'falloff-labels'];

map.addSource('falloff', { type: 'image', url: BLANK, coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]] });
map.addSource('falloff-lines', { type: 'geojson', data: NOTHING });
map.addLayer({ id: 'falloff', type: 'raster', source: 'falloff', paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, 'focus-fill');
map.addLayer({
  id: 'falloff-lines', type: 'line', source: 'falloff-lines',
  paint: { 'line-color': 'rgba(20, 20, 20, 0.7)', 'line-width': 1.4, 'line-dasharray': [3, 2] },
}, 'focus-fill');
map.addLayer({
  id: 'falloff-labels', type: 'symbol', source: 'falloff-lines', filter: ['==', ['geometry-type'], 'Point'],
  layout: { 'text-field': ['get', 'label'], 'text-font': ['Roboto Medium'], 'text-size': 12, 'text-allow-overlap': true },
  paint: { 'text-color': '#141414', 'text-halo-color': '#fff', 'text-halo-width': 2 },
});

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

function reach(score, geometry) {
  let [lo, hi] = [0, 20000];
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (distanceScore(mid, geometry) >= score) lo = mid; else hi = mid;
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

const falloffs = new globalThis.Map();

function falloff(target) {
  if (falloffs.has(target.name)) return falloffs.get(target.name);
  const { geometry } = target;
  const [[w, s], [e, n]] = bounds([geometry]);
  const [[west, south]] = around([w, s], SPREAD);
  const [, [east, north]] = around([e, n], SPREAD);
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
      const score = distanceScore(field[k], geometry);
      image.data.set([...rampColor(score), Math.round(255 * 0.5 * Math.min(1, Math.max(0, (score - 3) / 20)))], k * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  const features = LEVELS.flatMap((score) => {
    const segments = contour(field, GRID, reach(score, geometry), spot);
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
  falloffs.set(target.name, result);
  return result;
}

function showFalloff(q) {
  const on = q.type === 'point' && el('falloff').checked;
  for (const id of FALLOFF_LAYERS) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  if (!on) return;
  const { url, coordinates, lines } = falloff(q.target);
  map.getSource('falloff').updateImage({ url, coordinates });
  map.getSource('falloff-lines').setData(lines);
}

const gain = document.createElement('div');
gain.id = 'gain';
gain.hidden = true;
el('weekmap').append(gain);

map.on('mousemove', (e) => {
  const q = rows[at]?.q;
  if (!q || q.type !== 'point' || !el('falloff').checked) { gain.hidden = true; return; }
  const { score, distance } = TYPES.point.grade(q, [e.lngLat.lng, e.lngLat.lat], items);
  gain.textContent = distance ? `${score} p · ${formatDistance(distance)}` : `${score} p`;
  gain.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
  gain.hidden = false;
});
map.getCanvas().addEventListener('mouseleave', () => { gain.hidden = true; });

function frame(marks) {
  const [sw, ne] = bounds(marks.map((m) => m.item.geometry));
  const view = map.getBounds();
  if (view.contains(sw) && view.contains(ne)) return;
  const camera = map.cameraForBounds([sw, ne], { padding: 60 });
  if (!camera) return;
  map.easeTo({ center: camera.center, zoom: Math.min(camera.zoom, map.getZoom()), duration: 400 });
}
byName = new globalThis.Map(items.map((it) => [it.name, it]));

function setLabels() {
  const visibility = el('labels').checked ? 'visible' : 'none';
  for (const id of baseLabels) map.setLayoutProperty(id, 'visibility', visibility);
}

function mentions(q) {
  return [...(q.options ?? []).filter((n) => n !== q.target.name), q.from?.name, q.to?.name].filter(Boolean);
}

function build() {
  const from = el('from').value || dateKey();
  const count = Math.max(1, Math.min(60, Number(el('count').value) || 8));
  history.replaceState(null, '', `?from=${from}&days=${count}`);
  const days = Array.from({ length: count }, (_, n) => {
    const key = laterKey(from, n);
    return { key, set: dailySet(items, key) };
  });
  const seen = new globalThis.Map();
  const onMap = new globalThis.Map();
  days.forEach(({ key, set }, d) => {
    for (const q of set) {
      seen.set(q.target.name, [...(seen.get(q.target.name) ?? []), key]);
      for (const it of [q.from, q.to]) if (it) onMap.set(it.name, [...(onMap.get(it.name) ?? []), d]);
    }
  });

  rows = [];
  const root = el('days');
  root.replaceChildren();
  days.forEach(({ key, set }, d) => {
    const section = document.createElement('section');
    section.className = 'day';
    const h = document.createElement('h2');
    h.textContent = `${dayName(key)} · nr ${issue(key)}`;
    const groups = {};
    const types = {};
    for (const q of set) {
      const g = GROUP[q.target.kind];
      groups[g] = (groups[g] ?? 0) + 1;
      types[q.type] = (types[q.type] ?? 0) + 1;
    }
    const sum = document.createElement('p');
    sum.className = 'sum';
    sum.textContent = [
      Object.entries(groups).map(([g, n]) => `${n} ${GROUP_NAMES[g]}`).join(', '),
      Object.entries(types).map(([t, n]) => `${n} ${TYPE_NAMES[t].toLowerCase()}`).join(', '),
      set.length === 10 ? '' : `${set.length} frågor`,
    ].filter(Boolean).join(' · ');
    section.append(h, sum);

    const listed = new globalThis.Map();
    const shown = new globalThis.Map();
    const note = (to, n, i) => to.set(n, [...(to.get(n) ?? []), i]);
    set.forEach((q, i) => {
      for (const o of q.options ?? []) if (o !== q.target.name) note(listed, o, i);
      for (const it of [q.from, q.to]) if (it) note(shown, it.name, i);
    });
    const others = (from, t, i) => (from.get(t.name) ?? []).filter((j) => j !== i).map((j) => j + 1).join(', ');

    set.forEach((q, i) => {
      const flags = [];
      const t = q.target;
      if (!t.about) flags.push(['warn', 'saknar text']);
      if (!t.source) flags.push(['warn', 'saknar källa']);
      if (t.kind === 'landmark' && !t.label) flags.push(['warn', 'saknar etikett']);
      if (set.length !== 10 && i === set.length - 1) flags.push(['warn', `bara ${set.length} frågor`]);
      const shownToday = others(shown, t, i);
      if (shownToday) flags.push(['warn', `visas på kartan i fråga ${shownToday}`]);
      const asOption = others(listed, t, i);
      if (asOption) flags.push(['note', `alternativ i fråga ${asOption}`]);
      const nearby = (onMap.get(t.name) ?? []).filter((e) => e !== d && Math.abs(e - d) <= SHOWN_GAP);
      if (nearby.length) flags.push(['warn', `visas på kartan ${nearby.map((e) => shortDay(days[e].key)).join(', ')}`]);
      const again = (seen.get(t.name) ?? []).filter((k) => k !== key);
      if (again.length) flags.push(['note', `även ${again.map(shortDay).join(', ')}`]);
      const missing = mentions(q).filter((n) => !byName.has(n));
      if (missing.length) flags.push(['warn', `okänt: ${missing.join(', ')}`]);

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'q';
      const { title, detail } = TYPES[q.type].prompt(q);
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = i + 1;
      const tt = document.createElement('span');
      tt.className = 'title';
      tt.textContent = title;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = [TYPE_NAMES[q.type], detail, q.type === 'point' ? '' : `svar: ${t.name}`].filter(Boolean).join(' · ');
      b.append(n, tt, meta);
      if (q.options) {
        const opts = document.createElement('span');
        opts.className = 'opts';
        q.options.forEach((o, k) => {
          if (k) opts.append(', ');
          const score = TYPES[q.type].grade(q, o, items).score;
          const w = document.createElement(o === t.name ? 'b' : 'span');
          w.textContent = o;
          if (o !== t.name && score) {
            w.className = 'close';
            w.textContent = `${o} ${score}\u00a0p`;
          }
          opts.append(w);
        });
        b.append(opts);
      }
      if (flags.length) {
        const f = document.createElement('span');
        f.className = 'flags';
        for (const [kind, text] of flags) {
          const s = document.createElement('span');
          s.className = `flag ${kind}`;
          s.textContent = text;
          f.append(s);
        }
        b.append(f);
      }
      const index = rows.length;
      b.addEventListener('click', () => select(index));
      rows.push({ q, key, button: b });
      section.append(b);
    });
    root.append(section);
  });
  at = -1;
  if (rows.length) select(0, false);
}

function marksFor(q) {
  const marks = [{ item: q.target, role: 'answer', named: true }];
  for (const it of [q.from, q.to]) if (it) marks.push({ item: it, role: 'context', named: true });
  if (el('options').checked) {
    for (const o of q.options ?? []) if (o !== q.target.name && byName.has(o)) marks.push({ item: byName.get(o), role: 'hit', named: true });
  }
  return marks;
}

function select(index, scroll = true) {
  if (!rows[index]) return;
  rows[at]?.button.removeAttribute('aria-current');
  at = index;
  const { q, key, button } = rows[index];
  button.setAttribute('aria-current', 'true');
  if (scroll) button.scrollIntoView({ block: 'nearest' });
  const marks = marksFor(q);
  show(marks);
  showFalloff(q);
  frame(marks);
  card(q, key);
}

function card(q, key) {
  const t = q.target;
  const box = el('card');
  box.replaceChildren();
  const photo = t.photos?.[0];
  if (photo) {
    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = t.name;
    box.append(img);
  }
  const label = document.createElement('p');
  label.className = 'meta';
  label.textContent = `${shortDay(key)} · ${t.label ?? t.kind}${t.category ? ` · ${t.category}` : ''}${t.apart ? ` · apart: ${t.apart}` : ''}`;
  const h = document.createElement('h3');
  h.textContent = t.name;
  const about = document.createElement('p');
  about.textContent = t.about ?? '— ingen text —';
  const links = document.createElement('p');
  links.className = 'links';
  const [lng, lat] = t.streetview ?? t.point;
  for (const [text, href] of [
    ['Källa', t.source],
    ['Gatuvy', `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`],
    ['Google Maps', `https://www.google.com/maps/search/?api=1&query=${t.point[1]},${t.point[0]}`],
    ['OSM', `https://www.openstreetmap.org/#map=17/${t.point[1]}/${t.point[0]}`],
  ]) {
    if (!href) continue;
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    links.append(a);
  }
  box.append(label, h, about, links);
  if (q.type === 'point') {
    const scale = document.createElement('p');
    scale.className = 'meta';
    const from = t.geometry.type === 'Point' ? 'från punkten' : 'från kanten';
    scale.textContent = `${LEVELS.map((s) => `${s} p inom ${formatDistance(reach(s, t.geometry))}`).join(' · ')} ${from}`;
    box.append(scale);
  }
  box.hidden = false;
}

addEventListener('keydown', (e) => {
  if (e.target.matches('input')) return;
  if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); select(at + 1); }
  if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); select(at - 1); }
});
el('from').addEventListener('change', build);
el('count').addEventListener('change', build);
el('labels').addEventListener('change', setLabels);
el('options').addEventListener('change', () => select(at, false));
el('falloff').addEventListener('change', () => select(at, false));

setLabels();
build();
