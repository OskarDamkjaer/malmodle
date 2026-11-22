import { LAUNCH, dailySet, laterKey, setId } from '../../app/daily.mjs';

export const PLAYED = 'learn/played.json';

export function pin(quiz, days, today) {
  const out = { ...days };
  for (let day = LAUNCH; day <= today; day = laterKey(day, 1)) out[day] ??= setId(dailySet(quiz.items, day, quiz.decoys, quiz.made));
  return out;
}

export const pinned = (days) => `${JSON.stringify({ days }, null, 2)}\n`;
