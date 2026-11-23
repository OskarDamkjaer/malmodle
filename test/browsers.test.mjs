import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ENGINES, chromium } from './browser.mjs';

const NEEDED = ['build/style.json', 'build/data/quiz.json', 'data/cache/malmo.pmtiles', 'app/vendor/maplibre-gl.mjs'];
const missing = NEEDED.filter((p) => !existsSync(p));
const unready = !chromium ? 'playwright is not installed' : missing.length ? `missing: ${missing.join(', ')}` : false;

const PORT = 9000 + Math.floor(Math.random() * 900);
const URL = `http://127.0.0.1:${PORT}/`;
let server;
const browsers = {};

before(async () => {
  if (unready) return;
  server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(URL)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(async () => {
  for (const browser of Object.values(browsers)) await browser?.close();
  server?.kill();
});

async function started(page, visit) {
  const up = await page.waitForSelector('#question:not([hidden])', { timeout: 60000 }).then(() => true, () => false);
  if (!up) assert.fail(`no question on ${visit}; boot says "${await page.textContent('#bootmsg')}"`);
}

for (const [name, launch] of Object.entries(ENGINES)) {
  if (!unready) browsers[name] = await launch().catch(() => null);
  const skip = unready || (!browsers[name] && `no ${name} could be launched`);

  test(`the day starts in ${name}, on a first visit and on one the offline worker answers`, { skip }, async () => {
    const context = await browsers[name].newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(URL);
    await started(page, 'the first visit');
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 60000 });
    await page.reload();
    await started(page, 'a visit the offline worker answers');
    assert.ok(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)));
    assert.deepEqual(errors, []);
    await context.close();
  });
}
