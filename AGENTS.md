# AGENTS.md

Guidance for coding agents working in this repository.

## Language

Write everything in English: commit messages, pull request titles and
descriptions, issues, code comments, documentation, and file names.

The only exceptions are content that is Chinese by nature:
- the Chinese copy of the site: the `zh` entries in
  `src/i18n/content.ts`, `src/content/projects/zh/` and the Chinese
  résumé PDF;
- proper names in data, such as song titles and artists in
  `src/data/songs.json`, which may also be quoted in the docs;
- patterns that have to match Chinese text, such as the lyric credits in
  `api/lyrics.ts`.

File and folder names are English and ASCII. Before committing, check
that nothing else slipped in, for example with a search for CJK
characters over `git ls-files`.

## Site structure

The home page (`src/pages/index.astro`) is JM/OS, a Mac OS X–style
desktop rendered by one client-only React island in `src/os/`. The page
also renders a visually hidden plain-text copy of the content for screen
readers, crawlers and visitors without JavaScript.

- `src/os/core/store.ts`: zustand store for windows (map + z-order array),
  theme and appearance, Spotlight, Dashboard, Exposé, the screensaver
  and its settings, the visitor's place and the chosen desktop picture.
- `src/os/shell/Expose.tsx`: the Exposé grid (F9, the bottom-left hot corner or
  View → Exposé). Windows animate to their slot in place, so iframes
  don't reload.
- `src/os/core/sound.ts`: interface sounds synthesized with Web Audio (no
  recordings). Off by default; the menu bar speaker and the Sound pane
  turn them on (`os-sound` in `localStorage`). That one switch and volume
  govern every sound, the music included: anything new that plays audio
  must follow it (see `setLoudness()` in `music.ts`).
- `src/os/shell/AppSwitcher.tsx`: ⌥Tab steps through open windows, most
  recent first; releasing ⌥ focuses the chosen one.
- `src/os/shell/Screensaver.tsx` and `savers.tsx`: Desktop Pictures (a
  slideshow of Mac OS X's scenic desktop pictures, `SCENIC` in
  `wallpapers.ts`), Flurry, Soapbox (the latest posts in large type), Starfield,
  Clock or Bounce, after the idle time chosen in System Preferences (two
  minutes by default).
- `src/os/apps/preferences/`: System Preferences, as Leopard's: a Show
  All grid of panes in three rows (`panes.ts`, which also gives the words
  its search field and Spotlight find them by), back and forward, and a
  window titled after the pane. It opens from the Apple menu only
  (`menuOnly` in the registry): no Dock icon, not in Applications or on a
  phone's home screen. Panes: Appearance (light, dark, automatic, or
  follow the sun where the visitor is), Desktop & Screen Saver, Dock
  (size, magnification), Date & Time (place, 24-hour clock), Displays
  (Night Shift, motion), Sound, Accounts, Sharing (city, pointer, AirDrop),
  Software Update (compares the build with `main` on GitHub) and Backup &
  Restore (`backup.ts`: every `os-*` setting to a file and back, and a
  reset). Choices live in `localStorage` (`os-wallpaper`,
  `os-wallpaper-rotate`, `os-screensaver`, `theme`, `os-place`, and
  `os-system` for the rest, in `src/os/core/system.ts`). Animations ask
  `useReduceMotion()` there rather than motion's `useReducedMotion()`, so
  the Displays pane's choice wins over the device's.
- The desktop picture changes to another from the same collection each
  time the visitor leaves the tab and comes back (`useDesktopPicture.ts`,
  `nextPicture()` in `wallpapers.ts`); the default moves on to `SCENIC`.
  A checkbox in System Preferences turns it off. Jincheng's own photos
  are only shown in Photos, never as the desktop or the screen saver.
