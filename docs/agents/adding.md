# Adding things

## An app

An app is a folder named by its id: `src/os/apps/<id>/` for one built
into the desktop, `src/os/applets/<id>/` for an applet from the Applet
Store. In it:

- `manifest.ts`: `defineApp({ id, name, Icon, window, load, … })` from
  `src/os/kit/manifest.ts`. `load` is `() => import('./TheApp')`, so the
  code arrives on first open. The fields say where it appears: `dock`
  (its position), `phoneDock`, `inApplications`, `menuOnly`, `internal`,
  `noDock`; `applet` is its page in the Applet Store (category, tagline,
  description, date added); `shortcuts` are places inside it that
  Spotlight finds, as Preferences' panes. The manifest is part of the
  first load: it imports only `kit/manifest`, `core/icons` and its own
  folder (the lint enforces it).
- The component (the default export `load` fetches), and its rules or
  physics in a plain module with tests.
- Its stylesheet, declared in the manifest as
  `styles: () => import('./app.css?inline')`: it's fetched with the code
  and adopted before the app renders (`core/appStyles.ts`), never in the
  first load. Don't `import './app.css'` from the component: Astro would
  hoist it into the page. Rules for the app's own classes, phone and
  reduced-motion variants included, stay in this file; anything another
  app or the OS uses goes in `src/os/styles/` (`components.css`,
  `source-list.css`).

Then add one line for it to `src/os/catalog.ts`. `AppId`, the Dock,
Finder, Spotlight, the Terminal, `?open=`, the Applet Store and the
smoke test all follow from the catalog; `catalog.test.ts` checks the
folders and manifests agree. Add a desktop shortcut in `Desktop.tsx` if it
needs one.

A built-in app may use the OS (`core/`, `social/`, `media/`…) but not
another app: what two apps share belongs in the OS. An applet imports
nothing but `src/os/kit` and its own folder; what it needs from the OS
goes into the kit. A game runs its frames through
`useGameLoop(tick, front)`, so it stops behind another window, and
keeps scores with `saved(id, 'best')`. Anything else remembered in the
browser goes through `src/os/core/storage.ts`.

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
skipped. The `Update project previews` workflow runs it once a day (and
by hand from the Actions tab), on macOS so the fonts match, and commits
images whose pixels changed by more than 0.1%. Don't edit a captured image by hand; it will
be overwritten.

The JM/OS Projects app, the pages at `/projects/<slug>/`, the sitemap and
`llms.txt` all update automatically.

Put a client-side tool that needs no backend under `src/pages/tools/`
and hydrate its React component only on that page. Deploy a tool that
needs a server or API keys as its own project on a subdomain, and link
to it from `demo`.
