import { SET_SIZE } from '../app/daily.mjs';
import { TYPES } from '../app/questions.mjs';
import { PLAYER, json, playerKey } from './results.mjs';

export const LONGEST = 65536;
export const LIMITS = { target: 200, note: 500, name: 80, remark: 1500 };
export const NOTES = ['add', 'remove', 'fix'];
export const PER_DAY = 10;

const DAY = 86400000;

const isName = (value) => typeof value === 'string' && value.length > 0 && value.length <= LIMITS.target;
const isAt = (at) => at === undefined || (Array.isArray(at) && at.length === 2 && at.every(Number.isFinite));
const said = (value, max) => (typeof value === 'string' && value.length <= max ? value.trim() : null);

function parseSlot(raw) {
  const { target, type, seed, at } = raw ?? {};
  if (!isName(target) || typeof type !== 'string' || !Object.hasOwn(TYPES, type) || !Number.isSafeInteger(seed) || !isAt(at)) return null;
  return { target, type, seed, ...(at && { at }) };
}

function parseNote(raw) {
  const { target, what, at } = raw ?? {};
  const text = said(raw?.text, LIMITS.note);
  if (!isName(target) || !NOTES.includes(what) || text === null || !isAt(at)) return null;
  return { target, what, text, ...(at && { at }) };
}

export function parseHandmade(raw) {
  const { player, slots, notes } = raw ?? {};
  const name = said(raw?.name ?? '', LIMITS.name);
  const remark = said(raw?.remark ?? '', LIMITS.remark);
  if (typeof player !== 'string' || !PLAYER.test(player) || name === null || remark === null) return null;
  if (!Array.isArray(slots) || slots.length !== SET_SIZE || !Array.isArray(notes)) return null;
  const day = { slots: slots.map(parseSlot), notes: notes.map(parseNote) };
  if (!day.slots.every(Boolean) || !day.notes.every(Boolean)) return null;
  return { player, ...day, name, remark };
}

export async function postHandmade(request, env, now = Date.now()) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const text = await request.text();
  if (text.length > LONGEST) return json({ error: 'size' }, 413);
  let raw;
  try { raw = JSON.parse(text); } catch { return json({ error: 'json' }, 400); }
  const day = parseHandmade(raw);
  if (!day) return json({ error: 'invalid' }, 400);
  const player = await playerKey(day.player);
  const { meta } = await env.DB.prepare(`INSERT INTO handmade (at, player, name, remark, slots, notes)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE (SELECT count(*) FROM handmade WHERE player = ?2 AND at > ?7) < ?8`)
    .bind(now, player, day.name, day.remark, JSON.stringify(day.slots), JSON.stringify(day.notes), now - DAY, PER_DAY)
    .run();
  if (!meta.changes) return json({ error: 'many' }, 429);
  return json({ ok: true });
}
