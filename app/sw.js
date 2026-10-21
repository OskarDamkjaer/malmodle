const CODE = 'malmo-code';
const MAP = 'malmo-map';

const CODE_FILES = [
  '/',
  '/app.css',
  '/app.js',
  '/palette.mjs',
  '/map.js',
  '/geo.mjs',
  '/daily.mjs',
  '/crowd.mjs',
  '/crowd-view.js',
  '/questions.mjs',
  '/tiles.mjs',
  '/manifest.webmanifest',
  '/style.json',
  '/data/quiz.json',
  '/vendor/maplibre-gl.css',
  '/vendor/maplibre-gl.mjs',
  '/vendor/maplibre-gl-shared.mjs',
  '/vendor/maplibre-gl-worker.mjs',
  '/vendor/pmtiles.js',
  '/sprite/osm-liberty.json',
  '/sprite/osm-liberty.png',
  '/sprite/osm-liberty@2x.json',
  '/sprite/osm-liberty@2x.png',
  '/icons/icon.svg',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  ...['Roboto Regular', 'Roboto Medium', 'Roboto Condensed Italic'].flatMap((font) => [
    '0-255', '256-511', '8192-8447',
  ].map((range) => `/glyphs/${encodeURIComponent(font)}/${range}.pbf`)),
];

const MAP_FILES = ['/malmo.pmtiles'];
const STEADY = 'malmo-steady';

async function fillCache(name, urls) {
  const cache = await caches.open(name);
  const results = await Promise.allSettled(urls.map(async (url) => {
    const res = await fetch(url, { cache: 'reload' });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    await cache.put(url, res);
  }));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) console.warn(`sw: ${failed.length} of ${urls.length} failed`, failed.map((f) => f.reason?.message));
}

async function ranged(request, res) {
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('Range') ?? '');
  if (!range) return res;
  const body = await res.blob();
  const start = Number(range[1]);
  const end = range[2] ? Math.min(Number(range[2]), body.size - 1) : body.size - 1;
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${body.size}` } });
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${body.size}`,
    },
  });
}

async function missing(name, urls) {
  const cache = await caches.open(name);
  const found = await Promise.all(urls.map((url) => cache.match(url)));
  return urls.filter((_, i) => !found[i]);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const map = self.registration.active ? await missing(MAP, MAP_FILES) : [];
    await Promise.all([fillCache(CODE, CODE_FILES), fillCache(MAP, map)]);
    if (!self.registration.active || !(await caches.has(STEADY))) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  const activated = (async () => {
    const keys = await caches.keys();
    const takeover = !keys.includes(STEADY) && keys.some((key) => key.startsWith('malmo-code') && key !== CODE);
    for (const key of keys) {
      if (![CODE, MAP, STEADY].includes(key)) await caches.delete(key);
    }
    await caches.open(STEADY);
    await self.clients.claim();
    return takeover;
  })();
  event.waitUntil(activated);
  activated.then(async (takeover) => {
    if (!takeover) return;
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url).catch(() => {});
  });
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  const { url, file } = event.data ?? {};
  if (!MAP_FILES.includes(url) || !(file instanceof Blob)) return;
  event.waitUntil((async () => {
    const res = new Response(file, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(file.size) } });
    await (await caches.open(MAP)).put(url, res);
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/live/')) return;

  event.respondWith((async () => {
    const cache = await caches.open(url.pathname.endsWith('.pmtiles') ? MAP : CODE);
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return ranged(request, hit);
    try {
      const res = await fetch(request);
      if (res.ok) {
        const copy = res.clone();
        event.waitUntil(cache.put(request, copy).catch(() => {}));
      }
      return res;
    } catch (err) {
      if (request.mode === 'navigate') {
        const shell = await (await caches.open(CODE)).match('/');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