- The menu bar is see-through. Its text is white or black depending on
  how bright the top of the desktop picture is (`topBrightness()` in
  `accent.ts`, darkened by the sky's layers via `skyDimming()`), shown as
  `data-backdrop` on `.os-root`. It turns opaque over a zoomed window and
  on phones while an app is open. The Apple logo is tinted with the
  accent.
- `src/os/look/wallpapers.ts`: desktop pictures besides photos: ryOS's photo
  collections and tiles (`public/os/wallpapers/`, listed in
  `src/data/wallpapers.json`; photos are WebP, at most 2560px wide), solid
  colours, SVG/CSS patterns and a dynamic sky that follows the sun and
  weather at the visitor's place. The store keeps a photo URL or
  `color:<id>`, `pattern:<id>`, `dynamic:sky`; `backgroundFor()` turns
  it into CSS.
- `src/os/look/accent.ts`: the accent colour. By default it's sampled from the
  desktop picture (the most prominent colourful hue, at a readable
  lightness); System Preferences can fix it instead. Everything blue in
  `os.css` derives from `--os-accent` via `color-mix()`.
- `src/os/ambient/place.ts`: where the visitor is. `api/geo.ts` (a Vercel
  Function) returns the city, coordinates and time zone Vercel derives
  from their IP address; the Weather widget's flip side lets them pick a
  city instead (kept in `localStorage`), and `?place=<city>` overrides
  both for demos. Without a location (e.g. `astro dev`) it falls back to
  San Jose's weather and the device clock.
- `src/os/ambient/Sky.tsx` and `weather.ts`: tint the wallpaper with the time of
  day and weather at that place (Open-Meteo), in °F or °C by country.
  `?sky=dusk,rain` pins both. The menu bar clock and the Dashboard's
  clock and calendar use the place's time zone; a Dashboard widget shows
  Jincheng's time in San Jose next to it.
- `src/os/shell/drawer.tsx`: Tiger-style drawers. Each window has a slot
  along its edge (right, left if there's no room, or over the content
  when neither side fits); an app renders `<Drawer open>` anywhere and it
  appears there. Used by Photos (Info) and Finder (Get Info, ⌥I).
- `src/os/shell/genie.ts`: the displacement map behind the Genie minimize in
  `Window.tsx`.
- `src/os/social/social.ts`: Stickies (a guestbook) and presence (who's
  online and from which city, and other visitors' cursors labelled with
  it) on Supabase. See below.
- `src/os/apps/Soapbox.tsx`: Jincheng's own notes and rants, with
  photos. Posts come from a Telegram bot, `supabase/functions/soapbox-bot`
  (setup in its README): text, photos with captions, albums (one post)
  and images sent as files; photos are copied into the public `soapbox`
  storage bucket. Visitors read them and leave one emoji reaction per
  post.
- `src/os/media/music.ts`, `lyrics.ts`, `apps/ipod/IPod.tsx` and `apps/Karaoke.tsx`:
  the iPod (click wheel, menus, Now Playing with the video and a line of
  lyrics) and Karaoke (full-window video with lyrics that fill as they're
  sung, or a listening view for instrumentals). `src/data/songs.json`
  holds `albums` (whole albums, with cover, year and a note) and `songs`
  (YouTube video id, title, artist, `album`, square `cover` art from
  Apple's catalogue, `track` for album tracks, `instrumental`). Playback
  uses the YouTube IFrame API; the app used last owns playback and hands
  the position over when the other takes it, and ⏭/⏮ follow the queue a
  song was started from (album, artist or all). Lyrics come from
  lrclib.net in the browser, or, when it has none, from NetEase through
  `api/lyrics.ts` (a Vercel Function; converted to Traditional Chinese).
  To add a song, add its video id, title, artist, album and cover; tune
  `offset` (ms the lyrics run ahead of the video, negative for videos
  with an intro) by nudging it in Karaoke with `[`/`]` and adding the
  tweak it shows, and set `lyrics` to an lrclib id if the search picks
  the wrong entry. Prefer album audio (a "Topic" or label upload) over
  music videos, whose edits don't match the lyrics' timing. Visitors'
  own timing tweaks live in `os-lyric-offsets`. YouTube's own chrome must
  never show: players go in a `.os-player-frame` (300px taller than the
  space, so the title bar and logo are cut off) and the app covers the
  video with the artwork until `usePlayer`'s `live` is true.
- `src/os/apps/ipod/`: the iPod's full-screen views (Cover Flow, Brick,
  Music Quiz), which take the wheel through a `ScreenInput`, and the
  `Marquee` used for long titles. The iPod's own settings (theme,
  backlight, artwork or video) live in `os-ipod`.
