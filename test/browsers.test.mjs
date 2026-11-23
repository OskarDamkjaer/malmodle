import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, statSync, utimesSync } from 'node:fs';
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

function soon(promise, what) {
  let timer;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`waited for ${what}`)), 60000); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function started(page, visit) {
  const up = await page.waitForSelector('#question:not([hidden])', { timeout: 60000 }).then(() => true, () => false);
  if (!up) assert.fail(`no question on ${visit}; boot says "${await page.textContent('#bootmsg')}"`);
}

for (const [name, launch] of Object.entries(ENGINES)) {
  if (!unready) browsers[name] = await soon(launch(), `${name} to launch`).catch(() => null);
  const skip = unready || (!browsers[name] && `no ${name} could be launched`);

  test(`the day starts in ${name}, on a first visit, on one the offline worker answers, and on one after a release`, { skip, timeout: 300000 }, async () => {
    const touched = 'app/palette.mjs';
    const { atime, mtime } = statSync(touched);
    const context = await browsers[name].newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    let visit = 0;
    let replaced = -1;
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) visit += 1; });
    page.on('pageerror', (e) => errors.push([visit, String(e)]));
    const version = () => soon(page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('malmo-code-')).join()), 'the names of the caches');
    try {
      await page.goto(URL);
      await started(page, 'the first visit');
      await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 60000 });
      await soon(page.reload(), 'the reload');
      await started(page, 'a visit the offline worker answers');
      assert.ok(await soon(page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'the worker in control'));
      const first = await version();

      utimesSync(touched, atime, new Date());
      await soon(page.reload(), 'the reload after a release');
      replaced = visit;
      const deadline = Date.now() + 60000;
      let now = first;
      while (now === first || now.includes(',') || !now) {
        if (Date.now() > deadline) assert.fail(`the release was not taken; the code cache is "${now}", and was "${first}"`);
        await new Promise((r) => setTimeout(r, 250));
        now = await version().catch(() => first);
      }
      await started(page, 'the visit after a release');
      assert.ok(visit > replaced, 'the page the old worker answered was not replaced');
      assert.deepEqual(errors.filter(([at]) => at !== replaced), []);
    } finally {
      utimesSync(touched, atime, mtime);
      await context.close();
    }
  });
}
