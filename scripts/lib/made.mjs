import { dailySet, laterKey } from '../../app/daily.mjs';

export const WAIT = { area: 7, street: 14, place: 14 };
export const LEAD = 7;
export const SOONEST = 3;
export const APART = 7;
export const WEEKDAY = 5;

const gapOf = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

export function problems(quiz, day, entry) {
  const found = [];
  if (quiz.made?.[day]) found.push(`${day} already has a day made by hand`);
  const set = dailySet(quiz.items, day, quiz.decoys, { ...(quiz.made ?? {}), [day]: entry });
  for (const slot of entry.slots) {
    const q = set.find((x) => x.target.name === slot.target);
    if (!q) found.push(`${slot.target} is not in the game on ${day}`);
    else if (q.type !== slot.type) found.push(`${slot.target} cannot be asked as ${slot.type} on ${day}`);
  }
  return found;
}

export function fitTogether(quiz, picks, check = problems) {
  let made = quiz.made ?? {};
  const found = [];
  for (const { day, entry, label } of [...picks].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
    for (const problem of check({ ...quiz, made }, day, entry)) found.push(`${label}: ${problem}`);
    made = { ...made, [day]: entry };
  }
  return found;
}

export function schedule(quiz, entries, from, { apart = APART, weekday = WEEKDAY, check = problems, tries = 120 } = {}) {
  let made = quiz.made ?? {};
  const near = (day) => Object.keys(made).some((other) => Math.abs(gapOf(other, day)) < Math.max(1, apart));
  return entries.map((entry) => {
    for (let n = 0, day = from; n < tries; n++, day = laterKey(day, 1)) {
      if (weekdayOf(day) !== weekday || near(day) || check({ ...quiz, made }, day, entry).length) continue;
      made = { ...made, [day]: entry };
      return day;
    }
    return null;
  });
}

export function written(doc) {
  const days = Object.fromEntries(Object.entries(doc.days).sort(([a], [b]) => (a < b ? -1 : 1)));
  return `${JSON.stringify({ ...doc, days }, null, 2)
    .replace(/\{\n\s+"target": (.*),\n\s+"type": (.*),\n\s+"seed": (.*)\n\s+\}/g, '{ "target": $1, "type": $2, "seed": $3 }')}\n`;
}
