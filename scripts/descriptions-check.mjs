import { readFile, writeFile, readdir } from 'node:fs/promises';

const DIR = 'places/descriptions';
const MAX = 220;
const BANNED = ['bästa', 'mysig', 'populär', 'måste', 'perfekt', 'unik', 'fantastisk', 'härlig', 'charmig', 'älskad'];
const STOP = new Set(['Malmö', 'Malmös', 'Sverige', 'Sveriges', 'Skåne', 'Skånes']);

const fold = (s) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
const slug = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function tokens(text, name) {
  const own = new Set(name.split(/[\s&,.:'’-]+/).filter(Boolean));
  const out = [];
  for (const m of text.matchAll(/\d[\d\s]*\d|\d/g)) out.push(m[0].replace(/\s/g, ''));
  for (const sentence of text.split(/(?<=[.!?:;–—])\s+/)) {
    const words = sentence.split(/\s+/).slice(1);
    for (const w of words) {
      const word = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
      if (/^\p{Lu}/u.test(word) && !STOP.has(word) && !own.has(word)) out.push(word);
    }
  }
  return out;
}

function backed(token, quotes) {
  const q = fold(quotes.join(' ')).replace(/(?<=\d)[\s ](?=\d)/g, '');
  const t = fold(token);
  if (q.includes(t)) return true;
  if (/^\p{L}+$/u.test(token) && t.length > 5) return q.includes(t.slice(0, Math.max(5, t.length - 2)));
  return false;
}

export function check(entry, facts) {
  if (entry.text == null) return [];
  const reasons = [];
  const snippets = new Map(facts.snippets.map((s) => [s.id, s.text]));
  const quotes = [];
  for (const c of entry.claims ?? []) {
    const text = snippets.get(c.snippet);
    if (text == null) reasons.push(`no snippet "${c.snippet}"`);
    else if (!fold(text).includes(fold(c.quote ?? ''))) reasons.push(`quote not in ${c.snippet}: "${c.quote}"`);
    else quotes.push(c.quote);
  }
  if (!(entry.claims ?? []).length) reasons.push('no claims');
  if ((entry.claims ?? []).length && entry.claims.every((c) => c.snippet === 'research')) reasons.push('only the research snippet is quoted');
  for (const t of tokens(entry.text, entry.name)) if (!backed(t, quotes)) reasons.push(`"${t}" is in no quote`);
  if (entry.text.length > MAX) reasons.push(`${entry.text.length} characters`);
  if (/på kartan|i OpenStreetMap|enligt (egen |sin )?webbplats/i.test(entry.text)) reasons.push('says where a fact comes from instead of stating a fact about the place');
  for (const w of BANNED) if (new RegExp(`\\b${w}`, 'i').test(entry.text)) reasons.push(`banned word "${w}"`);
  return reasons;
}

async function main() {
  const batches = (await readdir(DIR)).filter((f) => /^[\w-]+\.json$/.test(f) && !/\.(check|verdict)\.json$/.test(f));
  let pass = 0, fail = 0, none = 0;
  for (const f of batches) {
    const entries = JSON.parse(await readFile(`${DIR}/${f}`, 'utf8'));
    const out = [];
    for (const e of entries) {
      const facts = JSON.parse(await readFile(`places/facts/${slug(e.name)}.json`, 'utf8'));
      const reasons = check(e, facts);
      if (e.text == null) none++;
      else if (reasons.length) fail++;
      else pass++;
      out.push({ name: e.name, text: e.text, ok: e.text != null && !reasons.length, reasons });
      if (reasons.length) console.log(`✗ ${e.name}: ${reasons.join('; ')}`);
    }
    await writeFile(`${DIR}/${f.replace(/\.json$/, '.check.json')}`, `${JSON.stringify(out, null, 2)}\n`);
  }
  console.log(`${pass} pass, ${fail} rejected, ${none} without text`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
