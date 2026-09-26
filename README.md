# JM/OS: majincheng.com

Jincheng Ma's portfolio, as a Mac OS X Aqua desktop in the browser. It's
live at **[www.majincheng.com](https://www.majincheng.com)**.

Projects, the résumé, photos and posts open as windows on the desktop.
Around them sits a small working system:

- **Shell:** menu bar, Dock, Exposé, Dashboard, Spotlight, a screen saver,
  and Finder over a read-only Macintosh HD.
- **Apps and applets:** Terminal, iPod and Karaoke with synced lyrics,
  Photo Booth, and applets from the Applet Store (Minesweeper, Spider
  Solitaire, Pinball, Synth and more).
- **Social:** member accounts, Chat with rooms and private conversations,
  a Stickies guestbook, AirDrop between visitors, and Soapbox posts sent
  from a Telegram bot.
- **Ambient:** the desktop follows the light and weather where the visitor
  is.

The page also ships a plain-text copy of everything for screen readers,
search engines and browsers without JavaScript. Every project has its own
page at `/projects/<slug>/`.

## Stack

- [Astro](https://astro.build) 7 (Node 22.12 or later), static output, with one client-only
  React 19 island for the desktop (`src/os/`), plus zustand and motion.
- [Supabase](https://supabase.com): accounts, Postgres with row-level
  security, Realtime, Storage and Edge Functions (Deno).
- [Vercel](https://vercel.com): hosting and two small functions in `api/`
  (the visitor's location, and a lyrics relay).
- Vitest, Playwright for preview images, and GitHub Actions.

## Running it

```bash
npm install
npm run dev        # http://localhost:4321
npm test           # unit tests (Vitest)
npm run test:db    # database rules against a local Postgres (needs psql)
npm run build      # -> dist/
npm run perf       # load, drag and idle budgets, against `npx astro preview` (after a build)
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
src/os/            the desktop: core/ shell/ apps/ ambient/ look/ media/ social/ styles/
src/pages/         the home page, project pages, robots.txt, llms.txt
src/content/       projects (Markdown, one file per language) and their covers
src/i18n/          the site's copy (English; the Chinese copy is kept for later)
src/data/          songs, desktop pictures, the photo snapshot
api/               Vercel Functions: geo, lyrics
supabase/          schema, migrations, Edge Functions, database tests
scripts/           preview capture, photo refresh, favicon and portrait builders, bot setup
public/os/         icons, fonts and desktop pictures (from ryOS, see NOTICE)
```

[AGENTS.md](AGENTS.md) has the conventions and a map of every part: how to
add an app, a project, a song or a desktop picture.
[HANDOFF.md](HANDOFF.md) is the running state of the project and its open
issues.

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
  proposes dependency updates weekly.

To report a security problem, please email the address on the résumé
rather than opening an issue.

## Performance

A first visit downloads about 170 KB of JavaScript (gzipped), one
desktop picture and two subset fonts. Everything else loads when it's
first used: each app, the Supabase client and the screen savers.
Dragging a window re-renders only that window. `npm run perf` checks
these budgets:
- what a first visit downloads;
- the script time of a drag with six apps open;
- the script time of an idle desktop.

AGENTS.md has the rules and the self-audit every significant change
goes through.

## Scripts

| Command | Does |
| --- | --- |
| `npm run preview:capture` | Screenshots project pages into their covers, and the home page into `public/og.png`. CI runs it on every push to `main`. |
| `npm run perf` | Measures a production build against the performance budgets (see AGENTS.md). |
| `npm run photos:update` | Refreshes `src/data/photos.json` from Unsplash. |
| `node scripts/build-favicon.mjs` | Regenerates the favicons from one vector mark. |
| `node scripts/build-portrait.mjs <photo>` | Crops `public/portrait.jpg` from the source photo. |
| `bash scripts/setup-soapbox.sh` | Sets up the Soapbox bot's secrets, deploy and webhook. |

## Credits

The icons, fonts and desktop pictures come from
[ryOS](https://github.com/ryokun6/ryos) (AGPL-3.0); see [NOTICE](NOTICE).
Apple, Mac OS X and Aqua are trademarks of Apple Inc. This site is not
affiliated with Apple or ryOS.
