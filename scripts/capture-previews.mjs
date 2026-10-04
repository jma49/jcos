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
// Covers are 1440x900 JPEGs (the pages show them at most 1200 wide), light
// theme, with motion reduced. The home page is also captured into
// public/og.jpg at 1200x630 for link previews.
//
// Every image is kept in git for good, so a capture is only written when
// the page changed visibly: more than 0.1% of its pixels, compared with the
// image already there. What the page shows is pinned for the same reason:
// the clock and time zone (San Jose, 9:41 in the morning) and the weather
// in the menu bar (a fixed forecast instead of Open-Meteo's live one), so
// an unchanged site captures the same wherever and whenever it runs. A page
// that answers with an HTTP error keeps its old image.

import { spawnSync } from 'node:child_process';
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { chromium } from 'playwright';
import { serveDist } from './serve-dist.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const PROJECTS = join(ROOT, 'src/content/projects');
// Astro's own entry point, from its package.json (it moved in Astro 7).
const ASTRO_PACKAGE = join(ROOT, 'node_modules/astro/package.json');
const ASTRO = join(dirname(ASTRO_PACKAGE), JSON.parse(await readFile(ASTRO_PACKAGE, 'utf8')).bin.astro);

// JPEG quality: link previews must stay under ~150 KB (they're fetched by
// every chat app a link is pasted into); covers are re-encoded by Astro.
const COVER = { width: 1440, height: 900, quality: 82, placeholder: true };
const OG = { width: 1200, height: 630, quality: 72, placeholder: false, maxBytes: 150_000 };

// The moment every capture shows, where Jincheng is.
const TIME_ZONE = 'America/Los_Angeles';
const NOW = new Date('2026-09-25T09:41:00-07:00');

/** A fixed Open-Meteo answer: clear and 68°F, so the menu bar and sky don't follow today's weather. */
const FORECAST = {
  current: { temperature_2m: 68, weather_code: 0 },
  daily: {
    time: ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'],
    weather_code: [0, 1, 2, 0, 0, 1],
    temperature_2m_max: [75, 74, 72, 76, 77, 75],
    temperature_2m_min: [56, 55, 54, 56, 57, 56],
    sunrise: Array(6).fill('2026-09-25T06:59'),
    sunset: Array(6).fill('2026-09-25T18:58')
  }
};

/** Every project Markdown file that sets both `cover` and `capture`, plus the OG image. */
async function findTargets() {
  const targets = new Map([[join(ROOT, 'public/og.jpg'), { url: '/', ...OG }]]);
  for (const entry of await readdir(PROJECTS, { recursive: true })) {
    if (!entry.endsWith('.md')) continue;
    const file = join(PROJECTS, entry);
    const frontmatter = (await readFile(file, 'utf8')).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const field = (name) => frontmatter.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'm'))?.[1];
    const cover = field('cover');
    const capture = field('capture');
    if (!cover || !capture) continue;
    const out = resolve(dirname(file), cover);
    targets.set(out, { url: capture, ...COVER });
  }
  return targets;
}

/**
 * Share of pixels that differ noticeably between two images of the same
 * size, computed on a canvas in the browser. Repeated captures of an
 * unchanged page are not byte-identical, so this decides whether a new
 * screenshot is worth committing.
 */
async function pixelDiff(page, a, b) {
  const type = (buf) => (buf[0] === 0x89 ? 'png' : 'jpeg');
  const toDataUrl = (buf) => `data:image/${type(buf)};base64,${buf.toString('base64')}`;
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
  for (const [out, { placeholder }] of targets) {
    if (placeholder && (await access(out).then(() => false, () => true))) {
      await scratch.screenshot({ path: out, type: 'jpeg', quality: 85 });
    }
  }

  const build = spawnSync(process.execPath, [ASTRO, 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) throw new Error('astro build failed');

  // Site paths are captured from the build, served in this process.
  if ([...targets.values()].some(({ url }) => url.startsWith('/'))) server = await serveDist();

  for (const [out, { url: target, width, height, quality, maxBytes }] of targets) {
    const url = target.startsWith('/') ? new URL(target, server.url).href : target;
    // Reduced motion also skips the JM/OS boot screen.
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: 'light',
      reducedMotion: 'reduce',
      timezoneId: TIME_ZONE
    });
    await context.route(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/, (route) =>
      route.fulfill({ json: FORECAST, headers: { 'access-control-allow-origin': '*' } })
    );
    const page = await context.newPage();
    // Freeze time so the JM/OS menu-bar clock doesn't change every capture.
    await page.clock.setFixedTime(NOW);
    // Keep the current cover when the page is down; an error page is not a
    // preview. `::warning::` surfaces the skip in the GitHub Actions summary.
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    if (!response?.ok()) {
      console.log(`::warning::Skipped ${url}: HTTP ${response?.status() ?? 'no response'}`);
      await context.close();
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
    // JPEG keeps each committed image small.
    const shot = await page.screenshot({ type: 'jpeg', quality });
    const previous = await readFile(out).catch(() => null);
    const diff = previous ? await pixelDiff(scratch, previous, shot) : 1;
    await context.close();
    if (diff < 0.001) {
      console.log(`${url} unchanged (${(diff * 100).toFixed(3)}% of pixels differ)`);
      continue;
    }
    await writeFile(out, shot);
    if (maxBytes && shot.length > maxBytes) {
      console.log(`::warning::${relative(ROOT, out)} is ${Math.round(shot.length / 1000)} KB, over ${maxBytes / 1000} KB: lower its quality`);
    }
    console.log(`${url} -> ${relative(ROOT, out)} (${(diff * 100).toFixed(2)}% of pixels changed)`);
  }
} finally {
  await browser.close();
  server?.close();
}
