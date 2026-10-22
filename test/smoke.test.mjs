import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, statSync, utimesSync } from 'node:fs';
import { DEFAULT_STYLE, STYLES } from '../app/palette.mjs';
import { SAVE_KEY, dateKey } from '../app/daily.mjs';
import { chromium, launch } from './browser.mjs';

const NEEDED = ['build/style.json', 'build/data/quiz.json', 'data/cache/malmo.pmtiles', 'app/vendor/maplibre-gl.mjs', 'app/glyphs', 'app/sprite'];
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const missing = NEEDED.filter((p) => !existsSync(p));
const skip = !chromium ? 'playwright is not installed'
  : missing.length ? `missing: ${missing.join(', ')}` : false;

const PORT = 8000 + Math.floor(Math.random() * 900);
const URL = `http://127.0.0.1:${PORT}/`;
let server;
let browser;

before(async () => {
  if (skip) return;
  server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(URL)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

async function open(viewport, path = '/', saved) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
  if (saved !== undefined) await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, saved]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(new globalThis.URL(path, URL).href);
  await page.waitForSelector('#boot.done', { state: 'attached', timeout: 60000 });
  await page.waitForSelector('#question:not([hidden])');
  return { page, context, errors };
}

const visibleText = (page) => page.evaluate(() => window.map.getStyle().layers
  .filter((l) => l.type === 'symbol' && l.id !== 'focus-label')
  .filter((l) => (window.map.getLayoutProperty(l.id, 'visibility') ?? 'visible') !== 'none')
  .map((l) => l.id));

async function playThrough(page, viewport, count = 10) {
  const prompts = [];
  for (let i = 0; i < count; i++) {
    await page.waitForSelector('#question:not([hidden])');
    prompts.push(await page.textContent('#prompt'));
    assert.deepEqual(await visibleText(page), [], 'a label is visible during a question');
    if (await page.isVisible('#choices')) {
      await page.locator('#choices button').first().click();
    } else {
      await page.mouse.click(viewport.width / 2, viewport.height / 2);
    }
    await page.waitForSelector('#result:not([hidden])');
    assert.match(await page.textContent('#points'), /^\d+$/);
    await page.click('#next');
  }
  return prompts;
}

test('a page of a style that is gone leads to the start page, keeping the hash', { skip }, async () => {
  const { page, context, errors } = await open({ width: 390, height: 844 }, '/natt/#x=1');
  assert.equal(await page.evaluate(() => location.pathname + location.hash), '/#x=1');
  assert.deepEqual(errors, []);
  await context.close();
});

test('the map can be answered from the keyboard', { skip }, async () => {
  const viewport = { width: 1280, height: 800 };
  const { page, context, errors } = await open(viewport);
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector('#question:not([hidden])');
    if (await page.isVisible('#choices')) {
      await page.keyboard.press('1');
    } else {
      const onMap = () => page.evaluate(() => document.activeElement === window.map.getCanvas());
      for (let t = 0; t < 10 && !(await onMap()); t++) await page.keyboard.press('Tab');
      assert.ok(await onMap());
      assert.ok(await page.isVisible('#aim'));
      await page.keyboard.press('Enter');
    }
    await page.waitForSelector('#result:not([hidden])');
    assert.ok(!(await page.isVisible('#aim')));
    await page.keyboard.press('Enter');
  }
  await page.waitForSelector('#end:not([hidden])');
  assert.deepEqual(errors, []);
  await context.close();
});

test('with the pin flag a tap locks in after a moment, a held press waits, and moving the map takes it back', { skip }, async () => {
  const viewport = { width: 1280, height: 800 };
  const { page, context, errors } = await open(viewport, '/#flaggor=pin');
  assert.equal(await page.evaluate(() => location.hash), '');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.flags), 'pin');
  for (let i = 0; i < 10 && await page.isVisible('#choices'); i++) {
    await page.locator('#choices button').first().click();
    await page.waitForSelector('#result:not([hidden])');
    await page.click('#next');
    await page.waitForSelector('#question:not([hidden])');
  }
  const [x, y] = [viewport.width / 2, viewport.height / 2];
  await page.mouse.click(x, y);
  assert.ok(await page.isVisible('.pin'));
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 10, y);
  await page.mouse.up();
  await page.waitForTimeout(1000);
  assert.ok(!(await page.isVisible('.pin')));
  assert.ok(await page.isHidden('#result'));
  await page.mouse.click(x, y);
  await page.mouse.move(x - 150, y);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  assert.ok(await page.isHidden('#result'), 'a held press keeps the pin from locking in');
  await page.mouse.up();
  await page.waitForSelector('#result:not([hidden])');
  assert.ok(!(await page.isVisible('.pin')));
  await page.reload();
  await page.waitForSelector('#boot.done', { state: 'attached', timeout: 60000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.flags), 'pin');
  assert.deepEqual(errors, []);
  await context.close();
});

