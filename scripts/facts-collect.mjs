import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const USER_AGENT = 'malmoemaps-build/1.0 (Lar dig Malmo, a daily map quiz; https://github.com/OskarDamkjaer)';
const CACHE = 'data/cache/facts';
const OUT = 'places/facts';
const CAP = 3000;
const OSM_KEYS = ['start_date', 'architect', 'cuisine', 'heritage', 'building', 'operator', 'description', 'amenity', 'shop', 'tourism', 'leisure', 'historic', 'sport', 'brand'];
const WIKIDATA_PROPS = { P31: 'instance of', P571: 'inception', P1619: 'opening', P576: 'dissolved', P84: 'architect', P1435: 'heritage designation', P138: 'named after', P149: 'architectural style', P2048: 'height' };

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let lastFetch = 0;
async function fetchCached(url, as = 'json') {
  const file = `${CACHE}/${createHash('sha1').update(url).digest('hex').slice(0, 16)}.${as === 'json' ? 'json' : 'txt'}`;
  try {
    const text = await readFile(file, 'utf8');
    return as === 'json' ? JSON.parse(text) : text;
  } catch {}
  const wait = lastFetch + 250 - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();
  let body = null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
    if (res.ok) body = as === 'json' ? await res.json() : await res.text();
  } catch {}
  if (body != null) await writeFile(file, as === 'json' ? JSON.stringify(body) : body);
  return body;
}

function decode(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aring: 'å', Aring: 'Å', auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', eacute: 'é', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n] ?? m);
}

