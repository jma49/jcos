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
  theme and appearance, Spotlight, Dashboard, Exposé, the screensaver
  and its settings, the visitor's place and the chosen desktop picture.
- `src/os/Expose.tsx`: the Exposé grid (F9, the bottom-left hot corner or
  View → Exposé). Windows animate to their slot in place, so iframes
  don't reload.
- `src/os/sound.ts`: interface sounds synthesized with Web Audio (no
  recordings). Off by default; the menu bar speaker and the Sound pane
  turn them on (`os-sound` in `localStorage`).
- `src/os/AppSwitcher.tsx`: ⌥Tab steps through open windows, most
  recent first; releasing ⌥ focuses the chosen one.
- `src/os/Screensaver.tsx`: Photos (a slideshow of the library),
  Starfield or Clock, after the idle time chosen in System Preferences
  (two minutes by default).
- `src/os/apps/Preferences.tsx`: System Preferences: desktop picture,
  screen saver, appearance (light, dark, automatic, or follow the sun
  where the visitor is) and place. Choices live in `localStorage`
  (`os-wallpaper`, `os-screensaver`, `theme`, `os-place`).
- `src/os/place.ts`: where the visitor is. `api/geo.ts` (a Vercel
  Function) returns the city, coordinates and time zone Vercel derives
  from their IP address; the Weather widget's flip side lets them pick a
  city instead (kept in `localStorage`), and `?place=<city>` overrides
  both for demos. Without a location (e.g. `astro dev`) it falls back to
  San Jose's weather and the device clock.
- `src/os/Sky.tsx` and `weather.ts`: tint the wallpaper with the time of
  day and weather at that place (Open-Meteo), in °F or °C by country.
  `?sky=dusk,rain` pins both. The menu bar clock and the Dashboard's
  clock and calendar use the place's time zone; a Dashboard widget shows
  Jincheng's time in San Jose next to it.
- `src/os/genie.ts`: the displacement map behind the Genie minimize in
  `Window.tsx`.
- `src/os/social.ts`: Stickies (a guestbook) and presence (who's
  online and from which city, and other visitors' cursors labelled with
  it) on Supabase. See below.
- `src/os/apps/Soapbox.tsx`: Jincheng's own notes and rants. Posts come
  from a Telegram bot, `supabase/functions/soapbox-bot` (setup in its
  README); visitors read them and leave one emoji reaction per post.
- `src/os/files.ts` and `apps/Finder.tsx`: Macintosh HD, a read-only
  file system built from the content (Applications, Applets, Documents,
  Pictures, Projects), browsed in Finder with icon and list views.
- `src/os/applets.ts`: the Applet Store's catalog and which applets this
  browser has installed (`os-applets`).
- `src/os/registry.tsx`: every app's name, icon, default and minimum size,
  and lazily imported component. `dockApps` and `mobileDockApps` pick what
  the Dock shows.
- `src/os/apps/`: one component per app. Content comes from `OSData`,
  assembled at build time in `index.astro` from `src/i18n/content.ts`, the
  projects collection and `src/lib/photos.ts` (Unsplash, fetched at build).
- `src/os/os.css`: the Aqua theme. Icons, fonts and the wallpaper under
  `public/os/` and `src/assets/os/` come from ryOS; see `NOTICE`.
- Deep links: `/?open=<app|project-slug|dashboard|screensaver>` opens that
  window.

### Stickies and presence (Supabase)

The browser talks to Supabase directly with the public anon key; row-level
security in `supabase/schema.sql` lets anyone add a note, which shows right
away. Each visitor gets one note: the database keeps a salted hash of the
poster's IP address, and the browser remembers it has posted. To set it
up, create a Supabase project, run the schema in its SQL editor, and set `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`) in Vercel and in `.env`,
for both Production and Preview. The names the Supabase integration for
Vercel uses, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, work as well.
Hide a note by setting `approved` to false in the Table editor. A project
set up from an older schema also needs the files in `supabase/migrations/`,
run in date order.

Without those variables, production hides both features, and `astro dev`
falls back to `src/os/social-local.ts`, which keeps notes in
`localStorage` (one per browser) and shares presence between tabs of one
browser.

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
