import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { dateKey, laterKey } from '../app/daily.mjs';
import { localD1 } from './lib/d1.mjs';
import { LEAD, firstFit, problems, written } from './lib/made.mjs';

register('./lib/resolve.mjs', import.meta.url);
const { WHAT, pack } = await import('../bygg/handmade.mjs');

const SITE = 'https://malmodle.se';
const DAYS = 'learn/days.json';
const QUIZ = 'build/data/quiz.json';

const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const file = flag('--db');
const [command, id, on] = args;

const SELECT = `SELECT h.id, h.at, h.name, h.remark, h.slots, h.notes,
  (SELECT count(*) FROM results r WHERE r.player = h.player) AS played
  FROM handmade h`;

async function query(sql) {
  if (file) return (await localD1(file).prepare(sql).all()).results;
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'malmodle', '--remote', '--json', '--command', sql], { encoding: 'utf8' });
  return JSON.parse(out)[0].results;
}

const parse = (row) => ({ ...row, slots: JSON.parse(row.slots), notes: JSON.parse(row.notes) });
const when = (at) => new Date(at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });

async function list() {
  const rows = (await query(`${SELECT} ORDER BY h.id DESC`)).map(parse);
  if (!rows.length) console.log('No days have been sent in.');
  for (const row of rows) {
    console.log(`#${row.id}  ${when(row.at)}  ${row.name || '(no name)'}  played ${row.played} days`);
    if (row.remark) console.log(`  "${row.remark}"`);
    for (const n of row.notes) console.log(`  ${WHAT[n.what]}: ${n.target}${n.text ? `: ${n.text}` : ''}`);
    console.log(`  ${SITE}/bygg/#dag=${pack(row)}\n`);
  }
}

async function take() {
  if (!/^\d+$/.test(id ?? '')) throw new Error('usage: node scripts/handmade.mjs take <id> [YYYY-MM-DD]');
  const [row] = (await query(`${SELECT} WHERE h.id = ${Number(id)}`)).map(parse);
  if (!row) throw new Error(`no day #${id}`);
  const quiz = JSON.parse(readFileSync(QUIZ, 'utf8'));
  const entry = { by: row.name || null, slots: row.slots.map(({ target, type, seed }) => ({ target, type, seed })) };
  const outside = row.slots.filter((s) => s.at || !quiz.items.some((it) => it.name === s.target)).map((s) => s.target);
  if (outside.length) throw new Error(`not in the game yet: ${outside.join(', ')}. Add them to core.json first.`);
  const day = on ?? firstFit(quiz, entry, laterKey(dateKey(), LEAD));
  if (!day) throw new Error('no date in the next four months fits; try one by hand to see why');
  const found = problems(quiz, day, entry);
  if (found.length) throw new Error(`${day} does not fit:\n  ${found.join('\n  ')}`);
  const doc = JSON.parse(readFileSync(DAYS, 'utf8'));
  doc.days[day] = entry;
  writeFileSync(DAYS, written(doc));
  console.log(`#${row.id} by ${entry.by ?? 'an unnamed player'} is played on ${day}. Rebuild the quiz and run the tests.`);
}

try {
  if (!command || command === 'list') await list();
  else if (command === 'take') await take();
  else throw new Error(`unknown command ${command}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
