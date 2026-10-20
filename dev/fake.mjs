import { random } from '/daily.mjs';
import { NEAR_SCORE, MAX_SCORE, TYPES, distanceScore } from '/questions.mjs';

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

function normal(rng) {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

export function rounds(questions, players, seed, shape = 'vanlig') {
  const rng = random(seed);
  const [lo, hi] = { lätt: [0.65, 0.95], svår: [0.05, 0.35] }[shape] ?? [0.2, 0.9];
  const ease = questions.map(() => lo + rng() * (hi - lo));
  return Array.from({ length: players }, (_, p) => {
    const skill = shape === 'tvådelad' ? (p % 2 ? 0.35 : -0.35) + rng() * 0.2 - 0.1
      : shape === 'bred' ? rng() * 1.2 - 0.6
      : rng() * 0.5 - 0.25;
    return questions.map((q, i) => {
      const good = Math.min(0.98, Math.max(0.02, ease[i] + skill));
      if (TYPES[q.type].input === 'choice') return rng() < good ? MAX_SCORE : rng() < 0.35 ? NEAR_SCORE : 0;
      const meters = 2500 * Math.exp(-3.2 * good) * Math.exp(0.9 * normal(rng));
      return distanceScore(meters, q.target.geometry);
    });
  }).sort((a, b) => sum(b) - sum(a));
}
