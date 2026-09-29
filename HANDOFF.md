# Handoff: majincheng.com (JM/OS)

State of the project as of 2026-09-28, for picking the work up in a new
session: where it runs, how we work, what was decided, and what's open.
Conventions and a map of the code are in [AGENTS.md](AGENTS.md) and
[docs/agents/](docs/agents/); what was built when is in the git history.

## 1. Where it runs

- Astro 7 with one `client:only` React 19 island (zustand, motion),
  Tailwind 4, on Node 24 (`engines.node` in `package.json`, which Vercel
  and both workflows follow; npm warns on another major locally).
- `npm run build && npm run serve` runs the production build with the
  `api/` functions on http://localhost:4321, like Vercel minus Supabase
  (the social features hide without it). Check changes there when
  deployments are scarce.
- Hosted on Vercel project `jmos` (team "Jonson's projects", Hobby
  plan; the CLI logged in as `jma49` reaches it); merging to `main`
  deploys. DNS is at GoDaddy. The repository is `jma49/jmos`.
- One Vercel Firewall rule, "Rate limit the relays" (2026-09-29): at
  most 60 requests a minute per IP to `/api/lyrics` and `/api/framing`
  together, answered with a plain 429. Hobby allows one rate-limit rule;
  see docs/agents/api.md.
- Supabase project `hszogpoyyqgwjuznbegd` backs accounts, Stickies,
  Chat, presence and Soapbox. Vercel holds its URL and publishable key
  as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (all environments; Astro exposes the `NEXT_PUBLIC_` prefix through
  `vite.envPrefix`). Only `main` deploys (`git.deploymentEnabled` in
  `vercel.json`), so a branch has no preview: try it with `npm run
  serve`. Anything posted from a local build with the real keys is real
  data.
- `supabase/schema.sql` describes the full current state for a new
  project; changes to an existing one go in a new file under
  `supabase/migrations/`, written so it can be rerun, and the owner runs
  it by hand in the SQL editor. The editor warns about "destructive
  operations" for `drop policy` / `drop trigger` lines; that's expected.
- Deploy the Edge Functions from an up-to-date `main`: `supabase
  functions deploy` uploads the working copy, so deploying from an old
  branch puts old code live.
- Free Supabase projects pause after a week without activity; the social
  features then hide themselves until it's resumed.
- The "Update project previews" workflow runs on macOS once a day and by
  hand (not on every push, to save deployments): it refreshes the Photos snapshot
  (`npm run photos:update`) and recaptures the project covers and
  `public/og.png` (`npm run preview:capture`), committing what changed.
- The Hobby plan caps deployments a day, and a busy day of merges hit
  it (2026-09-26: "Deployment rate limited — retry in 24 hours"; the
  GitHub CI stays the gate meanwhile). Only `main` deploys now
  (`git.deploymentEnabled` in vercel.json), so a pull request spends no
  deployment until it merges, and `scripts/vercel-ignore.sh` (the
  `ignoreCommand`) skips `main`'s build when only docs, tests, CI,
  Supabase or tooling changed. On a busy day, batch merges.

The icons, fonts (Lucida Grande, Apple Garamond, Monaco) and the stones
wallpaper are copied from ryOS. Using them was a deliberate choice after
discussing the Apple/Adobe copyright risk; `NOTICE` records their origin.
The `src/os` code is original and only borrows architecture ideas from
ryOS (AGPL-3.0).

## 2. Working agreements

- English for commits, PRs, comments and docs; only the Chinese site
  copy is in Chinese.
- Conventional Commits, one logical change per commit.
- Branch → PR → merge after CI passes. The owner sometimes merges PRs
  directly on GitHub, so fetch `main` before assuming a PR is still open.
- Merge with merge commits. When PRs are stacked, merge from the bottom
  up. Delete a branch once it's merged; only `main` should be left.
- Try UI changes in a real browser before calling them done. The owner's
  Chrome has reduced motion on, so animation work needs a temporary
  bypass to see (and the reduced-motion fallback checked separately).

## 3. Decisions

- **The retro assets stay** (decided 2026-09-28). Replacing ryOS's
  Mac OS X icons, fonts and wallpapers with original drawings was
  proposed: a greyhound mark in place of the apple (Aqua, Graphite and
  natural finishes) and five icons redrawn in SVG. Jincheng judged the
  drafts worse than the originals and dropped the idea. Keep the apple,
  the icons, the fonts and the pictures as they are (see NOTICE); don't
  propose replacing them again. New icons for apps ryOS doesn't have
  (Stickies, Soapbox) are still drawn here to match.
