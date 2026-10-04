# Pitfalls

Mistakes this project has already made, kept here so they aren't made
again.

## Supabase and the database

- The SQL editor runs a script as one transaction. One failing statement
  (a `storage.buckets` insert some projects refuse) rolled back
  everything before it, and the next call failed with PGRST202 (no such
  function). Wrap optional steps in `do $$ … exception when others then
  raise notice … $$`.
- PostgREST caches the schema. End a migration that adds functions or
  columns with `notify pgrst, 'reload schema';`.
- Supabase's API loads pg_safeupdate: a `DELETE` or `UPDATE` without a
  `WHERE` fails with "DELETE requires a WHERE clause", even inside a
  `SECURITY DEFINER` function. `music_stop()` did, and `/stop` broke in
  production while `npm run test:db` passed, since its Postgres doesn't
  load the extension. Write a `WHERE` (`where id` for a one-row table);
  `rules.sql` checks every function for one.
- Realtime reads each changed row by its primary key, as the subscriber,
  before sending it. A table whose visitors are granted some columns but
  not the key sends them nothing, silently: `now_playing` granted
  `song_id` but not `id`, and `/play` only showed after a reload.
  Grant the key with the columns; `rules.sql` checks every published
  table.
- Migrations are named `<UTC timestamp>_<what it does>.sql`, with the
  time they're written as `YYYYMMDDHHMMSS`, the way `supabase migration
  new` names them. They used to be named by date, and the date was
  bumped for each new file: nine migrations written over two days ran
  up to "20261003". They were renamed to their real commit times. Since
  2026-09-29 the project applies them with `supabase db push`, which
  records each version it ran (the ones run by hand before were marked
  with `supabase migration repair`): never rename a migration once it
  has run, or the CLI takes it for a new one and runs it again.
- Supabase grants everything made in `public` (tables, functions,
  sequences) to `anon` and `authenticated` by default. `revoke … from
  public` leaves those grants, so revoke from `anon` (and
  `authenticated`) by name: `chat_can_write()` was callable by visitors
  for that reason (2026-09-29). `supabase/tests/stubs.sql` makes the
  same default grants, so `test:db` sees what production does.
- A record that a migration ran isn't proof: the chat rooms migration
  was noted as run and had never taken. Before relying on production's
  schema, compare its structure with `schema.sql` (read the catalogs
  with `supabase db query --linked`, build `schema.sql` in a scratch
  database, diff; no rows needed).
- Every migration must run twice without harm:
  - `if not exists` for tables and indexes;
  - `create or replace` for functions;
  - `drop … if exists` before `create policy` and `create trigger`;
  - `on conflict` for seed rows.

  `run.sh` reruns every migration from `20260926071227` on over the
  schema to prove it: it loops over the folder, so a new file is covered
  without being listed (it used to name them by hand, and seven of forty
  commits edited the list).
- Counting rows before an insert is not a limit under concurrency. Six
  notes sent at once all got through a "three a day" check. Take
  `pg_advisory_xact_lock` first (see [supabase.md](supabase.md#security)).
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

## Edge Functions and the Telegram bot

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

## The desktop

- With `LazyMotion`, a value one `animate` target has and the next
  leaves out goes back to its `initial`. Windows in Exposé shrank to
  their opening size because the Exposé target lacked the `scaleX` and
  `scaleY` the shown target had. Give every target of a component the
  same keys.
- A module import that failed (offline for a moment) fails again for the
  rest of the page's life: Chrome keeps the failure for that URL and
  makes no request, even once the network is back, while the same file
  with `?retry=1` loads. So a failed chunk isn't retried in the page:
  the crash panel and the Applet Store offer a reload (the open windows
  come back), and only `fetch()` paths such as `/api/songs` recover by
  themselves.
- ⏮ ⏯ ⏭ ▶ ◀ ❚❚ and 🔈 are emoji on iOS (and some Android fonts): the
  iPod's wheel, Karaoke and Now Playing showed colour pictures on a phone
  and symbols on a desktop. Controls use the drawn glyphs in
  `core/glyphs.tsx`, never the characters.
- The iPod's menu moved its list with `translate` to follow the choice,
  so nothing scrolled it but the wheel and the arrow keys: a finger, a
  mouse wheel or a trackpad did nothing, and the rest of a long list
  couldn't be seen. A list scrolls natively (`.os-ipod-scroll`); the
  choice only brings its row into view.
- React holds back content that suspended for about 300 ms before
  showing it. An installed applet, its code already fetched, took 820 ms
  to open through `lazy` and 80 ms rendered directly (`readyApp()`). A lazy Dashboard behind `Suspense` took 350 ms to appear
  where it had taken 55, even with its code loaded. For something that
  must open instantly, load the module yourself and render it once it's
  in (`DashboardLayer.tsx`).
- An effect that runs on one trigger but calls functions from the
  render sees the state of the render it last ran in. Synth's octave keys
  saved the patch from before the last knob turn, undoing it; a nudge's
  notification opened a conversation with the first render's state.
  Read the latest values through `useEffectEvent` (or a ref, for a
  callback that outlives the effect, like a notification's), and don't
  leave dependencies out: the lint fails on it.
- Motion's `useReducedMotion()` only knows the device. Use
  `useReduceMotion()` from `core/system.ts`, which honours System
  Preferences.
- A keyboard handler must check that its window is the front one, and
  whose the key is. Photos' viewer took the arrows and Escape from other
  windows until #188 (2026-09-30): this entry had recorded that as
  fixed while the check had never been in the code, so read the code,
  not the pitfall, before trusting a fix. Pinball once did the same, and
  its restart moved from N to F2 so typing elsewhere can't trigger it.
  Until #186 every window-level handler also took Return and Space from
  a focused control outside its window (a Dock icon, the menu bar, a
  window's close box), so a keyboard user couldn't open an app from the
  Dock while Finder had a selection, and ⌥ shortcuts fired while typing
  in a field (#187). Listen while `useFocusedId() === win.id`, ask
  `ownsKey(e)` (`core/useKeys.ts`) before taking a key, and prefer
  `useKeys`, which asks it for you.
- What had focus can't be read in an effect of the thing that takes it.
  `FullScreenLayer.tsx` noted `document.activeElement` in its effect to
  give it back when Time Machine closed; the first time, the app's code
  was still loading, so the Dock icon was noted, but once the code was
  cached the app rendered in the same pass and its own effect, which
  runs first (children before parents), had focused its sidebar: the
  layer noted that, and focus fell to the page on close (#193). Note it
  where the opening starts (the store's action, `core/focus.ts`), or
  while rendering, before any effect of the commit runs.
- Release pointer capture on `pointerup` and `pointercancel`. Pinball's
  flippers stuck otherwise.
- Anything kept in window `props` is saved in `os-windows` and survives
  a reload. Don't leave one-time values there: the reset token is
  cleared once used.
- Launching an open window again with the same props doesn't navigate
  it. Compare against the props last acted on, as Preferences does.
- YouTube's chrome must never show; see [media.md](media.md). Chrome
  delays playback in background tabs, so test playback in a visible
  tab.
- YouTube's embed shows its own play/pause button in the middle of the
  picture for about 4.3 s after a video starts, seeks or resumes, with
  `controls: 0` and every other setting (`youtube-nocookie.com` too),
  whatever the user agent, and whether or not a click asked for the play
  (found 2026-09-29, when DVD Player showed it). It's a 56px circle in
  the middle of the player whatever its size, and while it buffers the
  spinner is in the same circle. With it comes a darkening of the whole
  picture, strongest at the top, that draws a hairline across the
  middle. A picture paused while they're up keeps them; one paused after
  shows nothing of YouTube's, and a seek while paused brings nothing up.
  The frame's crop can't reach the middle, so the iPod and Karaoke keep
  their artwork over the picture until it has played that long
  (`revealAfterButton`); DVD Player keeps its picture and masks only the
  middle with its own button (`middleControls`), leaving the darkening
  (Jincheng's choice: a picture that doesn't stop). To check a player,
  look inside YouTube's frame for `.player-controls-middle` and
  `.player-controls-background`: its classic `.ytp-*` controls aren't
  the ones that show.
- Jincheng's own photos appear only in Photos, never as the desktop
  picture or the screen saver.
- Unsplash blocks Vercel's build servers. Photos come from the snapshot
  in `src/data/photos.json`, or from the API with
  `UNSPLASH_ACCESS_KEY`.
- A motion value jumped (or set) in a layout effect declared *before*
  the `useTransform` calls that read it goes unnoticed until the next
  render: `useTransform` subscribes again after every render, and its
  cleanup cancels its pending update. The Dock's dropped icon stayed
  invisible for six frames. Put such effects after the transforms
  (`Magnified` in `shell/Dock.tsx`), and check an animation frame by
  frame (`requestAnimationFrame` in the page), not only its end state.
- `window.innerWidth` read while rendering is a snapshot: nothing
  renders again when the browser is resized or a phone rotates. Zoomed
  windows, a phone's apps, Exposé's grid and a member's stickies stayed
  laid out for the size at their last render, and a window dragged to
  the corner was out of reach after a shrink, until #192 (2026-09-30).
  A component whose frame depends on the browser's size selects the
  store's `viewport`, which `watchViewport()` keeps current; the
  arithmetic lives in plain functions with tests (`fitWindow`,
  `zoomedFrame`, `phoneFrame`, `exposeLayout`, `onScreen`). Event-time
  reads (a drag's limits) are fine.

## Games

- Pinball's flippers leave a gap the ball can't get stuck in.
- Pockets always kick the ball out.
- The ball saver works once per ball.
- Lanes re-arm after a completed set.
- The canvas follows its window's size.
- `table.test.ts` plays the table with bots; run it after any change to
  the table or physics.

- Astro hoists every stylesheet imported anywhere in the island, lazy
  imports included, into the page. Importing each app's CSS from its
  component put 36 KB of styles inline and seven stylesheets in the
  first load (the HTML grew from 15 to 23 KB gzipped). Apps' styles are
  imported as text (`?inline`) by their manifests instead; check the
  built `index.html` after changing how styles load.
- Styles several apps shared lived in one app's stylesheet: the button
  in Account's, the segmented control's disabled state in Finder's, the
  sidebar in Projects', and `@keyframes os-spin`, which spins every
  window's loading indicator, in the Applet Store's. Once app styles
  load with their apps, anything outside the app that uses a class or
  keyframes has to live in `src/os/styles/`.

- A function in `api/` imports local TypeScript by its compiled name
  (`../src/lib/library.js`). Vercel's builder (`@vercel/node`) compiles
  each file to `.js` without rewriting imports, so `library.ts` isn't
  deployed: importing it by that name made `/api/songs` crash in
  production (FUNCTION_INVOCATION_FAILED) while every test passed, and
  an extensionless import fails too, since the functions run as ES
  modules. An earlier fix wrote `.ts` to make `npm run serve` work,
  which is what broke production; `serve.mjs` now maps a missing `.js`
  to its `.ts` instead, and the lint rejects a `.ts` import in `api/`.
  To check a function the way Vercel runs it, build it with
  `@vercel/node` into a separate directory and run the output (a build
  whose files and work path are the same directory truncates them).
- Every tab saved its whole copy of a setting or score. A best score of
  5000 set in one tab was overwritten by 4000 from a tab that had loaded
  before it, and changing the Dock size in one tab turned pointers back
  off after another tab had turned them on. Build on what's stored
  (`updateJSON`) and listen for other tabs (`onStored`).
- Pressing Add under a song twice read the draft twice, so both presses
  tried to add it and the second reported a failure over the first's
  success. Claim with the delete itself (`delete … returning`).
- Every visitor asking the database what's playing when a song starts is
  a stampede of one query per visitor. Use what the Realtime event
  carries, and ask only when someone acts on it.

- The music migration granted visitors `songs.added_at` but not
  `albums.added_at`, while `/api/songs` ordered albums by it: Postgres
  refuses to order by a column the role can't read, so every live
  request fell back to the snapshot, silently, and new songs never
  showed. The function now logs why it falls back, and `rules.sql` runs
  the function's own queries as a visitor. A query and its grants
  change together.

## Tests and tooling

- A test that mocks a module and then loads several modules with
  `Promise.all([import(…), …])` failed five times in six: a module could
  bind the real one before the mock was in place. Load them one after
  another.
- The same goes for the code under test: two calls at once that each
  `await import()` a mocked module can get the real one the second time.
  `findSong()` looked like it lost a race until its import of the social
  module was made static (it was in the first load anyway).
- A Vitest `expect` inside a per-frame loop made the Pinball test time
  out. Use plain `throw` in hot loops, and give long simulations an
  explicit timeout.
- A rule check run as `anon` or `authenticated` sees only the columns
  granted to that role. Look test fixtures up (and read columns like
  `visitor`) after `reset role`, or the check fails with "permission
  denied" for the wrong reason.
- The database test stubs need grants for `service_role` too, such as
  the `net` schema, or a check fails for the wrong reason.
- Playwright's browser depends on the machine. On a laptop or in CI,
  `npx playwright install chromium` once; in the cloud sandbox, set
  `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium`, which `perf` and
  `test:smoke` pass as `executablePath`. A throwaway script must run
  from inside the repository to find the `playwright` package.
- Astro 7's `astro preview` starts a server in the background and
  answers "already running" while one is up, still serving whatever
  `dist/` holds. Stop it with `npx astro preview stop`. The scripts serve
  `dist/` themselves (`scripts/serve-dist.mjs`) for this reason.
- Astro 7 moved its entry point to `bin/astro.mjs`. The preview capture
  ran `node_modules/astro/astro.js` and failed on every push for a day
  before anyone noticed; it reads the path from astro's `package.json`
  now. Check a workflow's runs after upgrading what it calls.
- Dependabot opens one pull request per package. Packages that move
  together (Astro with `@astrojs/*`, React with its types) are
  upgraded in one pull request. Adjacent bumps to the same file (the
  workflow actions) conflict once the first merges; redo the rest on
  `main` rather than merging `main` into each. Every major gets the
  whole desktop used in a browser, not only CI, whose smoke test opens
  each app but doesn't use it.
- `pkill -f "<pattern>"` (and `pgrep -f`) also match the shell running
  them, since the pattern is in its own command line, and kill it
  mid-command. A bracketed character helps only if the rest of the
  command doesn't contain a match either (`--port 4410` later in the
  same line still matches `441[0-9]`). Stop a server by its port
  instead: `fuser -k 4321/tcp`.
- An image loaded with `crossOrigin = 'anonymous'` is a separate
  request from the same image used as a CSS background. The accent
  sampler downloaded the 900 KB desktop picture twice until it set
  `crossOrigin` only for other hosts.
- Hooks that do real work (`useSky`) must not sit in a component that
  re-renders every frame. `Desktop` subscribed to `windows`, so a drag
  recomputed the sun and the weather tint sixty times a second.
- ESLint's flat config replaces a rule's options when a later block
  matching the same file sets the same rule; it doesn't merge them. A
  block for manifests silently lifted the applet rule from applets'
  manifests. Use a different rule, or keep the file sets apart.
- ESLint's `no-restricted-imports` looks only at import and export
  declarations, and `import()` is how the desktop loads almost
  everything: a dynamic import across a boundary passed the lint until
  #208. `eslint.config.js` holds `import()` to the same patterns with a
  local rule (`local/no-restricted-dynamic-imports`). The OS block also
  listed its folders by name, and `home/` and `stickies/` went unguarded
  through three merged pull requests; it covers `src/os/**` now and names
  what it leaves out. `tests/eslint.test.ts` probes each rule with a
  snippet that fails without it: a new rule gets one.
- A rule that lives only in prose isn't kept. AGENTS.md said everything
  remembered in the browser goes through `core/storage.ts`, and iCal
  read and wrote `localStorage` itself (#206): another tab didn't follow
  a change, and a blocked storage wasn't handled. The lint refuses
  `localStorage` and `sessionStorage` outside `storage.ts` now; the one
  per-tab value (the boot screen's `os-booted`) has `loadForTab` and
  `saveForTab` there.
- There's no Prettier config. Don't reformat whole files; it buries the
  change in the diff.
- Wrapping a big JSX tree reindents all of it. Wrap through a small
  outer component instead, as `Desktop` wraps `Shell` in `MotionConfig`.

## Git and pull requests

- Pushing a branch for the first time builds a Vercel preview even when
  the change looks small: with no earlier deployment of the branch,
  `vercel-ignore.sh` compares with `main`. Pushing a stack of twelve
  branches spent twelve of the day's deployments at once, and the
  production deployment after it was rate-limited, and later a single
  pull request's preview used up the day's last deployment, leaving
  its merge undeployed. Branches don't deploy any more
  (`git.deploymentEnabled`: only `main`); a `*` pattern wouldn't have
  matched `fix/…` names, since it stops at `/`, hence `**`.
- `vercel-ignore.sh` left out all of `supabase/` as backend-only, while
  the site bundles `supabase/functions/_shared/youtube.ts` (DVD Player's
  Burn sheet): a fix there (8daa72f) reached the bot and skipped the
  site's build, silently (#209). What's left out is named path by path
  now, so a new path builds until it's listed, and a file the site
  bundles says so in its header.
- A guess made to get a check green went wrong: CI's perf counted the
  Dashboard (161 KB against 160) and the pointer was moved away before
  loading, which CI's Chromium ignored. Listing when each file was asked
  for, then the pointer events, showed the cause: a pointer resting at
  (0, 0) was reported over the menu bar as it painted, and
  `pointerover` fetched the Dashboard ahead. Real visitors whose pointer
  rests at the top did the same. The fix was in the product (only real
  movement counts), not the measurement. Make the cause observable
  first.

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
  change that makes it unused, and update the README and these docs.
