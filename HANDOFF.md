# Handoff: majincheng.com (JM/OS)

State of the project as of 2026-09-26, for picking the work up in a new
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
- Hosted on Vercel project `jincheng-protafolio`; merging to `main`
  deploys. DNS is at GoDaddy. The repository is `jma49/jmos`.
- Supabase project `hszogpoyyqgwjuznbegd` backs accounts, Stickies,
  Chat, presence and Soapbox. Vercel holds its URL and publishable key
  as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (all environments; Astro exposes the `NEXT_PUBLIC_` prefix through
  `vite.envPrefix`). Preview deployments use the same project as
  production, so anything posted while testing a PR is real data.
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
  GitHub CI stays the gate meanwhile). `scripts/vercel-ignore.sh`
  (vercel.json's `ignoreCommand`) skips the build when only docs, tests,
  CI, Supabase or tooling changed. On a busy day, batch merges.

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
    for five minutes and served stale while it's refreshed for a day.
    When Supabase can't be read, the function serves the snapshot in the
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
- No link back to a classic site; Chinese is on hold.
- Don't change ocra for now; it will be redesigned.
- The "Ask me" AI assistant is on hold.
- Stickies has no review step, by choice: members only, three notes a
  day. To hide a note, set `approved` to false in the Supabase Table
  editor.

## 4. To check after the next deploy

**Where things stand (2026-09-26, evening).** Production has run #85;
the daily deployment cap held back #86–#95, and everything since is in
twelve open pull requests, stacked, each targeting the branch below it:
#107 `chore/node-24-and-ci-cache` (keyboard menus, no-JS page, Node 24,
CI cache) → #108 `refactor/app-kit` → #109 `refactor/app-manifests` →
#110 `perf/app-styles` → #111 `feat/applet-install` → #112
`feat/music-db` → #113 `feat/music-api` → #114 `feat/music-bot` →
#115 `feat/music-together` → #116 `feat/pointers-opt-in` → #117
`fix/concurrency` → #118 `fix/exploratory-bugs` (issues #96–#106).
Pushing them spent the day's deployments on previews (pitfalls), so
production can't deploy until the cap resets.

**To do, in order:**
1. **CI on #118: done**, green (2026-09-26). Its perf check had counted
   the Dashboard in the first load on some runs: a pointer resting at
   the top was reported over the menu bar as it painted, and that
   fetched the Dashboard ahead. Only real movement counts now (a product
   fix, not a raised budget); first-load JS on CI is 156 KB.
