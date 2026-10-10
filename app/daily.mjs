import { MAX_SCORE, TYPES } from './questions.mjs';

export const MIX = ['area', 'area', 'point', 'point', 'point', 'point', 'point', 'identify', 'identify', 'special'];

export const SPECIALS = ['nearest', 'neighbour'];

export function dateKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function order(mix, rng) {
  const out = [...mix];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  const first = out.findIndex((type) => TYPES[type]?.input === 'map');
  if (first > 0) [out[0], out[first]] = [out[first], out[0]];
  return out.map((type) => (type === 'special' ? SPECIALS[Math.floor(rng() * SPECIALS.length)] : type));
}

export function dailySet(items, key, mix = MIX) {
  const rng = random(hash(`malmo:${key}`));
  const used = new Set();
  const pick = (filter, { peek = false } = {}) => {
    const pool = items.filter((it) => !used.has(it.name) && filter(it));
    if (!pool.length) return null;
    const it = pool[Math.floor(rng() * pool.length)];
    if (!peek) used.add(it.name);
    return it;
  };
  const questions = [];
  for (const wanted of order(mix, rng)) {
    let type = wanted;
    let q = TYPES[type].build({ pick, items, rng, used });
    if (!q) {
      type = 'point';
      q = TYPES.point.build({ pick, items, rng, used });
    }
    if (q) questions.push({ type, ...q });
  }
  return questions;
}

export function square(score) {
  if (score >= 80) return '🟩';
  if (score >= 40) return '🟨';
  return '🟥';
}

export function shareText({ key, scores, url }) {
  const total = scores.reduce((sum, s) => sum + s, 0);
  return [
    `Lär dig Malmö ${key}`,
    `${total}/${scores.length * MAX_SCORE}`,
    scores.map(square).join(''),
    url,
  ].filter(Boolean).join('\n');
}
