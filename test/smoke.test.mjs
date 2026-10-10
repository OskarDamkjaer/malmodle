import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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

async function open(viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForSelector('#boot.done', { timeout: 60000 });
  await page.waitForSelector('#question:not([hidden])');
  return { page, context, errors };
}

const visibleText = (page) => page.evaluate(() => window.map.getStyle().layers
  .filter((l) => l.type === 'symbol' && l.id !== 'focus-label')
  .filter((l) => (window.map.getLayoutProperty(l.id, 'visibility') ?? 'visible') !== 'none')
  .map((l) => l.id));

async function playThrough(page, viewport) {
  const prompts = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector('#question:not([hidden])');
    prompts.push(await page.textContent('#prompt'));
    assert.deepEqual(await visibleText(page), [], 'a label is visible during a question');
    if (await page.isVisible('#choices')) {
      await page.locator('#choices button').first().click();
    } else {
      await page.mouse.click(viewport.width / 2, viewport.height / 2);
    }
    await page.waitForSelector('#result:not([hidden])');
    assert.match(await page.textContent('#points'), /^\d+ p$/);
    await page.click('#next');
  }
  return prompts;
}

for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  test(`a day can be played start to finish on ${name}`, { skip }, async () => {
    const { page, context, errors } = await open(viewport);
    const prompts = await playThrough(page, viewport);

    await page.waitForSelector('#end:not([hidden])');
    assert.equal(await page.locator('#endlist li').count(), 10);
    const score = await page.textContent('#endscore');
    assert.match(score, /^\d+ \/ 1000$/);

    await page.click('#share');
    const shared = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(shared, /^Lär dig Malmö \d{4}-\d{2}-\d{2}\n\d+\/1000\n/);
    assert.equal([...shared.split('\n')[2]].length, 10);

    await page.click('#openmap');
    await page.waitForSelector('#back:not([hidden])');
    assert.ok((await visibleText(page)).length > 0, 'the free map has no labels');

    await page.click('#back');
    await page.click('#again');
    await page.waitForSelector('#question:not([hidden])');
    assert.equal(await page.textContent('#prompt'), prompts[0]);

    assert.deepEqual(errors, []);
    await context.close();
  });
}
