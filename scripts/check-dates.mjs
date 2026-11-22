import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dateKey } from '../app/daily.mjs';
import { DATED, dateProblems, label } from './lib/dates.mjs';
import { PLAYED } from './lib/played.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--base');
const base = at >= 0 ? args[at + 1] : 'origin/main';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const has = (ref) => { try { git('cat-file', '-e', ref); return true; } catch { return false; } };
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

if (!base || !has(`${base}^{commit}`)) {
  console.error(`check-dates: ${base ?? '--base'} is not a commit here; fetch it first`);
  process.exit(1);
}

const then = Object.fromEntries(Object.entries(DATED).map(([k, file]) => [k, has(`${base}:${file}`) ? JSON.parse(git('show', `${base}:${file}`)) : null]));
const now = Object.fromEntries(Object.entries(DATED).map(([k, file]) => [k, read(file)]));
const last = Object.keys(read(PLAYED).days).sort().at(-1);
const today = dateKey();
const { fresh, problems } = dateProblems(then, now, last, today);

if (!fresh.length) console.log(`check-dates: no date differs from ${base}`);
else {
  console.log(`check-dates: compared with ${base} on ${today}`);
  for (const d of fresh) console.log(`  ${label(d)}`);
}
if (problems.length) {
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