for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  test(`a day can be played start to finish on ${name}`, { skip }, async () => {
    const { page, context, errors } = await open(viewport);
    const asked = [];
    page.on('request', (r) => {
      const { pathname } = new globalThis.URL(r.url());
      if (pathname === '/api/result') asked.push('post');
      else if (pathname.startsWith('/live/')) asked.push('file');
    });
    const prompts = await playThrough(page, viewport);

    await page.waitForSelector('#end:not([hidden])');
    assert.equal(await page.evaluate(() => window.map.getSource('scored-labels').serialize().data.features.length), 10);
    assert.match(await page.textContent('#endverdict'), /imorgon\.$/);
    assert.match(await page.textContent('#endscore'), /^\d+$/);
    assert.equal(await page.textContent('#endmax'), 'av 1000');
    await page.waitForSelector('#crowd:not([hidden])');
    assert.match(await page.textContent('#crowd .wait'), /till har spelat\./);

    await page.click('#share');
    const shared = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(shared, /^Malmödle \d{4}-\d{2}-\d{2}\n\d+\/1000\n/);
    assert.equal([...shared.split('\n')[2]].length, 10);

    await page.waitForTimeout(800);
    const spot = await page.evaluate(() => {
      const [first] = window.map.getSource('scored-labels').serialize().data.features;
      const { x, y } = window.map.project(first.geometry.coordinates);
      return { x, y, name: first.properties.name };
    });
    await page.evaluate(() => { document.querySelector('#end .sheet').style.visibility = 'hidden'; });
    await page.mouse.click(spot.x, spot.y);
    await page.evaluate(() => { document.querySelector('#end .sheet').style.visibility = ''; });
    await page.waitForSelector('#info:not([hidden])');
    assert.ok(await page.isVisible('#infoscore'));
    await page.click('#infoclose');
    assert.ok(await page.isHidden('#info'));

    assert.equal(asked[0], 'post');
    asked.length = 0;
    await page.click('#again');
    await page.waitForSelector('#question:not([hidden])');
    assert.equal(await page.textContent('#prompt'), prompts[0]);
    await playThrough(page, viewport);

    await page.waitForSelector('#end:not([hidden])');
    await page.waitForSelector('#crowd:not([hidden])');
    assert.equal(asked[0], 'file');
    await page.click('#practise');
    assert.equal(await page.locator('#kinds button').count(), 9);
    await page.locator('#kinds button').nth(2).click();
    await page.waitForSelector('#question:not([hidden])');
    assert.equal(await page.locator('#dots li').count(), 10);
    await playThrough(page, viewport);
    await page.waitForSelector('#end:not([hidden])');
    assert.match(await page.textContent('#enddate'), /^Övning · /);
    assert.ok(await page.isHidden('#sharecard'));

    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('a reload returns to the same place in the day', { skip }, async () => {
  const viewport = { width: 390, height: 844 };
  const { page, context, errors } = await open(viewport);
  await playThrough(page, viewport, 3);
  const next = await page.textContent('#prompt');

  await page.reload();
  await page.waitForSelector('#boot.done', { state: 'attached', timeout: 60000 });
  await page.waitForSelector('#question:not([hidden])');
  assert.equal(await page.textContent('#prompt'), next);
  assert.equal(await page.locator('#dots li[data-band]').count(), 3);

  await playThrough(page, viewport, 7);
  await page.waitForSelector('#end:not([hidden])');
  const squares = () => page.$$eval('#endsquares .sq', (bs) => bs.map((b) => b.getAttribute('aria-label')));
  const shared = await squares();
  assert.equal(shared.length, 10);

  await page.reload();
  await page.waitForSelector('#boot.done', { state: 'attached', timeout: 60000 });
  await page.waitForSelector('#end:not([hidden])');
  assert.deepEqual(await squares(), shared);
  assert.ok(await page.isVisible('#practise'));

  assert.deepEqual(errors, []);
  await context.close();
});

test('whatever is left in storage, the day starts', { skip }, async () => {
  const key = dateKey();
  for (const saved of [
    '{trasig',
    'null',
    '[1,2,3]',
    JSON.stringify({ version: 1, key, targets: 'alla', playing: [null] }),
    JSON.stringify({ version: 1, key: '2001-01-01', targets: [], done: [] }),
  ]) {
    const { page, context, errors } = await open({ width: 390, height: 844 }, '/', saved);
    assert.equal(await page.locator('#dots li[data-band]').count(), 0, saved);
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY), null, saved);
    assert.deepEqual(errors, [], saved);
    await context.close();
  }
});