2. **Merge once, deploy once.** When #118 is green, retarget it to
   `main` and merge it (a merge commit): one production deployment
   carries the whole stack. Close #107–#117 as merged through #118, and
   delete every branch but `main`, including the old
   `claude/task-knphtp` (merged as #72). Issues #96–#106 close with #118.
3. **Deploy after the reset.** A rate-limited deployment isn't retried:
   redeploy `main`'s head from the Vercel dashboard once the cap resets,
   and check About This Mac shows its hash.
4. **Database.** Run `supabase/migrations/20260927030802_music_library.sql`
   in the SQL editor, then Advisors › Security. Until then `/api/songs`
   serves the snapshot, so the site works either way.
5. **Bot.** Deploy `soapbox-bot` from an up-to-date `main`
   (`supabase functions deploy soapbox-bot --no-verify-jwt`) and rerun
   the command menu in `scripts/setup-soapbox.sh`.
6. **The whole music loop, live:** `/add` a song and see it in the iPod
   within five minutes; `/play` it and see the notification on another
   device, listen along at the same place; `/stop` and see it go.

Checked locally, in production builds (2026-09-27):
- the clear desktop and the Welcome; Finder's selection on striped rows;
  the Dashboard and Exposé with and without reduced motion; Synth's
  patch across octaves; Photos' keys; the résumé on Letter and A4;
  every app (smoke test); the animations frame by frame;
- **a deploy under an open page**, by swapping builds under the local
  server: opening an app whose code is gone offers Reload, which brings
  every window back in the new version (since #97 the panel says the
  page may be out of date or the connection dropped, or that the visitor
  is offline; either way Reload, since the browser won't fetch a failed
  chunk again in the same page);
- **slow networks**, emulated: the desktop is ready in 2.4 s on 4G and
  7 s on fast 3G. Opening the Dashboard right away takes 90 ms on 4G
  as before #86, and 210 ms instead of 90 on fast 3G, only in the first
  eight seconds, before it has loaded ahead (accepted, 2026-09-27: not
  worth 4 KB more on every first load);
- the preview capture, run end to end (#81);
- keyboard use and names for assistive tech (all apps), and the page
  without JavaScript.

Only a deployment or a push can show:
1. that it's live: About This Mac shows the build hash of `main`'s head;
2. that the ignored build step skips a docs-only pull request and builds
   one touching `src/`, and whether a skipped one counts toward the cap;
3. that Vercel builds on Node 24 (the build log's first lines), and that
   CI reads Node 24 from `package.json`;
4. that CI installs only Playwright's headless shell, and on the second
   run finds it in the cache (the install step drops from about 20 s to
   about 11 s).

Checked by Jincheng on `npm run serve` (2026-09-27): printing the
résumé from Chrome's and Safari's print dialogs, the interface sounds,
the desktop with VoiceOver. The lyrics' timing in Karaoke is left for a
new way of syncing them, planned for later (see below).

## 5. Open issues and next steps

0. **The music library on Supabase**, as decided in section 3, in four
   pull requests, stacked on `feat/applet-install`:
   - M1, done (`feat/music-db`): the `songs`, `albums` and `now_playing`
     tables with row-level security, column grants, the 200-song limit and
     a race test, seeded with today's library. Once merged, **run
     `20260927030802_music_library.sql` in the SQL editor, then the
     Security Advisor**. Until then `/api/songs` serves the snapshot, so
     the order doesn't matter.
   - M2, done (`feat/music-api`): `/api/songs`, and the library loaded
     when a music app first opens, not on the first visit.
   - M3, done (`feat/music-bot`): the bot's `/add` (with a preview to
     confirm), `/songs`, `/remove` and `/offset`. Deploy the bot once it's
     merged and the migration has run, and rerun
     `scripts/setup-soapbox.sh` (or its `setMyCommands` call) for the
     command menu.
   - M4, done (`feat/music-together`): `/play`, `/stop` and listening
     along (`media/together.ts`); `now_playing_position()` also returns
     the time left, so this changes the M1 migration, which hasn't run
     anywhere yet.
   Jincheng deploys the bot from `main`, as for earlier changes. Only a
   deployment can show the whole loop: `/add` a song and see it in the
   iPod within five minutes; `/play` it and see the notification on
   another device, listen along and hear it at the same place; `/stop`
   and see the notification go.

1. **The database is up to date** (2026-09-26). Every migration in
   `supabase/migrations/`, through `20260926100511_advisor.sql`, has been
   run in the SQL editor. Password reset (`account-recovery`) is live and
   sends mail. The Security Advisor shows only the two findings kept on
   purpose:
   - members can call `my_reactions` and the other member-only helpers;
   - leaked password protection (an Auth setting on the Pro plan).
2. **Moderation** is in (2026-09-26): every new Stickies note and public
   chat message goes to the owner on Telegram with Hide / Show again;
   `/watch off` stops it. Automatic filtering in front of it is still an
   option if spam gets heavy.
3. **Songs.** Lyric timing will be reworked as a whole rather than tuned
   song by song with `offset` (decided 2026-09-27). Ten of the starter
   songs remain (timing carried over from
   ryOS's values, unchecked by ear), plus 寧夏, Kiss & Tell, 寫信給你,
   心動 and 三個人的晚餐 (lyrics from NetEase) and BTTB. 三個人的晚餐
   uses the official MV, which is ten seconds shorter than the album cut,
   so its timing may need an `offset`. Chrome defers YouTube playback in
   background tabs, so a song started in a hidden tab waits until the tab
   is shown. `/api/lyrics` only runs on Vercel; under `astro dev` those
   songs show the listening view.
4. **Tests and CI.** Every pull request gets the type check, the hooks
   lint, the unit tests (Vitest: game rules, the window manager and
   window restore, lyrics, the Vercel Functions, the Soapbox bot and the
   account-recovery function), the build, a smoke test that opens every
   app in a browser, the download budgets of `npm run perf`, and
   `npm run test:db` (about 50 database rules, plus races against the
   per-member limits, on Postgres with stand-ins for Supabase's auth,
   storage and pg_net). **Possible next work:** the Chinese site and the
   AI assistant later; an ocra review-replay app once ocra's redesign is
   done.
5. **Still missing compared with ryOS:** in Chat, @ryo (AI replies), voice
   messages, IRC rooms and admins making rooms from the app; the first is
   on hold with the AI assistant, the rest were left out. Signals
   (typing, nudges, AirDrop) go over the shared presence channel, so they
   aren't private and anyone could forge one; receivers only act on
   well-formed ones, and none carries anything but names and Macintosh HD
   paths. Deliberately skipped: ryOS's Videos app, emulators, a virtual
   file system, multiple OS themes (System 7, XP, 98), video wallpapers
   and AI chat. Listen to the sounds once; they were checked by
   instrumentation, not by ear.
6. **Outside suggestions reviewed (2026-09-26).** Done: restoring windows
    after a reload; one storage helper; src/os and os.css split by
    domain; a declarative app registry; landscape phones and safe areas;
    Exposé by keyboard; the "Follow the sun" fallback note; a first-visit
    welcome; a Dashboard widget of visitors' cities; timeouts on the
    lyrics relay. Already the case, measured: every app is its own lazily
    loaded chunk; all desktop pictures are WebP ≤ 2560px. Not done, on
    purpose: a focus trap in windows (they aren't modal); a "continue
    playing" prompt for hidden tabs; more reduced-motion fallbacks.
7. **Security review (2026-09-26).** Fixed:
    - the per-member limits (notes, chat, reset links) let simultaneous
      requests through; they now take advisory locks, and race.sh proves
      it;
    - site-wide caps on chat, sign-ups and reset mail;
    - an index for the chat limit;
    - reset mail sent after the answer (no timing oracle);
    - chat signals tied to the sender's presence;
    - security headers;
    - bounded inputs on `/api/*`;
    - Security Advisor findings (the advisor migration): trigger functions no longer
      callable over the API, `username_available` runs as the caller,
      and reactions check the post and the member;
    - Astro 5 → 7 (with @astrojs/react 7, Vite 8), which clears the
      Astro, sharp and esbuild advisories: `npm audit` reports none.
    Performance audit (2026-09-26), measured with `npm run perf`:
    - a drag with six apps open: script time 640 ms to 210 ms (the desktop
      no longer re-renders per frame; windows are memoized);
    - a first visit: images 2.2 MB to 0.95 MB (the desktop picture was
      fetched twice; quality 75), fonts 389 KB to 185 KB (subset);
    - the screen saver's views load lazily; an idle desktop costs about
      10 ms of script in five seconds.

    What's left is mostly framework weight: react-dom (67 KB gzip).
    Motion now loads lean through `LazyMotion` (#85).
    Known and accepted:
    - Presence names are the client's own claim (a signed-out visitor
      could show up as "jincheng" on a cursor or in AirDrop). Signals
      only carry names and Macintosh HD paths. Proper identity would
      need Realtime Authorization and server-checked presence.
    - There's no full script CSP: Astro's inline hydration and the
      YouTube player would need it loosened too far to help.
    In the Supabase dashboard:
    - run Advisors › Security after each migration;
    - keep Settings › API › Exposed schemas to `public` (and
      `graphql_public` only if GraphQL is used; otherwise disable it);
    - consider CAPTCHA under Auth › Attack Protection if sign-up spam
      appears (it needs a widget in the Account window).
8. **Engineering audit (2026-09-26).** Done: each window is isolated by
   an error boundary, and a chunk missing after a deploy offers a reload
   (#73); CI type-checks (#74), lints hooks (#79), opens every app (#76)
   and checks the download budgets (#81); `llms.txt` and the site's
   project page describe JM/OS (#75, #77); tests for the lyrics relay,
   geo, lyric parsing and window restore (#78); AGENTS.md split into
   `docs/agents/` (#80); the preview capture, broken since Astro 7, fixed
   (#81); pointers stop past 12 people on the desktop (crowd mode). Open:
   - First-visit JavaScript went from 172 to 154 KB (LazyMotion, #85;
     the Dashboard and screen saver after the desktop settles, #86), and
     the budget from 180 to 160. The song library left the first load
     with its move to Supabase; the wallpaper catalogue stays (it's read
     synchronously on the first screen).
   - Contrast (measured 2026-09-27): secondary text in the light theme
     is `rgb(128,128,128)`-ish on light grey, 3.2–3.9:1 against the 4.5:1
     text needs (Finder's metadata, dates, empty states, the résumé's
     dates; the sidebar headings are 3.7:1 light, 2.9:1 dark). Meeting it
     means greys near `#6a6a6a`, a visibly heavier look. Decided
     2026-09-27: keep the greys as they are. Links on the dark theme's
     documents were fixed.
   - Considered and not done: a spec template for changes, `llms.txt` in
     robots.txt (no crawler reads it there), splitting the largest app
     components.
