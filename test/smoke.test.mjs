import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { THEMES, themePath } from '../app/themes.mjs';

const require = createRequire(import.meta.url);

function loadChromium() {
  const roots = [];
  try { roots.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch {}
  for (const name of ['playwright-core', 'playwright']) {
    for (const from of [name, ...roots.map((r) => join(r, name))]) {
      try { return require(from).chromium; } catch {}
    }
  }
  return null;
}

const NEEDED = ['build/style.json', 'build/data/quiz.json', 'data/cache/malmo.pmtiles', 'app/vendor/maplibre-gl.mjs', 'app/glyphs', 'app/sprite'];
const chromium = loadChromium();
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
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

async function open(viewport, path = '/') {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
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

for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  test(`a day can be played start to finish on ${name}`, { skip }, async () => {
    const { page, context, errors } = await open(viewport);
    const prompts = await playThrough(page, viewport);

    await page.waitForSelector('#end:not([hidden])');
    assert.equal(await page.evaluate(() => window.map.getSource('scored-labels').serialize().data.features.length), 10);
    assert.match(await page.textContent('#endverdict'), /imorgon\.$/);
    assert.match(await page.textContent('#endscore'), /^\d+$/);
    assert.equal(await page.textContent('#endmax'), 'av 1000');

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

    await page.click('#again');
    await page.waitForSelector('#question:not([hidden])');
    assert.equal(await page.textContent('#prompt'), prompts[0]);
    await playThrough(page, viewport);

    await page.waitForSelector('#end:not([hidden])');
    await page.click('#practise');
    assert.equal(await page.locator('#kinds button').count(), 9);
    await page.locator('#kinds button').nth(2).click();
    await page.waitForSelector('#question:not([hidden])');
    assert.equal(await page.locator('#dots li').count(), 10);
    await playThrough(page, viewport);
    await page.waitForSelector('#end:not([hidden])');
    assert.match(await page.textContent('#enddate'), /^Övning · /);
    assert.ok(await page.isHidden('.sharecard'));

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
  const shared = await page.textContent('#sharetext');

  await page.reload();
  await page.waitForSelector('#boot.done', { state: 'attached', timeout: 60000 });
  await page.waitForSelector('#end:not([hidden])');
  assert.equal(await page.textContent('#sharetext'), shared);
  assert.ok(await page.isVisible('#practise'));

  assert.deepEqual(errors, []);
  await context.close();
});

test('every style boots at its own path', { skip }, async () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const { page, context, errors } = await open({ width: 390, height: 844 }, themePath(name));
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), name);
    assert.equal(await page.evaluate(() => window.map.getPaintProperty('background', 'background-color')), theme.map.background);
    assert.deepEqual(errors, [], name);
    await context.close();
  }
});
