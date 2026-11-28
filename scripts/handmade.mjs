import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LAUNCH, dailySet, dateKey, lasting, laterKey, settled } from '../app/daily.mjs';
import { metersBetween } from '../app/geo.mjs';
import { localD1 } from './lib/d1.mjs';
import { APART, LEAD, SOONEST, fitTogether, problems, schedule, written } from './lib/made.mjs';
import { PLAYED, pin, pinned } from './lib/played.mjs';
import { buildQuiz, untouched } from './lib/rebuild.mjs';

register('./lib/resolve.mjs', import.meta.url);
const { WHAT, assemble, pack, variant } = await import('../bygg/handmade.mjs');

const PAGE = 'http://127.0.0.1:8080/dev/review.html';
const DAYS = 'learn/days.json';
const DECLINED = 'learn/declined.json';
const QUIZ = 'build/data/quiz.json';
const ALL = 'build/data/quiz-all.json';
const REVIEW = 'build/review.json';
const SAME_PLACE = 50;
const USAGE = 'usage: node scripts/handmade.mjs [review | take all | take <id>[@YYYY-MM-DD] ... | decline <id> ...] [--db file.db]';

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const file = flag('--db');
const [command = 'review', ...rest] = args;

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const plain = (text) => String(text).replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, ' ');
const when = (at) => new Date(at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
const weekday = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
const isDate = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && laterKey(day, 0) === day;

async function query(sql) {
  if (file) return (await localD1(file).prepare(sql).all()).results;
  try {
    const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'malmodle', '--remote', '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out)[0].results;
  } catch (err) {
    throw new Error(`D1 could not be read through wrangler, which needs a login (npx wrangler login):\n${`${err.stdout ?? ''}${err.stderr ?? ''}`.trim() || err.message}`);
  }
}

const parse = (row) => ({ ...row, slots: JSON.parse(row.slots), notes: JSON.parse(row.notes) });
const sentIn = async (where = '') => (await query(`SELECT id, at, player, name, remark, slots, notes FROM handmade ${where} ORDER BY id`)).map(parse);

async function playedBy(players) {
  const keys = [...new Set(players)].filter((key) => /^[0-9a-f]+$/.test(key));
  if (!keys.length) return new Map();
  const days = [];
  for (let day = LAUNCH; day <= dateKey(); day = laterKey(day, 1)) days.push(`'${day}'`);
  const rows = await query(`SELECT player, count(*) AS played FROM results WHERE day IN (${days}) AND player IN (${keys.map((key) => `'${key}'`)}) GROUP BY player`);
  return new Map(rows.map((row) => [row.player, row.played]));
}

const entryOf = (row) => ({ by: row.name || null, sent: row.id, slots: row.slots.map(({ target, type, seed }) => ({ target, type, seed })) });
const declinedIn = () => new Set(read(DECLINED).declined);
const takenIn = (doc) => new Map(Object.entries(doc.days).filter(([, entry]) => entry.sent).map(([day, entry]) => [entry.sent, day]));
const outsideOf = (quiz, row) => {
  const inGame = new Map(settled(quiz.items).map((it) => [it.name, it]));
  const there = ({ target, at }) => {
    const it = inGame.get(target);
    return Boolean(it) && (!at || metersBetween(it.point, at) < SAME_PLACE);
  };
  return row.slots.filter((s) => !there(s)).map((s) => s.target);
};

function blockers(quiz, row) {
  const outside = outsideOf(quiz, row);
  return [
    ...(row.name !== plain(row.name) ? ['the name has characters that do not show'] : []),
    ...(outside.length ? [`not in the game yet: ${outside.join(', ')}; they join through learn/pending.json and scripts/join.mjs first`] : []),
  ];
}

function shownAs(quiz, day, entry) {
  const seen = assemble(entry.slots, settled(quiz.items), lasting(quiz.decoys));
  const played = dailySet(quiz.items, day, quiz.decoys, { ...(quiz.made ?? {}), [day]: entry });
  const changed = seen.filter((e, n) => !e.q || !played[n] || e.q.type !== played[n].type || variant(e.q) !== variant(played[n])).map((e) => e.target);
  return changed.length ? [`${day} would not ask these as the builder showed them: ${changed.join(', ')}`] : [];
}

const fits = (quiz, day, entry) => {
  const found = problems(quiz, day, entry);
  return found.length ? found : shownAs(quiz, day, entry);
};

async function review() {
  const quiz = buildQuiz(QUIZ);
  buildQuiz(ALL, '--all');
  const doc = read(DAYS);
  const taken = takenIn(doc);
  const all = await sentIn();
  const declined = declinedIn();
  const today = dateKey();
  const soonest = laterKey(today, LEAD);
  const coming = (row) => taken.get(row.id) > today;
  const rows = all.filter((row) => !declined.has(row.id) && (!taken.has(row.id) || coming(row)));
  const played = await playedBy(rows.map((row) => row.player));
  const ready = rows.filter((row) => !taken.has(row.id) && !blockers(quiz, row).length);
  const dates = schedule(quiz, ready.map(entryOf), soonest, { check: fits });
  const dateOf = new Map([...ready.map((row, n) => [row.id, dates[n]]), ...rows.filter(coming).map((row) => [row.id, taken.get(row.id)])]);

  const days = rows.map((row) => {
    const entry = coming(row) ? doc.days[taken.get(row.id)] : null;
    const shown = entry ? { ...row, name: entry.by ?? '', slots: entry.slots } : row;
    return {
      id: row.id, at: row.at, name: shown.name, remark: row.remark, slots: shown.slots, notes: row.notes, pack: pack(shown),
      played: played.get(row.player) ?? 0,
      same: rows.filter((other) => other.player === row.player && other.id !== row.id).map((other) => other.id),
      outside: entry ? [] : outsideOf(quiz, row), hidden: shown.name !== plain(shown.name), date: dateOf.get(row.id) ?? null,
      taken: Boolean(entry), edited: Boolean(entry) && JSON.stringify(entryOf(row)) !== JSON.stringify({ by: entry.by ?? null, sent: entry.sent, slots: entry.slots }),
    };
  }).sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9') || a.id - b.id);
  const scheduled = Object.entries(doc.days).map(([day, entry]) => ({ day, by: entry.by ?? null, sent: entry.sent ?? null }));
  writeFileSync(REVIEW, `${JSON.stringify({ today, soonest, apart: APART, scheduled, days }, null, 2)}\n`);

  if (!days.length) console.log('No days are waiting.');
  const rowOf = new Map(rows.map((row) => [row.id, row]));
  for (const day of days) {
    console.log(`#${day.id}  ${when(day.at)}  ${plain(day.name) || '(no name)'}  played ${day.played} days${day.same.length ? `  same player as ${day.same.map((id) => `#${id}`).join(', ')}` : ''}`);
    if (day.remark) console.log(`  "${plain(day.remark)}"`);
    for (const note of day.notes) console.log(`  ${WHAT[note.what]}: ${plain(note.target)}${note.text ? `: ${plain(note.text)}` : ''}`);
    const blocked = day.taken ? [] : blockers(quiz, rowOf.get(day.id));
    if (day.taken) console.log(`  played on: ${weekday(day.date)} ${day.date}${day.edited ? ', changed since it was sent' : ''}`);
    else if (day.date) console.log(`  suggested: ${weekday(day.date)} ${day.date}`);
    else console.log(`  no date: ${blocked.join('; ') || 'nothing in the next four months fits; try a date with take <id>@YYYY-MM-DD to see why'}`);
    console.log();
  }
  const done = all.length - rows.length;
  if (done) console.log(`${done} more sent in ${done === 1 ? 'is' : 'are'} already in ${DAYS} or ${DECLINED}.`);
  console.log(`Written: ${REVIEW}. With node scripts/serve.mjs running, review them at ${PAGE}`);
}

function picked() {
  const picks = rest.map((arg) => {
    const found = /^(\d+)(?:@(.+))?$/.exec(arg);
    if (!found) throw new Error(USAGE);
    return { id: Number(found[1]), day: found[2] ?? null };
  });
  if (!picks.length) throw new Error(USAGE);
  const twice = picks.filter((p, n) => picks.findIndex((q) => q.id === p.id) !== n);
  if (twice.length) throw new Error(`#${twice[0].id} is named twice`);
  return picks;
}

async function waiting() {
  const taken = takenIn(read(DAYS));
  const declined = declinedIn();
  return (await sentIn()).filter((row) => !taken.has(row.id) && !declined.has(row.id)).map((row) => ({ id: row.id, day: null }));
}

async function take() {
  const all = rest.length === 1 && rest[0] === 'all';
  let picks = all ? await waiting() : picked();
  if (!picks.length) return console.log('No days are waiting.');
  const today = dateKey();
  const soonest = laterKey(today, LEAD);
  for (const { id, day } of picks) {
    if (day && !isDate(day)) throw new Error(`#${id}: ${day} is not a date`);
    if (day && day < soonest) throw new Error(`#${id}: ${day} is too soon: a made day changes the days around it, so the first date is ${soonest}`);
  }
  const doc = read(DAYS);
  const taken = takenIn(doc);
  for (const { id } of picks) if (taken.has(id)) throw new Error(`#${id} is already played on ${taken.get(id)}`);
  const declined = declinedIn();
  for (const { id } of picks) if (declined.has(id)) throw new Error(`#${id} is declined; take it out of ${DECLINED} first`);
  const rows = new Map((await sentIn(`WHERE id IN (${picks.map((p) => p.id)})`)).map((row) => [row.id, row]));
  for (const { id } of picks) if (!rows.has(id)) throw new Error(`no day #${id} has been sent in`);

  const dir = mkdtempSync(join(tmpdir(), 'malmodle-take-'));
  try {
    const before = buildQuiz(join(dir, 'before.json'));
    const blocked = picks.flatMap(({ id }) => blockers(before, rows.get(id)).map((b) => `#${id}: ${b}`));
    if (blocked.length && !all) throw new Error(blocked.join('\n'));
    for (const line of blocked) console.log(`left waiting, ${line}`);
    picks = picks.filter(({ id }) => !blockers(before, rows.get(id)).length);
    if (!picks.length) return console.log('No day waiting can be played yet.');
    const pins = pin(before, read(PLAYED).days, today);

    const dated = picks.filter((p) => p.day).map((p) => ({ day: p.day, entry: entryOf(rows.get(p.id)), label: `#${p.id}` }));
    const unfit = fitTogether(before, dated, fits);
    if (unfit.length) throw new Error(unfit.join('\n'));
    const undated = picks.filter((p) => !p.day);
    const withDated = { ...before, made: { ...(before.made ?? {}), ...Object.fromEntries(dated.map((d) => [d.day, d.entry])) } };
    const dates = schedule(withDated, undated.map((p) => entryOf(rows.get(p.id))), soonest, { check: fits });
    const lost = undated.filter((p, n) => !dates[n]);
    if (lost.length) throw new Error(`no date in the next four months fits ${lost.map((p) => `#${p.id}`).join(', ')}; try one by hand to see why`);
    const placed = [...dated, ...undated.map((p, n) => ({ day: dates[n], entry: entryOf(rows.get(p.id)), label: `#${p.id}` }))]
      .sort((a, b) => (a.day < b.day ? -1 : 1));

    const text = written({ ...doc, days: { ...doc.days, ...Object.fromEntries(placed.map((p) => [p.day, p.entry])) } });
    writeFileSync(join(dir, 'days.json'), text);
    const after = buildQuiz(join(dir, 'after.json'), '--days', join(dir, 'days.json'));
    const first = placed[0].day;
    untouched(before, after, pins, today, first);
    for (const { day, entry, label } of placed) {
      const others = Object.fromEntries(Object.entries(after.made ?? {}).filter(([key]) => key !== day));
      const found = fits({ ...after, made: others }, day, entry);
      if (found.length) throw new Error(`${label}: ${found.join('\n  ')}`);
    }

    writeFileSync(DAYS, text);
    writeFileSync(PLAYED, pinned(pins));
    buildQuiz(QUIZ);
    buildQuiz(ALL, '--all');

    for (const { day, entry, label } of placed) console.log(`${label} by ${entry.by ?? 'an unnamed player'} is played on ${weekday(day)} ${day}.`);
    const keys = Object.keys(pins).sort();
    console.log(`\nThe ${keys.length} days played, ${keys[0]} to ${keys.at(-1)}, keep their sets, and every day until ${first} asks what it would have.`);
    console.log(`Written: ${DAYS}, ${PLAYED}. Rebuilt: ${QUIZ}, ${ALL}.`);
    console.log(`\nLeft to do:
  node --test 'test/*.test.mjs'
  node scripts/check-dates.mjs
  commit, open a pull request, and merge it by ${laterKey(first, -SOONEST)}, ${SOONEST} days before ${first}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function decline() {
  const picks = picked();
  if (picks.some((p) => p.day)) throw new Error(USAGE);
  const taken = takenIn(read(DAYS));
  for (const { id } of picks) if (taken.has(id)) throw new Error(`#${id} is played on ${taken.get(id)}, so it cannot be declined`);
  const found = new Set((await query(`SELECT id FROM handmade WHERE id IN (${picks.map((p) => p.id)})`)).map((row) => row.id));
  for (const { id } of picks) if (!found.has(id)) throw new Error(`no day #${id} has been sent in`);
  const declined = [...new Set([...declinedIn(), ...picks.map((p) => p.id)])].sort((a, b) => a - b);
  writeFileSync(DECLINED, `${JSON.stringify({ declined }, null, 2)}\n`);
  console.log(`Declined ${picks.map((p) => `#${p.id}`).join(', ')} in ${DECLINED}; review leaves them out. Nothing in D1 changed.`);
}

try {
  if (command === 'review') await review();
  else if (command === 'take') await take();
  else if (command === 'decline') await decline();
  else throw new Error(USAGE);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
