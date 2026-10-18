import { Map, AttributionControl, addProtocol } from './vendor/maplibre-gl.mjs';
import { BAND_COLORS, PRACTICE, SAVE_KEY, band, dailySet, dateKey, practiceSet, recall, remember, setId, shareText, square } from './daily.mjs';
import { crowdCard } from './crowd-view.js';
import { TYPES, formatDistance, MAX_SCORE } from './questions.mjs';
import { namedLines, streetNear, tileAt } from './tiles.mjs';
import { THEMES, themeFromPath, themePath } from './themes.mjs';
import {
  applyTheme, clear, frameHome, frameItems, frameReveal, hideLabels, pickScored, setupLayers, show, showScored, showTap,
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

if (!document.createElement('canvas').getContext('webgl2')) {
  const err = new Error('Webbläsaren saknar stöd för WebGL2.');
  fail('Kartan kunde inte visas', err);
  throw err;
}

let archive;
let archiveFile;
try {
  const protocol = new pmtiles.Protocol();
  addProtocol('pmtiles', protocol.tile);
  archiveFile = await loadArchive('/malmo.pmtiles');
  archive = new pmtiles.PMTiles(new pmtiles.FileSource(archiveFile));
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
let practicing = null;

const current = () => set[index];
const typeOf = (q) => TYPES[q.type];
const sum = (list) => list.reduce((a, b) => a + b, 0);

function hide(...ids) { for (const id of ids) el(id).hidden = true; }
function reveal(...ids) { for (const id of ids) el(id).hidden = false; }

function renderDots() {
  const dots = el('dots');
  dots.replaceChildren();
  set.forEach((_, i) => {
    const li = document.createElement('li');
    if (results[i]) li.dataset.band = band(results[i].result.score);
    if (i === index && phase !== 'end') li.dataset.current = '';
    dots.append(li);
  });
  dots.setAttribute('aria-label', `Fråga ${index + 1} av ${set.length}`);
}

function start() {
  key = dateKey();
  practicing = null;
  play(dailySet(items, key));
}

function resume() {
  key = dateKey();
  practicing = null;
  const questions = dailySet(items, key);
  const answered = recall(loadSaved(), key, questions);
  if (!answered.length) forget();
  try {
    play(questions, answered);
  } catch (err) {
    console.error(err);
    forget();
    play(questions);
  }
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}

function forget() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

function save(finished) {
  if (practicing) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(remember(loadSaved(), { key, set, results, finished })));
  } catch {}
}

function practise(kind) {
  key = dateKey();
  practicing = kind;
  play(practiceSet(items, { key, category: kind.id, seed: Math.floor(Math.random() * 2 ** 32) }));
}

function play(questions, answered = []) {
  set = questions;
  results = answered;
  index = results.length;
  hide('end', 'result', 'info');
  delete document.body.dataset.ended;
  delete document.body.dataset.mapview;
  el('endmap').textContent = 'Visa på kartan';
  hideLabels();
  showScored([]);
  if (index < set.length) ask();
  else finish();
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
  hide('result', 'info');
  delete document.body.dataset.answered;
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
    reveal('choices');
  } else {
    hide('choices');
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
  const street = type.input === 'map' && q.target.kind === 'street' ? await clickedStreet(value).catch(() => undefined) : undefined;
  const result = type.grade(q, value, items, street);
  results.push({ q, result });
  save(false);
  phase = 'answered';
  navigator.vibrate?.(result.score === MAX_SCORE ? 15 : [10, 60, 10]);

  el('points').textContent = `${result.score}`;
  el('points').dataset.band = band(result.score);

  if (type.input === 'map') revealPoint(q, result);
  else revealChoice(q, result);

  renderDots();
  hide('choices');
  showInfo(q.target);
  reveal('result');
  el('next').textContent = index + 1 < set.length ? 'Nästa' : practicing ? 'Se resultat' : 'Se dagens resultat';
  el('next').focus({ preventScroll: true });
}

