# Handoff: majincheng.com (JM/OS)

State of the project as of 2026-09-26, for picking the work up in a new
session. Conventions and code layout are in [AGENTS.md](AGENTS.md).

## 1. What's done

### Site

- **majincheng.com is JM/OS**, a Mac OS X Aqua–style desktop in the
  browser. The classic one-page site is retired.
- **Chinese site is offline.** The `zh` copy in `src/i18n/content.ts` and
  `src/content/projects/zh/` are kept for later.
- **Project pages** at `/projects/<slug>/` remain for search and sharing,
  with an "Open in JM/OS" link.
- **Deep links:** `/?open=<about|resume|projects|photos|ipod|karaoke|stickies|soapbox|terminal|preferences|<project-slug>|dashboard|screensaver>`.
  `?sky=<dawn|day|golden|dusk|night>,<clear|cloudy|overcast|fog|drizzle|rain|storm|snow>`
  pins the desktop's time of day and weather for demos; `?place=<city>`
  pins the visitor's place.
- **Canonical URL** is `https://www.majincheng.com`; the bare domain
  redirects to it.
- **SEO and accessibility:** the home page ships a visually hidden
  plain-text copy of the content; sitemap, `robots.txt`, `llms.txt` and
  JSON-LD are generated.

### Shell

- Menu bar with per-app menus and a clock. It's see-through over the
  desktop picture, with white or black text to suit the picture, and
  opaque over a zoomed window or an app on a phone. The Apple logo takes
  the accent colour, so it follows the desktop picture.
- Desktop icons: Macintosh HD, About Me, Résumé, Projects (phones list
  every app). Right-clicking the empty desktop offers to change
  or reset the desktop picture, Exposé and the screensaver.
- Dock: one floating, rounded pane of frosted glass with magnification,
  running dots, a Dashboard toggle and a trash can. It keeps Finder,
  Projects, Photos, iPod and Chat; other apps show up there while
  they're open, and right-clicking one gives its menu. Its size and
  magnification are set in System Preferences › Dock.
- Now playing: ♫ in the menu bar while a song is on, with a card (cover,
  ⏮ ⏯ ⏭); the browser's media keys work through the Media Session API.
  One sound switch (menu bar speaker, System Preferences › Sound)
  governs interface sounds and music alike; pressing Play turns it on.
- The desktop picture changes (within its collection) each time the
  visitor leaves the tab and comes back; System Preferences can turn it
  off. Dynamic › Now Playing shows the playing song's cover, blurred.
- Window manager: drag, resize from five edges, z-order, minimize into
  the Dock with a Genie effect (SVG displacement map; Safari, phones and
  reduced motion get a plain shrink), zoom, windows that grow from the
  icon that opened them, and windows that can be thrown and bounce off
  the screen edges.
