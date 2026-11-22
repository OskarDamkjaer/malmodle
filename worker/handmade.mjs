import { SET_SIZE } from '../app/daily.mjs';
import { TYPES } from '../app/questions.mjs';
import { PLAYER, json, playerKey } from './results.mjs';

export const LONGEST = 65536;
export const LIMITS = { target: 200, note: 500, name: 80, remark: 1500, notes: 100 };
export const NOTES = ['add', 'remove', 'fix'];
export const PER_DAY = 10;
export const ALL_DAY = 300;

const DAY = 86400000;

const UNSEEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;
const UNSEEN_BUT_LINES = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

const isName = (value) => typeof value === 'string' && value.length > 0 && value.length <= LIMITS.target && !UNSEEN.test(value);
const isAt = (at) => at === undefined || (Array.isArray(at) && at.length === 2 && at.every(Number.isFinite));
const said = (value, max, unseen = UNSEEN_BUT_LINES) => (typeof value === 'string' && value.length <= max && !unseen.test(value) ? value.trim() : null);

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
  const name = said(raw?.name ?? '', LIMITS.name, UNSEEN);
  const remark = said(raw?.remark ?? '', LIMITS.remark);
  if (typeof player !== 'string' || !PLAYER.test(player) || name === null || remark === null) return null;
  if (!Array.isArray(slots) || slots.length !== SET_SIZE || !Array.isArray(notes) || notes.length > LIMITS.notes) return null;
  const day = { slots: slots.map(parseSlot), notes: notes.map(parseNote) };
  if (!day.slots.every(Boolean) || !day.notes.every(Boolean)) return null;
  return { player, ...day, name, remark };
}

export async function postHandmade(request, env, now = Date.now()) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (Number(request.headers.get('content-length')) > LONGEST) return json({ error: 'size' }, 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > LONGEST) return json({ error: 'size' }, 413);
  let raw;
  try { raw = JSON.parse(text); } catch { return json({ error: 'json' }, 400); }
  const day = parseHandmade(raw);
  if (!day) return json({ error: 'invalid' }, 400);
  const player = await playerKey(day.player);
  const { meta } = await env.DB.prepare(`INSERT INTO handmade (at, player, name, remark, slots, notes)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE (SELECT count(*) FROM handmade WHERE player = ?2 AND at > ?7) < ?8
      AND (SELECT count(*) FROM handmade WHERE at > ?7) < ?9`)
    .bind(now, player, day.name, day.remark, JSON.stringify(day.slots), JSON.stringify(day.notes), now - DAY, PER_DAY, ALL_DAY)
    .run();
  if (!meta.changes) return json({ error: 'many' }, 429);
  return json({ ok: true });
}
