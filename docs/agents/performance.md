# Performance

- **Budgets** (checked by `npm run perf`; see [self-audit.md](self-audit.md)) for a first visit,
  meaning what's requested in the first seven seconds, before the
  desktop settles and fetches ahead:
  - at most 160 KB of JavaScript, gzipped (159 today; react-dom alone
    is 67), and 20 KB of CSS (16 today);
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
  (AGENTS.md); making room (ROADMAP.md item 1) comes first.
- **Load only what the first screen needs.**
  - Apps are lazy, code and styles (`registry.tsx`, `core/appStyles.ts`):
    `perf` fails if an applet's chunk is in the first load.
  - The Supabase client arrives by dynamic import (`social.ts`).
  - Moving apps in and out of the Dock (`shell/dockDrag.tsx`) loads on
    the first press, or once the desktop has settled.
  - The Dashboard and the screen saver's views load on first use, or
    once the desktop has settled (`afterSettled()` in
    `core/warmUp.ts`, eight seconds in and idle), so they're instant by
    the time anyone reaches for them. The Dashboard also starts loading
    when the pointer reaches the menu bar or the Dock. The screen
    savers' names and blurbs for System Preferences moved there too
    (2026-09-29, 0.5 KB off the first load: only that pane shows them),
    and a view's own stylesheet comes as text with it
    (`shell/artwork.css`), as an app's does.
  - Motion is loaded lean: `Desktop.tsx` wraps everything in
    `<LazyMotion features={domAnimation} strict>`, so animate with `m.div`
    and friends, never `motion.div` (strict mode throws). `domAnimation`
    has animations, exit, variants and hover/tap/focus; layout animations
    and drag need `domMax`, which costs about 13 KB more on every first
    visit, so measure before reaching for it.

  Anything new that isn't on screen at first paint follows the same
  pattern.
- **Subscribe to the narrowest slice of the store.** Dragging or
  resizing a window updates `windows` every frame, and every component
  that selects `s.windows` renders with it.
  - The chrome reads `useWindowList()` (no positions).
  - Booleans are selected as booleans.
  - The windows render in their own `WindowLayer`.
  - `Window` is memoized; keep its props stable.
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
