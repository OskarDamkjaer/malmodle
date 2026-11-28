import { dailySet, laterKey } from '../../app/daily.mjs';

export const WAIT = { area: 7, street: 14, place: 14 };
export const LEAD = 7;
export const SOONEST = 3;
export const APART = 7;
export const WEEKDAY = 5;

const gapOf = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

export const askedOf = (entry) => entry.slots.map((s) => s.target).sort().join('\n');

export const twinOf = (made, entry, day) => Object.keys(made ?? {}).find((other) => other !== day && askedOf(made[other]) === askedOf(entry)) ?? null;

export function problems(quiz, day, entry) {
  const found = [];
  if (quiz.made?.[day]) found.push(`${day} already has a day made by hand`);
  const twin = twinOf(quiz.made, entry, day);
  if (twin) found.push(`it asks what the day on ${twin} asks`);
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

export function schedule(quiz, entries, from, { apart = APART, weekday = WEEKDAY, check = problems, tries = 120, who = () => null } = {}) {
  let made = quiz.made ?? {};
  const dates = entries.map(() => null);
  const left = new Set(entries.keys());
  const near = (day) => Object.keys(made).some((other) => Math.abs(gapOf(other, day)) < Math.max(1, apart));
  const beside = (day) => {
    const days = Object.keys(made).sort();
    return [days.findLast((other) => other < day), days.find((other) => other > day)].filter(Boolean).map((other) => who(made[other], other));
  };
  for (let n = 0, day = from; n < tries && left.size; n++, day = laterKey(day, 1)) {
    if (weekdayOf(day) !== weekday || near(day)) continue;
    const others = beside(day);
    const again = (i) => who(entries[i], day) !== null && others.includes(who(entries[i], day));
    const fitting = [...left].filter((i) => !check({ ...quiz, made }, day, entries[i]).length);
    const pick = fitting.find((i) => !again(i)) ?? ([...left].every(again) ? fitting[0] : undefined);
    if (pick === undefined) continue;
    made = { ...made, [day]: entries[pick] };
    dates[pick] = day;
    left.delete(pick);
  }
  return dates;
}

export function written(doc) {
  const days = Object.fromEntries(Object.entries(doc.days).sort(([a], [b]) => (a < b ? -1 : 1)));
  return `${JSON.stringify({ ...doc, days }, null, 2)
    .replace(/\{\n\s+"target": (.*),\n\s+"type": (.*),\n\s+"seed": (.*)\n\s+\}/g, '{ "target": $1, "type": $2, "seed": $3 }')}\n`;
}
