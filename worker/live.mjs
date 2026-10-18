import { FEWEST_TO_RANK } from '../app/crowd.mjs';

export const WRITE_GAP = 15000;
export const CACHE = 'public, max-age=15';

export const fileKey = (day, set) => `${day}/${set}.json`;
export const fileUrl = (env, day, set) => (env.LIVE && env.LIVE_URL ? `${env.LIVE_URL}/${fileKey(day, set)}` : null);

export function dayFile(day, set, row) {
  return {
    day,
    set,
    players: row.players,
    totals: JSON.parse(row.totals),
    questions: JSON.parse(row.questions),
    finished: row.players < FEWEST_TO_RANK ? JSON.parse(row.finished) : null,
  };
}

export async function claim(db, day, set, now) {
  return db.prepare(`UPDATE days SET written = ?1, written_players = players
    WHERE day = ?2 AND set_id = ?3 AND players > written_players AND written <= ?1 - ?4
    RETURNING players, totals, questions, finished`).bind(now, day, set, WRITE_GAP).first();
}

export async function write(env, file) {
  try {
    await env.LIVE.put(fileKey(file.day, file.set), JSON.stringify(file), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: CACHE },
    });
  } catch (err) {
    console.error('live:', err);
    await env.DB.prepare('UPDATE days SET written_players = 0 WHERE day = ? AND set_id = ?').bind(file.day, file.set).run();
  }
}

export async function publish(env, day, set, now = Date.now()) {
  if (!env.LIVE) return;
  const row = await claim(env.DB, day, set, now);
  if (row) await write(env, dayFile(day, set, row));
}

export async function catchUp(env, now = Date.now()) {
  if (!env.LIVE) return;
  const since = new Date(now - 86400000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare('SELECT day, set_id FROM days WHERE day >= ? AND players > written_players')
    .bind(since).all();
  for (const { day, set_id: set } of results) await publish(env, day, set, now);
}