- `src/os/shell/NowPlaying.tsx`: the menu bar's ♫ while a song is on, with a
  card to control it; it also feeds the Media Session API. The Dynamic
  desktop picture `dynamic:cover` shows the playing song's cover,
  blurred.
- `src/os/core/files.ts` and `apps/finder/`: Macintosh HD, a read-only
  file system built from the content (Applications, Applets, Documents,
  Music, Pictures, Projects), browsed in Finder with icon, list and
  column views, Quick Look (Space), keyboard navigation and a
  right-click menu. A file's `look` is what Quick Look shows.
- `src/os/social/airdrop.ts` and `apps/AirDrop.tsx`: AirDrop between
  signed-in members on the desktop (signed out, it asks you to sign in).
  Only a Macintosh HD path is sent, and the receiver looks it up on its
  own disk, so only JM/OS's own content can
  arrive; offers go over presence signals and must be accepted. Finder
  (right-click, drag onto AirDrop), Photos and project windows share.
- `src/os/core/notices.ts` and `shell/Notices.tsx`: Growl-style
  notifications (chat mentions, AirDrop offers). `shell/ContextMenu.tsx`
  is the right-click menu the desktop and Finder share.
- `src/os/apps/PhotoBooth.tsx`: the camera with CSS-filter effects, a
  countdown and one or four pictures, kept in `os-photobooth` (the last
  eight, as small JPEGs). The camera is only on while the window is open.
- `src/os/apps/Synth.tsx`: an applet synthesizer on the shared
  AudioContext (`audio()` in `sound.ts`); it follows the sound switch
  and volume, and a note turns sound on. Settings in `os-synth`.
- `src/os/apps/AboutThisMac.tsx`: the Apple menu's About This Mac.
  `__JMOS_BUILD__` (defined in `astro.config.mjs` from Vercel's
  `VERCEL_GIT_COMMIT_SHA`) is the build's short commit hash.
- The Terminal (`apps/Terminal.tsx`) has a working folder on Macintosh
  HD (`cd`, `pwd`, `ls`, `cat`, `open <path>`), and the Dock and the
  desktop share `shell/ContextMenu.tsx` for their right-click menus.
- `src/os/core/applets.ts` and `apps/AppletStore.tsx`: the Applet Store's
  catalog (Minesweeper, Tile Game, Spider Solitaire, Pinball, Calculator,
  Synth). Pinball's table, physics and rules are in `apps/pinball/table.ts`
  (table units, 400 × 700); keep it free of anything from Microsoft's
  Space Cadet. Which applets this browser has installed is kept in
  `os-applets`; installed applets appear in Finder's Applets folder and
  Spotlight. To add one, write the app,
  register it, and add an entry to `APPLETS`.
- Open windows survive a reload (`src/os/core/windowSession.ts`, saved in
  `os-windows`); `?open=` wins. A first visit gets the Welcome window
  alone, centred (`os-welcomed`), and About once it's closed.
- The home page's browser tab says "Jincheng" (`tabTitle` in
  `Layout.astro`); link previews keep the full title.
- Phones are anything narrower than 768px or a short touch screen (a phone
  sideways): `isPhone()` and `PHONE_QUERY` in `src/os/core/store.ts`, and
  the same media query in the stylesheets.
- `src/os/core/registry.tsx`: every app's name, icon, default and minimum size,
  and lazily imported component. `dockApps` and `mobileDockApps` pick what
  the Dock keeps (other apps appear there while open, except `noDock`
  panels); `launcherApps` is what Spotlight lists. Keep the Dock and the
  desktop (`shell/DesktopIcons.tsx`: Macintosh HD, About Me, Résumé,
  Projects) short; a phone's home screen lists every app.
- `src/os/apps/`: one component per app. Content comes from `OSData`,
  assembled at build time in `index.astro` from `src/i18n/content.ts`, the
  projects collection and `src/lib/photos.ts` (Unsplash, fetched at build).
- `src/os/os.css`: the Aqua theme, split by part of the desktop into
  `src/os/styles/` (one file per app in `styles/apps/`) and imported in
  cascade order. Icons, fonts and the wallpaper under
  `public/os/` and `src/assets/os/` come from ryOS; see `NOTICE`.
- Deep links: `/?open=<app|project-slug|dashboard|screensaver>` opens that
  window.

### Accounts, Stickies, Chat and presence (Supabase)

