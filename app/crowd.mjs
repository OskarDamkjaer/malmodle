export const BIN = 50;
export const CLEARED = 80;
export const RARE = 1 / 3;
export const COMMON = 3 / 4;
export const FEWEST = 5;
export const MOST_STANDOUTS = 3;

const NBSP = ' ';
const percent = (share) => `${Math.round(100 * share)}${NBSP}%`;

export const binOf = (total, bins) => Math.min(bins - 1, Math.floor(total / BIN));

export function standing({ players, you }, shown = you.total) {
  const others = players - 1;
  const first = shown === you.total ? '' : ` Räknat på din första omgång idag, ${you.total} poäng.`;
  if (others < 1) return `Ingen annan har spelat än idag. Titta in senare och se hur det gick för andra.${first}`;
  const share = you.below / others;
  const lead = share === 1 ? `Bäst av ${players} spelare idag.`
    : share < 0.005 ? `Längst ner av ${players} spelare idag.`
    : `Bättre än ${percent(share)} av ${players} spelare idag.`;
  return lead + first;
}

export function standouts(names, { players, you, cleared }) {
  if (players < FEWEST) return [];
  const rows = names.map((name, i) => ({ name, share: cleared[i], mine: you.scores[i] >= CLEARED }));
  const rare = rows.filter((r) => r.mine && r.share <= RARE).sort((a, b) => a.share - b.share)
    .map((r) => `Bara ${percent(r.share)} klarade ${r.name}. Du gjorde det.`);
  const missed = rows.filter((r) => !r.mine && r.share >= COMMON).sort((a, b) => b.share - a.share)
    .map((r) => `${percent(r.share)} klarade ${r.name}, men inte du.`);
  return [...rare, ...missed].slice(0, MOST_STANDOUTS);
}

export const clearedLabel = (name, share, score) => `${name}: ${percent(share)} klarade den, du fick ${score}`;
