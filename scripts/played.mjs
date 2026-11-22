import { readFileSync, writeFileSync } from 'node:fs';
import { LAUNCH, dailySet, dateKey, laterKey, setId } from '../app/daily.mjs';

const FILE = 'learn/played.json';
const { items, decoys, made } = JSON.parse(readFileSync('build/data/quiz.json', 'utf8'));
const { days } = JSON.parse(readFileSync(FILE, 'utf8'));
const today = dateKey();
let added = 0;
for (let day = LAUNCH; day <= today; day = laterKey(day, 1)) {
  if (days[day]) continue;
  days[day] = setId(dailySet(items, day, decoys, made));
  added++;
}
writeFileSync(FILE, `${JSON.stringify({ days }, null, 2)}\n`);
console.log(`${added} days added, ${Object.keys(days).length} in all, through ${today}`);
