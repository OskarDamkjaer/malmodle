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

const claimSql = (set) => `UPDATE days SET written = ?1, written_players = players
    WHERE day = ?2 AND set_id = ${set} AND players > written_players AND written <= ?1 - ?4
    RETURNING players, totals, questions, finished`;

const playerSet = '(SELECT set_id FROM results WHERE day = ?2 AND player = ?3)';

export const claiming = (db, day, set, now) => db.prepare(claimSql('?3')).bind(now, day, set, WRITE_GAP);
export const claimingFor = (db, day, player, now) => db.prepare(claimSql(playerSet)).bind(now, day, player, WRITE_GAP);

export async function write(env, file, claimed) {
  try {
    await env.LIVE.put(fileKey(file.day, file.set), JSON.stringify(file), {
      httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: CACHE },
      onlyIf: { uploadedBefore: new Date(claimed) },
    });
  } catch (err) {
    console.error('live:', err);
    await env.DB.prepare('UPDATE days SET written_players = 0 WHERE day = ? AND set_id = ?').bind(file.day, file.set).run();
  }
}

export async function publish(env, day, set, now = Date.now()) {
  if (!env.LIVE) return;
  const row = await claiming(env.DB, day, set, now).first();
  if (row) await write(env, dayFile(day, set, row), now);
}

export async function catchUp(env, now = Date.now()) {
  if (!env.LIVE) return;
  const since = new Date(now - 86400000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare('SELECT day, set_id FROM days WHERE day >= ? AND players > written_players')
    .bind(since).all();
  for (const { day, set_id: set } of results) await publish(env, day, set, now);
}