function showInfo(item, played) {
  el('infolabel').textContent = item.label;
  el('infoname').textContent = item.name;
  el('infoabout').textContent = item.about ?? '';
  el('infoscore').hidden = !played;
  if (played) {
    const pill = el('infopoints');
    pill.textContent = String(played.result.score);
    pill.dataset.band = band(played.result.score);
    el('infooutcome').textContent = outcome(played);
  }
  el('infosource').hidden = !item.source;
  if (item.source) el('infosource').href = item.source;

  const figure = el('infophoto');
  figure.replaceChildren();
  const photo = item.photos?.[0];
  if (photo) {
    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = item.name;
    img.loading = 'lazy';
    const credit = document.createElement('figcaption');
    const link = document.createElement('a');
    link.href = photo.source;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `Foto: ${photo.author}, ${photo.licence}`;
    credit.append(link);
    figure.append(img, credit);
  }
  figure.hidden = !photo;
  document.body.dataset.answered = '';
  reveal('info');
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

const VERDICTS = [
  [0.9, 'Snyggt!', 'Välkommen tillbaka imorgon.'],
  [0.7, 'Riktigt bra!', 'Ses imorgon.'],
  [0.5, 'Bra jobbat!', 'Ny omgång imorgon.'],
  [0.3, 'På god väg.', 'Försök igen imorgon.'],
  [0, 'Öva en gång till.', 'Försök igen imorgon.'],
];

function verdictFor(total, max, daily) {
  const [share, praise, tomorrow] = VERDICTS.find(([least]) => total / max >= least);
  if (!daily) return praise;
  return share ? `${praise} ${tomorrow}` : tomorrow;
}

function finish() {
  phase = 'end';
  save(true);
  clear();
  hide('question', 'result', 'info', 'choices');
  delete document.body.dataset.answered;
  document.body.dataset.ended = '';
  const scores = results.map((r) => r.result.score);
  const total = sum(scores);
  const max = set.length * MAX_SCORE;
  el('enddate').textContent = practicing
    ? `Övning · ${practicing.label}`
    : new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
  el('sharecard').hidden = Boolean(practicing);
  el('practise').setAttribute('aria-expanded', String(Boolean(practicing)));
  el('kinds').hidden = !practicing;
  countUp(el('endscore'), total);
  el('endmax').textContent = `av ${max}`;
  el('endverdict').textContent = verdictFor(total, max, !practicing);
  el('endsquares').textContent = scores.map(square).join('');
  el('sharetext').textContent = resultText();
  el('sharenative').hidden = !navigator.share;
  el('report').href = reportLink();
  el('again').textContent = practicing ? 'Dagens omgång' : 'Spela igen';
  offerInstall();
  compare();

  reveal('end');
  el('end').scrollTop = 0;
  spreadOut();
  el(practicing ? 'again' : 'share').focus({ preventScroll: true });
}

const PLAYER_KEY = 'malmodle-player';
let sessionPlayer;

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

let card = null;

async function compare() {
  hide('crowd');
  if (practicing) return;
  const asked = set;
  const scores = results.map((r) => r.result.score);
  try {
    const res = await fetch('/api/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ day: key, set: setId(set), player: playerId(), scores }),
    });
    if (!res.ok) return;
    const crowd = await res.json();
    if (phase !== 'end' || practicing || set !== asked) return;
    card ??= crowdCard({ onPractise: () => { if (el('kinds').hidden) toggleKinds(); el('kinds').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } });
    el('crowd').replaceChildren(card.node);
    card.update(crowd, set.map((q) => q.target.name), sum(results.map((r) => r.result.score)));
    reveal('crowd');
  } catch {}
}

function resultText() {
  return shareText({
    key,
    scores: results.map((r) => r.result.score),
    url: location.origin + themePath(themeName),
  });
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

let copiedTimer;
async function share() {
  const ok = await copy(resultText());
  const button = el('share');
  button.textContent = ok ? 'Kopierat ✓' : 'Kunde inte kopiera';
  button.dataset.state = ok ? 'done' : 'failed';
  if (ok) selectText(el('sharetext'));
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    button.textContent = 'Kopiera resultat';
    delete button.dataset.state;
  }, 2500);
}

function selectText(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
}

async function shareNative() {
  try {
    await navigator.share({ text: resultText() });
  } catch (err) {
    if (err.name !== 'AbortError') share();
  }
}

function reportLink() {
  const body = [
    `Datum: ${key}`,
    `Stil: ${themeName}`,
    `Webbläsare: ${navigator.userAgent}`,
    '',
    'Vad blev fel?',
    '',
  ].join('\n');
  const url = new URL('https://github.com/OskarDamkjaer/malmoemaps/issues/new');
  url.searchParams.set('body', body);
  return url.href;
}

