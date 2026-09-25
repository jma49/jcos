# AGENTS.md

Guidance for coding agents working in this repository.

## Language

Write everything in English: commit messages, pull request titles and
descriptions, issues, code comments, documentation, and file names.

The only exception is the Chinese copy of the site itself, the `zh`
entries in `src/i18n/content.ts` and the Chinese résumé PDF. Keep those
in Chinese.

## Site structure

The home page (`src/pages/index.astro`) is JM/OS, a Mac OS X–style
desktop rendered by one client-only React island in `src/os/`. The page
also renders a visually hidden plain-text copy of the content for screen
readers, crawlers and visitors without JavaScript.

- `src/os/store.ts`: zustand store for windows (map + z-order array),
  theme, Spotlight and Dashboard.
- `src/os/registry.tsx`: every app's name, icon, default and minimum size,
  and lazily imported component. `dockApps` and `mobileDockApps` pick what
  the Dock shows.
- `src/os/apps/`: one component per app. Content comes from `OSData`,
  assembled at build time in `index.astro` from `src/i18n/content.ts`, the
  projects collection and `src/lib/photos.ts` (Unsplash, fetched at build).
- `src/os/os.css`: the Aqua theme. Icons, fonts and the wallpaper under
  `public/os/` and `src/assets/os/` come from ryOS; see `NOTICE`.
- Deep links: `/?open=<app|project-slug|dashboard>` opens that window.

To add an app: add its id to `AppId` in `src/os/types.ts`, write the
component in `src/os/apps/`, register it in `registry.tsx`, and add it to
`dockApps` or the desktop shortcuts in `Desktop.tsx` if it should be
reachable from there.

The Chinese site is offline for now: `/zh/*` redirects to the English
paths (`vercel.json`). Keep the `zh` content in `content.ts` and the
Chinese project files; they will be used again.

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- Subject: `<type>: <summary>` in the imperative mood, lowercase after
  the colon, no trailing period, at most 72 characters. Common types are
  `feat`, `fix`, `docs`, `style`, `refactor`, `chore`.
- Leave a blank line after the subject, then write a body wrapped at 72
  characters that explains what changed and why.
- Keep each commit to one logical change.

## Adding a project

Projects are Markdown files in `src/content/projects/<lang>/<slug>.md`,
one per language with the same `<slug>`. The frontmatter schema lives in
`src/content.config.ts`:

```yaml
---
title: Project name
description: One sentence, shown in the list and as the page description.
date: 2026-10          # month the project shipped or started
status: live           # live | wip | archived
order: 1               # optional list position, lowest first; unset sorts after, newest first
stack: [Go, TypeScript]
repo: https://github.com/jma49/...   # optional
demo: https://...                    # optional, a URL or a site path
cover: ../covers/<slug>.jpg          # optional preview image, 16:10
capture: /                           # optional page to screenshot into cover
---
```

Preview images live in `src/content/projects/covers/`, shared by both
languages; Astro converts them to AVIF/WebP at the sizes each layout
needs. Projects without a cover show their title on a plain tile.

Set `capture` (in one language's file) to have the cover generated: a
site path like `/` is captured from the local build, a full URL from the
live site. Run `npm run preview:capture` to update covers locally; it
also captures the home page into `public/og.png`. Captures use a frozen
clock and reduced motion, and pages that answer with an HTTP error are
skipped. The `Update project previews` workflow runs it on every push to
`main`, on macOS so the fonts match, and commits images whose pixels
changed by more than 0.1%. Don't edit a captured image by hand; it will
be overwritten.

The JM/OS Projects app, the pages at `/projects/<slug>/`, the sitemap and
`llms.txt` all update automatically.

Put a client-side tool that needs no backend under `src/pages/tools/`
and hydrate its React component only on that page. Deploy a tool that
needs a server or API keys as its own project on a subdomain, and link
to it from `demo`.