- Exposé: F9, the bottom-left hot corner or View → Exposé.
- Screensavers: Desktop Pictures (Ken Burns over Mac OS X's pictures),
  Flurry, Soapbox, Starfield, Clock or Bounce, after the idle time set in
  System Preferences (two minutes by default).
- Place: the visitor's city, coordinates and time zone come from their
  IP address through `api/geo.ts` (Vercel's `x-vercel-ip-*` headers; no
  prompt, nothing stored). They can pick another city instead.
- Sky: the wallpaper follows the light and weather at that place
  (Open-Meteo), with rain, storms, snow and fog drawn behind the windows
  and the temperature (°F or °C by country) in the menu bar. The menu
  bar clock uses the place's time zone; its tooltip shows San Jose time.
- Presence: the menu bar counts who's on the desktop and lists where
  they are ("🇯🇵 Tokyo"); other visitors' cursors carry the same label.
- Spotlight (⌘K); ⌥W / ⌥M / ⌥T close, minimize and open a terminal
  (browsers reserve ⌘W and ⌘T); ⌥Tab switches windows.
- Sounds: synthesized with Web Audio, off by default; the menu bar
  speaker or the Sound pane turns them on.
- Desktop icons can be dragged anywhere; "Clean Up Icons" on the desktop
  menu puts them back.
- Boot screen once per session; light and dark appearance.
- Desktop pictures include ryOS's photo collections and tiles.
- Look (2026-09-25 polish round, PRs #31–#39): Aqua pinstripes on
  windows, menus and bars; brushed metal for Finder, Browser, Photos and
  Calculator; an accent colour sampled from the desktop picture (or a
  fixed one); background windows go grey; glossy Aqua buttons, pop-ups,
  checkboxes, radios and sliders; an optional Glass material; Tiger
  drawers (Photos Info, Finder Get Info); six screen savers (Desktop Pictures,
  Flurry, Soapbox, Starfield, Clock, Bounce); desktop pictures in
  collections, including solid colours, patterns and a dynamic sky.

### Apps

- **About:** short and long bio.
- **Résumé:** a Pages-style HTML document (grey canvas, white two-column
  page) with zoom and Print…, whose print styles output only the page.
  There are no PDFs any more: the old `/Jincheng_Ma_Resume.pdf` and
  `/Jincheng_Ma_Resume_CN.pdf` redirect to `/?open=resume`.
- **Projects:** Finder-style list filtered by status, plus a detail
  window per project.
- **Browser:** an iframe window for live demos.
- **Terminal:** `help`, `whoami`, `ls`, `open`, `projects`, `contact`,
  `theme`, `neofetch`, tab completion and history.
- **Photos:** the 43 Unsplash photos, grouped by year in justified rows.
  Fetched at build time; Unsplash blocks Vercel's build servers, so
  builds usually fall back to the committed snapshot in
  `src/data/photos.json` (set `UNSPLASH_ACCESS_KEY` to use the official
  API instead). The viewer shows the whole photo, resizes the window to
  its proportions, and can AirDrop it. His photos aren't used as desktop
  pictures.
- **Accounts:** a username and a password (and an optional recovery
  address), in a ryOS-style window (Create Account / Sign In). Apple menu
  Sign In… / Sign Out; the username sits at the right of the menu bar.
  Supabase Auth with an address made from the username, so "Confirm
  email" must be off in the project. Forgot your password? A one-time
  link goes to the recovery address (Edge Function `account-recovery`,
  mail through Resend); members add or change the address once signed in.
- **Stickies:** a guestbook of notes in the style of Mac OS X Stickies,
  stored in Supabase. Members only (since 2026-09-26): three notes in any
  24 hours, enforced by a trigger, signed with the username; members can
  take their own down. Notes show right away.
- **Chat:** iChat-style, after ryOS's Chats: public rooms (Lobby, Music,
  Dev, Photography; more can be added in `chat_rooms`) in a sidebar with
  how many people are in each and unread counts, and private
  conversations between two members ("New Message…" or a click on an
  avatar). Readable by anyone, written by members, kept for good, live
  over Realtime. Typing indicators (public rooms), @mentions with
  completion, big emoji-only messages, links, a "new messages" button,
  and a nudge that shakes the other member's window. Private messages
  and mentions reach a signed-in member with Chat closed as a Growl-style
  notification and a badge on the Dock. Members can take back their own
  messages; eight messages in 30 seconds at most.
- **AirDrop:** for signed-in members; a Lion-style radar of the other
  members on the desktop. Share a
  photo, project, song, app or folder from Finder (right-click, or drag
  onto AirDrop), Photos or a project window; the other visitor accepts
  or declines, and accepting opens it. Only a Macintosh HD path travels,
  looked up on the receiver's own disk. "Allow me to be discovered by:
  No One" turns it off.
- **Dashboard:** the visitor's clock (dark at night), calendar and
  weather with a five-day forecast (flip it with "i" to pick a city);
  "Jincheng's time" in San Jose with the offset and a guess at what
  Jincheng is doing; recent GitHub activity and a sticky note.
- **System Preferences** (Apple menu only, not an app): Leopard's Show
  All grid with search, back/forward and ten panes. Personal: Appearance
  (Automatic, Light, Dark, Follow the sun; material; accent), Desktop &
  Screen Saver, Dock (size, magnification), Date & Time (place, 24-hour
  clock, date). Hardware & System: Displays (Night Shift, reduce motion),
  Sound, Accounts. Internet & Network: Sharing (city, pointer, AirDrop
  visibility, others' pointers), Software Update (build vs. `main` on
  GitHub), Backup & Restore (settings to a file and back; reset).
  Spotlight finds each pane.
- **Soapbox:** Jincheng's own notes and rants, with photos (a caption
  is the text, an album is one post), posted from a Telegram bot (`supabase/functions/soapbox-bot`); visitors react with one emoji
  per post, and the newest one shows on the Dashboard. Terminal:
  `soapbox`, `weather [city]`.
