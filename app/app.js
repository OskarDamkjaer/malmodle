import { Map, AttributionControl, addProtocol } from './vendor/maplibre-gl.mjs';
import { dailySet, dateKey, shareText, square } from './daily.mjs';
import { TYPES, formatDistance, MAX_SCORE } from './questions.mjs';
import { metersBetween, offset } from './geo.mjs';
import {
  clear, ensureVisible, frameAll, frameItems, markToday, pick, setLabels, setupLayers, show, showTap,
} from './map.js';

const el = (id) => document.getElementById(id);
const boot = el('boot');
const bootmsg = el('bootmsg');

function fail(what, err) {
  console.error(what, err);
  boot.classList.add('failed');
  boot.classList.remove('done');
  bootmsg.textContent = `${what}. ${err?.message ?? ''}`.trim();
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
    bootmsg.textContent = total
      ? `Laddar kartan… ${Math.round((got / total) * 100)} %`
      : `Laddar kartan… ${(got / 1048576).toFixed(1)} MB`;
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

function start() {
  key = dateKey();
  set = dailySet(items, key);
  index = 0;
  results = [];
  hide('end', 'back', 'card', 'result');
  setLabels(false);
  ask();
}

function ask() {
  const q = current();
  const type = typeOf(q);
  const { title, detail } = type.prompt(q);
  phase = 'asking';
  clear();
  el('progress').textContent = `${index + 1} / ${set.length}`;
  el('detail').textContent = detail ?? '';
  el('prompt').textContent = title;
  hide('result');
  reveal('question');

  const choices = el('choices');
  choices.replaceChildren();
  if (type.input === 'choice') {
    for (const option of q.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = option[0].toUpperCase() + option.slice(1);
      b.dataset.value = option;
      b.addEventListener('click', () => answer(option));
      choices.append(b);
    }
    reveal('choices');
  } else {
    hide('choices');
  }

  show(type.showing(q).map(({ item, named }) => ({ item, named, role: 'context' })));
  const view = type.view(q);
  requestAnimationFrame(() => {
    if (view === 'home') frameAll(items);
    else frameItems(view.items, view.context);
  });
}

function answer(value) {
  if (phase !== 'asking') return;
  const q = current();
  const type = typeOf(q);
  const result = type.grade(q, value, items);
  results.push({ q, result });
  phase = 'answered';

  const right = result.score === MAX_SCORE;
  el('points').textContent = `${result.score} p`;
  el('result').dataset.tone = right ? 'right' : result.score >= 40 ? 'mid' : 'wrong';

  if (type.input === 'map') revealPoint(q, result);
  else revealChoice(q, result);

  hide('choices');
  reveal('result');
  el('next').textContent = index + 1 < set.length ? 'Nästa' : 'Se resultatet';
  el('next').focus({ preventScroll: true });
}

function revealPoint(q, result) {
  const marks = [{ item: q.target, role: 'answer', named: true }];
  if (result.hit) marks.push({ item: result.hit, role: 'hit', named: true });
  show(marks);
  showTap(result.tap, result.near);
  el('verdict').textContent = result.score === MAX_SCORE ? 'Rätt' : `${formatDistance(result.distance)} bort`;
  el('explain').textContent = result.hit ? `Du tryckte på ${result.hit.name}.` : '';
  requestAnimationFrame(() => ensureVisible([result.tap, result.near, q.target.point]));
}

function revealChoice(q, result) {
  const right = result.score === MAX_SCORE;
  el('verdict').textContent = right ? 'Rätt' : 'Fel';
  const marks = [];
  const points = [];
  const add = (item, role) => {
    if (!item) return;
    marks.push({ item, role, named: true });
    points.push(item.point);
  };

  if (q.type === 'identify') {
    add(q.target, 'answer');
    if (!right) add(byName.get(result.choice), 'hit');
    el('explain').textContent = right ? `Det är ${q.target.name}.` : `Det är ${q.target.name}, inte ${result.choice}.`;
  } else if (q.type === 'nearest') {
    add(q.anchor, 'context');
    add(q.target, 'answer');
    const d = formatDistance(metersBetween(q.anchor.point, q.target.point));
    let text = `${q.target.name} ligger ${d} från ${q.anchor.name}.`;
    if (!right) {
      const wrong = byName.get(result.choice);
      add(wrong, 'hit');
      text += ` ${wrong.name} ligger ${formatDistance(metersBetween(q.anchor.point, wrong.point))} bort.`;
    }
    el('explain').textContent = text;
  } else if (q.type === 'compass') {
    add(q.reference, 'context');
    add(q.target, 'answer');
    const { east, north } = offset(q.reference.point, q.target.point);
    const along = Math.abs(q.axis === 'north' ? north : east);
    el('explain').textContent = `${q.target.name} ligger ${formatDistance(along)} ${q.answer} om ${q.reference.name}.`;
  }

  show(marks);
  requestAnimationFrame(() => ensureVisible(points));
}

function next() {
  if (phase !== 'answered') return;
  index += 1;
  if (index < set.length) ask();
  else finish();
}

function scoreTone(score) {
  if (score >= 80) return 'right';
  if (score >= 40) return 'mid';
  return 'wrong';
}

function outcome({ q, result }) {
  if (q.type === 'point') {
    return result.score === MAX_SCORE ? 'Rätt' : `${formatDistance(result.distance)} bort`;
  }
  return result.score === MAX_SCORE ? 'Rätt' : `Du svarade ${result.choice}`;
}

function finish() {
  phase = 'end';
  clear();
  hide('question', 'result', 'choices');
  const scores = results.map((r) => r.result.score);
  el('enddate').textContent = new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
  el('endscore').textContent = `${sum(scores)} / ${set.length * MAX_SCORE}`;
  el('endsquares').textContent = scores.map(square).join('');

  const list = el('endlist');
  list.replaceChildren();
  for (const r of results) {
    const { q, result } = r;
    const li = document.createElement('li');

    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('strong');
    name.textContent = q.target.name;
    const score = document.createElement('span');
    score.className = 'score';
    score.dataset.tone = scoreTone(result.score);
    score.textContent = `${result.score} p`;
    row.append(name, score);

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = q.target.label;

    const asked = document.createElement('p');
    asked.className = 'asked';
    asked.textContent = `${typeOf(q).prompt(q).title} ${outcome(r)}.`;

    li.append(row, meta, asked);

    if (q.target.about) {
      const about = document.createElement('p');
      about.className = 'about';
      about.textContent = q.target.about;
      li.append(about);
    }
    if (q.target.source) {
      const a = document.createElement('a');
      a.href = q.target.source;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Källa';
      li.append(a, document.createTextNode(' '));
    }
    const onMap = document.createElement('button');
    onMap.type = 'button';
    onMap.className = 'onmap';
    onMap.textContent = 'Visa på kartan';
    onMap.addEventListener('click', () => explore(q.target));
    li.append(onMap);

    list.append(li);
  }

  reveal('end');
  el('end').scrollTop = 0;
  el('share').focus({ preventScroll: true });
}

async function share() {
  const text = shareText({ key, scores: results.map((r) => r.result.score), url: location.origin });
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

function explore(focus = null) {
  phase = 'explore';
  hide('end', 'card');
  reveal('back');
  setLabels(true);
  markToday(results.map((r) => r.q.target));
  clear();
  if (focus) {
    select(focus);
    requestAnimationFrame(() => frameItems([focus], 600));
  } else {
    requestAnimationFrame(() => frameAll(items));
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
  reveal('card');
}

function deselect() {
  clear();
  hide('card');
}

function backToEnd() {
  deselect();
  hide('back');
  setLabels(false);
  phase = 'end';
  reveal('end');
}

map.on('click', (e) => {
  if (phase === 'asking' && typeOf(current()).input === 'map') {
    answer([e.lngLat.lng, e.lngLat.lat]);
  } else if (phase === 'explore') {
    const name = pick(e.point);
    if (name) select(byName.get(name));
    else deselect();
  }
});

el('next').addEventListener('click', next);
el('share').addEventListener('click', share);
el('explore').addEventListener('click', () => explore());
el('again').addEventListener('click', start);
el('back').addEventListener('click', backToEnd);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (phase === 'explore') {
    if (!el('card').hidden) deselect();
    else backToEnd();
  }
});

map.on('load', async () => {
  try {
    items = (await fetch('/data/quiz.json').then((r) => r.json())).items;
    byName = new globalThis.Map(items.map((it) => [it.name, it]));
    setupLayers(map, items);
  } catch (err) {
    fail('Frågorna kunde inte laddas', err);
    return;
  }
  boot.classList.add('done');
  start();
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('sw:', err));
}
