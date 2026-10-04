// Checks that every repository path the docs cite in backticks exists, so
// a moved or deleted file doesn't leave the docs pointing at nothing.
// Reads README.md, AGENTS.md, CONTRIBUTING.md, SECURITY.md and docs/**/*.md.
//
// A token is taken for a path when it starts with one of the repository's
// top-level files or folders (src/…, api/…, README.md) and has a / or a
// file extension; anything else in backticks (code, commands, table names)
// is left alone. Then:
// - a glob (`supabase/functions/*/index.ts`) must match at least one file;
// - a placeholder (`src/os/apps/<id>/`, `supabase/migrations/NNNN_x.sql`,
//   `{apps,applets}`) is checked up to the folder before it;
// - a command (`node scripts/audit.mjs`) has each of its words checked,
//   and `:` or `#` after a path (`api/lyrics.ts:42`) is cut off;
// - a path in another repository (`../jmos-ops/…`) or on the web is skipped;
// - a short path relative to the folder the doc is about
//   (`shell/DesktopIcons.tsx` in docs/agents/desktop.md) is checked
//   against that folder, through RELATIVE_TO below.
// `node scripts/check-doc-paths.mjs` prints each missing path with its
// file and line, and exits 1 if there is any. tests/doc-paths.test.ts runs
// it with `npm test`.
import { existsSync, globSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The docs read: the front-page files and everything under docs/. */
export function docFiles(dir = root) {
  const top = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md'].filter((name) => existsSync(join(dir, name)));
  return [...top, ...globSync('docs/**/*.md', { cwd: dir }).sort()];
}

// Folders a doc cites paths relative to, tried after the repository's
// root. Only for paths that don't start with a top-level name: these are
// the folders the docs talk about without repeating their prefix.
const RELATIVE_TO = ['src/os/', 'src/os/apps/', 'src/', 'supabase/'];

// Paths that are cited on purpose though they aren't in this repository,
// each with its reason.
const ALLOWED = new Map([
  // Written by the build or a script, ignored by git.
  ['dist/', 'build output (npm run build)'],
  ['.env', 'local secrets, never committed (.env.example is)'],
  ['.astro/', 'Astro’s generated types'],
  ['node_modules/', 'installed dependencies'],
  ['.claude/settings.local.json', 'a personal tool file, kept out of git'],
  ['.claude/worktrees/', 'agent worktrees, kept out of git'],
  ['CLAUDE.local.md', 'a personal tool file, kept out of git'],
  ['.cursor/', 'a personal tool folder, kept out of git'],
  ['public/og.png', 'named as what not to commit (the image is public/og.jpg)'],
  ['supabase/.temp/', 'the Supabase CLI’s local state, kept out of git'],
  // Named in docs/agents/pitfalls.md as history: where Astro's entry point
  // was and is, inside node_modules/astro.
  ['node_modules/astro/astro.js', 'Astro’s old entry point, gone since Astro 7 (pitfalls.md)'],
  ['bin/astro.mjs', 'Astro’s entry point inside node_modules/astro (pitfalls.md)']
]);

const extension = /\.(md|mdx|ts|tsx|mjs|cjs|js|json|jsonc|css|astro|sql|sh|yml|yaml|toml|txt|html|svg|png|jpe?g|webp|avif|gif|ico|mp3|m4a|woff2?|xml|lrc)$/i;

/** The repository's top-level names (src, api, README.md…), from disk. */
function topLevel(dir) {
  return new Set(readdirSync(dir).filter((name) => name !== 'node_modules' && name !== '.git'));
}

/** The paths a backticked token cites: itself, or a command's arguments. */
export function pathsOf(token, tops) {
  if (/^[a-z]+:\/\//i.test(token.trim())) return [];
  return token.trim().split(/\s+/).map((word) => pathOf(word, tops)).filter(Boolean);
}

/** The path a word cites, or null when it isn't one. */
export function pathOf(word, tops) {
  let path = word.replace(/^\.\//, '').replace(/[),.;]+$/, '');
  // A line number or symbol after the file: `api/lyrics.ts:42`, `x.ts#L4`.
  path = path.replace(/[:#].*$/, '');
  if (!path || /^[a-z]+:/i.test(word) || path.startsWith('../') || path.startsWith('/')) return null;
  const first = path.split('/')[0];
  const isPath = (tops.has(first) || tops.has(first + '/')) && (path.includes('/') || extension.test(path));
  return isPath ? path : null;
}

/** A short path relative to a folder a doc is about (`shell/x.tsx`). */
function relativePathOf(token) {
  const path = token.trim();
  if (/\s/.test(path) || path.startsWith('.') || path.startsWith('/') || /^[a-z]+:/i.test(path)) return null;
  if (!/^[\w.-]+(\/[\w.@-]+)+\/?$/.test(path)) return null;
  return extension.test(path) || path.endsWith('/') ? path : null;
}

/** The part of a path before its first placeholder, glob or brace. */
function fixedPart(path) {
  const at = path.search(/<|\{|NNNN|YYYY|\.\.\.|…/);
  if (at === -1) return path;
  return path.slice(0, path.lastIndexOf('/', at) + 1);
}

function exists(dir, path) {
  if (path.includes('*')) return globSync(path.replace(/\/$/, ''), { cwd: dir }).length > 0;
  return existsSync(join(dir, path));
}

/** Every cited path that's missing, as { file, line, path }. */
export function missingPaths(dir = root) {
  const tops = topLevel(dir);
  const missing = [];
  for (const file of docFiles(dir)) {
    const lines = readFileSync(join(dir, file), 'utf8').split('\n');
    let fenced = false;
    lines.forEach((text, index) => {
      if (/^\s*```/.test(text)) fenced = !fenced;
      if (fenced) return;
      for (const [, token] of text.matchAll(/`([^`\n]+)`/g)) {
        const paths = pathsOf(token, tops);
        for (const path of paths) {
          if (ALLOWED.has(path)) continue;
          const fixed = fixedPart(path);
          if (fixed && !exists(dir, fixed)) missing.push({ file, line: index + 1, path });
        }
        if (paths.length) continue;
        const short = relativePathOf(token);
        if (!short || ALLOWED.has(short)) continue;
        const fixed = fixedPart(short);
        if (!fixed || !fixed.includes('/')) continue;
        const found = [''].concat(RELATIVE_TO).some((base) => exists(dir, base + fixed));
        if (!found) missing.push({ file, line: index + 1, path: short });
      }
    });
  }
  return missing;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const missing = missingPaths();
  for (const { file, line, path } of missing) console.error(`${file}:${line}: \`${path}\` doesn’t exist`);
  if (missing.length) {
    console.error(`\n${missing.length} path(s) cited in the docs don’t exist: fix the doc, or add the path to ALLOWED in ${relative(process.cwd(), fileURLToPath(import.meta.url))} with the reason.`);
    process.exit(1);
  }
  console.log('Every path the docs cite exists.');
}
