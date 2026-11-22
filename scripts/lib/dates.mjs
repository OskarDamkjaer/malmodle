import { SOONEST } from './made.mjs';

export const DATED = { core: 'learn/core.json', places: 'places/places.json', days: 'learn/days.json' };

const gap = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function dated({ core, places, days }) {
  const out = new Map();
  const add = (d) => out.set(JSON.stringify([d.file, d.name, d.day]), d);
  for (const [day, names] of Object.entries(core?.since ?? {})) add({ file: DATED.core, day, what: names });
  for (const p of places?.places ?? []) {
    for (const [day, change] of Object.entries(p.changes ?? {})) add({ file: DATED.places, day, name: p.name, what: change });
  }
  for (const [day, entry] of Object.entries(days?.days ?? {})) add({ file: DATED.days, day, what: entry });
  return out;
}

export function newDates(base, now) {
  const before = dated(base);
  const after = dated(now);
  const same = (key) => JSON.stringify(before.get(key)?.what) === JSON.stringify(after.get(key)?.what);
  return [...new Set([...before.keys(), ...after.keys()])].filter((key) => !same(key)).map((key) => {
    const how = !before.has(key) ? 'new' : !after.has(key) ? 'removed' : 'changed';
    return { ...(after.get(key) ?? before.get(key)), how };
  }).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

const away = (n) => (n < 0 ? 'has passed' : n === 0 ? 'is today' : `is ${n} day${n === 1 ? '' : 's'} away`);

export const label = (d) => `${d.file}: ${d.how} ${d.day}${d.name ? ` for ${d.name}` : ''}`;

export function dateProblems(base, now, last, today) {
  const fresh = newDates(base, now);
  const found = [];
  for (const d of fresh) {
    if (d.day <= last) found.push(`${label(d)} is on or before ${last}, the last day in learn/played.json`);
    else if (gap(today, d.day) < SOONEST) found.push(`${label(d)} ${away(gap(today, d.day))}, and a date must be ${SOONEST} or more days ahead`);
  }
  if (fresh.length && gap(last, today) > SOONEST) found.push(`learn/played.json ends on ${last}; run node scripts/played.mjs to pin the days up to today`);
  return { fresh, problems: found };
}
