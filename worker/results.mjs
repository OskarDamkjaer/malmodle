import { MAX_SCORE } from '../app/questions.mjs';
import { SET_SIZE } from '../app/daily.mjs';
import { summarize } from '../app/crowd.mjs';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PLAYER = /^[0-9a-f]{32}$/;
const SET = /^[0-9a-f]{1,8}$/;

const isScore = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;

function nearToday(day, now) {
  const t = Date.parse(`${day}T00:00:00Z`);
  const today = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) && Math.abs(t - today) <= 86400000;
}

export function parseResult(raw, now = Date.now()) {
  const { day, set, player, scores } = raw ?? {};
  if (typeof day !== 'string' || !DAY.test(day) || !nearToday(day, now)) return null;
  if (typeof set !== 'string' || !SET.test(set)) return null;
  if (typeof player !== 'string' || !PLAYER.test(player)) return null;
  if (!Array.isArray(scores) || scores.length < 1 || scores.length > SET_SIZE || !scores.every(isScore)) return null;
  return { day, set, player, scores };
}

export async function playerKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export async function postResult(request, db, now = Date.now()) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const text = await request.text();
  if (text.length > 2048) return json({ error: 'size' }, 413);
  let raw;
  try { raw = JSON.parse(text); } catch { return json({ error: 'json' }, 400); }
  const result = parseResult(raw, now);
  if (!result) return json({ error: 'invalid' }, 400);

  const player = await playerKey(result.player);
  const total = result.scores.reduce((a, b) => a + b, 0);
  await db.prepare('INSERT INTO results (day, player, set_id, total, scores, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
    .bind(result.day, player, result.set, total, JSON.stringify(result.scores), now).run();

  const mine = await db.prepare('SELECT set_id, total, scores FROM results WHERE day = ? AND player = ?')
    .bind(result.day, player).first();
  const { results } = await db.prepare('SELECT total, scores FROM results WHERE day = ? AND set_id = ?')
    .bind(result.day, mine.set_id).all();
  const rows = results.map((r) => ({ total: r.total, scores: JSON.parse(r.scores) }));
  return json({ day: result.day, ...summarize(rows, { total: mine.total, scores: JSON.parse(mine.scores) }) });
}
