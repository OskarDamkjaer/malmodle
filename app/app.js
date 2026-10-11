import { Map, AttributionControl, addProtocol } from './vendor/maplibre-gl.mjs';
import { dailySet, dateKey, shareText, square } from './daily.mjs';
import { TYPES, formatDistance, MAX_SCORE } from './questions.mjs';
import { namedLines, streetNear, tileAt } from './tiles.mjs';
import { THEMES, themeFromPath, themePath } from './themes.mjs';
import { MIN_OTHERS, binOf, bins, placing, spread } from './scores.mjs';
import {
  applyTheme, clear, frameHome, frameItems, frameReveal, markToday, pick, setLabels, setupLayers, show, showTap,
} from './map.js';

const el = (id) => document.getElementById(id);
const boot = el('boot');
const bootmsg = el('bootmsg');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const themeName = themeFromPath(location.pathname);
const theme = THEMES[themeName];
document.documentElement.dataset.theme = themeName;
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.themeColor);

function fail(what, err) {
  console.error(what, err);
  boot.classList.add('failed');
  boot.classList.remove('done');
  bootmsg.textContent = `${what}. ${err?.message ?? ''}`.trim();
}

function progress(fraction) {
  el('bootbar').style.transform = `scaleX(${Math.max(0.04, Math.min(1, fraction))})`;
}

async function loadArchive(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = [];
  let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) progress((got / total) * 0.9);
  }
  return new File(chunks, url.split('/').pop());
}

let archive;
try {
  const protocol = new pmtiles.Protocol();
  addProtocol('pmtiles', protocol.tile);
  archive = new pmtiles.PMTiles(new pmtiles.FileSource(await loadArchive('/malmo.pmtiles')));
  protocol.add(archive);
} catch (err) {
  fail('Kartan kunde inte laddas', err);
  throw err;
}

const style = await fetch('/style.json').then((r) => r.json());
style.sprite = location.origin + style.sprite;
style.glyphs = location.origin + style.glyphs;

const header = await archive.getHeader();

const map = new Map({
  container: 'map',
  style,
  center: [header.centerLon, header.centerLat],
  zoom: 12,
  minZoom: 10,
  maxZoom: header.maxZoom + 2,
  maxBounds: [[header.minLon - 0.06, header.minLat - 0.03], [header.maxLon + 0.06, header.maxLat + 0.03]],
  bearing: 0,
  pitch: 0,
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
  rollEnabled: false,
  attributionControl: false,
  maplibreLogo: false,
  fadeDuration: 120,
});
map.touchZoomRotate.disableRotation();
map.keyboard.disableRotation();
map.addControl(new AttributionControl({ compact: false }), 'bottom-right');
window.map = map;

let items = [];
let byName = new globalThis.Map();
let key = '';
let set = [];
let index = 0;
let results = [];
let phase = 'loading';

const current = () => set[index];
const typeOf = (q) => TYPES[q.type];
const sum = (list) => list.reduce((a, b) => a + b, 0);

function hide(...ids) { for (const id of ids) el(id).hidden = true; }
function reveal(...ids) { for (const id of ids) el(id).hidden = false; }

function tone(score) {
  if (score >= 80) return 'right';
  if (score >= 40) return 'mid';
  return 'wrong';
}

function renderDots() {
  const dots = el('dots');
  dots.replaceChildren();
  set.forEach((_, i) => {
    const li = document.createElement('li');
    if (results[i]) li.dataset.tone = tone(results[i].result.score);
    if (i === index && phase !== 'end') li.dataset.current = '';
    dots.append(li);
  });
  dots.setAttribute('aria-label', `Fråga ${index + 1} av ${set.length}`);
}

function start() {
  key = dateKey();
  set = dailySet(items, key);
  index = 0;
  results = [];
  hide('end', 'back', 'card', 'result', 'freehint');
  setLabels(false);
  ask();
}