- **No King of Fighters '98** (decided 2026-09-26). A Neo Geo emulator
  runs well in the browser (EmulatorJS with the FBNeo core), but the
  game ROM and the BIOS are SNK's and can't be hosted; the only lawful
  version makes visitors bring their own ROM, which isn't worth having
  when it can't just be played. The same goes for other commercial
  games: build originals in their spirit, as Pinball is.
- **Jincheng's photos are for Photos only**, not desktop pictures or the
  screen saver, which use Mac OS X's own pictures.
- **AirDrop is for members**, as in ryOS.
- **Positioning.** The title is "Software Engineer"; the copy leads with
  bringing AI agents into each stage of quality control and building
  developer tooling, not "mainly testing". The bio covers US experience
  only and mentions bouldering (V6) and photography. Projects, in order:
  ocra (in progress), Assay, JM/OS.

- **Apps are self-contained** (decided 2026-09-26; docs/agents/adding.md).
  Each app is a folder with a manifest listed once in
  `src/os/catalog.ts`; its code and styles load on first open, an
  applet's when it's got in the Applet Store, never on a first visit
  (`perf` checks). Applets use the OS only through `src/os/kit`, apps
  don't import each other, and the OS reaches apps only through the
  catalog; the lint enforces all of it. Removing an applet keeps what it
  saved.
- **The music library moves to Supabase** (decided 2026-09-26, not yet
  built): Jincheng adds songs and plays them for whoever is on the desktop
  from the Telegram bot. Limits and choices:
  - at most 200 songs, enforced in the database with an advisory lock; a
    full library refuses new songs (the bot says so) rather than dropping
    old ones;
  - only Jincheng requests songs for now; visitors requesting, approved
    from Telegram, may come later;
  - "listen along" joins at Jincheng's position, from the elapsed time the
    database computes (`now() - started_at`), not the visitor's clock;
  - requests reach visitors through `postgres_changes` on a table only the
    Edge Function writes, never a broadcast, which anyone with the public
    key could forge; the visitor clicks to listen (browsers don't play
    sound unasked), under the one sound switch;
  - the site reads the library through `/api/songs`, cached at the edge
    for thirty seconds and served stale for thirty more while it's read
    again (changed 2026-09-29 from five minutes and a day: on a quiet site
    the first visitor after a pause got the edge's old copy, so a song
    added at 05:13 was first served at 05:31; a miss costs about 0.2 s).
    A visit picks up songs added meanwhile when a music app opens or the
    tab comes back, at most once a minute, appended so every song keeps
    its place. When Supabase can't be read, the function serves the snapshot in the
    repository (`npm run songs:snapshot`, refreshed by hand, not by a
    daily commit that would spend a deployment): Vercel's CDN doesn't
    honour `stale-if-error`, so an older cached answer can't stand in. The
    library left the first load;
  - covers stay links (Apple's and YouTube's image hosts only, checked by
    the database); songs are validated in the database, not only by the
    bot, which builds every URL it fetches itself (YouTube oEmbed, iTunes
    Search, lrclib) from the parsed video id.
  Free-plan headroom (checked 2026-09-26): 200 songs are about 100 KB of
  the 500 MB database; the edge cache keeps the 5 GB egress out of reach.
- **A visitor's iPod is theirs** (decided 2026-09-27): "Listen along"
  starts the song on the visitor's iPod once, and from then on it's the
  visitor's. `/stop` only takes the notification away (and stops
  prompting late arrivals); it never stops anyone's music. `/stop`
  matters little, since a play ends by itself with its song.
- **Other people's pointers are opt-in** (decided 2026-09-26): they're
  off unless a visitor turns on "Show other people's pointers" in System
  Preferences › Sharing, and a pointer is only sent while someone else
  has, so one visitor's mouse never moves across another's screen
  uninvited. The setting has a new key (`showOthersPointers`), so the
  old default (on) doesn't carry over for visitors who saved settings.
- **Concurrency is part of every design** (decided 2026-09-26): the
  checklist is in docs/agents/self-audit.md. Audited then: tabs of one
  visitor no longer overwrite each other's settings, scores, photos,
  lyric tweaks or installed applets; the bot's Add button claims its
  draft atomically; a song starting doesn't send every visitor to the
  database. Left as is, on purpose: open windows are per tab (last
  writer wins, as browsers restore tabs); past 200 visitors at once the
  free plan's Realtime refuses more connections, and those visitors
  simply don't see presence, chat or listening along (the desktop works
  without them).
- **Windows have no focus trap** (decided 2026-09-26): they aren't
  modal, so Tab moves on to the rest of the desktop.
- **No full script CSP** (decided 2026-09-26): Astro's inline hydration
  and the YouTube player would need it loosened too far to help. The
  other security headers are in `vercel.json`.
