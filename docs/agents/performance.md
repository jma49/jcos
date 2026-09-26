# Performance

- **Budgets** (checked by `npm run perf`; see [self-audit.md](self-audit.md)) for a first visit,
  meaning what's requested in the first seven seconds, before the
  desktop settles and fetches ahead:
  - at most 160 KB of JavaScript, gzipped (154 today; react-dom alone
    is 67);
  - at most 1.1 MB of images and 250 KB of fonts;
  - nothing downloaded twice.

  Dragging a window with six apps open, and five idle seconds, stay
  under the script time the script reports.
- **Load only what the first screen needs.**
  - Apps are lazy (`registry.tsx`).
  - The Supabase client arrives by dynamic import (`social.ts`).
  - The Dashboard and the screen saver's views load on first use, or
    once the desktop has settled (`afterSettled()` in
    `core/warmUp.ts`, eight seconds in and idle), so they're instant by
    the time anyone reaches for them. The Dashboard also starts loading
    when the pointer reaches the menu bar or the Dock.
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
