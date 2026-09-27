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
- YouTube's chrome must never show; see [media.md](media.md). Chrome
  delays playback in background tabs, so test playback in a visible
  tab.
- Jincheng's own photos appear only in Photos, never as the desktop
  picture or the screen saver.
- Unsplash blocks Vercel's build servers. Photos come from the snapshot
  in `src/data/photos.json`, or from the API with
  `UNSPLASH_ACCESS_KEY`.

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

## Tests and tooling

- A test that mocks a module and then loads several modules with
  `Promise.all([import(…), …])` failed five times in six: a module could
  bind the real one before the mock was in place. Load them one after
  another.
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
- There's no Prettier config. Don't reformat whole files; it buries the
  change in the diff.
- Wrapping a big JSX tree reindents all of it. Wrap through a small
  outer component instead, as `Desktop` wraps `Shell` in `MotionConfig`.

## Git and pull requests

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
