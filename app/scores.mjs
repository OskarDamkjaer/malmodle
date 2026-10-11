export const SCORES_URL = '';
export const MIN_OTHERS = 10;
export const BIN = 50;
const SENT = 'malmo:counted';

let sentDay = null;

export function bins(counts, max, width = BIN) {
  const out = new Array(Math.ceil(max / width)).fill(0);
  for (const [total, n] of counts) out[Math.min(out.length - 1, Math.floor(total / width))] += n;
  return out;
}

export function binOf(total, max, width = BIN) {
  return Math.min(Math.ceil(max / width) - 1, Math.floor(total / width));
}

export function placing(counts, total, counted) {
  let players = 0;
  let below = 0;
  for (const [t, n] of counts) {
    players += n;
    if (t < total) below += n;
  }
  const others = players - (counted ? 1 : 0);
  return { others, beaten: others > 0 ? Math.round((100 * below) / others) : 0 };
}

function alreadySent(day) {
  if (sentDay === day) return true;
  try { return localStorage.getItem(SENT) === day; } catch { return false; }
}

function markSent(day) {
  sentDay = day;
  try { localStorage.setItem(SENT, day); } catch {}
}

export async function spread(day, total, url = SCORES_URL) {
  if (!url) return null;
  const counted = !alreadySent(day);
  if (counted) markSent(day);
  try {
    const signal = AbortSignal.timeout(6000);
    const res = counted
      ? await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, total }),
        signal,
      })
      : await fetch(`${url}?day=${encodeURIComponent(day)}`, { signal });
    if (!res.ok) return null;
    const { counts } = await res.json();
    return { counts, counted };
  } catch {
    return null;
  }
}
