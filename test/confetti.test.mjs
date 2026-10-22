import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, launch } from './browser.mjs';

const ORIGIN = 'http://confetti.test';
const skip = chromium ? false : 'playwright is not installed';
let browser;

before(async () => {
  if (!skip) browser = await launch();
});

after(async () => {
  await browser?.close();
});

async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2, ...options });
  await context.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/confetti.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync('app/confetti.js') });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>.confetti { position: fixed; inset: 0; width: 100%; height: 100%; }</style><body></body>' });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(async () => { window.confetti = (await import('/confetti.js')).confetti; });
  return { page, context, errors };
}

test('confetti draws at the size it is shown and removes itself', { skip }, async () => {
  const { page, context, errors } = await open();
  await page.evaluate(() => { window.stop = window.confetti(['#2e9e4f', '#c8102e']); });
  await page.waitForTimeout(300);
  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas.confetti');
    return { width: c.width, height: c.height, shown: [c.clientWidth * 2, c.clientHeight * 2], hidden: c.getAttribute('aria-hidden') };
  });
  assert.deepEqual([size.width, size.height], size.shown);
  assert.equal(size.hidden, 'true');
  await page.waitForSelector('canvas.confetti', { state: 'detached', timeout: 5000 });
  assert.deepEqual(errors, []);
  await context.close();
});

test('stopping confetti removes it at once', { skip }, async () => {
  const { page, context, errors } = await open();
  const left = await page.evaluate(async () => {
    const stop = window.confetti(['#2e9e4f']);
    await new Promise((r) => requestAnimationFrame(r));
    stop();
    return document.querySelectorAll('canvas').length;
  });
  assert.equal(left, 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('confetti stays away with reduced motion', { skip }, async () => {
  const { page, context, errors } = await open({ reducedMotion: 'reduce' });
  const count = await page.evaluate(() => { window.confetti(['#2e9e4f'])(); window.confetti(['#2e9e4f']); return document.querySelectorAll('canvas').length; });
  assert.equal(count, 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a failing frame takes the confetti away and nothing else', { skip }, async () => {
  const { page, context } = await open();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluate(() => {
    window.confetti(['#2e9e4f']);
    CanvasRenderingContext2D.prototype.fillRect = () => { throw new Error('broken'); };
  });
  await page.waitForSelector('canvas.confetti', { state: 'detached', timeout: 1000 });
  assert.match(errors.join(), /broken/);
  await context.close();
});
