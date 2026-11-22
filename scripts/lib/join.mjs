export const SECTIONS = ['areas', 'streets', 'bridges', 'landmarks'];
const WIDTH = 79;

const nameOf = (entry) => (typeof entry === 'string' ? entry : entry.name);
const namesIn = (pending, section) => (pending[section] ?? []).map(nameOf);

export function pick(pending, sections, names) {
  const found = [];
  for (const section of sections) if (!SECTIONS.includes(section)) found.push(`${section} is not a section of learn/pending.json`);
  const waiting = new Set(SECTIONS.flatMap((s) => namesIn(pending, s)));
  for (const name of names) if (!waiting.has(name)) found.push(`${name} is not waiting in learn/pending.json`);
  if (!found.length && !sections.length && !names.length) found.push('name the sections to join, or the names with --names');
  if (found.length) throw new Error(found.join('\n'));
  const chosen = new Set([...names, ...sections.flatMap((s) => namesIn(pending, s))]);
  if (!chosen.size) throw new Error(`nothing waits in ${sections.join(', ')}`);
  return Object.fromEntries(SECTIONS.map((s) => [s, namesIn(pending, s).filter((n) => chosen.has(n))]).filter(([, list]) => list.length));
}

const TEXTS = {
  areas: { file: 'learn/about.json', of: (docs, name) => docs.about.areas[name], checked: true },
  streets: { file: 'learn/streets.json', of: (docs, name) => docs.streets.streets.find((s) => s.name === name), checked: true },
  bridges: { file: 'learn/bridges.json', of: (docs, name) => docs.bridges.bridges.find((b) => b.name === name), checked: true },
  landmarks: { file: 'learn/pending.json', of: (docs, name) => docs.pending.landmarks.find((p) => p.name === name), checked: false },
};

export function undescribed(picked, docs) {
  const found = [];
  for (const [section, names] of Object.entries(picked)) {
    const { file, of, checked } = TEXTS[section];
    for (const name of names) {
      const entry = of(docs, name);
      if (!(entry?.text ?? entry?.description)) found.push(`${name} has no description in ${file}`);
      else if (checked && entry.verified !== true) found.push(`${name}'s description in ${file} is not verified`);
    }
  }
  return found;
}

export function move({ core, pending, places }, picked, day) {
  const joining = Object.values(picked).flat();
  const leaving = new Set(joining);
  const since = { ...core.since, [day]: [...(core.since?.[day] ?? []), ...joining] };
  const coming = (pending.landmarks ?? []).filter((p) => leaving.has(p.name));
  return {
    core: {
      ...core,
      core: { ...core.core, ...Object.fromEntries(Object.entries(picked).map(([s, names]) => [s, [...(core.core[s] ?? []), ...names]])) },
      since: Object.fromEntries(Object.entries(since).sort(([a], [b]) => (a < b ? -1 : 1))),
    },
    pending: Object.fromEntries(Object.entries(pending).map(([s, list]) => [s, list.filter((e) => !leaving.has(nameOf(e)))])),
    places: coming.length ? { ...places, places: [...places.places, ...coming] } : places,
  };
}

function wrapped(names, indent) {
  const lines = [];
  names.forEach((name, i) => {
    const token = `${JSON.stringify(name)}${i < names.length - 1 ? ',' : ''}`;
    const line = lines.length ? `${lines.at(-1)} ${token}` : null;
    if (line && line.length <= WIDTH) lines[lines.length - 1] = line;
    else lines.push(`${indent}${token}`);
  });
  return lines.join('\n');
}

export function coreWritten(doc) {
  const list = ([key, names]) => `    ${JSON.stringify(key)}: ${names.length ? `[\n${wrapped(names, '      ')}\n    ]` : '[]'}`;
  const block = ([key, lists]) => `  ${JSON.stringify(key)}: ${Object.keys(lists).length ? `{\n${Object.entries(lists).map(list).join(',\n')}\n  }` : '{}'}`;
  return `{\n${Object.entries(doc).map(block).join(',\n')}\n}\n`;
}

export const pendingWritten = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

export const placesWritten = (doc) => `${JSON.stringify(doc, null, 1)}\n`;
