import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { THEMES, themePath } from '../../app/themes.mjs';
import { chromium, launch } from '../browser.mjs';

const SITES = (process.env.SITES ?? 'https://malmodle.se').split(/\s+/).filter(Boolean);
const BUILD = process.env.BUILD;
const WAIT = 10 * 60 * 1000;
const skip = chromium ? false : 'playwright is not installed';

let browser;

before(async () => {
  if (!skip) browser = await launch();
});

after(async () => {
  await browser?.close();
});

const own = (site, url) => new URL(url).origin === new URL(site).origin;

async function open(site, viewport, path = '/', { workers = 'block' } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: workers });
  await context.route(`${site}/api/result`, (route) => route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid"}' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.location().url.endsWith('/api/result')) errors.push(m.text());
  });
  page.on('requestfailed', (r) => { if (own(site, r.url())) errors.push(`${r.failure()?.errorText} ${r.url()}`); });
  await page.goto(new URL(path, site).href);
  await page.waitForSelector('#boot.done', { state: 'attached', timeout: 60000 });
  await page.waitForSelector('#question:not([hidden])');
  return { page, context, errors };
}

for (const site of SITES) {
  test(`${site} serves this build`, { skip: skip || (!BUILD && 'BUILD is not set') }, async () => {
    const want = readFileSync(join(BUILD, 'sw.js'), 'utf8');
    const deadline = Date.now() + WAIT;
    let got = '';
    while (Date.now() < deadline) {
      const res = await fetch(`${site}/sw.js?check=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
      got = res?.ok ? await res.text() : '';
      if (got === want) return;
      await new Promise((r) => setTimeout(r, 15000));
    }
    const stamp = (text) => text.match(/malmo-code-\w+/)?.[0] ?? 'nothing';
    assert.fail(`${site} still serves ${stamp(got)}, the build is ${stamp(want)}`);
  });

  for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
    test(`a day can be played on ${site} on ${name}`, { skip }, async () => {
      const { page, context, errors } = await open(site, viewport);
      for (let i = 0; i < 10; i++) {
        await page.waitForSelector('#question:not([hidden])');
        if (await page.isVisible('#choices')) await page.locator('#choices button').first().click();
        else await page.mouse.click(viewport.width / 2, viewport.height / 2);
        await page.waitForSelector('#result:not([hidden])');
        assert.match(await page.textContent('#points'), /^\d+$/);
        await page.click('#next');
      }
      await page.waitForSelector('#end:not([hidden])');
      assert.match(await page.textContent('#endscore'), /^\d+$/);
      assert.equal(await page.textContent('#endmax'), 'av 1000');
      assert.deepEqual(errors, []);
      await context.close();
    });
  }

  test(`every style boots on ${site}`, { skip }, async () => {
    for (const [name, theme] of Object.entries(THEMES)) {
      const { page, context, errors } = await open(site, { width: 390, height: 844 }, themePath(name));
      assert.equal(await page.evaluate(() => window.map.getPaintProperty('background', 'background-color')), theme.map.background, name);
      assert.deepEqual(errors, [], name);
      await context.close();
    }
  });

  test(`${site} opens offline once it has been visited`, { skip }, async () => {
    const { page, context, errors } = await open(site, { width: 390, height: 844 }, '/', { workers: 'allow' });
    await page.waitForFunction(async () => navigator.serviceWorker.controller
      && Number((await caches.match('/malmo.pmtiles'))?.headers.get('Content-Length')) > 0, null, { timeout: 60000 });
    await context.setOffline(true);
    errors.length = 0;
    await page.reload();
    await page.waitForSelector('#boot.done', { state: 'attached', timeout: 60000 });
    await page.waitForSelector('#question:not([hidden])');
    assert.deepEqual(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|net::/.test(e)), []);
    await context.close();
  });

  test(`the results API on ${site} turns away a broken result`, { skip: new URL(site).hostname !== 'malmodle.se' && 'no API here' }, async () => {
    const res = await fetch(`${site}/api/result`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /"invalid"/);
  });
}

test('the build to compare with is there', { skip: !BUILD && 'BUILD is not set' }, () => {
  assert.ok(existsSync(join(BUILD, 'sw.js')), `${BUILD}/sw.js`);
});
