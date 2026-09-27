// Measures the desktop the way a visitor meets it, for the self-audit
// after a significant change (docs/agents/self-audit.md). Run it against a
// production build:
//
//   npm run build && npm run perf     # serves dist/ itself
//   node scripts/perf-audit.mjs <url> # or measures a running site
//
// It reports three things, each compared with its budget:
//   load  what a first visit downloads before the desktop settles
//         (initial JS and CSS gzip, images, fonts), whether anything is
//         fetched twice, and that no applet's code or styles are among it
//   drag  script time while dragging a window with six apps open
//   idle  script time over five quiet seconds with the same six apps
//
// Numbers vary by machine; compare runs on the same one, before and
// after a change. It exits non-zero when a budget is exceeded. In CI
// (CI=true), where shared runners make script times noisy, drag and idle
// are reported but only the download budgets can fail it.

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { serveDist } from './serve-dist.mjs';

const server = process.argv[2] ? null : await serveDist();
const URL_ = process.argv[2] ?? server.url;
/** Budgets that measure time, not bytes: too noisy to fail CI on. */
const TIMED = new Set(['dragScriptMs', 'idleScriptMs']);
const strict = (key) => !(process.env.CI && TIMED.has(key));
const BUDGET = {
  initialJsGzipKB: 160,
  initialCssGzipKB: 20,
  imagesKB: 1100,
  fontsKB: 250,
  dragScriptMs: 400,
  idleScriptMs: 50
};

/**
 * The chunks only an applet brings: the files its manifest loads (`load`
 * and `styles`), named as Vite names chunks, after the file. An applet is
 * fetched when it's opened or installed, never on a first visit.
 */
async function appletChunks() {
  const catalog = await readFile(new URL('../src/os/catalog.ts', import.meta.url), 'utf8');
  const names = new Set();
  for (const [, path] of catalog.matchAll(/from '\.\/(applets\/\w+)\/manifest'/g)) {
    const manifest = await readFile(new URL(`../src/os/${path}/manifest.ts`, import.meta.url), 'utf8');
    for (const [, file] of manifest.matchAll(/import\('\.\/([\w-]+)/g)) names.add(file);
  }
  return names;
}
const APPLET_CHUNKS = await appletChunks();

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

/**
 * Opens the desktop and waits for the network to go quiet, for at most ten
 * seconds: with the iPod (YouTube), Chat and Photos open it may never be
 * quiet on a CI runner, and what's measured has loaded by then.
 */
async function settle(page) {
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

/**
 * The first load is what's asked for before the desktop settles: eight
 * seconds after it starts, afterSettled() (src/os/core/warmUp.ts) fetches
 * the Dashboard and the screen saver ahead, and those aren't the first
 * screen's. Requests are counted up to seven seconds after navigation,
 * whatever the machine's speed.
 */
const FIRST_LOAD_MS = 7000;

async function load() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // The pointer starts at (0, 0), over the menu bar, where it would fetch the
  // Dashboard ahead (DashboardLayer.tsx) whenever the browser happens to
  // report it there: a first visit's load is measured before anyone reaches
  // for the menu bar.
  await page.mouse.move(720, 450);
  const seen = [];
  const start = Date.now();
  // Who asked for each file (the script and function, from the browser's
  // initiator stack), so a file that shouldn't be in the first load shows
  // what fetched it.
  const initiators = new Map();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', ({ request, initiator }) => {
    const frame = initiator.stack?.callFrames?.find((f) => f.url.includes('/_astro/'));
    if (frame) initiators.set(new URL(request.url).pathname, `${frame.functionName || '(anonymous)'} in ${frame.url.split('/').pop()}`);
  });
  page.on('response', async (res) => {
    if (new URL(res.url()).origin !== new URL(URL_).origin) return;
    if (res.request().timing().startTime - start > FIRST_LOAD_MS) return;
    const body = await res.body().catch(() => null);
    const at = Math.round(res.request().timing().startTime - start);
    seen.push({ path: new URL(res.url()).pathname, type: res.request().resourceType(), bytes: body?.length ?? 0, gzip: body ? gzipSync(body).length : 0, at });
  });
  await page.addInitScript(() => sessionStorage.setItem('os-booted', '1'));
  // Pointer events nobody made (the browser reporting where its pointer is
  // as the page appears under it) can fetch the Dashboard ahead: list them.
  await page.addInitScript(() => {
    const t0 = performance.now();
    document.addEventListener('pointerover', (e) => {
      const el = e.target instanceof Element ? e.target : null;
      const where = el?.closest('.os-menubar') ? 'menu bar' : el?.closest('.os-dock') ? 'Dock' : el?.className?.toString().slice(0, 40) || el?.tagName;
      console.log(`[perf] pointerover ${where} at ${((performance.now() - t0) / 1000).toFixed(2)} s (${e.clientX}, ${e.clientY})`);
    }, true);
  });
  const pointerEvents = [];
  page.on('console', (m) => m.text().startsWith('[perf] ') && pointerEvents.push(m.text().slice(7)));
  await settle(page);
  await page.waitForTimeout(3000);
  await page.close();
  for (const e of pointerEvents.slice(0, 5)) console.log(`     ${e}`);
  const sum = (type, key = 'bytes') => seen.filter((r) => r.type === type).reduce((n, r) => n + r[key], 0);
  // What the first load's JavaScript is, largest first, to see what a change added.
  for (const r of seen.filter((r) => r.type === 'script').sort((a, b) => b.gzip - a.gzip)) {
    const by = initiators.get(r.path);
    console.log(`     ${(r.gzip / 1024).toFixed(1).padStart(5)} KB  ${r.path.replace('/_astro/', '').padEnd(34)} at ${(r.at / 1000).toFixed(2)} s${by ? `  (${by})` : ''}`);
  }
  const counts = new Map();
  for (const r of seen) counts.set(r.path, (counts.get(r.path) ?? 0) + 1);
  return {
    initialJsGzipKB: Math.round(sum('script', 'gzip') / 1024),
    initialCssGzipKB: Math.round(sum('stylesheet', 'gzip') / 1024),
    appletsInFirstLoad: seen.map((r) => r.path.split('/').pop().split('.')[0]).filter((name) => APPLET_CHUNKS.has(name)),
    imagesKB: Math.round(sum('image') / 1024),
    fontsKB: Math.round(sum('font') / 1024),
    fetchedTwice: [...counts].filter(([, n]) => n > 1).map(([path]) => path)
  };
}

async function withSixWindows(run) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.addInitScript(sixWindows);
  await settle(page);
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
server?.close();

let over = false;
for (const [key, budget] of Object.entries(BUDGET)) {
  const ok = result[key] <= budget;
  if (strict(key)) over ||= !ok;
  const mark = ok ? 'ok  ' : strict(key) ? 'OVER' : 'slow';
  console.log(`${mark} ${key.padEnd(16)} ${String(result[key]).padStart(6)}  (budget ${budget}${strict(key) ? '' : ', reported only'})`);
}
const lean = result.appletsInFirstLoad.length === 0;
over ||= !lean;
console.log(`${lean ? 'ok  ' : 'OVER'} appletsInFirstLoad ${lean ? 'none' : result.appletsInFirstLoad.join(', ')}`);
const twice = result.fetchedTwice.length === 0;
over ||= !twice;
console.log(`${twice ? 'ok  ' : 'OVER'} fetchedTwice     ${twice ? 'none' : result.fetchedTwice.join(', ')}`);
process.exit(over ? 1 : 0);
