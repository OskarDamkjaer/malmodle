import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync, utimesSync } from 'node:fs';
import { PALETTE } from '../app/palette.mjs';
import { SAVE_KEY, dailySet, dateKey } from '../app/daily.mjs';
import { TYPES } from '../app/questions.mjs';
import { unlockedText } from '../app/crowd.mjs';
import { chromium, launch } from './browser.mjs';

const NEEDED = ['build/style.json', 'build/data/quiz.json', 'build/data/quiz-all.json', 'data/cache/malmo.pmtiles', 'app/vendor/maplibre-gl.mjs', 'app/glyphs', 'app/sprite'];
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

async function open(viewport, path = '/', saved, device = {}) {
  const context = await browser.newContext({ viewport, ...device, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
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

async function guess(page, x, y) {
  await page.mouse.click(x, y);
  await page.click('#guessbutton');
}

async function playThrough(page, viewport, count = 10) {
  const prompts = [];
  for (let i = 0; i < count; i++) {
    await page.waitForSelector('#question:not([hidden])');
    prompts.push(await page.textContent('#prompt'));
    assert.deepEqual(await visibleText(page), [], 'a label is visible during a question');
    if (await page.isVisible('#choices')) {
      await page.locator('#choices button').first().click();
    } else {
      await guess(page, viewport.width / 2, viewport.height / 2);
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

for (const [name, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  test(`a tap sets a pin that is guessed from the panel at the bottom, and a held press answers at once, on ${name}`, { skip }, async () => {
    const { page, context, errors } = await open(viewport, '/', undefined, touch ? { hasTouch: true, isMobile: true } : {});
    const [x, y] = [viewport.width / 2, viewport.height / 2];
    const tap = (px, py) => (touch ? page.touchscreen.tap(px, py) : page.mouse.click(px, py));
    const press = (selector) => (touch ? page.locator(selector).tap() : page.click(selector));
    const pins = () => page.locator('.pin:not(.guessed)').count();

    assert.equal(await page.isVisible('.maplibregl-ctrl-zoom-in'), !touch, 'zoom buttons only on desktop');
    assert.equal(await page.textContent('#pinhint'), `${touch ? 'Tryck' : 'Klicka'} eller håll inne för att gissa`);
    assert.ok(await page.isVisible('#pinhint'));
    assert.ok(await page.isHidden('#guess'));
    await tap(x, y);
    await page.waitForSelector('#guess:not([hidden])');
    assert.ok(await page.isHidden('#pinhint'));
    await tap(x + 60, y + 40);
    assert.equal(await pins(), 1);
    await press('#unpin');
    assert.equal(await pins(), 0);
    assert.ok(await page.isHidden('#guess'));
    assert.ok(await page.isVisible('#pinhint'));
    assert.ok(await page.isHidden('#result'));

    await tap(x, viewport.height - 50);
    await page.waitForSelector('#guess:not([hidden])');
    await page.waitForTimeout(500);
    const pin = await page.locator('.pin').boundingBox();
    const panel = await page.locator('#guess').boundingBox();
    assert.ok(pin.y + pin.height <= panel.y, 'a pin set behind the panel brings the map along');
    await press('#guessbutton');
    await page.waitForSelector('#result:not([hidden])');
    const result = await page.locator('#result').boundingBox();
    assert.deepEqual([result.x, result.width, result.y + result.height], [panel.x, panel.width, panel.y + panel.height], 'the result takes the place of the panel');
    assert.ok(await page.isHidden('#guess'));
    assert.equal(await pins(), 0);
    assert.equal(await page.locator('.pin.guessed').count(), 1);
    await press('#next');

    for (let i = 0; i < 9 && await page.isVisible('#choices'); i++) {
      await press('#choices button');
      await page.waitForSelector('#result:not([hidden])');
      await press('#next');
      await page.waitForSelector('#question:not([hidden])');
    }
    assert.ok(await page.isHidden('#pinhint'), 'the hint is only on the first question');
    if (touch) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(600);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForTimeout(600);
      await page.mouse.up();
    }
    await page.waitForSelector('#result:not([hidden])');
    assert.equal(await pins(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

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
    assert.equal(await page.evaluate(() => new Set(window.map.getSource('scored-labels').serialize().data.features.map((f) => f.properties.name)).size), 10);
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
    else await guess(page, 195, 422);
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

test('the palette is applied to the basemap', { skip }, async () => {
  const { page, context, errors } = await open({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => window.map.getPaintProperty('background', 'background-color')), PALETTE.map.background);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a day made by hand names its maker, and a full score unlocks the day builder', { skip }, async () => {
  const quiz = JSON.parse(readFileSync('build/data/quiz.json', 'utf8'));
  const key = dateKey();
  const slots = dailySet(quiz.items, key, quiz.decoys).map((q, i) => ({ target: q.target.name, type: q.type, seed: i + 1 }));
  const made = { [key]: { by: 'Kim', slots } };
  const set = dailySet(quiz.items, key, quiz.decoys, made);
  const finished = (score) => JSON.stringify({
    version: 1, key, targets: set.map((q) => q.target.name),
    done: set.map((q) => (TYPES[q.type].input === 'map' ? { score, distance: score === 100 ? 0 : 900 } : { score, choice: score === 100 ? q.target.name : 'fel' })),
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/data/quiz.json', (route) => route.fulfill({ json: { ...quiz, made } }));
  await context.route('**/api/**', (route) => route.abort());
  const page = await context.newPage();
  const end = async (score) => {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, finished(score)]);
    await page.reload();
    await page.waitForSelector('#end:not([hidden])', { timeout: 60000 });
  };
  try {
    await page.goto(URL);
    await page.waitForSelector('#question:not([hidden])', { timeout: 60000 });
    assert.equal(await page.textContent('#byline'), 'Dagens frågor av Kim');
    assert.ok(await page.locator('#byline').isVisible());
    await end(0);
    assert.equal(await page.textContent('#endby'), 'Dagens frågor av Kim.');
    assert.ok(await page.locator('#builder').isHidden());
    await end(100);
    assert.ok(await page.locator('#builder').isVisible());
    assert.equal(await page.textContent('#builderwhy'), unlockedText('perfect'));
    assert.equal(await page.getAttribute('#builderlink', 'href'), '/bygg/');
    assert.ok(await page.locator('#builder .phone').isVisible());
  } finally {
    await context.close();
  }
});

test('a day can be built by hand, changed, undone, kept over a reload, and take what the game never asks', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  page.on('request', (r) => { if (r.headers().range) errors.push(`asked for a part of ${r.url()}, which the live site answers with all of it`); });
  try {
    await page.goto(new globalThis.URL('/bygg/', URL).href);
    await page.waitForFunction(() => window.map?.loaded() && document.querySelector('#filters button'), null, { timeout: 60000 });
    for (const name of ['Möllevången', 'Folkets Park']) {
      await page.fill('#search', name);
      await page.keyboard.press('Enter');
    }
    assert.deepEqual(await page.locator('#questions .title').allTextContents(), ['Möllevången', 'Folkets Park']);
    assert.equal(await page.locator('#nextn').textContent(), '3');
    assert.equal(await page.locator('#rest li').count(), 7);
    await page.click('#questions li:nth-child(2) .types button:has-text("Vad ligger här?")');
    assert.match(await page.locator('#questions li:nth-child(2) .meta').textContent(), /^Vad ligger här\?/);
    assert.equal(await page.locator('#questions li:nth-child(2) .options li').count(), 8);
    assert.equal(await page.locator('#lead .off').count(), 0);
    assert.equal(await page.locator('#lead').textContent(), 'Första frågan är alltid att peka ut ett område. Fördelningen brukar se ut så här:');
    await page.keyboard.press('Meta+z');
    assert.match(await page.locator('#questions li:nth-child(2) .meta').textContent(), /^Peka ut/);
    await page.reload();
    await page.waitForSelector('#questions li:nth-child(2)');
    assert.equal(await page.locator('#questions li').count(), 2);
    await page.fill('#search', 'Möllevångstorget');
    assert.equal(await page.locator('#results li').first().locator('.tag').count(), 0);
    await page.fill('#search', 'Espresso House');
    assert.equal(await page.locator('#results li').first().locator('.tag').count(), 0);
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.locator('#questions li:nth-child(3) .flag').allTextContents(), []);
    assert.match(await page.locator('#questions li:nth-child(3) .edit').textContent(), /ställen?a? räknas/);
    assert.ok(await page.locator('#questions li:nth-child(3) .types button:has-text("Vad ligger här?")').isDisabled());
    assert.ok(await page.evaluate(() => window.map.getSource('atlas-points').serialize().data.features.filter((f) => f.properties.name === 'Espresso House').length > 1));
    await page.fill('#search', 'Valdemarsro');
    assert.equal(await page.locator('#results li').first().locator('.tag').textContent(), 'inte i spelet än');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.locator('#questions li:nth-child(4) .flag').allTextContents(), ['finns inte i spelet än']);
    assert.match(await page.locator('#notes li').first().textContent(), /Ta med i spelet · Valdemarsro · fråga 4/);
    assert.ok(await page.locator('#sendopen').isDisabled());
    assert.equal(await page.locator('#sendopen').textContent(), 'Skicka in · 4/10');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('a finished day is sent to the Worker once, under the player the game knows', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  const button = page.locator('#sendopen');
  try {
    await page.goto(new globalThis.URL('/bygg/', URL).href);
    await page.waitForFunction(() => window.map?.loaded(), null, { timeout: 60000 });
    const code = await page.evaluate(async () => {
      const { pack } = await import('/bygg/handmade.mjs');
      const { items } = await (await fetch('/data/quiz.json')).json();
      return pack({ slots: items.filter((it) => it.kind === 'area').slice(0, 10).map((it) => ({ target: it.name, type: 'point', seed: 1 })) });
    });
    await page.goto(new globalThis.URL(`/bygg/#dag=${code}`, URL).href);
    await page.reload();
    await page.waitForSelector('#questions li:nth-child(10)', { timeout: 60000 });
    assert.equal(await button.textContent(), 'Skicka in');
    assert.ok(await page.locator('#adder').isHidden());
    assert.equal(await page.locator('#rest li').count(), 0);
    await button.click();
    await page.fill('#credit', 'Kim');
    const [request, response] = await Promise.all([
      page.waitForRequest('**/api/handmade'),
      page.waitForResponse('**/api/handmade'),
      page.click('#submit'),
    ]);
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => document.querySelector('#sendstate').dataset.state === 'ok');
    assert.equal(await page.textContent('#sendstate'), 'Tack! Dagen är inskickad.');
    assert.equal(request.postDataJSON().player, await page.evaluate(() => localStorage.getItem('malmodle-player')));
    assert.equal(request.postDataJSON().name, 'Kim');
    assert.equal(request.postDataJSON().slots.length, 10);
    await page.click('#sendclose');
    assert.equal(await button.textContent(), 'Inskickad ✓');
    assert.ok(await button.isDisabled());
    await page.reload();
    await page.waitForSelector('#questions li:nth-child(10)', { timeout: 60000 });
    assert.equal(await button.textContent(), 'Inskickad ✓');
    await page.click('#questions li:nth-child(1) .tools button[aria-label="Flytta fråga 1 ner"]');
    assert.equal(await button.textContent(), 'Skicka in');
    assert.ok(await button.isEnabled());
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
