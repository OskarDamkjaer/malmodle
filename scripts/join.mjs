import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DECKS, dailySet, dateKey, laterKey, setId, targetsOn } from '../app/daily.mjs';
import { coreWritten, move, pendingWritten, pick, undescribed } from './lib/join.mjs';
import { LEAD, SOONEST } from './lib/made.mjs';
import { PLAYED, pin, pinned } from './lib/played.mjs';

const CORE = 'learn/core.json';
const PENDING = 'learn/pending.json';
const AHEAD = 60;
const USAGE = 'usage: node scripts/join.mjs [areas] [streets] [bridges] [--names "A, B"] [--on YYYY-MM-DD] [--dry]';

const args = process.argv.slice(2);
const option = (k) => { const i = args.indexOf(k); return i < 0 ? null : args.splice(i, 2)[1] ?? ''; };
const on = option('--on');
const named = option('--names');
const dry = args.includes('--dry');
const sections = args.filter((a) => a !== '--dry');

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'malmodle-join-'));

function build(name, ...extra) {
  const out = join(dir, name);
  try {
    execFileSync(process.execPath, ['scripts/build-quiz.mjs', '--out', out, ...extra], { stdio: 'pipe' });
  } catch (err) {
    throw new Error(`the quiz does not build:\n${String(err.stderr).trim()}`);
  }
  return read(out);
}

function run() {
  const unknown = sections.filter((a) => a.startsWith('-'));
  if (unknown.length || on === '' || named === '') throw new Error(USAGE);

  const today = dateKey();
  const before = build('before.json');
  const played = read(PLAYED).days;
  const days = pin(before, played, today);
  const added = Object.keys(days).length - Object.keys(played).length;
  console.log(`${PLAYED}: ${added} day${added === 1 ? '' : 's'} to pin, ${Object.keys(days).length} in all, through ${today}`);

  const coreDoc = read(CORE);
  const pendingDoc = read(PENDING);
  const picked = pick(pendingDoc, sections, named ? named.split(',').map((n) => n.trim()).filter(Boolean) : []);
  const joining = new Set(Object.values(picked).flat());

  const day = on ?? laterKey(today, LEAD);
  const soonest = laterKey(today, SOONEST);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || laterKey(day, 0) !== day) throw new Error(`${day} is not a date`);
  if (day < soonest) throw new Error(`${day} is too soon: a browser still on the old version would deal the old set, so the first date is ${soonest}`);

  const missing = undescribed(picked, { about: read('learn/about.json'), streets: read('learn/streets.json'), bridges: read('learn/bridges.json') });
  if (missing.length) throw new Error(missing.join('\n'));

  const moved = move(coreDoc, pendingDoc, picked, day);
  const files = { [CORE]: coreWritten(moved.core), [PENDING]: pendingWritten(moved.pending), [PLAYED]: pinned(days) };
  writeFileSync(join(dir, 'core.json'), files[CORE]);
  writeFileSync(join(dir, 'pending.json'), files[PENDING]);
  const after = build('after.json', '--core', join(dir, 'core.json'), '--pending', join(dir, 'pending.json'));

  const changed = Object.entries(days).filter(([d, id]) => setId(dailySet(after.items, d, after.decoys, after.made)) !== id).map(([d]) => d);
  if (changed.length) throw new Error(`these days already played would change: ${changed.join(', ')}`);
  const asked = (quiz, d) => JSON.stringify(dailySet(quiz.items, d, quiz.decoys, quiz.made)
    .map((q) => [q.type, q.target.name, q.side, q.from?.name, q.to?.name, q.region?.name, q.options?.map((o) => o.name ?? o)]));
  const sooner = [];
  for (let d = today; d < day; d = laterKey(d, 1)) if (asked(before, d) !== asked(after, d)) sooner.push(d);
  if (sooner.length) throw new Error(`these days before ${day} would ask something else: ${sooner.join(', ')}`);

  const ahead = Math.round((Date.parse(day) - Date.parse(today)) / 86400000);
  console.log(`\n${joining.size} names join on ${day}, in ${ahead} days:`);
  const live = after.items.filter((it) => !it.since || it.since <= day);
  for (const [deck, has] of Object.entries(DECKS)) {
    const fresh = live.filter((it) => has(it) && joining.has(it.name)).length;
    if (fresh) console.log(`  ${deck.padEnd(7)} ${String(fresh).padStart(3)} new, ${live.filter(has).length} in the deck`);
  }
  const keys = Object.keys(days).sort();
  console.log(`\nThe ${keys.length} days played, ${keys[0]} to ${keys.at(-1)}, keep their sets, and every day until ${day} asks what it would have.`);

  const first = new Map();
  for (let n = 0; n < AHEAD; n++) {
    const key = laterKey(day, n);
    for (const it of targetsOn(after.items, key, after.made)) if (joining.has(it.name) && !first.has(it.name)) first.set(it.name, key);
  }
  console.log(`\nFirst asked, over the ${AHEAD} days from ${day}:`);
  const byDay = Map.groupBy(first.keys(), (name) => first.get(name));
  for (const [key, names] of byDay) console.log(`  ${key}  ${names.join(', ')}`);
  const unasked = [...joining].filter((name) => !first.has(name));
  console.log(unasked.length ? `Not asked within those ${AHEAD} days: ${unasked.join(', ')}` : `Every one is asked within those ${AHEAD} days.`);

  if (dry) console.log(`\nNothing written (--dry).`);
  else {
    for (const [file, text] of Object.entries(files)) writeFileSync(file, text);
    console.log(`\nWritten: ${Object.keys(files).join(', ')}.`);
  }
  console.log(`\nLeft to do:
  node scripts/build-quiz.mjs
  node scripts/build-quiz.mjs --all --out build/data/quiz-all.json
  node --test 'test/*.test.mjs'
  commit, open a pull request, and merge it by ${laterKey(day, -SOONEST)}, ${SOONEST} days before ${day}`);
}

try {
  run();
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
