import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ENDPOINT = 'https://graph.mapillary.com';
const USER_AGENT = 'malmoemaps-build/1.0 (Lar dig Malmo, a daily map quiz; contact via repo)';
const MIN_INTERVAL_MS = 150;
const FIELDS = 'id,captured_at,compass_angle,computed_compass_angle,geometry,computed_geometry,is_pano,sequence,creator,width,height';

let lastRequest = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function token() {
  if (process.env.MAPILLARY_TOKEN) return process.env.MAPILLARY_TOKEN;
  if (existsSync('.env')) {
    const m = readFileSync('.env', 'utf8').match(/^MAPILLARY_TOKEN=["']?([^"'\s]+)/m);
    if (m) return m[1];
  }
  throw new Error('MAPILLARY_TOKEN is not set (environment or .env)');
}

async function get(path, params) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    const query = Object.entries({ ...params, access_token: token() })
      .map(([k, v]) => `${k}=${encodeURIComponent(v).replaceAll('%2C', ',')}`)
      .join('&');
    const res = await fetch(`${ENDPOINT}/${path}?${query}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    const text = await res.text();
    let json = {};
    try { json = JSON.parse(text); } catch {  }
    if (res.ok && !json.error) return json;
    if (attempt === 3) throw new Error(`Mapillary ${res.status} for ${path}: ${text.slice(0, 300)}`);
    await sleep(1500 * (attempt + 1));
  }
}

export async function imagesNear([lon, lat], radiusM, { cacheDir = 'data/cache/photos/mapillary' } = {}) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((x) => x.toFixed(6)).join(',');
  const key = createHash('sha1').update(bbox + FIELDS).digest('hex').slice(0, 16);
  const cacheFile = `${cacheDir}/near-${key}.json`;
  await mkdir(cacheDir, { recursive: true });
  try {
    return JSON.parse(await readFile(cacheFile, 'utf8'));
  } catch {  }
  let { data } = await get('images', { bbox, fields: FIELDS, limit: '2000' });
  if (!data.length) {
    await sleep(1000);
    ({ data } = await get('images', { bbox, fields: FIELDS, limit: '2000' }));
  }
  await writeFile(cacheFile, JSON.stringify(data));
  return data;
}

export async function thumbnail(id, { cacheDir = 'data/cache/photos/mapillary/thumbs', size = 1024 } = {}) {
  const file = `${cacheDir}/${id}-${size}.jpg`;
  await mkdir(cacheDir, { recursive: true });
  try {
    return await readFile(file);
  } catch {  }
  const meta = await get(id, { fields: `thumb_${size}_url` });
  const res = await fetch(meta[`thumb_${size}_url`], { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Mapillary thumbnail ${res.status} for ${id}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  return buf;
}

export const pageUrl = (id) => `https://www.mapillary.com/app/?pKey=${id}`;