function ask() {
  const q = current();
  const type = typeOf(q);
  const { title, detail } = type.prompt(q);
  phase = 'asking';
  clear();
  renderDots();
  el('detail').textContent = detail ?? '';
  el('prompt').textContent = title;
  hide('result');
  reveal('question');

  const choices = el('choices');
  choices.replaceChildren();
  if (type.input === 'choice') {
    q.options.forEach((option, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = option[0].toUpperCase() + option.slice(1);
      b.setAttribute('aria-keyshortcuts', String(i + 1));
      b.addEventListener('click', () => answer(option));
      choices.append(b);
    });
    choices.dataset.count = q.options.length;
    hide('hint');
    reveal('choices');
  } else {
    hide('choices');
    reveal('hint');
  }

  show(type.showing(q).map(({ item, named }) => ({ item, named, role: 'context' })));
  const view = type.view(q);
  requestAnimationFrame(() => {
    if (view === 'home') frameHome(items);
    else frameItems(view.items, view.context);
  });
}

async function clickedStreet(tap) {
  const cos = Math.cos((tap[1] * Math.PI) / 180);
  const reach = (12 * 40075016.686 * cos) / (512 * 2 ** map.getZoom());
  const tiles = new globalThis.Map();
  for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const tile = tileAt([tap[0] + (dx * reach) / (111320 * cos), tap[1] + (dy * reach) / 111320], header.maxZoom);
    tiles.set(`${tile.x}/${tile.y}`, tile);
  }
  const lines = [];
  for (const tile of tiles.values()) {
    const found = await archive.getZxy(tile.z, tile.x, tile.y).catch(() => null);
    if (found) lines.push(...namedLines(new Uint8Array(found.data), tile, 'transportation_name'));
  }
  const street = streetNear(lines, tap, reach);
  return street && (byName.get(street.name)?.kind === 'street' ? byName.get(street.name) : street);
}

async function answer(value) {
  if (phase !== 'asking') return;
  phase = 'grading';
  const q = current();
  const type = typeOf(q);
  const street = type.input === 'map' && q.target.kind === 'street' ? await clickedStreet(value) : undefined;
  const result = type.grade(q, value, items, street);
  results.push({ q, result });
  phase = 'answered';
  navigator.vibrate?.(result.score === MAX_SCORE ? 15 : [10, 60, 10]);

  el('points').textContent = `${result.score}`;
  el('result').dataset.tone = tone(result.score);

  if (type.input === 'map') revealPoint(q, result);
  else revealChoice(q, result);

  renderDots();
  hide('choices', 'hint');
  reveal('result');
  el('next').textContent = index + 1 < set.length ? 'Nästa' : 'Se dagens resultat';
  el('next').focus({ preventScroll: true });
}

function revealPoint(q, result) {
  const marks = [{ item: q.target, role: 'answer', named: true }];
  if (result.hit) marks.push({ item: result.hit, role: 'hit', named: true });
  show(marks);
  showTap(result.tap, result.near);
  el('verdict').textContent = result.score === MAX_SCORE ? 'Mitt i prick' : `${formatDistance(result.distance)} bort`;
  el('explain').textContent = result.hit ? `Det där var ${result.hit.name}.` : '';
  requestAnimationFrame(() => frameReveal([q.target.geometry], [result.tap]));
}

function revealChoice(q, result) {
  const right = result.score === MAX_SCORE;
  el('verdict').textContent = right ? 'Rätt' : result.score > 0 ? 'Nära' : 'Fel';
  const marks = [];
  const add = (item, role) => { if (item) marks.push({ item, role, named: true }); };

  if (q.type === 'identify') {
    add(q.target, 'answer');
    if (!right) add(byName.get(result.choice), 'hit');
    el('explain').textContent = right ? `Det är ${q.target.name}.` : `Det är ${q.target.name}, inte ${result.choice}.`;
  } else if (q.type === 'route') {
    add(q.from, 'context');
    add(q.to, 'context');
    add(q.target, 'answer');
    if (!right) add(byName.get(result.choice), 'hit');
    el('explain').textContent = right
      ? `${q.target.name} går från ${q.from.name} till ${q.to.name}.`
      : `Det är ${q.target.name}, inte ${result.choice}.`;
  } else if (q.type === 'neighbour') {
    add(q.from, 'context');
    add(q.target, 'answer');
    let text = `Direkt ${q.side} om ${q.from.name} ligger ${q.target.name}.`;
    if (!right) {
      add(byName.get(result.choice), 'hit');
      const side = Object.entries(q.from.beside ?? {}).find(([, n]) => n === result.choice)?.[0];
      text += side ? ` ${result.choice} ligger ${side} om ${q.from.name}.` : '';
    }
    el('explain').textContent = text;
  }

  show(marks);
  requestAnimationFrame(() => frameReveal(marks.map((m) => m.item.geometry), []));
}

