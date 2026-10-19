import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ORIGIN = 'https://malmodle.se';
const source = readFileSync('app/sw.js', 'utf8');

function worker({ online = true, pages = {}, cached = {} } = {}) {
  const store = new Map();
  const keyOf = (req) => new URL(typeof req === 'string' ? req : req.url, ORIGIN).pathname;
  const open = async (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const cache = store.get(name);
    return {
      put: async (req, res) => { cache.set(keyOf(req), res); },
      match: async (req) => cache.get(keyOf(req)),
    };
  };
  const caches = {
    open,
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
    match: async (req) => {
      for (const cache of store.values()) if (cache.has(keyOf(req))) return cache.get(keyOf(req));
    },
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
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    registration: {},
  };
  vm.runInNewContext(source, {
    self, caches, fetch, Response, Blob, URL, console, Promise,
    location: new URL(ORIGIN),
  });

  return {
    fetched,
    async seed(entries) {
      const cache = await open('malmo-code');
      for (const [path, body] of Object.entries(entries)) await cache.put(path, new Response(body));
    },
    async navigate(path) {
      let answer;
      const waits = [];
      listeners.fetch({
        request: { method: 'GET', mode: 'navigate', url: ORIGIN + path },
        respondWith: (p) => { answer = p; },
        waitUntil: (p) => waits.push(p),
      });
      const res = await answer;
      await Promise.all(waits);
      return res;
    },
    async cachedText(path) {
      const res = await caches.match(path);
      return res && res.clone().text();
    },
    async install() {
      const waits = [];
      self.skipWaiting = async () => {};
      listeners.install({ waitUntil: (p) => waits.push(p) });
      await Promise.all(waits);
    },
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
