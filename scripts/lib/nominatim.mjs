import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'malmoemaps-build/1.0 (Malmökoll, a daily map quiz; contact via repo)';
const MIN_INTERVAL_MS = 1100;

let lastRequest = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
}

export async function geocode(query, { viewbox, cacheDir = 'data/cache/nominatim', refresh = false, limit = 5 } = {}) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: String(limit),
    addressdetails: '1',
  });
  if (viewbox) {
    params.set('viewbox', viewbox.join(','));
    params.set('bounded', '1');
  }

  const key = createHash('sha1').update(params.toString()).digest('hex').slice(0, 16);
  const cacheFile = `${cacheDir}/${key}.json`;
  await mkdir(cacheDir, { recursive: true });

  if (!refresh) {
    try {
      return JSON.parse(await readFile(cacheFile, 'utf8'));
    } catch {  }
  }

  await throttle();
  const res = await fetch(`${ENDPOINT}?${params}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'sv' },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status} ${res.statusText} for "${query}"`);
  const json = await res.json();
  await writeFile(cacheFile, JSON.stringify(json));
  return json;
}
