import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
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

export const chromium = loadChromium();

export async function launch() {
  try {
    return await chromium.launch();
  } catch (err) {
    try { return await chromium.launch({ channel: 'chrome' }); } catch { throw err; }
  }
}
