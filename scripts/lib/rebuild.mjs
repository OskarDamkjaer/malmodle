import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dailySet, laterKey, setId } from '../../app/daily.mjs';

export function buildQuiz(out, ...extra) {
  try {
    execFileSync(process.execPath, ['scripts/build-quiz.mjs', '--out', out, ...extra], { stdio: 'pipe' });
  } catch (err) {
    throw new Error(`the quiz does not build:\n${String(err.stderr).trim()}`);
  }
  return JSON.parse(readFileSync(out, 'utf8'));
}

export const asked = (quiz, day) => JSON.stringify(dailySet(quiz.items, day, quiz.decoys, quiz.made)
  .map((q) => [q.type, q.target.name, q.side, q.from?.name, q.to?.name, q.region?.name, q.options?.map((o) => o.name ?? o)]));

export function untouched(before, after, played, today, first) {
  const changed = Object.entries(played).filter(([day, id]) => setId(dailySet(after.items, day, after.decoys, after.made)) !== id).map(([day]) => day);
  if (changed.length) throw new Error(`these days already played would change: ${changed.join(', ')}`);
  const sooner = [];
  for (let day = today; day < first; day = laterKey(day, 1)) if (asked(before, day) !== asked(after, day)) sooner.push(day);
  if (sooner.length) throw new Error(`these days before ${first} would ask something else: ${sooner.join(', ')}`);
}
