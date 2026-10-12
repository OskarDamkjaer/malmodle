import { readFile, writeFile, readdir } from 'node:fs/promises';

const DIR = 'places/factcheck';

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const indentOf = (text) => /\n( +)/.exec(text)?.[1].length ?? 2;

async function rewrite(file, update) {
  const text = await readFile(file, 'utf8');
  const doc = JSON.parse(text);
  const before = JSON.stringify(doc);
  update(doc);
  if (JSON.stringify(doc) === before) return;
  if (file === 'learn/streets.json') {
    const line = (e) => `{ ${Object.entries(e).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
    const byName = new Map(doc.streets.map((e) => [e.name, e]));
    await writeFile(file, text.replace(/^( *)(\{ "name": ("[^"]*").*\})(,?)$/gm, (m, pad, _, name, comma) => `${pad}${line(byName.get(JSON.parse(name)))}${comma}`));
  } else {
    const out = JSON.stringify(doc, null, indentOf(text));
    const flat = !/\["[^"\n]*"[,\]]/.test(text) ? out : out.replace(/\[\n\s+("[^"\n]*"(?:,\n\s+"[^"\n]*")*)\n\s+\]/g, (m, items) => `[${items.split(/,\n\s+/).join(', ')}]`);
    await writeFile(file, `${flat}\n`);
  }
}

function problems(text) {
  const found = [];
  if (text.length > 220) found.push(`${text.length} tecken`);
  if (/;/.test(text)) found.push('semikolon');
  if (/\s[–—]\s|—/.test(text)) found.push('tankstreck');
  return found;
}

async function main() {
  const files = (await readdir(DIR)).filter((f) => /^out-\d+\.json$/.test(f));
  const batches = (await readdir(DIR)).filter((f) => /^batch-\d+\.json$/.test(f));
  const kinds = new Map();
  for (const f of batches) for (const e of await json(`${DIR}/${f}`)) kinds.set(e.name, e);
  const results = new Map();
  for (const f of files) for (const r of await json(`${DIR}/${f}`)) results.set(r.name, r);

  const counts = { ok: 0, fix: 0, remove: 0 };
  const warnings = [];
  const missing = [...kinds.keys()].filter((n) => !results.has(n));
  const result = (name, kind) => {
    const r = results.get(name);
    if (!r || kinds.get(name)?.kind !== kind) return null;
    const old = kinds.get(name);
    const text = r.verdict === 'remove' ? null : r.verdict === 'fix' ? r.text : r.text ?? old?.text ?? null;
    const source = r.verdict === 'remove' ? null : r.source ?? old?.source ?? null;
    if (text) for (const p of problems(text)) warnings.push(`${name}: ${p}`);
    counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
    return { text, source, verified: r.verdict !== 'remove' };
  };
  const set = (kind) => (entry) => {
    const r = result(entry.name, kind);
    if (!r) return;
    entry.description = r.text;
    entry.source = r.source;
    if ('verified' in entry) entry.verified = r.verified;
  };

  await rewrite('places/places.json', (doc) => { doc.places.forEach(set('landmark')); });
  await rewrite('learn/streets.json', (doc) => { doc.streets.forEach(set('street')); });
  await rewrite('learn/bridges.json', (doc) => { doc.bridges.forEach(set('bridge')); });
  await rewrite('learn/about.json', (doc) => {
    for (const [name, area] of Object.entries(doc.areas)) {
      const r = result(name, 'area');
      if (r) Object.assign(area, r);
    }
  });

  console.log(`${counts.ok} ok, ${counts.fix} fixed, ${counts.remove} removed`);
  if (missing.length) console.log(`not checked yet (${missing.length}): ${missing.join(', ')}`);
  for (const w of warnings) console.log(`check: ${w}`);
}

await main();