function next() {
  if (phase !== 'answered') return;
  index += 1;
  if (index < set.length) ask();
  else finish();
}

function outcome({ q, result }) {
  if (typeOf(q).input === 'map') {
    return result.score === MAX_SCORE ? 'Mitt i prick.' : `${formatDistance(result.distance)} bort.`;
  }
  return result.score === MAX_SCORE ? 'Rätt.' : `Du svarade ${result.choice}.`;
}

function countUp(node, total) {
  if (reducedMotion) { node.textContent = String(total); return; }
  const startAt = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - startAt) / 900);
    node.textContent = String(Math.round(total * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function verdictFor(total, max) {
  const share = total / max;
  if (share >= 0.9) return 'Du hittar i Malmö.';
  if (share >= 0.7) return 'Riktigt bra.';
  if (share >= 0.5) return 'Bra jobbat.';
  if (share >= 0.3) return 'På god väg.';
  return 'Imorgon blir det bättre.';
}

function finish() {
  phase = 'end';
  clear();
  hide('question', 'result', 'choices', 'hint');
  const scores = results.map((r) => r.result.score);
  const total = sum(scores);
  const max = set.length * MAX_SCORE;
  el('enddate').textContent = new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
  countUp(el('endscore'), total);
  el('endmax').textContent = `av ${max}`;
  el('endverdict').textContent = verdictFor(total, max);
  el('endsquares').textContent = scores.map(square).join('');
  showSpread(total, max);

  const list = el('endlist');
  list.replaceChildren();
  for (const r of results) {
    const { q, result } = r;
    const li = document.createElement('li');
    const details = document.createElement('details');
    const summary = document.createElement('summary');

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = q.target.name;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = q.target.label;
    const score = document.createElement('span');
    score.className = 'score';
    score.dataset.tone = tone(result.score);
    score.textContent = String(result.score);
    summary.append(name, meta, score);

    const body = document.createElement('div');
    body.className = 'body';
    const asked = document.createElement('p');
    asked.className = 'asked';
    asked.textContent = `${typeOf(q).prompt(q).title} ${outcome(r)}`;
    body.append(asked);
    if (q.target.about) {
      const about = document.createElement('p');
      about.className = 'about';
      about.textContent = q.target.about;
      body.append(about);
    }
    const links = document.createElement('div');
    links.className = 'links';
    const onMap = document.createElement('button');
    onMap.type = 'button';
    onMap.textContent = 'Visa på kartan';
    onMap.addEventListener('click', () => openMap(q.target));
    links.append(onMap);
    if (q.target.source) {
      const a = document.createElement('a');
      a.href = q.target.source;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Läs mer';
      links.append(a);
    }
    body.append(links);

    details.append(summary, body);
    li.append(details);
    list.append(li);
  }

  reveal('end');
  el('end').scrollTop = 0;
  el('share').focus({ preventScroll: true });
}

let spreadRun = 0;

async function showSpread(total, max) {
  const figure = el('endspread');
  figure.hidden = true;
  const run = ++spreadRun;
  const got = await spread(key, total);
  if (run !== spreadRun || !got) return;
  const { others, beaten } = placing(got.counts, total, got.counted);
  if (others < MIN_OTHERS) return;

  const counts = bins(got.counts, max);
  const tallest = Math.max(...counts, 1);
  const you = binOf(total, max);
  el('spreadbars').replaceChildren(...counts.map((n, i) => {
    const bar = document.createElement('span');
    bar.style.height = n ? `max(3px, ${(100 * n) / tallest}%)` : '0';
    if (i === you) bar.dataset.you = '';
    return bar;
  }));
  el('spreadmax').textContent = String(max);
  el('spreadtext').textContent = got.counted
    ? `Bättre än ${beaten} % av de ${others} andra som spelat idag.`
    : `Bättre än ${beaten} % av dagens ${others} spelare. Bara första rundan räknas.`;
  figure.hidden = false;
}

async function share() {
  const text = shareText({
    key,
    scores: results.map((r) => r.result.score),
    url: location.origin + themePath(themeName),
  });
  const button = el('share');
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Kopierat';
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    button.textContent = ok ? 'Kopierat' : 'Kunde inte kopiera';
  }
  setTimeout(() => { button.textContent = 'Kopiera resultat'; }, 2000);
}

function openMap(focus = null) {
  phase = 'free';
  hide('end', 'card');
  reveal('back', 'freehint');
  setLabels(true);
  markToday(results.map((r) => r.q.target));
  clear();
  if (focus) {
    select(focus);
    requestAnimationFrame(() => frameItems([focus], 600));
  } else {
    requestAnimationFrame(() => frameHome(items));
  }
}

function select(item) {
  show([{ item, role: 'answer', named: false }]);
  el('cardname').textContent = item.name;
  el('cardlabel').textContent = item.label;
  el('cardabout').textContent = item.about ?? '';
  const src = el('cardsource');
  src.hidden = !item.source;
  if (item.source) src.href = item.source;
  hide('freehint');
  reveal('card');
}

function deselect() {
  clear();
  hide('card');
  if (phase === 'free') reveal('freehint');
}

function backToEnd() {
  deselect();
  hide('back', 'freehint');
  setLabels(false);
  phase = 'end';
  reveal('end');
}

function renderThemes() {
  const nav = el('devthemes');
  nav.hidden = !['localhost', '127.0.0.1'].includes(location.hostname);
  for (const [name, t] of Object.entries(THEMES)) {
    const a = document.createElement('a');
    a.href = themePath(name);
    a.textContent = t.label;
    if (name === themeName) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
}

map.on('click', (e) => {
  if (phase === 'asking' && typeOf(current()).input === 'map') {
    answer([e.lngLat.lng, e.lngLat.lat]);
  } else if (phase === 'free') {
    const name = pick(e.point);
    if (name) select(byName.get(name));
    else deselect();
  }
});

el('next').addEventListener('click', next);
el('share').addEventListener('click', share);
el('openmap').addEventListener('click', () => openMap());
el('again').addEventListener('click', start);
el('back').addEventListener('click', backToEnd);
el('cardclose').addEventListener('click', deselect);

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (phase === 'asking' && /^[1-9]$/.test(e.key)) {
    const button = el('choices').children[Number(e.key) - 1];
    if (button && !el('choices').hidden) { e.preventDefault(); button.click(); }
  } else if (phase === 'answered' && e.key === 'Enter' && document.activeElement !== el('next')) {
    e.preventDefault();
    next();
  } else if (phase === 'free' && e.key === 'Escape') {
    if (!el('card').hidden) deselect();
    else backToEnd();
  }
});

map.on('load', async () => {
  try {
    applyTheme(map, theme);
    items = (await fetch('/data/quiz.json').then((r) => r.json())).items;
    byName = new globalThis.Map(items.map((it) => [it.name, it]));
    setupLayers(map, items);
  } catch (err) {
    fail('Frågorna kunde inte laddas', err);
    return;
  }
  progress(1);
  renderThemes();
  start();
  setTimeout(() => boot.classList.add('done'), reducedMotion ? 0 : 250);
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => console.warn('sw:', err));
}
