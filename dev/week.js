import { Map, addProtocol } from '/vendor/maplibre-gl.mjs';
import { THEMES, DEFAULT_THEME } from '/themes.mjs';
import { GROUP, SHOWN_GAP, dailySet, dateKey, issue, laterKey } from '/daily.mjs';
import { TYPES } from '/questions.mjs';
import { applyTheme, frameItems, setupLayers, show } from '/map.js';

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
          const w = document.createElement(o === t.name ? 'b' : 'span');
          w.textContent = o;
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
  frameItems(marks.map((m) => m.item), 300);
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

setLabels();
build();
