# Handoff: majincheng.com (JM/OS)

State of the project as of 2026-09-26, for picking the work up in a new
session: where it runs, how we work, what was decided, and what's open.
Conventions and a map of the code are in [AGENTS.md](AGENTS.md) and
[docs/agents/](docs/agents/); what was built when is in the git history.

## 1. Where it runs

- Astro 7 with one `client:only` React 19 island (zustand, motion),
  Tailwind 4.
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
- The "Update project previews" workflow runs on macOS after every push
  to `main` and weekly: it refreshes the Photos snapshot
  (`npm run photos:update`) and recaptures the project covers and
  `public/og.png` (`npm run preview:capture`), committing what changed.

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

- No link back to a classic site; Chinese is on hold.
- Don't change ocra for now; it will be redesigned.
- The "Ask me" AI assistant is on hold.
- Stickies has no review step, by choice: members only, three notes a
  day. To hide a note, set `approved` to false in the Supabase Table
  editor.

## 4. Open issues and next steps

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
3. **Songs.** Ten of the starter songs remain (timing carried over from
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

    What's left is framework weight: react-dom (65 KB gzip) and motion
    (40 KB). Motion could shrink with `LazyMotion`, at the cost of
    touching every animated component.
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
   (#81). Open:
   - 18 `exhaustive-deps` warnings from `npm run lint`, left alone since
     most effects deliberately run on one trigger; review one by one.
   - First-visit JavaScript is 172 of 180 KB. The next addition to the
     first screen needs something taken out (motion's `LazyMotion` is
     the largest candidate).
   - Every visitor's cursor goes to every other over one Realtime
     channel. Fine at today's traffic; with a crowd (the front page of
     Hacker News), show a count instead of cursors past some number.
   - Considered and not done: a spec template for changes, `llms.txt` in
     robots.txt (no crawler reads it there), splitting the largest app
     components.
