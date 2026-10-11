import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const USER_AGENT = 'malmoemaps-build/1.0 (Lar dig Malmo, a daily map quiz; https://github.com/OskarDamkjaer)';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const OSM = 'https://api.openstreetmap.org/api/0.6';
const CACHE = 'data/cache/photos/commons';
const MIN_INTERVAL_MS = { [COMMONS]: 200, [WIKIDATA]: 200, [OSM]: 1100 };

const last = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cached(base, params) {
  const url = `${base}${params}`;
  const key = createHash('sha1').update(url).digest('hex').slice(0, 16);
  const file = `${CACHE}/${key}.json`;
  await mkdir(CACHE, { recursive: true });
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {  }
  for (let attempt = 0; ; attempt++) {
    const wait = (last[base] ?? 0) + (MIN_INTERVAL_MS[base] ?? 200) - Date.now();
    if (wait > 0) await sleep(wait);
    last[base] = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.status === 404 || res.status === 410) {
      await writeFile(file, 'null');
      return null;
    }
    const json = res.ok ? await res.json().catch(() => null) : null;
    if (json && !json.error) {
      await writeFile(file, JSON.stringify(json));
      return json;
    }
    if (attempt === 5) throw new Error(`${res.status} ${json?.error?.info ?? ''} for ${url}`);
    await sleep(json?.error?.code === 'maxlag' ? 6000 : 2000 * (attempt + 1));
  }
}

const api = (base, params) => cached(base, `?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`);

export async function osmTags(ref) {
  const json = await cached(OSM, `/${ref}.json`);
  return json?.elements?.find((e) => `${e.type}/${e.id}` === ref)?.tags ?? {};
}

export async function osmWikidata(ref) {
  return (await osmTags(ref)).wikidata ?? null;
}

export async function osmPhotos(ref) {
  const tags = await osmTags(ref);
  const out = { files: [], category: null };
  for (const value of [tags.wikimedia_commons, tags.image]) {
    if (!value) continue;
    const file = /(?:^|\/wiki\/)(File:[^?#]+)/.exec(decodeURIComponent(value).replaceAll('_', ' '));
    const category = /(?:^|\/wiki\/)Category:([^?#]+)/.exec(decodeURIComponent(value).replaceAll('_', ' '));
    if (file) out.files.push(file[1]);
    if (category) out.category ??= category[1];
  }
  return out;
}

export async function searchFiles(query, limit = 40) {
  const json = await api(COMMONS, { action: 'query', list: 'search', srsearch: `${query} filetype:bitmap`, srnamespace: '6', srlimit: String(limit) });
  return files((json?.query?.search ?? []).map((s) => s.title));
}

export async function wikipediaQid(pageUrl) {
  const m = /^https:\/\/([a-z]+)\.wikipedia\.org\/wiki\/(.+)$/.exec(pageUrl ?? '');
  if (!m) return null;
  const json = await api(`https://${m[1]}.wikipedia.org/w/api.php`, { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', titles: decodeURIComponent(m[2]).replaceAll('_', ' ') });
  return json?.query?.pages?.[0]?.pageprops?.wikibase_item ?? null;
}

export async function wikidataClaims(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 50) {
    const json = await api(WIKIDATA, { action: 'wbgetentities', ids: qids.slice(i, i + 50).join('|'), props: 'claims|sitelinks' });
    for (const [id, e] of Object.entries(json.entities ?? {})) {
      const value = (p) => e.claims?.[p]?.[0]?.mainsnak?.datavalue?.value ?? null;
      out[id] = { image: value('P18'), category: value('P373'), commonswiki: e.sitelinks?.commonswiki?.title ?? null };
    }
  }
  return out;
}

const FILE_PROPS = {
  prop: 'imageinfo|coordinates',
  iiprop: 'url|size|mime|extmetadata',
  iiurlwidth: '800',
  iiextmetadatafilter: 'LicenseShortName|Artist|DateTimeOriginal|ObjectName',
  colimit: 'max',
};

function pages(json) {
  return json?.query?.pages ?? [];
}

export async function files(titles) {
  const out = [];
  const full = titles.map((t) => (t.startsWith('File:') ? t : `File:${t}`));
  for (let i = 0; i < full.length; i += 50) {
    out.push(...pages(await api(COMMONS, { action: 'query', titles: full.slice(i, i + 50).join('|'), ...FILE_PROPS })));
  }
  return out;
}

export async function categoryFiles(category, limit = 500) {
  const json = await api(COMMONS, { action: 'query', list: 'categorymembers', cmtitle: `Category:${category}`, cmtype: 'file', cmlimit: String(limit) });
  return files((json?.query?.categorymembers ?? []).map((m) => m.title));
}

export async function filesNear([lon, lat], radiusM = 100, keep = () => true) {
  const json = await api(COMMONS, {
    action: 'query', list: 'geosearch', gscoord: `${lat}|${lon}`, gsradius: String(radiusM), gsnamespace: '6', gslimit: '500',
  });
  return files((json?.query?.geosearch ?? []).filter((g) => keep([g.lon, g.lat])).map((g) => g.title));
}

const text = (html) => (html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export function isFreeLicence(name) {
  const n = (name ?? '').toLowerCase();
  if (/\b(nc|nd)\b|non-?commercial|no-?deriv/.test(n)) return false;
  return /^(cc0|cc[ -]by(-sa)?[ -][\d.]+|public domain|pd\b|pd-)/.test(n);
}

export function toPhoto(page) {
  const info = page.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  const year = Number(/\b(1[89]\d\d|20\d\d)\b/.exec(text(meta.DateTimeOriginal?.value))?.[1]) || null;
  const coord = page.coordinates?.find((c) => c.primary) ?? page.coordinates?.[0];
  return {
    id: page.title,
    title: page.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
    point: coord ? [coord.lon, coord.lat] : null,
    heading: null,
    captured: /^\d{4}-\d\d-\d\d/.exec(text(meta.DateTimeOriginal?.value))?.[0] ?? (year ? String(year) : null),
    year,
    author: text(meta.Artist?.value).slice(0, 80) || null,
    licence: text(meta.LicenseShortName?.value),
    url: info.descriptionurl,
    thumb: info.thumburl,
    width: info.width,
    height: info.height,
    mime: info.mime,
  };
}

export function usable(photo) {
  return photo
    && isFreeLicence(photo.licence)
    && /^image\/(jpeg|png|webp)$/.test(photo.mime)
    && Math.max(photo.width, photo.height) >= 1000;
}

export function rank(photos) {
  const era = (p) => (p.year >= 2021 ? 2 : p.year >= 2018 ? 1 : 0);
  return [...photos].sort((a, b) => era(b) - era(a) || (b.point ? 1 : 0) - (a.point ? 1 : 0) || (b.year ?? 0) - (a.year ?? 0));
}
