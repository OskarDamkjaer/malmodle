import { readFileSync, writeFileSync } from 'node:fs';
import { dateKey } from '../app/daily.mjs';
import { PLAYED, pin, pinned } from './lib/played.mjs';

const quiz = JSON.parse(readFileSync('build/data/quiz.json', 'utf8'));
const { days } = JSON.parse(readFileSync(PLAYED, 'utf8'));
const today = dateKey();
const now = pin(quiz, days, today);
writeFileSync(PLAYED, pinned(now));
console.log(`${Object.keys(now).length - Object.keys(days).length} days added, ${Object.keys(now).length} in all, through ${today}`);
