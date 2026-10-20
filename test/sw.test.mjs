import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ORIGIN = 'https://malmodle.se';
const source = readFileSync('app/sw.js', 'utf8');

function worker({ online = true, slow = false, pages = {}, cached = {} } = {}) {
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
    if (slow) await new Promise((resolve) => { setTimeout(resolve, 20); });
    return new Response(pages[path] ?? 'fresh');
  };
  const listeners = {};
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    registration: {},
  };
  vm.runInNewContext(source, {
    self, caches, fetch, Response, Blob, URL, console, Promise,
    setTimeout: slow ? (fn) => fn() : setTimeout,
    location: new URL(ORIGIN),
  });

  return {
    fetched,
    async seed(entries) {
      const cache = await open('malmo-code');
      for (const [path, body] of Object.entries(entries)) await cache.put(path, new Response(body));
    },
    async navigate(path, mode = 'navigate') {
      let answer;
      const waits = [];
      listeners.fetch({
        request: { method: 'GET', mode, url: ORIGIN + path },
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

test('online, a page and its code come from the network even when cached', async () => {
  const sw = worker({ pages: { '/': 'new start', '/app.js': 'new code', '/data/quiz.json': 'new quiz' } });
  await sw.seed({ '/': 'old start', '/app.js': 'old code', '/data/quiz.json': 'old quiz' });
  assert.equal(await (await sw.navigate('/')).text(), 'new start');
  assert.equal(await (await sw.navigate('/app.js', 'cors')).text(), 'new code');
  assert.equal(await (await sw.navigate('/data/quiz.json', 'cors')).text(), 'new quiz');
  assert.equal(await sw.cachedText('/app.js'), 'new code');
});

test('offline, code comes from the cache', async () => {
  const sw = worker({ online: false });
  await sw.seed({ '/app.js': 'old code' });
  assert.equal(await (await sw.navigate('/app.js', 'cors')).text(), 'old code');
});

test('on a slow network, the cached page is shown and the new one saved for next time', async () => {
  const sw = worker({ slow: true, pages: { '/': 'new start' } });
  await sw.seed({ '/': 'old start' });
  assert.equal(await (await sw.navigate('/')).text(), 'old start');
  assert.equal(await sw.cachedText('/'), 'new start');
});

test('images and glyphs come from the cache and update behind it', async () => {
  const sw = worker({ pages: { '/icons/icon.svg': 'new icon' } });
  await sw.seed({ '/icons/icon.svg': 'old icon' });
  assert.equal(await (await sw.navigate('/icons/icon.svg', 'no-cors')).text(), 'old icon');
  assert.equal(await sw.cachedText('/icons/icon.svg'), 'new icon');
});