- **iPod:** a fifth-generation iPod with a working click wheel (drag,
  scroll or arrow keys): Music (Cover Flow, Albums, Artists, Songs),
  Extras (Karaoke, Brick, Music Quiz), Settings (shuffle, repeat,
  artwork or video on Now Playing, backlight, white / black / U2 theme),
  album pages, a dimming backlight, scrolling titles and a scrollbar.
  YouTube's title bar, logo and pause screen never show (cropped, and
  covered with the artwork until the video plays). A Controls menu
  appears in the menu bar while the iPod or Karaoke is in front.
- **Karaoke:** the song's video fills the window and its lyrics fill in
  time, line by line, with a song picker, seeking and a per-song lyrics
  timing nudge. Shares the iPod's library and "now playing": whichever
  app was used last plays, and the other picks up at the same second.
  Instrumentals get a listening view (cover over its own blur, album,
  what's next). The library (`src/data/songs.json`) has 15 songs and
  Ryuichi Sakamoto's BTTB -20th Anniversary Edition- (18 tracks);
  lyrics come from lrclib.net, or NetEase via `/api/lyrics`.
- **Photo Booth:** the camera in a mirror with nine effects, a 3-2-1
  countdown and flash, one picture or four; pictures stay in the
  browser and can be downloaded or made the desktop picture.
- **Synth** (applet): two octaves played with the mouse or Musical
  Typing, presets, waveforms, attack/release, tone, echo and an
  oscilloscope.
- **About This Mac** (Apple menu): the visitor's browser as the
  "hardware", and the build's commit under Software Update….
- **Terminal** extras: `cd`/`pwd`/`ls`/`cat`/`open` over Macintosh HD,
  `cowsay`, `fortune`, `uptime`, `say`.
- **Dock menus:** right-click an app for its windows, Show in Finder,
  Hide and Quit.
- **Games** (Applet Store): Spider Solitaire (one, two or four suits,
  undo, hints) and Pinball, an original Space Cadet–style table (bumpers,
  slingshots, drop targets, lanes, a wormhole, ranks Cadet → Fleet
  Admiral) with its own physics, played headlessly by bots to check the
  ball can't escape or get stuck.
- **Finder:** Macintosh HD opens a Finder over Applications, Applets,
  Documents, Music (albums as folders; a song plays on the iPod),
  Pictures and Projects, with icon, list (sortable headers) and column
  views, Quick Look (Space), arrow keys and type-to-select, a
  right-click menu and AirDrop in the sidebar.
- **Applet Store:** Get / Open / Remove for the applets, which install
  into Finder's Applets folder and Spotlight: **Minesweeper** (installed
  by default), **Tile Game** (a 4 × 4 sliding puzzle cut from a random
  photo) and **Calculator**. The store and Tile Game icons are drawn in
  SVG in `icons.tsx`.

### Phones

iOS-style home screen: a four-column icon grid and a four-slot Dock.
Apps open full screen with a "‹ Home" button, and the Dock hides while
an app is open.

### Content

- Projects, in order: ocra (in progress), Assay, majincheng.com.
- Positioning: title is "Software Engineer"; the copy leads with
  bringing AI agents into each stage of quality control and building
  developer tooling, not "mainly testing". The bio covers US experience
  only and mentions bouldering (V6) and photography.

### Automation

- `npm run preview:capture` builds the site, screenshots each project's
  `capture` URL into `src/content/projects/covers/*.jpg`, and captures
  the home page into `public/og.png`.
- Captures use a frozen 9:41 clock and reduced motion, skip pages that
  answer with an HTTP error, and only overwrite images whose pixels
  change by more than 0.1%.
- The "Update project previews" workflow runs the script on macOS after
  every push to `main` and weekly, and commits changed images. It also
  runs `npm run photos:update` to refresh the Photos snapshot.