let installEvent = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = /iPhone|iPod/.test(navigator.userAgent);
const phone = navigator.userAgentData?.mobile
  ?? (ios || /Android.*Mobile/.test(navigator.userAgent) || matchMedia('(pointer: coarse) and (max-width: 599px)').matches);

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  if (phase === 'end') offerInstall();
});
addEventListener('appinstalled', () => {
  installEvent = null;
  if (phase === 'end') offerInstall();
});

function offerInstall() {
  const text = !phone || standalone() ? null
    : installEvent ? 'Lägg Malmödle på hemskärmen, så är nästa omgång ett tryck bort.'
    : ios ? 'Lägg Malmödle på hemskärmen: tryck på Dela och välj Lägg till på hemskärmen.'
    : null;
  el('install').hidden = !text;
  el('installtext').textContent = text ?? '';
  el('installbutton').hidden = !installEvent;
}

async function install() {
  const event = installEvent;
  if (!event) return;
  installEvent = null;
  offerInstall();
  try {
    await event.prompt();
    await event.userChoice;
  } catch {}
  offerInstall();
}

function renderKinds() {
  const list = el('kinds');
  for (const kind of PRACTICE) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = kind.label;
    b.addEventListener('click', () => practise(kind));
    list.append(b);
  }
}

function toggleKinds() {
  const open = el('kinds').hidden;
  el('kinds').hidden = !open;
  el('practise').setAttribute('aria-expanded', String(open));
}

function spreadOut() {
  showScored(results.map(({ q, result }) => ({ item: q.target, color: BAND_COLORS[band(result.score)] })));
  requestAnimationFrame(() => frameItems(results.map((r) => r.q.target), 300));
}

function showPlace(r) {
  showInfo(r.q.target, r);
  requestAnimationFrame(() => frameItems(results.map((x) => x.q.target), 300));
}

function toggleMapView() {
  const on = !('mapview' in document.body.dataset);
  if (on) document.body.dataset.mapview = '';
  else delete document.body.dataset.mapview;
  el('endmap').textContent = on ? 'Visa resultatet' : 'Visa på kartan';
  closePlace();
  requestAnimationFrame(() => frameItems(results.map((r) => r.q.target), 300));
}

function closePlace() {
  hide('info');
}

map.on('click', (e) => {
  if (phase === 'asking' && typeOf(current()).input === 'map') {
    answer([e.lngLat.lng, e.lngLat.lat]);
  } else if (phase === 'end') {
    const name = pickScored(e.point);
    const r = results.find((x) => x.q.target.name === name);
    if (r) showPlace(r);
    else closePlace();
  }
});

map.on('mousemove', (e) => {
  if (phase !== 'end') return;
  map.getCanvas().style.cursor = pickScored(e.point) ? 'pointer' : '';
});

el('next').addEventListener('click', next);
el('share').addEventListener('click', share);
el('sharenative').addEventListener('click', shareNative);
el('sharetext').addEventListener('click', share);
el('practise').addEventListener('click', toggleKinds);
el('again').addEventListener('click', start);
el('installbutton').addEventListener('click', install);
el('infoclose').addEventListener('click', closePlace);
el('endmap').addEventListener('click', toggleMapView);
el('maptipbutton').addEventListener('click', (e) => {
  const open = e.currentTarget.getAttribute('aria-expanded') !== 'true';
  e.currentTarget.setAttribute('aria-expanded', String(open));
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (phase === 'asking' && /^[1-9]$/.test(e.key)) {
    const button = el('choices').children[Number(e.key) - 1];
    if (button && !el('choices').hidden) { e.preventDefault(); button.click(); }
  } else if (phase === 'answered' && e.key === 'Enter' && document.activeElement !== el('next')) {
    e.preventDefault();
    next();
  } else if (phase === 'end' && e.key === 'Escape') {
    closePlace();
  }
});

map.on('load', async () => {
  try {
    applyTheme(map, theme);
    items = (await fetch('/data/quiz.json').then((r) => r.json())).items;
    byName = new globalThis.Map(items.map((it) => [it.name, it]));
    setupLayers(map);
  } catch (err) {
    fail('Frågorna kunde inte laddas', err);
    return;
  }
  progress(1);
  renderKinds();
  resume();
  setTimeout(() => boot.classList.add('done'), Math.max(reducedMotion ? 0 : 250, 500 - performance.now()));
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  const uncontrolled = !navigator.serviceWorker.controller;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => console.warn('sw:', err));
  if (uncontrolled) {
    navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ url: '/malmo.pmtiles', file: archiveFile }));
  }
}
