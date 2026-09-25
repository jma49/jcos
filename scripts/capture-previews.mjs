// Screenshots each project's `capture` page into its `cover` image.
//
// Usage: npm run preview:capture
//
// A project opts in with two frontmatter fields:
//   cover: ../covers/<slug>.jpg   where the image is written
//   capture: /                    a path on this site, or a full URL
//
// The script builds the site and captures site paths from that build, so
// the preview always matches the code being committed. A cover that does
// not exist yet gets a blank placeholder first, since the build needs it.
// Screenshots are 1920x1200 (1440x900 at 4/3 scale), light theme, with
// motion reduced. An existing cover is only replaced when more than 0.1%
// of its pixels change, so re-running on an unchanged site is a no-op, and
// never when the page answers with an HTTP error.

import { spawn, spawnSync } from 'node:child_process';
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const PROJECTS = join(ROOT, 'src/content/projects');
const PORT = 4329;
const ORIGIN = `http://localhost:${PORT}`;
const ASTRO = join(ROOT, 'node_modules/astro/astro.js');

/** Every project Markdown file that sets both `cover` and `capture`. */
async function findTargets() {
  const targets = new Map();
  for (const entry of await readdir(PROJECTS, { recursive: true })) {
    if (!entry.endsWith('.md')) continue;
    const file = join(PROJECTS, entry);
    const frontmatter = (await readFile(file, 'utf8')).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const field = (name) => frontmatter.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'm'))?.[1];
    const cover = field('cover');
    const capture = field('capture');
    if (!cover || !capture) continue;
    // Languages share one cover, so capture each image once.
    const out = resolve(dirname(file), cover);
    targets.set(out, capture.startsWith('/') ? ORIGIN + capture : capture);
  }
  return targets;
}

/** Serves dist/ with `astro preview` and resolves once it responds. */
async function startServer() {
  // Run astro directly (not through npx) so kill() stops the server itself.
  const server = spawn(process.execPath, [ASTRO, 'preview', '--port', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(ORIGIN);
      return server;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  server.kill();
  throw new Error(`astro preview did not start on port ${PORT}`);
}

/**
 * Share of pixels that differ noticeably between two images of the same
 * size, computed on a canvas in the browser. Repeated captures of an
 * unchanged page are not byte-identical, so this decides whether a new
 * screenshot is worth committing.
 */
async function pixelDiff(page, a, b) {
  const toDataUrl = (buf) => `data:image/jpeg;base64,${buf.toString('base64')}`;
  return page.evaluate(
    async ([a, b]) => {
      const load = async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        return img;
      };
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return 1;
      const pixels = (img) => {
        const canvas = new OffscreenCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const [pa, pb] = [pixels(ia), pixels(ib)];
      let changed = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const delta = Math.max(
          Math.abs(pa[i] - pb[i]),
          Math.abs(pa[i + 1] - pb[i + 1]),
          Math.abs(pa[i + 2] - pb[i + 2])
        );
        if (delta > 24) changed++;
      }
      return changed / (pa.length / 4);
    },
    [toDataUrl(a), toDataUrl(b)]
  );
}

/** Bundled Chromium in CI; falls back to the local Chrome install. */
async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: 'chrome' });
  }
}

const targets = await findTargets();
if (targets.size === 0) {
  console.log('No projects set both `cover` and `capture`.');
  process.exit(0);
}

const browser = await launchBrowser();
let server = null;

try {
  // Blank page for placeholders and for comparing images.
  const scratch = await browser.newPage();
  await scratch.setContent('<body style="margin:0;background:#f6f5f3"></body>');
  for (const out of targets.keys()) {
    if (await access(out).then(() => false, () => true)) {
      await scratch.screenshot({ path: out, type: 'jpeg', quality: 85 });
    }
  }

  const build = spawnSync(process.execPath, [ASTRO, 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) throw new Error('astro build failed');

  if ([...targets.values()].some((url) => url.startsWith(ORIGIN))) {
    server = await startServer();
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 4 / 3,
    colorScheme: 'light',
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();

  for (const [out, url] of targets) {
    // Keep the current cover when the page is down; an error page is not a
    // preview. `::warning::` surfaces the skip in the GitHub Actions summary.
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    if (!response?.ok()) {
      console.log(`::warning::Skipped ${url}: HTTP ${response?.status() ?? 'no response'}`);
      continue;
    }
    // Wait for fonts and for images visible in the viewport. Hidden or
    // below-the-fold lazy images never load, so skip them, and cap the wait.
    await page.evaluate(async () => {
      const visible = [...document.images].filter(
        (img) => img.checkVisibility() && img.getBoundingClientRect().top < innerHeight
      );
      const ready = Promise.all([
        document.fonts.ready,
        ...visible.map((img) => img.decode().catch(() => {}))
      ]);
      await Promise.race([ready, new Promise((r) => setTimeout(r, 10_000))]);
    });
    // JPEG keeps each committed preview small; Astro re-encodes it anyway.
    const jpeg = /\.jpe?g$/i.test(out);
    const shot = await page.screenshot(jpeg ? { type: 'jpeg', quality: 85 } : {});
    const previous = await readFile(out).catch(() => null);
    const diff = previous ? await pixelDiff(scratch, previous, shot) : 1;
    if (diff < 0.001) {
      console.log(`${url} unchanged (${(diff * 100).toFixed(3)}% of pixels differ)`);
      continue;
    }
    await writeFile(out, shot);
    console.log(`${url} -> ${relative(ROOT, out)} (${(diff * 100).toFixed(2)}% of pixels changed)`);
  }
} finally {
  await browser.close();
  server?.kill();
}