The browser talks to Supabase directly with the public anon key; row-level
security and triggers in `supabase/schema.sql` do the enforcing.

- **Accounts** (`src/os/social/`, `apps/Account.tsx`): a username and a
  password, with an optional recovery address. They're Supabase Auth users
  whose address is made from the username
  (`<username>@users.majincheng.com`), so Authentication › Providers ›
  Email › "Confirm email" must be off. `public.profiles` holds usernames;
  recovery addresses sit in `private.recovery_emails`, out of the API's
  reach. `social/account.ts` tells the interface who's signed in. A
  forgotten password is reset with a one-time link emailed to the
  recovery address by `supabase/functions/account-recovery` (Resend;
  setup in its README); the link opens `/?open=account&reset=<token>`.
- **Stickies**: members only, three notes in any 24 hours, signed with the
  username; members can take their own down. Hide a note by setting
  `approved` to false in the Table editor.
- **Soapbox reactions**: members react as themselves and can change or take
  back a reaction; everyone else gets one per post, by salted IP hash.
- **Chat** (`apps/Chat.tsx`, `social/chatState.ts`): public rooms listed
  in `public.chat_rooms` (add one in the Table editor) and private
  conversations between two members (rooms named
  `dm:<account id>:<account id>`, smaller id first, readable only by
  those two). Rooms are readable by anyone and written by members; kept
  for good and delivered over Realtime. Hide a message with `hidden`.
  Typing, nudges, @mentions and unread counts live in the browser; a
  signed-in member gets a notification and a Dock badge for private
  messages and mentions while Chat is closed.
- **Presence and signals** (`social/Presence.tsx`, `social/signals.ts`):
  one Realtime channel carries who's on the desktop (city, username,
  open chat room, whether AirDrop can reach them), their cursors, and
  signals: short-lived messages such as typing, nudges and AirDrop
  offers. Anyone can send anything there, so receivers check what
  arrives (`cleanInfo()` for presence).

- **Moderation** (`supabase/migrations/20260926091033_moderation.sql`, the
  Soapbox bot): new Stickies notes and public chat messages go to the
  owner on Telegram through `pg_net`, signed with a secret in
  `private.secrets`, with Hide / Show again buttons; `/watch on|off`.

To set it up, create a Supabase project, run the schema in its SQL editor,
turn off "Confirm email", and set `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`) in Vercel and in `.env`,
for both Production and Preview. The names the Supabase integration for
Vercel uses, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, work as well. A project set up from
an older schema needs the files in `supabase/migrations/`, run in the
order of their timestamped names. Test a migration against the live project inside `begin; …
rollback;` first (`supabase db query --linked -f`).

Without those variables, production hides these features, and `astro dev`
falls back to `src/os/social/local.ts`, which keeps accounts, notes and
chat in `localStorage` and shares chat and presence between tabs of one
browser.

To add an app: add its id to `AppId` in `src/os/core/types.ts`, write the
component in `src/os/apps/` (a folder for one with several parts), its
styles in `src/os/styles/apps/` (imported from `os.css`), and register it
in `src/os/core/registry.tsx`. The entry says where it appears: `dock`
(its position), `phoneDock`, `inApplications`, `applet`, `menuOnly` or
`internal`;
Spotlight, the Terminal and `?open=` pick it up by itself. Add a desktop
shortcut in `Desktop.tsx` if it needs one. Anything remembered in the
browser goes through `src/os/core/storage.ts`.

`src/os` is grouped by domain: `core/` (store, types, registry, icons,
sounds, storage, files), `shell/` (menu bar, Dock, windows and the rest
of the chrome), `ambient/` (place, weather, sky), `look/` (desktop
pictures, accent), `media/` (music, lyrics), `social/` (Supabase),
`apps/` and `styles/`.

The Chinese site is offline for now: `/zh/*` redirects to the English
paths (`vercel.json`). Keep the `zh` content in `content.ts` and the
Chinese project files; they will be used again.

## Security

- The browser holds only the public key; the database enforces every
  rule. A new table gets row-level security, `revoke all` from `anon`
  and `authenticated`, and column-level grants for exactly what the site
  reads and writes.
