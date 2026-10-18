import {
  FEWEST_TO_RANK, MAX_TOTAL, aside, beatenText, belowText, columns, countBelow, highlight, highlightText,
  pausedText, practiceTip, rankLabel, standing, strongest, strongestText, waiting,
} from './crowd.mjs';

const W = 300;
const H = 80;
const WIDTH = 20;
const SNAP = 8;
const STEP = 10;
const NS = 'http://www.w3.org/2000/svg';

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => 1 - (1 - t) ** 3;
const glide = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2);
const edgeOf = (t) => (t < 0.15 ? 'left' : t > 0.85 ? 'right' : '');

function svg(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function monotone(pts) {
  const d = pts.slice(1).map(([x, y], i) => (y - pts[i][1]) / (x - pts[i][0]));
  const m = pts.map((_, i) => {
    if (i === 0) return d[0];
    if (i === pts.length - 1) return d[d.length - 1];
    const [a, b] = [d[i - 1], d[i]];
    return (Math.sign(a) + Math.sign(b)) * Math.min(Math.abs(a), Math.abs(b), Math.abs(a + b) / 4);
  });
  return pts.slice(1).map(([x, y], i) => {
    const [x0, y0] = pts[i];
    const h = (x - x0) / 3;
    return `C${(x0 + h).toFixed(2)},${(y0 + m[i] * h).toFixed(2)} ${(x - h).toFixed(2)},${(y - m[i + 1] * h).toFixed(2)} ${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function outline(ys) {
  const step = W / ys.length;
  const pts = [[0, H], ...ys.map((v, c) => [c * step + step / 2, H - v * (H - 2)]), [W, H]];
  return `M${pts[0].join(',')} ${monotone(pts)}`;
}

async function invite(link) {
  const url = new URL('/', location.href).href;
  try {
    if (navigator.share) await navigator.share({ title: 'Malmödle', url });
    else {
      await navigator.clipboard.writeText(url);
      link.textContent = 'Länken är kopierad';
      link.dataset.done = '';
    }
  } catch {}
}

let ids = 0;

function chart({ onRefresh } = {}) {
  const id = `crowd${ids++}`;
  const drawing = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const defs = svg('defs');
  const clip = {};
  for (const side of ['behind', 'ahead']) {
    const path = svg('clipPath', { id: `${id}${side}` });
    clip[side] = svg('rect', { y: -10, height: H + 10 });
    path.append(clip[side]);
    defs.append(path);
  }
  const behind = svg('path', { class: 'behind', 'clip-path': `url(#${id}behind)` });
  const ahead = svg('path', { class: 'ahead', 'clip-path': `url(#${id}ahead)` });
  const stroke = svg('path', { class: 'stroke', 'vector-effect': 'non-scaling-stroke' });
  const line = svg('line', { class: 'line', y1: -4, y2: H, 'vector-effect': 'non-scaling-stroke' });
  const tryLines = svg('g', { class: 'tries' });
  drawing.append(defs, behind, ahead, stroke, tryLines, line);

  const plot = el('div', 'plot');
  const you = el('span', 'you');
  const rank = el('span', 'rank');
  const tryTags = el('span', 'tries');
  plot.append(drawing, tryTags, you, rank);
  const bar = el('div', 'split');
  const ticks = el('span', 'ticks');
  bar.append(el('span', 'behind'), el('span', 'ahead'), ticks, el('span', 'mark'));
  const numbers = el('p', 'numbers');
  const wait = el('div', 'wait');
  const waitText = el('p');
  const link = el('button', 'invite');
  link.type = 'button';
  link.addEventListener('click', () => invite(link));
  const refresh = el('button', 'invite refresh');
  refresh.type = 'button';
  refresh.hidden = true;
  refresh.addEventListener('click', () => onRefresh?.());
  wait.append(waitText, refresh, link);
  const cursor = el('span', 'cursor');
  const cursorScore = el('span', 'cursor-score');
  const cursorShare = el('span', 'cursor-share');
  const spoken = el('span', 'spoken');
  spoken.setAttribute('aria-live', 'polite');

  const graph = el('div', 'graph');
  graph.dataset.waiting = '';
  graph.append(plot, bar, numbers, wait, cursor, cursorScore, cursorShare, spoken);

  let ys = Array(MAX_TOTAL / WIDTH).fill(0);
  let at = 0.5;
  let frame = 0;
  let crowd = null;
  let focus = null;
  let paused = null;
  let waitingFor = null;
  let tries = [];
  let mine = null;
  let ranked = false;

  const say = () => {
    const stop = paused ? pausedText(paused) : null;
    const words = waitingFor ? waiting(waitingFor.players, { recent: waitingFor.recent, paused: Boolean(paused) }) : null;
    waitText.textContent = [words?.text, stop?.text].filter(Boolean).join('\n');
    refresh.hidden = !stop;
    if (stop) refresh.textContent = stop.button;
    link.hidden = !words;
    if (words && !('done' in link.dataset)) link.textContent = `${words.invite} →`;
    if (paused) graph.dataset.paused = '';
    else delete graph.dataset.paused;
    if (crowd) graph.setAttribute('aria-label', paused ? waitText.textContent : describe(crowd));
  };

  const draw = () => {
    const top = outline(ys);
    behind.setAttribute('d', `${top} Z`);
    ahead.setAttribute('d', `${top} Z`);
    stroke.setAttribute('d', top);
    const x = at * W;
    clip.behind.setAttribute('x', 0);
    clip.behind.setAttribute('width', x);
    clip.ahead.setAttribute('x', x);
    clip.ahead.setAttribute('width', W - x);
    line.setAttribute('x1', x);
    line.setAttribute('x2', x);
    you.style.left = `${100 * at}%`;
    you.style.transform = `translateX(${-100 * (at < 0.15 ? at / 0.3 : at > 0.85 ? 1 - (1 - at) / 0.3 : 0.5)}%)`;
    you.dataset.edge = edgeOf(at);
    if (mine) mine.textContent = String(Math.round(at * MAX_TOTAL));
    rank.style.left = `${100 * at}%`;
    rank.dataset.edge = edgeOf(at);
    bar.style.setProperty('--at', `${100 * at}%`);
  };

  const morph = (toYs, toAt, duration = 700, curve = ease) => {
    cancelAnimationFrame(frame);
    if (still()) {
      ys = toYs;
      at = toAt;
      draw();
      return;
    }
    const fromYs = ys.slice();
    const fromAt = at;
    const start = performance.now();
    const tick = (now) => {
      const t = curve(Math.min(1, (now - start) / duration));
      ys = fromYs.map((v, i) => v + (toYs[i] - v) * t);
      at = fromAt + (toAt - fromAt) * t;
      draw();
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };

  const others = () => {
    if (!crowd.totals) return null;
    const rest = crowd.totals.slice();
    rest.splice(rest.indexOf(crowd.you.total), 1);
    return rest;
  };

  const readAt = (score, exact) => {
    const mine = crowd.you.total;
    const near = (a, b) => Math.abs(a - b) / MAX_TOTAL * graph.clientWidth < SNAP;
    if (near(score, mine)) return { score: mine, mine: true };
    const attempt = tries.findIndex((t) => near(score, t));
    if (attempt >= 0) return { score: tries[attempt], attempt: attempt + 2 };
    const rest = others();
    if (rest?.length && !exact) {
      const closest = rest.reduce((a, b) => (Math.abs(b - score) < Math.abs(a - score) ? b : a));
      if (near(score, closest)) return { score: closest, someone: true };
    }
    return { score };
  };

  const show = (point) => {
    const { score, mine, someone, attempt } = point;
    const t = score / MAX_TOTAL;
    const share = mine
      ? beatenText(crowd)
      : belowText(countBelow(crowd, score), crowd.players - (someone || attempt ? 1 : 0));
    const who = mine ? 'Du, ' : attempt ? `Försök ${attempt}, ` : '';
    graph.dataset.hover = mine ? 'you' : '';
    for (const node of [cursor, cursorScore, cursorShare]) {
      node.style.left = `${100 * t}%`;
      node.dataset.edge = edgeOf(t);
    }
    cursorScore.textContent = `${who}${score}`;
    cursorShare.textContent = share;
    const covered = (node) => {
      const a = node.getBoundingClientRect();
      return [cursorScore, cursorShare].some((tag) => {
        const b = tag.getBoundingClientRect();
        return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      });
    };
    for (const node of [you, ...numbers.children, ...tryTags.children]) node.classList.toggle('faded', covered(node));
    return `${who}${score} poäng: bättre än ${share}`;
  };

  const hide = () => {
    delete graph.dataset.hover;
    for (const node of graph.querySelectorAll('.faded')) node.classList.remove('faded');
  };

  const pointer = (event) => {
    if (!crowd || paused) return;
    const rect = plot.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    show(readAt(Math.round(t * MAX_TOTAL)));
  };
  graph.addEventListener('pointermove', pointer);
  graph.addEventListener('pointerdown', pointer);
  graph.addEventListener('pointerleave', () => { if (focus === null) hide(); });

  graph.addEventListener('keydown', (event) => {
    if (!crowd || paused) return;
    const keys = { ArrowLeft: -STEP, ArrowDown: -STEP, ArrowRight: STEP, ArrowUp: STEP, PageDown: -100, PageUp: 100 };
    if (event.key === 'Escape') { focus = null; hide(); return; }
    if (event.key === 'Home') focus = 0;
    else if (event.key === 'End') focus = MAX_TOTAL;
    else if (keys[event.key]) focus = Math.min(MAX_TOTAL, Math.max(0, (focus ?? crowd.you.total) + keys[event.key]));
    else return;
    event.preventDefault();
    spoken.textContent = show(readAt(focus, true));
  });
  graph.addEventListener('focus', () => {
    if (!crowd || paused) return;
    focus = crowd.you.total;
    spoken.textContent = show({ score: focus, mine: true });
  });
  graph.addEventListener('blur', () => { focus = null; hide(); });

  const describe = (c) => (c
    ? `Poängen för dagens ${c.players} spelare. Du fick ${c.you.total} och var bättre än ${beatenText(c)} av de andra, ${rankLabel(c)}.${tries.length ? ` Dina omspelningar, som inte räknas: ${tries.join(', ')}.` : ''} Piltangenterna visar andra poäng.`
    : waitText.textContent);

  const placeTries = (mine) => {
    const x = (t) => (t / MAX_TOTAL) * W;
    const apart = (t) => (Math.abs(t - mine) / MAX_TOTAL) * graph.clientWidth > 48;
    tryLines.replaceChildren(...tries.map((t) => svg('line', { class: 'try', x1: x(t), x2: x(t), y1: 0, y2: H, 'vector-effect': 'non-scaling-stroke' })));
    tryTags.replaceChildren(...tries.map((t, i) => {
      const tag = el('span', 'try', `försök ${i + 2}`);
      tag.style.left = `${(100 * t) / MAX_TOTAL}%`;
      tag.dataset.edge = edgeOf(t / MAX_TOTAL);
      tag.hidden = !apart(t);
      return tag;
    }));
  };

  const update = (next, { recent = 0, tries: played = [] } = {}) => {
    tries = played;
    const ready = next.players >= FEWEST_TO_RANK;
    crowd = ready ? next : null;
    waitingFor = ready ? null : { players: next.players, recent };
    say();
    if (!ready) {
      graph.dataset.waiting = '';
      graph.removeAttribute('tabindex');
      graph.removeAttribute('role');
      graph.removeAttribute('aria-label');
      hide();
      morph(columns(next, WIDTH, true), next.you.total / MAX_TOTAL);
      return;
    }
    delete graph.dataset.waiting;
    graph.tabIndex = 0;
    graph.setAttribute('role', 'group');
    graph.setAttribute('aria-label', describe(next));
    mine = el('span', 'mine', String(next.you.total));
    you.replaceChildren(el('span', 'who', 'Du'), el('span', 'sep', ', '), mine);
    placeTries(next.you.total);
    rank.textContent = rankLabel(next);
    const rest = others() ?? [];
    ticks.replaceChildren(...rest.map((t) => {
      const tick = el('span', 'tick');
      tick.style.left = `${(100 * t) / MAX_TOTAL}%`;
      return tick;
    }));
    const extra = aside(next);
    numbers.replaceChildren(el('span', 'beaten', `Bättre än ${beatenText(next)}`));
    if (extra) numbers.append(el('span', 'sep', '·'), el('span', 'aside', extra));
    const first = !ranked;
    ranked = true;
    if (first) at = 0;
    morph(columns(next, WIDTH), next.you.total / MAX_TOTAL, ...(first ? [1600, glide] : []));
  };

  const pause = (time) => {
    paused = time;
    if (paused) hide();
    say();
  };

  draw();
  return { node: graph, update, pause };
}

export function crowdCard({ onPractise, onRefresh } = {}) {
  const node = el('div', 'crowd');
  const top = el('div', 'standing');
  const graph = chart({ onRefresh });
  const best = el('div', 'best');
  node.append(top, graph.node, best);

  const update = (crowd, names, live = {}) => {
    const ready = crowd.players >= FEWEST_TO_RANK;
    const said = ready ? standing(crowd) : null;
    top.replaceChildren(...(said ? [el('p', 'head', said.head), el('p', 'dek', said.dek)] : []));
    graph.update(crowd, live);
    const hl = ready ? highlight(crowd) : null;
    const strong = ready && !hl ? strongest(crowd) : null;
    const tip = ready && !hl && !strong && onPractise;
    best.dataset.state = !ready ? 'waiting' : hl || strong || tip ? '' : 'empty';
    if (tip) {
      best.removeAttribute('aria-hidden');
      const go = el('button', 'inline', practiceTip.link);
      go.type = 'button';
      go.addEventListener('click', onPractise);
      const text = el('p', 'text');
      text.append(practiceTip.before, go, practiceTip.after);
      best.replaceChildren(el('p', 'kicker', practiceTip.kicker), text);
      return;
    }
    if (!hl && !strong) {
      best.replaceChildren(el('span', 'bone'), el('span', 'bone'));
      best.setAttribute('aria-hidden', 'true');
      return;
    }
    best.removeAttribute('aria-hidden');
    const line = hl ? highlightText(names[hl.i], hl, crowd.players) : strongestText(names[strong.i], strong);
    best.replaceChildren(el('p', 'kicker', line.kicker), el('p', 'text', line.text));
    if (line.detail) best.append(el('p', 'detail', line.detail));
  };

  return { node, update, pause: graph.pause };
}
