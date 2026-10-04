# Performance

- **Budgets** (checked by `npm run perf`; see [self-audit.md](self-audit.md)) for a first visit,
  meaning what's requested in the first seven seconds, before the
  desktop settles and fetches ahead. It's measured on a build with
  Supabase's settings, as production has them (placeholders, the
  backend's requests refused): before 2026-10-04 (#255) the build had
  none, and missed the 58 KB supabase-js chunk a visitor was sent
  0.2 s in (212 KB in all).
  - at most 160 KB of JavaScript, gzipped (152 today; react-dom alone
    is 67), and 20 KB of CSS (12 today);
  - at most 1.1 MB of images and 250 KB of fonts;
  - nothing downloaded twice.

  Dragging a window with six apps open, and five idle seconds, stay
  under the script time the script reports.

  The budgets guard against going backwards; they aren't a speed
  target. The JavaScript one started at 180 KB when `npm run perf` was
  added (#72, 172 KB then), and came down to 160 after #85 and #86 cut
  the first load to 154 (#87): room for small additions, not for
  undoing that work. What a visitor feels is the time to a usable
  desktop, measured on 2026-09-27 at 2.4 s on emulated 4G and 7 s on
  fast 3G. Raising a budget needs a reason that holds beyond today
  (AGENTS.md); making room comes first, as below.
- **Load only what the first screen needs.**
  - Apps are lazy, code and styles (`registry.tsx`, `core/appStyles.ts`):
    `perf` fails if an applet's chunk is in the first load.
  - The Supabase client arrives by dynamic import (`social.ts`), and
    not on a first visit: without a stored session no one is signed
    in, which `social/account.ts` knows without the client (and offers
    Sign In at once). The client loads when something asks for it (an
    app, signing in, a deep link such as a password reset) or once the
    desktop has settled, with Presence. A member's stored session loads
    it at the start, since their desktop (their name in the menu bar,
    their stickies) waits on it. Another tab signing in loads it to
    follow.
  - Moving apps in and out of the Dock (`shell/dockDrag.tsx`) loads on
    the first press, or once the desktop has settled.
  - The Dashboard, Spotlight and the screen saver's views load on first
    use, or once the desktop has settled (`afterSettled()` in
    `core/warmUp.ts`, eight seconds in and idle), so they're instant by
    the time anyone reaches for them. The Dashboard also starts loading
    when the pointer reaches the menu bar or the Dock. The screen
    savers' names and blurbs for System Preferences moved there too
    (2026-09-29, 0.5 KB off the first load: only that pane shows them),
    and a view's own stylesheet comes as text with it
    (`shell/artwork.css`), as an app's does. The Dashboard's and the
    screen savers' stylesheets left `styles/` for the same reason
    (2026-10-03, #218: the first load's CSS went from 12.0 to 10.1 KB
    gzipped); where CSS goes is in [adding.md](adding.md).
  - What isn't on the first screen and waits on the Supabase client
    anyway starts once the desktop has settled (`Desktop.tsx`): Presence
    (other people's pointers, the channel, its signals), chat's watch
    for private messages and mentions, listening along, AirDrop and the
    disc watch. The menu bar's count of who's here
    (`social/online.tsx`) shows what Presence finds.
  - Motion is loaded lean: `Desktop.tsx` wraps everything in
    `<LazyMotion features={domAnimation} strict>`, so animate with `m.div`
    and friends, never `motion.div` (strict mode throws). `domAnimation`
    has animations, exit, variants and hover/tap/focus; layout animations
    and drag need `domMax`, which costs about 13 KB more on every first
    visit, so measure before reaching for it.

  Anything new that isn't on screen at first paint follows the same
  pattern.
- **Room made on 2026-09-29**, from 159.9 KB to 149.1 (the roadmap's first item),
  for what the first screen gets next:
  - 4.0 KB: the genie's warp is one number, moved each frame by a small
    `tween()` in `shell/Window.tsx`. motion's `animate()` moved it
    before, and brought what it has beyond `domAnimation` (animating
    any value, sequences) into every first load for that.
  - 4.2 KB: Presence and the watchers above. None is on the first
    screen, and each waits for the Supabase client, which loads after
    the desktop anyway.
  - 2.2 KB: the list of ryOS's photo collections
    (`src/data/wallpapers.json`) is `look/pictureSets.ts`. Only
    choosing a picture needs it (Preferences, the screen saver, the new
    picture as the tab is left); the desktop draws the chosen one
    without it. The tiles stayed (`wallpaper-tiles.json`): a tile chosen
    as the desktop picture needs its size at first paint.
  - 0.6 KB: Spotlight, and the applet list it was the first screen's
    only user of.
  - 0.2 KB back: `core/storage` has a chunk of its own since (below).

  Time Machine took 0.5 KB of it the same day: its manifest, every
  app's `added` date and the full-screen layer (`shell/FullScreenLayer.tsx`);
  its own code loads as it opens. Keyboard focus took 1.1 KB on
  2026-10-03 (#193–#195): `core/focus.ts` in the store's chunk, and the
  context menu's keys (`shell/menuKeys.ts`) with the menu, which the
  Dock already brought into the first load.
- **Read the chunk list `npm run perf` prints** after adding a dynamic
  import. Rolldown puts the modules that the same entries reach in one
  chunk, so a module loaded later that reaches some of a first-load
  chunk's modules but not the rest splits that chunk, and the piece
  split off costs its own imports and exports. `look/pictureSets.ts`
  reaches `core/storage` (through `wallpapers.ts` and `accent.ts`)
  without `core/store`, which took storage out of the store's chunk:
  0.2 KB, less than the contortions that would avoid it. An app does it
  too: Job Hunt imported `pngIcon` from `core/icons` for its alert, and
  with nothing else of the registry's that split `core/icons` into a
  chunk of its own (0.8 KB), until it took its icon from `apps` in the
  registry, as the rest do. Weigh each one; don't bend a module's
  imports out of shape for the chunker.
- **Subscribe to the narrowest slice of the store.** Dragging or
  resizing a window updates `windows` every frame, and every component
  that selects `s.windows` renders with it.
  - The chrome reads `useWindowList()` (no positions).
  - Booleans are selected as booleans.
  - The windows render in their own `WindowLayer`.
  - `Window` is memoized; keep its props stable.
  - The browser's size is `viewport` in the store, set once per animation
    frame while it's being resized (`watchViewport`), never at rest. Only
    a zoomed window, a phone's app, Exposé while it's open and a placed
    sticky select it, so a resize renders those and the windows it had
    to move, not every window. Don't read `window.innerWidth` while
    rendering: it's a snapshot nothing refreshes (pitfalls.md).
- **Assets:**
  - Desktop pictures are WebP, at most 2560px, quality about 75.
  - Icons are at most 160px.
  - Fonts are subset to the scripts and symbols the interface uses:
    Latin, punctuation, arrows, ⌘ ⌥ ⇧, ✓ and the variation selectors.
    Other characters fall back to the system font. To subset a new
    font, use fontTools and check that nothing the UI uses is lost.
- **Idle means idle.** Timers and animation frames stop when nothing is
  showing (a closed app, a hidden tab), and listeners are removed on
  unmount. Presence withdraws the pointer when the tab is hidden, and
  Realtime traffic stays throttled (`CURSOR_INTERVAL`).
