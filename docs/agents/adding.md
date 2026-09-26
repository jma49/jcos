# Adding things

## An app

To add an app: add its id to `AppId` in `src/os/core/types.ts`, write the
component in `src/os/apps/` (a folder for one with several parts), its
styles in `src/os/styles/apps/` (imported from `os.css`), and register it
in `src/os/core/registry.tsx`. The entry says where it appears: `dock`
(its position), `phoneDock`, `inApplications`, `applet`, `menuOnly` or
`internal`;
Spotlight, the Terminal and `?open=` pick it up by itself. Add a desktop
shortcut in `Desktop.tsx` if it needs one. Anything remembered in the
browser goes through `src/os/core/storage.ts`.

An applet (a small app installed from the Applet Store) is an app with
`applet: true` in the registry and an entry in `APPLETS` in
`src/os/core/applets.ts`.

## A song or an album

See [media.md](media.md): the entry in `src/data/songs.json`, its cover,
and tuning its lyrics' `offset`.

## A desktop picture

Photos go in `public/os/wallpapers/` as WebP, at most 2560px wide and
quality about 75, listed in `src/data/wallpapers.json`. Solid colours
and patterns are `SOLID_COLORS` and `PATTERNS` in
`src/os/look/wallpapers.ts`. Jincheng's own photos are never desktop
pictures.

## A project

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
