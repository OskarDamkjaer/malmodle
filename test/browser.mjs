import { existsSync } from 'node:fs';

const loaded = await import('playwright-core').catch(() => null);

export const chromium = loaded?.chromium ?? null;

export async function launch() {
  try {
    return await chromium.launch();
  } catch (err) {
    try { return await chromium.launch({ channel: 'chrome' }); } catch { throw err; }
  }
}

const FIREFOX = ['/usr/bin/firefox', '/snap/bin/firefox', '/Applications/Firefox.app/Contents/MacOS/firefox'];
const headless = !process.env.HEADED;

async function launchFirefox() {
  const options = { headless, firefoxUserPrefs: { 'webgl.force-enabled': true } };
  try {
    return await loaded.firefox.launch(options);
  } catch (err) {
    const executablePath = process.env.FIREFOX ?? FIREFOX.find((path) => existsSync(path));
    if (!executablePath) throw err;
    try { return await loaded.firefox.launch({ ...options, channel: 'moz-firefox', executablePath }); } catch { throw err; }
  }
}

export const ENGINES = {
  chromium: launch,
  firefox: launchFirefox,
  webkit: () => loaded.webkit.launch({ headless }),
};
