const loaded = await import('playwright-core').catch(() => null);

export const chromium = loaded?.chromium ?? null;

export async function launch() {
  try {
    return await chromium.launch();
  } catch (err) {
    try { return await chromium.launch({ channel: 'chrome' }); } catch { throw err; }
  }
}
