import { readFile, writeFile, readdir } from 'node:fs/promises';

const DIR = 'places/descriptions';

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const indentOf = (text) => /\n( +)/.exec(text)?.[1].length ?? 2;
const exists = (file) => readFile(file).then(() => true, () => false);

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
    await writeFile(file, `${JSON.stringify(doc, null, indentOf(text))}\n`);
  }
}

async function main() {
  const passed = new Map();
  const tried = new Set();
  for (const f of (await readdir(DIR)).filter((f) => /^[\w-]+\.json$/.test(f) && !/\.(check|verdict)\.json$/.test(f))) {
    const base = f.replace(/\.json$/, '');
    const entries = await json(`${DIR}/${f}`);
    const checks = new Map((await exists(`${DIR}/${base}.check.json`) ? await json(`${DIR}/${base}.check.json`) : []).map((c) => [c.name, c]));
    const verdicts = new Map((await exists(`${DIR}/${base}.verdict.json`) ? await json(`${DIR}/${base}.verdict.json`) : []).map((v) => [v.name, v]));
    for (const e of entries) {
      tried.add(e.name);
      if (checks.get(e.name)?.ok && verdicts.get(e.name)?.verdict === 'supported') passed.set(e.name, e);
    }
  }

  const coreDoc = await json('learn/core.json');
  const counts = {};
  const tally = (kind, ok) => { counts[kind] ??= [0, 0]; counts[kind][ok ? 0 : 1]++; };
  const apply = (entry, name, field, verifiedField) => {
    if (!tried.has(name)) return;
    const e = passed.get(name);
    if (!e && entry[field] == null) return false;
    entry[field] = e?.text ?? null;
    entry.source = e?.source ?? null;
    if (verifiedField) entry.verified = Boolean(e);
    return Boolean(e);
  };

  await rewrite('places/places.json', (doc) => { for (const p of doc.places) if (tried.has(p.name)) tally('places', apply(p, p.name, 'description')); });
  await rewrite('learn/streets.json', (doc) => { for (const s of doc.streets) if (tried.has(s.name)) tally('streets', apply(s, s.name, 'description', 'verified' in s)); });
  await rewrite('learn/bridges.json', (doc) => { for (const b of doc.bridges) if (tried.has(b.name)) tally('bridges', apply(b, b.name, 'description', 'verified' in b)); });
  await rewrite('learn/about.json', (doc) => {
    const core = new Set(coreDoc.core.areas);
    for (const name of tried) {
      if (!core.has(name)) continue;
      const e = passed.get(name);
      if (!e && doc.areas[name]?.text == null) { tally('areas', false); continue; }
      doc.areas[name] = { text: e?.text ?? null, source: e?.source ?? null, verified: Boolean(e) };
      tally('areas', Boolean(e));
    }
  });
  for (const [kind, [ok, no]] of Object.entries(counts)) console.log(`${kind.padEnd(8)} ${ok} with a description, ${no} without`);
}

await main();