- Functions that bypass row-level security are `security definer` with
  `set search_path = public`, and have `execute` revoked from `public`,
  `anon` and `authenticated` unless the site calls them. Ones only an
  Edge Function calls are granted to `service_role` alone. Trigger
  functions get `execute` revoked from all three (triggers still fire:
  the right is only checked when a trigger is created). A function that
  only reads what its caller may read anyway is `security invoker`.
- Policies check something real: no `with check (true)`. Run Supabase's
  Advisors › Security after each migration; the findings left on purpose
  are listed in `supabase/migrations/20260926100511_advisor.sql`.
- A limit that counts rows before inserting ("three a day") takes a
  transaction-scoped advisory lock for whoever it limits first
  (`pg_advisory_xact_lock`), or concurrent requests all get through.
  Add a race for it in `supabase/tests/race.sh`, and a site-wide cap
  where many accounts together could flood it.
- Private data (recovery addresses, reset tokens, secrets) lives in the
  `private` schema, which the API doesn't expose. Keep tokens as hashes.
- Secrets (service role, Telegram, Resend) exist only as Supabase Edge
  Function secrets; nothing server-side goes in `PUBLIC_*` variables,
  Vercel or the repository. `.env` is ignored; `.env.example` lists
  what's safe.
- Presence and signals are unauthenticated claims: check shape and
  size, tie a name to the sender's own presence, and throttle anything
  that notifies.
- Anything a visitor wrote renders as text: links only for `http(s)`,
  never `dangerouslySetInnerHTML` (project Markdown, built at build time,
  is the one exception).
- Security headers are set in `vercel.json`. Dependabot proposes updates
  weekly; review majors (Astro, Vite) with a full build and the tests.

## README

`README.md` is the project's front page: what JM/OS is, how to run and
configure it, the backend setup, the layout, security and scripts. Update
it in the same pull request as any major change: a new part of the
desktop, a new service, secret or setup step, a new top-level folder or
script, or a changed command.

## Tests