test('the map is downloaded once and then comes from the service worker', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  let downloads = 0;
  context.on('response', (res) => {
    if (new globalThis.URL(res.url()).pathname === '/malmo.pmtiles' && !res.fromServiceWorker()) downloads++;
  });

  await page.goto(URL);
  await page.waitForSelector('#question:not([hidden])', { timeout: 60000 });
  await page.waitForFunction(async () => navigator.serviceWorker.controller
    && Number((await caches.match('/malmo.pmtiles'))?.headers.get('Content-Length')) > 0, null, { timeout: 30000 });

  await page.reload();
  await page.waitForSelector('#question:not([hidden])', { timeout: 60000 });
  assert.equal(downloads, 1);

  assert.deepEqual(errors, []);
  await context.close();
});

async function until(check, what, ms = 60000) {
  for (const deadline = Date.now() + ms; Date.now() < deadline;) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`waited for ${what}`);
}

test('a new version is taken before the first answer, and waits after one', { skip }, async () => {
  const touched = 'app/palette.mjs';
  const { atime, mtime } = statSync(touched);
  const release = () => utimesSync(touched, atime, new Date());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  let loads = 0;
  page.on('load', () => { loads += 1; });
  const version = () => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('malmo-code-')));
  try {
    await page.goto(URL);
    await page.waitForSelector('#question:not([hidden])', { timeout: 60000 });
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 });
    const [first] = await version();

    release();
    loads = 0;
    await page.reload();
    await until(() => loads >= 2, 'the page to reload into the new version');
    await page.waitForSelector('#boot.done', { state: 'attached', timeout: 60000 });
    await page.waitForSelector('#question:not([hidden])');
    const now = await version();
    assert.equal(now.length, 1);
    assert.notEqual(now[0], first);

    if (await page.isVisible('#choices')) await page.locator('#choices button').first().click();
    else await page.mouse.click(195, 422);
    await page.waitForSelector('#result:not([hidden])');
    release();
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((reg) => reg.update()));
    await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((reg) => Boolean(reg.waiting)), null, { timeout: 30000 });
    assert.equal(loads, 2);
    assert.ok(await page.isVisible('#result'));
    assert.deepEqual(errors, []);
  } finally {
    utimesSync(touched, atime, mtime);
    await context.close();
  }
});

const background = (page) => page.evaluate(() => window.map.getPaintProperty('background', 'background-color'));

test("the map starts in Tidning, and the menu switches the map's style and keeps it", { skip }, async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { page, context, errors } = await open(viewport);
    const panel = () => page.evaluate(() => getComputedStyle(document.getElementById('question')).backgroundColor);
    const before = await panel();
    assert.equal(await background(page), STYLES[DEFAULT_STYLE].map.background);
    await page.click('#mapmenubutton');
    assert.ok(await page.isVisible('#report'));
    for (const name of Object.keys(STYLES)) {
      await page.click(`#styles [data-style="${name}"]`);
      assert.equal(await page.locator(`#styles [data-style="${name}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await background(page), STYLES[name].map.background, name);
      assert.equal(await page.evaluate(() => window.map.getPaintProperty('tap-point', 'circle-color')), STYLES[name].marks.tap, name);
      assert.equal(await panel(), before, `${name} changes the UI`);
    }
    await page.keyboard.press('Escape');
    assert.ok(await page.isHidden('#mapmenupanel'));
    await page.reload();
    await page.waitForSelector('#question:not([hidden])', { timeout: 60000 });
    assert.equal(await background(page), STYLES[Object.keys(STYLES).at(-1)].map.background);
    assert.deepEqual(errors, []);
    await context.close();
  }
});
