import { GROUP, SHOWN_GAP, dailySet, laterKey } from '../../app/daily.mjs';

export const WAIT = { area: 7, street: 14, place: 14 };
export const LEAD = 7;
const AFTER = 60;

const gapOf = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function problems(quiz, day, entry) {
  const made = { ...(quiz.made ?? {}), [day]: entry };
  const found = [];
  if (quiz.made?.[day]) found.push(`${day} already has a day made by hand`);
  const set = dailySet(quiz.items, day, quiz.decoys, made);
  for (const slot of entry.slots) {
    const q = set.find((x) => x.target.name === slot.target);
    if (!q) found.push(`${slot.target} is not in the game on ${day}`);
    else if (q.type !== slot.type) found.push(`${slot.target} cannot be asked as ${slot.type} on ${day}`);
  }
  const days = [];
  for (let key = laterKey(day, -Math.max(...Object.values(WAIT))); key <= laterKey(day, AFTER); key = laterKey(key, 1)) {
    days.push([key, dailySet(quiz.items, key, quiz.decoys, made)]);
  }
  const last = new Map();
  for (const [key, questions] of days) {
    for (const q of questions) {
      const before = last.get(q.target.name);
      if (before && gapOf(before, key) < WAIT[GROUP[q.target.kind]]) found.push(`${q.target.name} is asked on ${before} and again on ${key}`);
      last.set(q.target.name, key);
    }
  }
  days.forEach(([key, questions], n) => {
    for (const shown of questions.flatMap((q) => [q.from, q.to]).filter(Boolean)) {
      for (const [other, those] of days.slice(Math.max(0, n - SHOWN_GAP), n + SHOWN_GAP + 1)) {
        if (those.some((q) => q.target.name === shown.name)) found.push(`${shown.name} is on the map on ${key} and asked on ${other}`);
      }
    }
  });
  return [...new Set(found)];
}

export function firstFit(quiz, entry, from, tries = 120) {
  for (let n = 0, day = from; n < tries; n++, day = laterKey(day, 1)) {
    if (!quiz.made?.[day] && !problems(quiz, day, entry).length) return day;
  }
  return null;
}

export function written(doc) {
  const days = Object.fromEntries(Object.entries(doc.days).sort(([a], [b]) => (a < b ? -1 : 1)));
  return `${JSON.stringify({ ...doc, days }, null, 2)
    .replace(/\{\n\s+"target": (.*),\n\s+"type": (.*),\n\s+"seed": (.*)\n\s+\}/g, '{ "target": $1, "type": $2, "seed": $3 }')}\n`;
}
