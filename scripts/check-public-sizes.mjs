// Checks that no file in public/ is over its size budget. Everything in
// public/ is served as it is (no build step resizes it) and stays in git's
// history for good, so a picture is made small before it's added
// (docs/agents/adding.md), and this keeps it so.
//
// - A desktop picture (public/os/wallpapers/photos/): 1 MB. They're WebP
//   up to 2560px wide, fetched only when chosen, one at a time; at quality
//   about 75 the largest photos come to 900 KB.
// - Anything else (icons, thumbnails, fonts, the portrait, og.jpg): 200 KB.
//   The largest today is public/portrait.jpg at 155 KB.
//
// A file over its budget is made smaller or, when it can't be without a
// visible difference, listed in EXCEPTIONS with its size and the reason.
// `node scripts/check-public-sizes.mjs` prints each file over budget and
// exits 1 if there is any; tests/public-sizes.test.ts runs it with
// `npm test`.
import { globSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const KB = 1024;

/** Budgets, the first whose prefix matches a file's path (from public/). */
export const BUDGETS = [
  { prefix: 'os/wallpapers/photos/', bytes: 1024 * KB, what: 'a desktop picture' },
  { prefix: '', bytes: 200 * KB, what: 'a file in public/' }
];

/** Files allowed over their budget, up to `bytes`, each with the reason. */
export const EXCEPTIONS = new Map([
  [
    'os/wallpapers/photos/nature/zen_garden.webp',
    {
      bytes: 1600 * KB,
      reason:
        'A ryOS desktop picture kept on purpose (docs/decisions/0001). Raked gravel is nearly all fine detail, ' +
        'so at about quality 78 it is 1.53 MB; re-encoding it at quality 75 saves only 5.6% (still over 1 MB) ' +
        'for a measurable loss (36.6 dB PSNR against it, the gravel slightly softer at 1:1). Checked 2026-10-03.'
    }
  ]
]);

/** Every file in public/ over its budget, as { path, size, budget, what }. */
export function oversized(dir = root) {
  const over = [];
  for (const path of globSync('**/*', { cwd: join(dir, 'public') }).sort()) {
    const stat = statSync(join(dir, 'public', path));
    if (!stat.isFile() || path.endsWith('.DS_Store')) continue;
    const exception = EXCEPTIONS.get(path);
    const { bytes, what } = exception ? { bytes: exception.bytes, what: 'its exception' } : BUDGETS.find(({ prefix }) => path.startsWith(prefix));
    if (stat.size > bytes) over.push({ path: `public/${path}`, size: stat.size, budget: bytes, what });
  }
  return over;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const over = oversized();
  const kb = (bytes) => `${Math.round(bytes / KB)} KB`;
  for (const { path, size, budget, what } of over) console.error(`${path}: ${kb(size)}, over the ${kb(budget)} budget for ${what}`);
  if (over.length) {
    console.error('\nMake it smaller (docs/agents/adding.md), or list it in EXCEPTIONS in scripts/check-public-sizes.mjs with the reason.');
    process.exit(1);
  }
  console.log('Every file in public/ is within its size budget.');
}
