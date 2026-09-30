# JM/OS: majincheng.com

Jincheng Ma's portfolio, as a Mac OS X Aqua desktop in the browser. It's
live at **[www.majincheng.com](https://www.majincheng.com)**.

Projects, the résumé, photos and posts open as windows on the desktop.
Around them sits a small working system:

- **Shell:** menu bar, Dock, Exposé, Dashboard, Spotlight, a screen saver,
  and Finder over Macintosh HD, with Jincheng's home folder: locked, as
  another user's was, but for Public and Sites. Time Machine goes back
  through the days in space, to the apps, music and discs the desktop
  had then.
- **Apps and applets:** Terminal, TextEdit, iPod (with Jincheng's
  ratings and playlists, and On-The-Go) and Karaoke with synced lyrics,
  DVD Player
  (YouTube videos burned onto discs, kept in Finder's Movies folder),
  Chess, Photo Booth, and applets from the Applet Store (Minesweeper,
  Spider Solitaire, Pinball, Synth and more).
- **Job Hunt:** every company Jincheng has applied to, on a board of
  stages kept up from Gmail; everyone else sees only the numbers.
- **Social:** member accounts, Chat with rooms and private conversations,
  a Stickies guestbook and, for every member, stickies on their own
  desktop and an iCal of their own,
  AirDrop between visitors, and Soapbox posts sent from a Telegram bot.
- **Ambient:** the desktop follows the light and weather where the visitor
  is.

The page also ships a plain-text copy of everything for screen readers,
search engines and browsers without JavaScript. Every project has its own
page at `/projects/<slug>/`.

## Stack

- [Astro](https://astro.build) 7, static output, with one client-only
  React 19 island for the desktop (`src/os/`), plus zustand and motion.
  Node 24: `engines` in `package.json`, which Vercel and CI follow; use
  the same locally (npm warns about another major).
- [Supabase](https://supabase.com): accounts, Postgres with row-level
  security, Realtime, Storage and Edge Functions (Deno).
- [Vercel](https://vercel.com): hosting and four small functions in
  `api/` (the visitor's location, a lyrics relay, the music library,
  cached at the edge, and whether a page can be framed in the Browser).
- Vitest, Playwright for preview images, and GitHub Actions.

## Running it

```bash
npm install
npm run dev        # http://localhost:4321
npm test           # unit tests (Vitest)
npm run test:db    # database rules against a local Postgres (needs psql)
npm run build      # -> dist/
npm run serve      # the build and the api/ functions on http://localhost:4321 (after a build)
npm run test:smoke # opens every app in the build, fails on any error (after a build)
npm run perf       # load, drag and idle budgets (after a build)
```

It runs without any setup. Without Supabase settings, `astro dev` uses an
in-browser stand-in (`src/os/social/local.ts`). That stand-in keeps
accounts, notes and chat in `localStorage` and shares chat and presence
between tabs. A production build without them hides the social features.

### Configuration

Copy `.env.example` to `.env`. Every value is optional.

| Variable | For |
| --- | --- |
| `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` | accounts, Chat, Stickies, presence, Soapbox |
| `UNSPLASH_ACCESS_KEY` | fetching the latest photos at build time |

Set the same variables in Vercel, for Production and Preview. Server-side
secrets never go in `.env` or Vercel. They live in Supabase as Edge
Function secrets:
- the Telegram bot token, for the Soapbox bot;
- `RESEND_API_KEY`, for the account-recovery function.

### Backend

1. Create a Supabase project and run `supabase/schema.sql` in its SQL
   editor.
2. Turn off Authentication › Providers › Email › "Confirm email".
   Accounts are usernames, with addresses made from them.
3. A project set up from an older schema instead runs the files in
   `supabase/migrations/`, in the order of their timestamped names.
4. Deploy the Edge Functions. Each has its own README:
   - `supabase/functions/soapbox-bot`: Telegram → Soapbox posts, plus
     moderation notices.
   - `supabase/functions/account-recovery`: password reset by email,
     through Resend.

## Layout

```
src/os/            the desktop: core/ shell/ apps/ applets/ kit/ ambient/ look/ media/ social/ styles/
src/pages/         the home page, project pages, robots.txt, llms.txt
src/content/       projects (Markdown, one file per language) and their covers
src/i18n/          the site's copy (English; the Chinese copy is kept for later)
src/data/          songs, desktop pictures, the photo snapshot
api/               Vercel Functions: geo, lyrics, songs, framing (docs/agents/api.md)
tests/api/         the Vercel Functions' unit tests (not in api/, or Vercel would deploy them)
supabase/          schema, migrations, Edge Functions, database tests
scripts/           preview capture, photo refresh, favicon and portrait builders, bot setup
public/os/         icons, fonts and desktop pictures (from ryOS, see NOTICE)
docs/agents/       guidance for coding agents, by part (AGENTS.md is the entry point)
```

[AGENTS.md](AGENTS.md) has the conventions and the checks for each kind of
change; [docs/agents/](docs/agents/) maps every part of the desktop and
how to add an app, a project, a song or a desktop picture.
[HANDOFF.md](HANDOFF.md) is the running state of the project and its open
issues; [ROADMAP.md](ROADMAP.md) is what comes next, in order.

## Security

- The browser uses only Supabase's public key. Row-level security,
  column grants and triggers enforce every rule: who can post, how often,
  and who can read a private conversation.
- Rate limits hold under concurrent requests, and site-wide caps stop
  floods. `npm run test:db` checks all of it, races included.
- Private data (recovery addresses, reset tokens, secrets) sits in a
  schema the API can't reach. Only a hash of each reset link is kept.
- Service-role keys and third-party tokens exist only inside Edge
  Functions.
- Responses carry security headers (`vercel.json`), and Dependabot
  proposes dependency updates weekly. CI fails on a high or critical
  advisory in a production dependency, and the workflows pin every
  action to a commit SHA with read-only permissions by default.
  The one exception is the ocra review of pull requests, which calls
  the owner's review workflow in Open-CR-Agent at `main`: Google Cloud
  issues its keyless login to that ref only (HANDOFF.md).

To report a security problem, please email the address on the résumé
rather than opening an issue.

## Performance

A first visit downloads about 149 KB of JavaScript (gzipped), one
desktop picture and two subset fonts. Everything else loads when it's
first used, or once the desktop has settled: each app, the Supabase
client, Presence, Spotlight, the Dashboard and the screen savers.
Dragging a window re-renders only that window. `npm run perf` checks
these budgets:
- what a first visit downloads;
- the script time of a drag with six apps open;
- the script time of an idle desktop.

[docs/agents/performance.md](docs/agents/performance.md) has the rules,
and [docs/agents/self-audit.md](docs/agents/self-audit.md) the audit every
significant change goes through.

## Scripts

| Command | Does |
| --- | --- |
| `npm run check` | Type-checks the site (`astro check`). CI runs it on every pull request. |
| `npm run preview:capture` | Screenshots project pages into their covers, and the home page into `public/og.png`. A workflow runs it once a day. |
| `bash scripts/vercel-ignore.sh <base>` | Vercel's ignored build step: says whether a deployment would be skipped (only docs, tests, CI or tooling changed since `<base>`). |
| `npm run lint` | Checks the rules of React hooks and effects' dependencies (ESLint, hooks rules only). CI runs it on every pull request. |
| `npm run perf` | Measures a production build against the performance budgets (see `docs/agents/performance.md`). |
| `npm run photos:update` | Refreshes `src/data/photos.json` from Unsplash. |
| `npm run songs:snapshot` | Saves the music library from Supabase to `src/data/songs.json`, the fallback. |
| `node scripts/build-favicon.mjs` | Regenerates the favicons from one vector mark. |
| `node scripts/build-portrait.mjs <photo>` | Crops `public/portrait.jpg` from the source photo. |
| `bash scripts/setup-soapbox.sh` | Sets up the Soapbox bot's secrets, deploy and webhook. |

## License

Copyright (C) 2026 Jincheng Ma.

The code is free software under the **GNU Affero General Public License
v3.0 or later** ([LICENSE](LICENSE)). You may use, change and share it.
If you run a changed version where others can use it over a network,
you must offer them its source under the same license.

Jincheng's personal content is not covered by that license. All rights
reserved. This means:
- the bio, experience and other copy in `src/i18n/content.ts`;
- the project write-ups in `src/content/projects/`;
- the photos (`public/portrait.jpg` and those listed in
  `src/data/photos.json`);
- the Soapbox posts.

To reuse the code for your own site, replace that content with yours.

## Credits

The icons, fonts and desktop pictures come from
[ryOS](https://github.com/ryokun6/ryos) (AGPL-3.0); see [NOTICE](NOTICE).
Apple, Mac OS X and Aqua are trademarks of Apple Inc. This site is not
affiliated with Apple or ryOS.