function htmlText(html) {
  return decode(html
    .replace(/<(script|style|noscript|svg|nav|header|footer|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 30).join('\n');
}

function wikiText(markup) {
  return markup
    .replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\S+ ([^\]]*)\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ').trim();
}

const cap = (text) => (text.length > CAP ? `${text.slice(0, CAP)}…` : text);

function wikiPage(url) {
  const m = /^https:\/\/([a-z]+)\.wikipedia\.org\/wiki\/(.+)$/.exec(url ?? '');
  return m ? { lang: m[1], title: decodeURIComponent(m[2]).replaceAll('_', ' ') } : null;
}

async function intro({ lang, title }, cached) {
  const key = title.replaceAll(' ', '_');
  if (lang === 'sv' && cached[key]) return { text: cached[key], title };
  const api = `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'extracts|pageprops', exintro: '1', explaintext: '1', redirects: '1', titles: title })}`;
  const page = (await fetchCached(api))?.query?.pages?.[0];
  if (!page || page.missing || !page.extract) return null;
  return { text: page.extract, title: page.title, qid: page.pageprops?.wikibase_item };
}

async function guessIntro(name) {
  const stem = name.toLowerCase().replace(/et$/, '');
  for (const title of [name, `${name}, Malmö`, `${name} (Malmö)`, `${name}, Malmö kommun`, `Malmö ${stem}`]) {
    const got = await intro({ lang: 'sv', title }, {});
    if (got && /Malmö/.test(got.text) && !/kan syfta på|kan avse/.test(got.text)) return got;
  }
  const stems = name.split(/[\s,&]+/).filter((w) => w.length > 3).map((w) => fold(w).replace(/(et|en|s)$/, ''));
  const api = `https://sv.wikipedia.org/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', list: 'search', srsearch: `${name} Malmö`, srlimit: '5' })}`;
  for (const hit of (await fetchCached(api))?.query?.search ?? []) {
    if (!stems.length || !stems.every((s) => fold(hit.title).includes(s))) continue;
    const got = await intro({ lang: 'sv', title: hit.title }, {});
    if (got && /Malmö|Limhamn/.test(got.text) && !/kan syfta på|kan avse/.test(got.text)) return got;
  }
  return null;
}

async function osmApiTags(ref) {
  const doc = await fetchCached(`https://api.openstreetmap.org/api/0.6/${ref}.json`);
  return doc?.elements?.find((e) => `${e.type}/${e.id}` === ref)?.tags ?? {};
}

async function wikidata(qid) {
  const url = `https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: qid, props: 'claims|sitelinks|labels', languages: 'sv|en' })}`;
  return (await fetchCached(url))?.entities?.[qid] ?? null;
}

async function labels(ids) {
  if (!ids.length) return {};
  const url = `https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: ids.join('|'), props: 'labels', languages: 'sv|en' })}`;
  const entities = (await fetchCached(url))?.entities ?? {};
  return Object.fromEntries(Object.entries(entities).map(([id, e]) => [id, e.labels?.sv?.value ?? e.labels?.en?.value ?? null]));
}

async function wikidataFacts(entity) {
  const lines = [];
  const items = [];
  for (const [p, label] of Object.entries(WIKIDATA_PROPS)) {
    for (const claim of entity.claims?.[p] ?? []) {
      const v = claim.mainsnak?.datavalue?.value;
      if (v?.id) items.push(v.id);
    }
  }
  const names = await labels([...new Set(items)].slice(0, 50));
  for (const [p, label] of Object.entries(WIKIDATA_PROPS)) {
    const values = (entity.claims?.[p] ?? []).map((claim) => {
      const v = claim.mainsnak?.datavalue?.value;
      if (v == null) return null;
      if (v.id) return names[v.id];
      if (v.time) return v.time.slice(1, v.precision >= 11 ? 11 : v.precision === 10 ? 8 : 5).replace(/-00(-00)?$/, '');
      if (v.amount) return `${Number(v.amount)} m`;
      return typeof v === 'string' ? v : null;
    }).filter(Boolean);
    if (values.length) lines.push(`${label}: ${[...new Set(values)].join(', ')}`);
  }
  return lines.join('\n');
}

function voyageListings(wikitext, name) {
  const target = fold(name);
  const out = [];
  for (const m of wikitext.matchAll(/\{\{\s*(?:listing|see|do|eat|drink|buy|sleep|se|gör|ät|drick|köp|sov)\b([\s\S]*?)\}\}/gi)) {
    const fields = Object.fromEntries(m[1].split(/\n?\s*\|\s*/).map((f) => f.split(/=(.*)/s)).filter((f) => f.length > 1).map(([k, v]) => [k.trim().toLowerCase(), v.trim()]));
    const n = fields.name ?? fields.namn ?? '';
    if (n && (fold(n) === target || fold(n).includes(target) || target.includes(fold(n)))) {
      const text = wikiText(fields.content ?? fields.beskrivning ?? fields.innehåll ?? '');
      if (text) out.push(`${n}: ${text}`);
    }
  }
  for (const line of wikitext.split('\n')) {
    if (/^\*/.test(line) && fold(line).includes(`'''${target}'''`)) out.push(wikiText(line.replace(/^\*+/, '')));
  }
  return out.join('\n');
}

async function firstSeen(ref) {
  const [type, id] = ref.split('/');
  try {
    const h = await json(`data/cache/places/history/${type}-${id}.json`);
    const years = h.elements.map((e) => e.timestamp?.slice(0, 4)).filter(Boolean).sort();
    return years[0] ?? null;
  } catch {
    return null;
  }
}

async function website(url) {
  const home = await fetchCached(url, 'text');
  if (!home) return null;
  const links = [...home.matchAll(/href="([^"#]+)"[^>]*>([^<]{0,40})</gi)];
  const about = links.find(([, href, label]) => /\b(om oss|om |about|historia|history)/i.test(label) || /\/(om|om-oss|about|about-us|historia|history)\/?$/i.test(href));
  const texts = [htmlText(home)];
  if (about) {
    try {
      const page = await fetchCached(new URL(about[1], url).href, 'text');
      if (page) texts.unshift(htmlText(page));
    } catch {}
  }
  return cap(texts.join('\n'));
}

function whiteGuide(doc, name) {
  const target = fold(name);
  const hits = doc.data
    .filter((r) => fold(decode(r.attributes?.title ?? '')).replace(/^\d{4}\s*–\s*/, '').trim() === target)
    .sort((a, b) => b.attributes.title.localeCompare(a.attributes.title));
  const r = hits[0];
  if (!r) return null;
  return { text: cap(htmlText(r.attributes.description ?? '').replace(/\n/g, ' ')), source: r.links?.self ?? r.attributes?.url ?? 'https://whiteguide.com' };
}

async function main() {
  const only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',').map((s) => s.trim())) : null;
  await mkdir(CACHE, { recursive: true });
  await mkdir(OUT, { recursive: true });
  const [core, places, sources, intros, overpass, voyageSv, voyageEn, konst, wg] = await Promise.all([
    json('learn/core.json'), json('places/places.json'), json('learn/sources.json'), json('data/cache/places/wikipedia-intros.json'),
    json('data/cache/places/overpass.json'), json('data/cache/places/wikivoyage-sv.json'), json('data/cache/places/wikivoyage-en.json'),
    json('data/cache/places/malmo-konst.geojson'), json('data/cache/places/whiteguide.json'),
  ]);
  const research = new Map();
  for (const f of (await readdir('places/research')).filter((f) => f.endsWith('.json'))) {
    const doc = await json(`places/research/${f}`);
    for (const r of [...(doc.core ?? []), ...(doc.everything ?? [])]) if (r.why) research.set(r.name, r.why);
  }
  const osm = new Map(overpass.elements.map((e) => [`${e.type}/${e.id}`, e.tags ?? {}]));
  const placeByName = new Map(places.places.map((p) => [p.name, p]));
  const kinds = { areas: 'area', streets: 'street', bridges: 'bridge', landmarks: 'landmark' };
  const targets = Object.entries(core.core).flatMap(([k, names]) => names.map((name) => ({ name, kind: kinds[k] })));

  let thin = 0;
  for (const { name, kind } of targets) {
    if (only && !only.has(name)) continue;
    const place = kind === 'landmark' ? placeByName.get(name) : null;
    const snippets = [];
    const add = (id, source, text) => { if (text && text.trim()) snippets.push({ id, source, text: text.trim() }); };

    const refs = place?.osm ?? [];
    const tags = Object.assign({}, ...(await Promise.all(refs.map(async (r) => osm.get(r) ?? await osmApiTags(r)))));
    let qid = tags.wikidata ?? /\bQ\d{3,}\b/.exec(place?.why ?? '')?.[0] ?? null;
    let page = wikiPage(sources.sources[name]) ?? wikiPage(place?.wikipedia);
    if (!page && tags.wikipedia) {
      const [lang, ...rest] = tags.wikipedia.split(':');
      page = { lang, title: rest.join(':') };
    }
    let entity = qid ? await wikidata(qid) : null;
    if (!page && entity) {
      const sv = entity.sitelinks?.svwiki?.title;
      const en = entity.sitelinks?.enwiki?.title;
      page = sv ? { lang: 'sv', title: sv } : en ? { lang: 'en', title: en } : null;
    }
    if (!page) {
      const got = await guessIntro(name);
      if (got) page = { lang: 'sv', title: got.title };
    }
    if (page) {
      const got = await intro(page, intros);
      if (got) {
        add(`wp-${page.lang}`, `https://${page.lang}.wikipedia.org/wiki/${encodeURIComponent(got.title.replaceAll(' ', '_'))}`, cap(got.text));
        if (!qid && got.qid) { qid = got.qid; entity = await wikidata(qid); }
      }
      if (page.lang === 'en' && entity?.sitelinks?.svwiki) {
        const sv = await intro({ lang: 'sv', title: entity.sitelinks.svwiki.title }, intros);
        if (sv) snippets.unshift({ id: 'wp-sv', source: `https://sv.wikipedia.org/wiki/${encodeURIComponent(sv.title.replaceAll(' ', '_'))}`, text: cap(sv.text) });
      }
    }

    add('wikivoyage-sv', 'https://sv.wikivoyage.org/wiki/Malmö', voyageListings(voyageSv.parse.wikitext, name));
    add('wikivoyage-en', 'https://en.wikivoyage.org/wiki/Malmö', voyageListings(voyageEn.parse.wikitext, name));
    if (entity) add('wikidata', `https://www.wikidata.org/wiki/${qid}`, await wikidataFacts(entity));
    const osmLines = OSM_KEYS.filter((k) => tags[k]).map((k) => `${k}: ${tags[k]}`);
    if (refs.length) add('osm', `https://www.openstreetmap.org/${refs[0]}`, osmLines.join('\n'));

    const art = konst.features.map((f) => f.properties).find((p) => p.title && fold(p.title) === fold(name));
    if (art) add('konst', 'https://malmo.se/konst', [`title: ${art.title}`, art.creator && `artist: ${art.creator}`, art.created && `year: ${art.created}`].filter(Boolean).join('\n'));

    if (place && ['krog', 'kafe'].includes(place.category)) {
      const years = (await Promise.all(refs.map(firstSeen))).filter(Boolean).sort();
      if (years[0]) add('osm-history', `https://www.openstreetmap.org/${refs[0]}/history`, `first seen in OpenStreetMap: ${years[0]}`);
      const guide = whiteGuide(wg, name);
      if (guide) add('whiteguide', guide.source, guide.text);
    }

    for (const url of (place?.why ?? '').match(/https?:\/\/\S+/g) ?? []) {
      const page = await fetchCached(url.replace(/[).,;]+$/, ''), 'text');
      if (page) add(`web-${snippets.filter((s) => s.id.startsWith('web')).length + 1}`, url, cap(htmlText(page)));
    }
    if (tags.website) {
      const text = await website(tags.website);
      if (text) add('website', tags.website, text);
    }
    const why = place?.why ?? research.get(name);
    if (why) add('research', 'places/research', why);

    const isThin = !snippets.some((s) => /^(wp-|wikivoyage|web|website|whiteguide)/.test(s.id));
    if (isThin) thin++;
    const commons = entity?.claims?.P373?.[0]?.mainsnak?.datavalue?.value ?? null;
    const doc = { name, kind, ...(place && { category: place.category }), thin: isThin, ...(commons && { commons }), snippets };
    await writeFile(`${OUT}/${slug(name)}.json`, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`${isThin ? 'thin ' : '     '} ${kind.padEnd(8)} ${name}: ${snippets.map((s) => s.id).join(', ')}`);
  }
  console.log(`${thin} thin`);
}

await main();
