# Adding things

## An app

An app is a folder named by its id: `src/os/apps/<id>/` for one built
into the desktop, `src/os/applets/<id>/` for an applet from the Applet
Store. In it:

- `manifest.ts`: `defineApp({ id, name, added, Icon, window, load, … })`
  from `src/os/kit/manifest.ts`. `load` is `() => import('./TheApp')`, so
  the code arrives on first open. `added` is the day it came to JM/OS
  (YYYY-MM-DD), which Time Machine shows it from; every built-in app has
  one (a test checks), and an applet's is its listing's. The fields say
  where it appears: `dock` (its position), `phoneDock`, `inApplications`,
  `menuOnly`, `internal`, `noDock`; `applet` is its page in the Applet
  Store (category, tagline, description, date added); `shortcuts` are
  places inside it that Spotlight finds by name or `keywords`, as
  Preferences' panes;
  `fullScreen` makes it take the whole screen rather than a window, as
  Time Machine does (it leaves by `closeFullScreen()`). The manifest is
  part of the first load: it imports only `kit/manifest`, `core/icons`
  and its own folder (the lint enforces it).
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
folders and manifests agree. The desktop's shortcuts
(`shell/DesktopIcons.tsx`: Macintosh HD, About Me, Résumé, Projects) stay
as they are: nothing is added to the desktop (Jincheng's rule,
2026-09-29; [desktop.md](desktop.md)).

A built-in app may use the OS (`core/`, `social/`, `media/`…) but not
another app: what two apps share belongs in the OS. It can add its own
menus to the menu bar while its window is in front
(`useWindows.getState().setMenus(win.id, menus)` in an effect, cleared
with `undefined` on unmount), as Chess does; phones show only the Apple
menu, so keep a way in from the window too. Work heavy enough to freeze
the window goes in a Web Worker, as Chess's computer does
(`new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`),
with a fallback on the page if it can't start. An applet imports
nothing but `src/os/kit` and its own folder; what it needs from the OS
goes into the kit. A game runs its frames through
`useGameLoop(tick, front)`, so it stops behind another window, and
keeps scores with `saved(id, 'best')`. Anything else remembered in the
browser goes through `src/os/core/storage.ts` (the lint enforces it, as
it does the boundaries above).

## A song or an album

See [media.md](media.md): a row in Supabase's `songs` (or `albums`), its
cover, and tuning its lyrics' offset. At most 200 songs.

## A desktop picture

Photos go in `public/os/wallpapers/` as WebP, at most 2560px wide and
quality about 75, listed in `src/data/wallpapers.json`. Solid colours
and patterns are `SOLID_COLORS` and `PATTERNS` in
`src/os/look/wallpapers.ts`. Jincheng's own photos are never desktop
pictures.

## A project

Projects are Markdown files in `src/content/projects/<slug>.md`. The
frontmatter schema lives in
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
cover: ./covers/<slug>.jpg           # optional preview image, 16:10
capture: /                           # optional page to screenshot into cover
---
```

Preview images live in `src/content/projects/covers/`; Astro converts them to AVIF/WebP at the sizes each layout
needs. Projects without a cover show their title on a plain tile.

Set `capture` to have the cover generated: a
site path like `/` is captured from the local build, a full URL from the
live site. Run `npm run preview:capture` to update covers locally; it
also captures the home page into `public/og.jpg` (1200×630, JPEG, under
150 KB: the script warns past that). Covers are 1440×900 JPEGs. Captures
use a frozen clock and time zone (9:41 in San Jose), a fixed forecast in
place of the live weather, and reduced motion, so an unchanged page
captures the same every time; pages that answer with an HTTP error are
skipped. An image is only rewritten when more than 0.1% of its pixels
changed, since every version stays in git for good. The `Update project
previews` workflow runs it once a day (and by hand from the Actions tab),
on macOS so the fonts match. Don't edit a captured image by hand; it will
be overwritten.

The JM/OS Projects app, the pages at `/projects/<slug>/`, the sitemap and
`llms.txt` all update automatically.

Put a client-side tool that needs no backend under `src/pages/tools/`
and hydrate its React component only on that page. Deploy a tool that
needs a server or API keys as its own project on a subdomain, and link
to it from `demo`.
