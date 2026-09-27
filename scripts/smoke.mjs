// Opens every app in a production build and fails if any of them breaks.
//
// Usage: npm run build && npm run test:smoke
//
// The unit tests check logic and the build checks that everything compiles,
// but neither runs the apps. This loads /?open=<app> for each app in the
// catalog (and a project, the Dashboard and the screen saver) in a fresh
// page and fails on an uncaught error, a console error, or an app showing
// AppBoundary's crash panel. Network failures are ignored: dist/ is served
// without the /api functions or Supabase, and third parties can be slow.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { serveDist } from './serve-dist.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
/** How long an app gets to load its code and settle. */
const SETTLE = 2500;
const PARALLEL = 4;

/** Every app ?open= can name, read from the manifests the catalog lists. */
async function targets() {
  const catalog = await readFile(join(ROOT, 'src/os/catalog.ts'), 'utf8');
  const manifests = [...catalog.matchAll(/from '\.\/(.+\/manifest)'/g)].map(([, path]) => path);
  const apps = [];
  for (const path of manifests) {
    const manifest = await readFile(join(ROOT, 'src/os', `${path}.ts`), 'utf8');
    if (!/^\s*internal: true/m.test(manifest)) apps.push(manifest.match(/^\s*id: '(\w+)'/m)[1]);
  }
  const projects = await readdir(join(ROOT, 'src/content/projects/en'));
  const project = projects.find((f) => f.endsWith('.md'))?.replace(/\.md$/, '');
  return [...apps, project, 'dashboard', 'screensaver'].filter(Boolean);
}

const ignored = /Failed to load resource|net::ERR_|ERR_NAME_NOT_RESOLVED/;

const server = await serveDist();
const base = server.url.replace(/\/$/, '');
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const failures = [];

/** Opens one target in a new visitor's browser; returns what went wrong. */
async function check(target) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  // Skip the boot animation.
  await context.addInitScript(() => sessionStorage.setItem('os-booted', '1'));
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignored.test(m.text())) problems.push(`console: ${m.text().slice(0, 300)}`);
  });
  try {
    await page.goto(`${base}/?open=${target}`, { waitUntil: 'load' });
    await page.waitForTimeout(SETTLE);
    if (await page.locator('.os-crash').count()) problems.push('showed the crash panel');
    const opened = ['dashboard', 'screensaver'].includes(target) || (await page.locator('.os-window').count()) > 0;
    if (!opened) problems.push('opened no window');
  } catch (e) {
    problems.push(`failed to load: ${e.message}`);
  } finally {
    await context.close();
  }
  return problems;
}

try {
  const list = await targets();
  if (list.length < 10) throw new Error(`Found only ${list.length} apps in the registry; has its format changed?`);
  const results = new Map();
  const queue = [...list];
  // A few pages at a time: each mostly waits.
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let target; (target = queue.shift()); ) results.set(target, await check(target));
    })
  );
  for (const target of list) {
    const problems = results.get(target);
    console.log(`${problems.length ? '✗' : '✓'} ${target}`);
    for (const p of problems) console.log(`    ${p}`);
    if (problems.length) failures.push(target);
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nEvery app opened without an error.');
