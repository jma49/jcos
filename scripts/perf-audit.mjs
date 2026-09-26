// Measures the desktop the way a visitor meets it, for the self-audit
// after a significant change (see AGENTS.md). Run it against a
// production build:
//
//   npm run build && npx astro preview --port 4321 &
//   npm run perf                      # or: node scripts/perf-audit.mjs <url>
//
// It reports three things, each compared with its budget:
//   load  what a first visit downloads (initial JS gzip, images, fonts)
//         and whether anything is fetched twice
//   drag  script time while dragging a window with six apps open
//   idle  script time over five quiet seconds with the same six apps
//
// Numbers vary by machine; compare runs on the same one, before and
// after a change. It exits non-zero when a budget is exceeded.

import { chromium } from 'playwright';
import { gzipSync } from 'node:zlib';

const URL_ = process.argv[2] ?? 'http://localhost:4321/';
const BUDGET = {
  initialJsGzipKB: 180,
  imagesKB: 1100,
  fontsKB: 250,
  dragScriptMs: 400,
  idleScriptMs: 50
};

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});

/** Six windows, restored from a saved session, as a busy visitor would have them. */
const sixWindows = () => {
  if (sessionStorage.getItem('perf-seeded')) return;
  sessionStorage.setItem('perf-seeded', '1');
  localStorage.setItem('os-welcomed', '1');
  sessionStorage.setItem('os-booted', '1');
  const apps = [['photos', 'Photos', 1000, 680], ['finder', 'Macintosh HD', 760, 480], ['ipod', 'iPod', 300, 492], ['terminal', 'Terminal', 640, 420], ['chat', 'Chat', 560, 600], ['about', 'About Me', 560, 520]];
  const windows = apps.map(([app, title, width, height], i) => ({ id: app, app, title, x: 40 + i * 60, y: 40 + i * 30, width, height, minimized: false, maximized: false, props: app === 'finder' ? { path: '/' } : undefined }));
  localStorage.setItem('os-windows', JSON.stringify({ windows, order: apps.map(([a]) => a) }));
};

async function load() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const seen = [];
  page.on('response', async (res) => {
    if (new URL(res.url()).origin !== new URL(URL_).origin) return;
    const body = await res.body().catch(() => null);
    seen.push({ path: new URL(res.url()).pathname, type: res.request().resourceType(), bytes: body?.length ?? 0, gzip: body ? gzipSync(body).length : 0 });
  });
  await page.addInitScript(() => sessionStorage.setItem('os-booted', '1'));
  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.close();
  const sum = (type, key = 'bytes') => seen.filter((r) => r.type === type).reduce((n, r) => n + r[key], 0);
  const counts = new Map();
  for (const r of seen) counts.set(r.path, (counts.get(r.path) ?? 0) + 1);
  return {
    initialJsGzipKB: Math.round(sum('script', 'gzip') / 1024),
    imagesKB: Math.round(sum('image') / 1024),
    fontsKB: Math.round(sum('font') / 1024),
    fetchedTwice: [...counts].filter(([, n]) => n > 1).map(([path]) => path)
  };
}

async function withSixWindows(run) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.addInitScript(sixWindows);
  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const script = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'ScriptDuration').value;
  const before = await script();
  await run(page);
  const ms = Math.round(((await script()) - before) * 1000);
  await page.close();
  return ms;
}

const drag = () =>
  withSixWindows(async (page) => {
    const bar = page.locator('.os-window').last().locator('.os-titlebar, header').first();
    const box = await bar.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 8);
    await page.mouse.down();
    for (let i = 0; i < 180; i++) await page.mouse.move(box.x + box.width / 2 + Math.sin(i / 10) * 300, box.y + 8 + Math.cos(i / 13) * 150);
    await page.mouse.up();
  });

const idle = () => withSixWindows((page) => page.waitForTimeout(5000));

const result = { ...(await load()), dragScriptMs: await drag(), idleScriptMs: await idle() };
await browser.close();

let over = false;
for (const [key, budget] of Object.entries(BUDGET)) {
  const ok = result[key] <= budget;
  over ||= !ok;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${key.padEnd(16)} ${String(result[key]).padStart(6)}  (budget ${budget})`);
}
const twice = result.fetchedTwice.length === 0;
over ||= !twice;
console.log(`${twice ? 'ok  ' : 'OVER'} fetchedTwice     ${twice ? 'none' : result.fetchedTwice.join(', ')}`);
process.exit(over ? 1 : 0);