- **The secondary greys stay** (decided 2026-09-27). Secondary text in
  the light theme is about `rgb(128,128,128)` on light grey, 3.2–3.9:1
  against the 4.5:1 text needs (Finder's metadata, dates, empty states;
  the sidebar headings are 3.7:1 light, 2.9:1 dark). Meeting it means
  greys near `#6a6a6a`, a visibly heavier look.
- **The Dashboard may open slower in the first seconds on 3G** (accepted
  2026-09-27): it loads after the desktop settles (#86), so opening it
  in the first eight seconds takes 210 ms instead of 90 on fast 3G (the
  same 90 on 4G). Loading it up front would add 4 KB to every first load.
- **Desktop lyrics are opt-in** (decided 2026-09-28): two lines,
  draggable, off until the visitor turns them on, like other people's
  pointers. How lyrics get synced is ROADMAP.md item 3.
- **No Chinese retro web, for now** (decided 2026-09-28). A proposal
  for 1999–2011 Chinese sites (portals from the Internet Archive, a
  hand-made 2008 QQ Zone over Soapbox, Photos and Stickies, a QQ2006
  skin for Chat, with Tencent's own art) was drafted and set aside: it
  doesn't fit the Mac OS X look of the rest. The Browser got ryOS IE's
  missing basics instead, with time travel through the Internet
  Archive but no AI-made pages (those wait on the AI assistant's
  spending caps).
- **API conventions** (decided 2026-09-29, after comparing with ryOS's
  API design guide): `{ error }` bodies in one sentence, the status codes,
  no CORS on the Vercel Functions, `publicUrl` for any URL fetched, a log
  line on failures, tests for every function, and a firewall rate limit
  on the functions that call other sites (docs/agents/api.md). Not taken
  from ryOS: a shared handler, Zod, an origin allowlist on the Vercel
  Functions or auth headers. Its dozens of endpoints exist because its
  Redis store has no permissions; here Supabase's REST API and the
  database's rules do that work, and only four small GET functions and
  two Edge Functions are ours.
- **The Browser asks the Internet Archive directly, with no proxy**
  (decided 2026-09-28). ryOS's IE sends every page through its own
  proxy, which forwards to any public address; the archive allows
  framing, so ours doesn't need one. `/api/framing` only reads headers
  and answers yes or no.
- **JM/OS is a secret base, not a portfolio** (decided 2026-09-29). It's
  Jincheng's own hideout: features serve him (music, things kept for
  himself, looking back, idling), not recruiters. Mostly open to
  visitors, with a few rooms only he can enter, locked by the database.
  New things are only what existed in Tiger or Leopard, drawn with the
  same styles and the ryOS icon set: an idea board framed for job hunting
  and its invented styles were rejected. From prototypes staged in the
  real site Jincheng kept all seven (ROADMAP.md item 2); on the Dock stack:
  "the interaction and the UI have to be done well". Live so far: the
  iTunes Artwork screen saver and Chess (2026-09-29).
- **The owner is a database fact** (decided 2026-09-29). ryOS gates its
  admin by username in code; here `private.owners` holds Jincheng's
  account id and `public.is_owner()` answers for the caller, so row-level
  security locks the owner's rooms and nothing in the browser decides
  who the owner is (docs/agents/supabase.md, "The owner").
- **DVD Player, as Jincheng chose it** (2026-09-29): all thirteen of the
  prototypes on the design board were kept, the wooden shelf (not
  Apple's) included. Built so far: the shelf and DVD Player with Movies,
  Quick Look and Burn (ROADMAP.md item 2.1 has the rest). The Controller
  is a panel the app draws above the windows while it's in front, not a
  second window, so the window manager didn't change. A disc starts at
  its menu, so Play Movie is the click that starts the sound. Visitors'
  DVD-Rs never leave their browser.
- **Considered and left out** (2026-09-26 and 27 audits): a "continue
  playing" prompt for hidden tabs, more reduced-motion fallbacks, a spec
  template for changes, `llms.txt` in robots.txt (no crawler reads it
  there) and splitting the largest app components. `knip`'s unused files
  are the documented one-off scripts (favicon, portrait, the reset email
  preview), and its unused exports are the applet kit's types and test
  helpers: not dead code.
- **No crash reports from visitors' browsers** (decided 2026-09-27):
  for a personal site, a table, a public write path with abuse limits
  and a bot change aren't worth it. Each window's error boundary keeps a
  crash to that window; crashes only show in the visitor's console.
- No link back to a classic site; Chinese is on hold.
- Don't change ocra for now; it will be redesigned.
- The "Ask me" AI assistant is on hold.
- Stickies has no review step, by choice: members only, three notes a
  day. To hide a note, set `approved` to false in the Supabase Table
  editor.

## 4. Current state

**Waiting on Jincheng** (2026-09-29):
1. Deploy `account-recovery` from an up-to-date `main` (`supabase
   functions deploy account-recovery`). Until then the old version runs
   (checked 2026-09-29, after the first deploy), which lets any site's
   page call it (CORS `*`) and answers other methods with 404; the new
   one answers CORS for the site's own origins only and other methods
   with 405 (docs/agents/api.md).
2. Run `supabase/migrations/20260929100000_owner.sql` in the SQL editor,
   then the one `insert` in its header with Jincheng's username. Until
   then nobody is the owner, so the secret base's locked rooms stay shut
   for Jincheng too.
3. Run `supabase/migrations/20260929120000_discs.sql` (after the owner
   migration), then deploy `soapbox-bot` from an up-to-date `main` for
   `/dvd`. Until the migration runs, `/api/songs` serves the music
   without a shelf (no error), so DVD Player's Movies folder holds only
   a visitor's own DVD-Rs. The bot now imports
   `supabase/functions/_shared/youtube.ts`, which the CLI bundles with it;
   the deploy also brings `/add` and `/dvd` the better guess for music
   videos named "Artist 'Song'" (2026-09-29).

- Every migration in `supabase/migrations/` has been run, through
  `20260927100000_now_playing_realtime.sql`. Both Edge Functions are
  deployed from `main` and work: password reset sends mail, and the
  whole music loop (`/add`, `/play`, "Listen along", `/stop`) was
  checked live on 2026-09-27.
- The Security Advisor shows only the findings kept on purpose, listed
  in `supabase/migrations/20260926100511_advisor.sql`: `song_limit()`
  callable by visitors (it returns only the limit), `my_reactions()` and
  the other member-only helpers callable by members, and leaked password
  protection (an Auth setting on the Pro plan). Once the owner migration
  runs, `is_owner()` joins them: callable by everyone, it says only
  whether the caller is the owner.
- Merges to `main` deploy, except those the ignored build step skips
  (only docs, tests, CI, Supabase or tooling). Still unconfirmed: that
  Vercel builds on Node 24; only a deployment's build log shows it (its
  first lines).
- Only `main` is left; every other branch is deleted.

What's been built and checked, and when, is in the git history and the
pull requests.

## 5. Open issues and known limits

What comes next, in order, is in [ROADMAP.md](ROADMAP.md).

1. **Songs.** Lyric timing will be reworked as a whole (ROADMAP.md).
   Ten starter songs carry ryOS's timing, unchecked by ear; 三個人的晚餐
   uses the official MV, ten seconds shorter than the album cut. Chrome
   defers YouTube playback in background tabs, so a song started in a
   hidden tab waits until the tab is shown. `/api/lyrics` only runs on
   Vercel; under `astro dev` those songs show the listening view.
2. **Moderation.** Every new Stickies note and public chat message goes
   to Jincheng on Telegram with Hide / Show again (`/watch off` stops
   it). Automatic filtering in front of it is an option if spam gets
   heavy; so is CAPTCHA under Auth › Attack Protection for sign-up spam
   (it needs a widget in the Account window).
3. **Presence is a claim, not an identity.** Names on cursors and in
   AirDrop are what the visitor's browser says, so a signed-out visitor
   could appear as "jincheng". Signals (typing, nudges, AirDrop) share
   the presence channel, so they aren't private and anyone could forge
   one; receivers act only on well-formed ones, which carry nothing but
   names and Macintosh HD paths. Proper identity would need Realtime
   Authorization and server-checked presence.
4. **The first load** is 159 of its 160 KB budget (157 before the Dock
   could be rearranged, 2026-09-28), mostly react-dom. ROADMAP.md item 1
   comes before anything else that adds to it.
5. **Not ported from ryOS**, in Chat: @ryo (AI replies, on hold with the
   AI assistant), voice messages, IRC rooms and admins making rooms from
   the app.
6. **Upkeep in the Supabase dashboard:** run Advisors › Security after
   each migration, and keep Settings › API › Exposed schemas to `public`
   (plus `graphql_public` only if GraphQL is used).
7. **What CI checks** on every pull request: `npm audit --omit=dev
   --audit-level=high`, the type check, the hooks lint, the unit tests
   (Vitest), the build, a smoke test that opens every app in a browser,
   the download budgets of `npm run perf`, and `npm run test:db` (the
   database rules and races against the per-member limits, on Postgres
   with stand-ins for Supabase's auth, storage and pg_net). The
   workflows pin every action to a commit SHA and default to read-only
   tokens; Dependabot updates npm and the actions weekly.
