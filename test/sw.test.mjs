import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stampWorker } from '../scripts/lib/stamp.mjs';

const ORIGIN = 'https://malmodle.se';
const OLD = 'malmo-code-000000000000';
const NEW = 'malmo-code-111111111111';
const source = (code) => stampWorker(readFileSync('app/sw.js', 'utf8'), code.replace('malmo-code-', ''), '222222222222');

function worker({ code = OLD, online = true, full = false, active = false, pages = {}, store = new Map() } = {}) {
  const keyOf = (req) => new URL(typeof req === 'string' ? req : req.url, ORIGIN).pathname;
  const open = async (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const cache = store.get(name);
    return {
      put: async (req, res) => {
        if (full) throw new Error('QuotaExceededError');
        cache.set(keyOf(req), res);
      },
      match: async (req) => cache.get(keyOf(req))?.clone(),
    };
  };
  const caches = {
    open,
    has: async (name) => store.has(name),
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
  };
  const fetched = [];
  const fetch = async (req) => {
    const path = keyOf(req);
    fetched.push(path);
    if (!online) throw new TypeError('offline');
    if (path === '/index.html') return new Response(null, { status: 307, headers: { Location: '/' } });
    return new Response(pages[path] ?? 'fresh');
  };
  const listeners = {};
  const skipped = [];
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    registration: { active: active ? {} : null },
    skipWaiting: async () => { skipped.push(true); },
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(source(code), { self, caches, fetch, Response, Blob, URL, console, Promise, location: new URL(ORIGIN) });

  const dispatch = async (type, event) => {
    const waits = [];
    let answer;
    listeners[type]({ ...event, waitUntil: (p) => waits.push(p), respondWith: (p) => { answer = p; } });
    const res = await answer;
    for (let i = 0; i < waits.length; i++) await waits[i];
    return res;
  };

  return {
    fetched,
    skipped,
    store,
    async seed(entries, name = code) {
      const cache = await open(name);
      for (const [path, body] of Object.entries(entries)) await cache.put(path, new Response(body));
    },
    navigate: (path, mode = 'navigate') => dispatch('fetch', { request: { method: 'GET', mode, url: ORIGIN + path } }),
    async cachedText(path, name = code) {
      return (await (await open(name)).match(path))?.text();
    },
    install: () => dispatch('install', {}),
    activate: () => dispatch('activate', {}),
    message: (data) => dispatch('message', { data }),
  };
}

test('a page load offline falls back to the cached page, then to the start page', async () => {
  const sw = worker({ online: false });
  await sw.seed({ '/': 'start', '/natt/': 'night' });
  assert.equal(await (await sw.navigate('/natt/?x=1')).text(), 'night');
  assert.equal(await (await sw.navigate('/papper/')).text(), 'start');
});

test('a page load offline with nothing cached fails instead of hanging', async () => {
  const sw = worker({ online: false });
  await assert.rejects(sw.navigate('/'));
});

test('the worker caches the start page itself, not a redirect to it', async () => {
  const sw = worker();
  await sw.install();
  assert.ok(sw.fetched.includes('/'));
  assert.ok(!sw.fetched.includes('/index.html'));
});

test('a page and its code come from this version, without asking the network', async () => {
  const sw = worker({ pages: { '/': 'new start', '/app.js': 'new code' } });
  await sw.seed({ '/': 'old start', '/app.js': 'old code' });
  assert.equal(await (await sw.navigate('/')).text(), 'old start');
  assert.equal(await (await sw.navigate('/app.js', 'script')).text(), 'old code');
  assert.deepEqual(sw.fetched, []);
});

test('a worker never answers from the cache of another version', async () => {
  const sw = worker({ pages: { '/app.js': 'network code' } });
  await sw.seed({ '/': 'old start' });
  await sw.seed({ '/app.js': 'next code' }, NEW);
  assert.equal(await (await sw.navigate('/app.js', 'script')).text(), 'network code');
  assert.equal(await sw.cachedText('/app.js'), 'network code');
  assert.equal(await sw.cachedText('/app.js', NEW), 'next code');
});

test('a full cache does not stop the answer from the network', async () => {
  const sw = worker({ full: true, pages: { '/malmo.pmtiles': 'tiles' } });
  assert.equal(await (await sw.navigate('/malmo.pmtiles', 'cors')).text(), 'tiles');
});

test('the first worker takes over at once', async () => {
  const sw = worker();
  await sw.install();
  assert.equal(sw.skipped.length, 1);
});

test('a new version waits for the page to ask for it', async () => {
  const store = new Map();
  const old = worker({ store });
  await old.install();
  await old.activate();
  const next = worker({ code: NEW, active: true, store });
  await next.install();
  assert.equal(next.skipped.length, 0);
  await next.message('skip');
  assert.equal(next.skipped.length, 1);
});

test('a new version takes over from a worker that cannot ask for it', async () => {
  const store = new Map();
  await worker({ store }).seed({ '/': 'old start' });
  const next = worker({ code: NEW, active: true, store });
  await next.install();
  assert.equal(next.skipped.length, 1);
});

test('taking over clears the old version and keeps the map', async () => {
  const store = new Map();
  const old = worker({ store });
  await old.seed({ '/': 'old start' });
  await old.seed({ '/malmo.pmtiles': 'tiles' }, 'malmo-map-222222222222');
  const next = worker({ code: NEW, active: true, store });
  await next.install();
  await next.activate();
  assert.ok(!store.has(OLD));
  assert.ok(store.has(NEW));
  assert.equal(await next.cachedText('/malmo.pmtiles', 'malmo-map-222222222222'), 'tiles');
});
