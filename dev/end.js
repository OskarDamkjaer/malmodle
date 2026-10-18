import { EPOCH, band, dailySet, dateKey, random, shareText, verdict } from '/daily.mjs';
import { MAX_SCORE } from '/questions.mjs';
import { summarize, tally } from '/crowd.mjs';
import { crowdCard } from '/crowd-view.js';
import { rounds, sum } from '/dev/fake.mjs';

const VARIANTS = [
  ['/dev/end-1.html', '1 Linjer'],
  ['/dev/end-2.html', '2 Förstasida'],
  ['/dev/end-3.html', '3 Facit'],
];

const CASES = {
  mitten: { label: '400 spelare, i mitten', players: 400, share: 0.45 },
  topp: { label: '400 spelare, tvåa', players: 400, place: 2 },
  botten: { label: '400 spelare, nära botten', players: 400, share: 0.9 },
  få: { label: '3 spelare', players: 3, place: 2 },
  utan: { label: 'Ingen server', players: 400, share: 0.45, offline: true },
};

const el = (tag, className = '', text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
const $ = (selector) => document.querySelector(selector);
const each = (selector, act) => document.querySelectorAll(selector).forEach(act);
const params = new URLSearchParams(location.search);
const which = CASES[params.get('läge')] ? params.get('läge') : 'mitten';

function devBar() {
  const nav = el('nav', 'devbar');
  for (const [href, label] of VARIANTS) {
    const a = el('a', '', label);
    a.href = href + location.search;
    if (location.pathname === href) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  const pick = el('select');
  for (const [id, c] of Object.entries(CASES)) pick.append(new Option(c.label, id, false, id === which));
  pick.addEventListener('change', () => { params.set('läge', pick.value); location.search = params; });
  nav.append(pick);
  document.body.append(nav);
}

function fakeMap() {
  const rng = random(7);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 1000');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  const shape = (tag, className, attrs) => {
    const node = document.createElementNS(ns, tag);
    node.setAttribute('class', className);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
  };
  shape('path', 'water', { d: 'M0 0H260C300 180 210 320 250 470S330 760 280 1000H0Z' });
  for (let i = 0; i < 6; i++) shape('circle', 'park', { cx: 320 + rng() * 680, cy: rng() * 1000, r: 20 + rng() * 50 });
  for (let i = 0; i < 90; i++) {
    let x = 260 + rng() * 740;
    let y = rng() * 1000;
    let angle = rng() * Math.PI * 2;
    const points = [[x, y]];
    for (let j = 0; j < 5; j++) {
      angle += (rng() - 0.5) * 0.6;
      x += Math.cos(angle) * 60;
      y += Math.sin(angle) * 60;
      points.push([x, y]);
    }
    shape('polyline', i < 8 ? 'street main' : 'street', { points: points.map((p) => p.join(',')).join(' ') });
  }
  $('#map').append(svg);
}

function squares(scores) {
  return scores.map((score) => {
    const square = el('span', 'sq');
    square.dataset.band = band(score);
    return square;
  });
}

devBar();
fakeMap();

const { items } = await (await fetch('/data/quiz.json')).json();
const key = dateKey();
const set = dailySet(items, key);
const c = CASES[which];
const pool = rounds(set, c.players, 4242);
const me = c.place ? c.place - 1 : Math.min(pool.length - 1, Math.round(c.share * pool.length));
const scores = pool[me];
const total = sum(scores);
const max = set.length * MAX_SCORE;
const end = $('#end');

$('#enddate').textContent = new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
each('#endissue', (node) => { node.textContent = `Nr ${Math.round((Date.parse(key) - Date.parse(EPOCH)) / 864e5) + 1}`; });
$('#endscore').textContent = String(total);
$('#endmax').textContent = `av ${max}`;
$('#endverdict').textContent = verdict(total, max, true);
each('[data-squares]', (node) => node.replaceChildren(...squares(scores)));
each('#sharetext', (node) => { node.textContent = shareText({ key, scores, url: 'https://malmodle.se/' }); });
$('#elsewhere').hidden = !c.offline;
$('#sharenative').hidden = false;
each('#endlist', (list) => list.replaceChildren(...set.map((q, i) => {
  const row = el('li');
  row.dataset.band = band(scores[i]);
  const what = el('span', 'what');
  what.append(el('span', 'name', q.target.name), el('span', 'kind', q.target.label));
  row.append(el('span', 'n', String(i + 1)), what, el('span', 'pts', String(scores[i])));
  return row;
})));

if (!c.offline) {
  const rows = pool.map((s) => ({ total: sum(s), scores: s }));
  const card = crowdCard({ onPractise: () => {} });
  $('#crowd').replaceChildren(card.node);
  $('#crowd').hidden = false;
  end.dataset.crowd = 'shown';
  card.update(summarize(tally(rows), rows[me]), set.map((q) => q.target.name), total, {});
}