## 2. Architecture, stack and agreements

### Stack

- Astro 5 + Tailwind 4. The desktop is one `client:only` React 19 island,
  with zustand for state and motion for animation.
- Hosted on Vercel project `jincheng-protafolio`; merging to `main`
  deploys. DNS is at GoDaddy.
- Supabase project `hszogpoyyqgwjuznbegd` backs Stickies and presence.
  Vercel holds its URL and publishable key as `NEXT_PUBLIC_SUPABASE_URL`
  and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (all environments; Astro
  exposes the `NEXT_PUBLIC_` prefix through `vite.envPrefix`). Preview
  deployments use the same project as production, so anything posted
  while testing a PR is real data.
- The project has `supabase/schema.sql` and every migration up to
  `20260926080833_soapbox_images.sql` applied (the last two on 2026-09-26);
  `20260926091033_moderation.sql` is next.
- Deploy the Soapbox bot from an up-to-date `main`: `supabase functions
  deploy` uploads whatever `supabase/functions/soapbox-bot/index.ts` is
  in the working copy, so deploying from an old branch puts an old bot
  live.
  `schema.sql` always describes the full current state for a new
  project; changes to an existing one go in a new dated file under
  `supabase/migrations/`, written so it can be rerun, and the owner runs
  it by hand in the SQL editor. The editor warns about "destructive
  operations" for `drop policy` / `drop trigger` lines; that's expected.
- Free Supabase projects pause after a week without activity; Stickies
  and presence then hide themselves until it's resumed.

### Code map

- `src/os/core/store.ts`: window map + z-order array; theme, Spotlight,
  Dashboard, Exposé, screensaver, desktop picture and online count.
- `src/os/shell/`, `ambient/`, `look/`, `media/`, `social/`: the
  features above, grouped by domain (see docs/agents/desktop.md).
- `src/os/core/registry.tsx`: every app, lazily loaded; `dockApps` and
  `mobileDockApps` choose what the Dock shows.
- `src/os/apps/*`: one component per app.
- `src/os/os.css`: the Aqua theme.
- `src/pages/index.astro`: assembles `OSData` at build time from
  `content.ts`, the projects collection and `src/lib/photos.ts`.
- Projects: `src/content/projects/<lang>/<slug>.md` with `order`,
  `status`, `cover`, `capture`, `demo` and `repo`.

### Assets

The icons, fonts (Lucida Grande, Apple Garamond, Monaco) and the stones
wallpaper are copied from ryOS. Using them was a deliberate choice after
discussing the Apple/Adobe copyright risk; `NOTICE` records their origin.
The `src/os` code is original and only borrows architecture ideas from
ryOS (AGPL-3.0).

### Working agreements

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

### Decisions

- **No King of Fighters '98** (decided 2026-09-26). A Neo Geo emulator
  runs well in the browser (EmulatorJS with the FBNeo core), but the
  game ROM and the BIOS are SNK's and can't be hosted; the only lawful
  version makes visitors bring their own ROM, which isn't worth having
  when it can't just be played. The same goes for other commercial
  games: build originals in their spirit, as Pinball is.
- **Jincheng's photos are for Photos only**, not desktop pictures or the
  screen saver, which use Mac OS X's own pictures.
- **AirDrop is for members**, as in ryOS.

- No link back to a classic site; Chinese is on hold.
- Don't change ocra for now; it will be redesigned.
- The "Ask me" AI assistant is on hold.
- Stickies has no review step, by choice: members only, three notes a
  day. To hide a note, set `approved` to false in the Supabase Table
  editor.

## 3. Open issues and next steps

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
4. **Tests and CI** are in: `npm test` (Vitest: Spider's rules, Pinball's
   physics by bot, the window manager, the Soapbox bot under a fake
   Telegram and Supabase, the account-recovery function) and
   `npm run test:db` (about 50 database rules, plus races against the
   per-member limits, on Postgres with stand-ins for Supabase's auth,
   storage and pg_net). `.github/workflows/ci.yml` runs both and the build on every
   pull request. **Possible next work:** the Chinese site and the AI assistant later;
   an ocra review-replay app once ocra's redesign is done.
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