`npm test` runs the unit tests (Vitest, `*.test.ts` next to the code,
and each Edge Function's `*.test.mjs`); keep game rules and
other logic worth testing in plain modules without React (as
`apps/spider/rules.ts` and `apps/pinball/table.ts` are). `npm run
test:db` checks the database's rules (`supabase/tests/rules.sql`)
against a local Postgres, then races the per-member limits with
overlapping sessions (`supabase/tests/race.sh`); add a check there with
every new rule or migration. CI (`.github/workflows/ci.yml`) runs both
and the build on every pull request.

## Pitfalls

Mistakes this project has already made, kept here so they aren't made
again.

### Supabase and the database

- The SQL editor runs a script as one transaction. One failing statement
  (a `storage.buckets` insert some projects refuse) rolled back
  everything before it, and the next call failed with PGRST202 (no such
  function). Wrap optional steps in `do $$ … exception when others then
  raise notice … $$`.
- PostgREST caches the schema. End a migration that adds functions or
  columns with `notify pgrst, 'reload schema';`.
- Migrations are named `<UTC timestamp>_<what it does>.sql`, with the
  time they're written as `YYYYMMDDHHMMSS`, the way `supabase migration
  new` names them. They used to be named by date, and the date was
  bumped for each new file: nine migrations written over two days ran
  up to "20261003". They were renamed to their real commit times. The
  project applies migrations by hand in the SQL editor, so a rename
  changes nothing there. Before switching to `supabase db push`,
  mark the ones already run with `supabase migration repair`.
- Every migration must run twice without harm:
  - `if not exists` for tables and indexes;
  - `create or replace` for functions;
  - `drop … if exists` before `create policy` and `create trigger`;
  - `on conflict` for seed rows.

  `run.sh` reruns the latest migrations over the schema to prove it.
- Counting rows before an insert is not a limit under concurrency. Six
  notes sent at once all got through a "three a day" check. Take
  `pg_advisory_xact_lock` first (see Security).
- A count needs an index that matches its `where`. The per-member chat
  limit scanned every message ever sent.
- Supabase Auth needs "Confirm email" off, or sign-up returns no
  session.
- The publishable key isn't a JWT. Edge Functions the browser calls
  before sign-in are deployed with `--no-verify-jwt` and check their
  input themselves.
- The Vercel integration names the variables
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
  `social.ts` reads those as well as `PUBLIC_SUPABASE_*`.

### Edge Functions and the Telegram bot

- A PostgREST insert with `return=minimal` answers 201 or 204 with an
  empty body. `JSON.parse('')` threw, and `/at` failed. Read the text,
  and parse only when there is some.
- Deploy functions from `main` after merging. The bot once ran code from
  an old branch.
- The `soapbox` bucket can be missing even after the migration. The bot
  makes it on `NoSuchBucket` and retries the upload.
- Buttons need `callback_query` in the webhook's `allowed_updates`. The
  bot registers the webhook itself; keep that list in `index.ts`,
  `scripts/setup-soapbox.sh` and the README the same.
- Owner-facing errors say why, with the upstream status and message.
  "Something went wrong" alone cost a round trip each time.
- Visitor-facing answers must not reveal anything:
  - Password reset answers the same whether or not a link went out.
  - It sends the mail after answering (`EdgeRuntime.waitUntil`), so
    timing doesn't tell either.

### The desktop

- Motion's `useReducedMotion()` only knows the device. Use
  `useReduceMotion()` from `core/system.ts`, which honours System
  Preferences.
- A keyboard handler must check that its window is the front one.
  Photos' lightbox and Pinball once took keys meant for other windows.
  Pinball's restart moved from N to F2 so typing elsewhere can't
  trigger it.
- Release pointer capture on `pointerup` and `pointercancel`. Pinball's
  flippers stuck otherwise.
- Anything kept in window `props` is saved in `os-windows` and survives
  a reload. Don't leave one-time values there: the reset token is
  cleared once used.
- Launching an open window again with the same props doesn't navigate
  it. Compare against the props last acted on, as Preferences does.
- YouTube's chrome must never show; see the iPod and Karaoke notes
  above. Chrome delays playback in background tabs.
- Jincheng's own photos appear only in Photos, never as the desktop
  picture or the screen saver.
- Unsplash blocks Vercel's build servers. Photos come from the snapshot
  in `src/data/photos.json`, or from the API with
  `UNSPLASH_ACCESS_KEY`.

### Games

- Pinball's flippers leave a gap the ball can't get stuck in.
- Pockets always kick the ball out.
- The ball saver works once per ball.
- Lanes re-arm after a completed set.
- The canvas follows its window's size.
- `table.test.ts` plays the table with bots; run it after any change to
  the table or physics.

### Tests and tooling

- A Vitest `expect` inside a per-frame loop made the Pinball test time
  out. Use plain `throw` in hot loops, and give long simulations an
  explicit timeout.
- A rule check run as `anon` or `authenticated` sees only the columns
  granted to that role. Look test fixtures up (and read columns like
  `visitor`) after `reset role`, or the check fails with "permission
  denied" for the wrong reason.
- The database test stubs need grants for `service_role` too, such as
  the `net` schema, or a check fails for the wrong reason.
- Playwright here launches with
  `executablePath: '/opt/pw-browsers/chromium'`. A throwaway script must
  run from inside the repository to find the `playwright` package.
- Dependabot opens one pull request per package. Packages that move
  together (Astro with `@astrojs/*`, React with its types) are
  upgraded in one pull request. Adjacent bumps to the same file (the
  workflow actions) conflict once the first merges; redo the rest on
  `main` rather than merging `main` into each. Every major gets the
  whole desktop opened in a browser, not only CI, which builds but
  never runs the apps.
- `pkill -f "<pattern>"` also matches the shell running it when the
  pattern is in its own command line; stop background servers by PID.
- There's no Prettier config. Don't reformat whole files; it buries the
  change in the diff.
- Wrapping a big JSX tree reindents all of it. Wrap through a small
  outer component instead, as `Desktop` wraps `Shell` in `MotionConfig`.

### Git and pull requests

- Check `git status` and `git diff --cached` before committing. A staged
  rename from other work once rode along in an unrelated fix.
- After scripting an edit to a doc, read the paragraph back. A
  replacement once spliced two sentences together.
- After a pull request merges, start the branch again from `main`.
  Never stack new work on merged history.
- Local tool state stays untracked: `supabase/.temp/`, `.vercel/`,
  `.env`. One file under `supabase/.temp/` was once committed despite
  `.gitignore`.
- When a file, script or asset is no longer used, delete it in the same
  change that makes it unused, and update the README and AGENTS.md.

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
