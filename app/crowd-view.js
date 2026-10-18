import {
  FEWEST_TO_RANK, MAX_TOTAL, aside, beatenText, belowText, columns, countBelow, highlight, highlightText,
  firstRound, practiceTip, rankLabel, standing, strongest, strongestText, waiting,
} from './crowd.mjs';

const W = 300;
const H = 80;
const WIDTH = 20;
const SNAP = 8;
const STEP = 10;
const NS = 'http://www.w3.org/2000/svg';

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => 1 - (1 - t) ** 3;
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

function chart() {
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
  drawing.append(defs, behind, ahead, stroke, line);

  const plot = el('div', 'plot');
  const you = el('span', 'you');
  const rank = el('span', 'rank');
  plot.append(drawing, you, rank);
  const bar = el('div', 'split');
  const ticks = el('span', 'ticks');
  bar.append(el('span', 'behind'), el('span', 'ahead'), ticks, el('span', 'mark'));
  const numbers = el('p', 'numbers');
  const wait = el('div', 'wait');
  const waitText = el('p');
  const link = el('button', 'invite');
  link.type = 'button';
  link.addEventListener('click', () => invite(link));
  wait.append(waitText, link);
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
    you.dataset.edge = edgeOf(at);
    rank.style.left = `${100 * at}%`;
    rank.dataset.side = at > 0.6 ? 'left' : 'right';
    bar.style.setProperty('--at', `${100 * at}%`);
  };

  const morph = (toYs, toAt) => {
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
      const t = ease(Math.min(1, (now - start) / 700));
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
    const rest = others();
    if (rest?.length && !exact) {
      const closest = rest.reduce((a, b) => (Math.abs(b - score) < Math.abs(a - score) ? b : a));
      if (near(score, closest)) return { score: closest, someone: true };
    }
    return { score };
  };

  const show = (point) => {
    const { score, mine, someone } = point;
    const t = score / MAX_TOTAL;
    const share = mine
      ? beatenText(crowd)
      : belowText(countBelow(crowd, score), crowd.players - (someone ? 1 : 0));
    graph.dataset.hover = mine ? 'you' : '';
    for (const node of [cursor, cursorScore, cursorShare]) {
      node.style.left = `${100 * t}%`;
      node.dataset.edge = edgeOf(t);
    }
    cursorScore.textContent = mine ? `Du, ${score}` : String(score);
    cursorShare.textContent = share;
    const covered = (node) => {
      const a = node.getBoundingClientRect();
      return [cursorScore, cursorShare].some((tag) => {
        const b = tag.getBoundingClientRect();
        return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      });
    };
    for (const node of [you, rank, ...numbers.children]) node.classList.toggle('faded', covered(node));
    return `${mine ? 'Du, ' : ''}${score} poäng: bättre än ${share}`;
  };

  const hide = () => {
    delete graph.dataset.hover;
    for (const node of graph.querySelectorAll('.faded')) node.classList.remove('faded');
  };

  const pointer = (event) => {
    if (!crowd) return;
    const rect = plot.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    show(readAt(Math.round(t * MAX_TOTAL)));
  };
  graph.addEventListener('pointermove', pointer);
  graph.addEventListener('pointerdown', pointer);
  graph.addEventListener('pointerleave', () => { if (focus === null) hide(); });

  graph.addEventListener('keydown', (event) => {
    if (!crowd) return;
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
    if (!crowd) return;
    focus = crowd.you.total;
    spoken.textContent = show({ score: focus, mine: true });
  });
  graph.addEventListener('blur', () => { focus = null; hide(); });

  const describe = (c) => (c
    ? `Poängen för dagens ${c.players} spelare. Du fick ${c.you.total} och var bättre än ${beatenText(c)} av de andra, ${rankLabel(c)}. Piltangenterna visar andra poäng.`
    : waitText.textContent);

  const update = (next) => {
    const ready = next.players >= FEWEST_TO_RANK;
    crowd = ready ? next : null;
    if (!ready) {
      graph.dataset.waiting = '';
      graph.removeAttribute('tabindex');
      graph.removeAttribute('role');
      graph.removeAttribute('aria-label');
      const words = waiting(next.players);
      waitText.textContent = words.text;
      if (!('done' in link.dataset)) link.textContent = `${words.invite} →`;
      hide();
      morph(columns(next, WIDTH, true), next.you.total / MAX_TOTAL);
      return;
    }
    delete graph.dataset.waiting;
    graph.tabIndex = 0;
    graph.setAttribute('role', 'group');
    graph.setAttribute('aria-label', describe(next));
    you.textContent = `Du, ${next.you.total}`;
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
    morph(columns(next, WIDTH), next.you.total / MAX_TOTAL);
  };

  draw();
  return { node: graph, update };
}

export function crowdCard({ onPractise } = {}) {
  const node = el('div', 'crowd');
  const top = el('div', 'standing');
  const graph = chart();
  const best = el('div', 'best');
  node.append(top, graph.node, best);

  const update = (crowd, names, shown = crowd.you.total) => {
    const ready = crowd.players >= FEWEST_TO_RANK;
    const said = ready ? standing(crowd) : null;
    top.replaceChildren(...(said ? [el('p', 'head', said.head), el('p', 'dek', said.dek)] : []));
    if (shown !== crowd.you.total) top.append(el('p', 'dek', firstRound(crowd.you.total)));
    graph.update(crowd);
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

  return { node, update };
}
