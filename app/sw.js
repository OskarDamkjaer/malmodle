const CODE = 'malmo-code';
const MAP = 'malmo-map-2';

const CODE_FILES = [
  '/',
  '/index.html',
  '/natt/',
  '/papper/',
  '/klar/',
  '/app.css',
  '/app.js',
  '/theme.js',
  '/themes.mjs',
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

async function missing(name, urls) {
  const cache = await caches.open(name);
  const found = await Promise.all(urls.map((url) => cache.match(url)));
  return urls.filter((_, i) => !found[i]);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const map = self.registration.active ? await missing(MAP, MAP_FILES) : [];
    await Promise.all([fillCache(CODE, CODE_FILES), fillCache(MAP, map)]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CODE && key !== MAP) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
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

  const isMap = url.pathname.endsWith('.pmtiles');

  event.respondWith((async () => {
    const hit = await caches.match(request, { ignoreSearch: true });
    if (hit && isMap) return hit;
    const update = fetch(request).then(async (res) => {
      if (res.ok) (await caches.open(isMap ? MAP : CODE)).put(request, res.clone());
      return res;
    });

    if (hit) {
      event.waitUntil(update.catch(() => {}));
      return hit;
    }

    try {
      return await update;
    } catch (err) {
      if (request.mode === 'navigate') {
        const shell = await caches.match('/index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
