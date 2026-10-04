# Handoff: majincheng.com (JM/OS)

State of the project as of 2026-09-30, for picking the work up in a new
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
  `supabase/migrations/`, written so it can be rerun. The agent applies
  it once the pull request has merged, from an up-to-date `main`, with
  the Supabase CLI (logged in on the owner's Mac; no database password
  needed, it makes a temporary login role): `supabase db push --dry-run
  --project-ref hszogpoyyqgwjuznbegd`, then without `--dry-run` (with
  `--yes`), then `supabase db advisors --linked --project-ref
  hszogpoyyqgwjuznbegd --type security`. The CLI records each one in the
  project's migration history, so it never runs one twice. The owner
  handed this over on 2026-09-29 (before, migrations were pasted into the
  SQL editor by hand, and the history was then filled in with `supabase
  migration repair`). The repository's old link file isn't read by CLI
  2.118, hence `--project-ref`.
- The agent deploys the Edge Functions too, from an up-to-date `main`:
  `supabase functions deploy <name> --no-verify-jwt --project-ref
  hszogpoyyqgwjuznbegd`. Both need `--no-verify-jwt`: Telegram's webhook
  and the password reset page call them without a Supabase login, and
  without the flag the gateway turns them away (each checks its own
  secret instead). It uploads the working copy, so deploying from an old
  branch puts old code live. The owner's Claude Code allows `supabase migration repair`,
  `supabase db push` and `supabase functions deploy`; anything else on
  the production project (its data, its settings) is still asked first.
- Free Supabase projects pause after a week without activity; the social
  features then hide themselves until it's resumed.
- The "Update project previews" workflow runs on macOS once a day and by
  hand (not on every push, to save deployments): it refreshes the Photos snapshot
  (`npm run photos:update`) and recaptures the project covers and
  `public/og.jpg` (`npm run preview:capture`). It never pushes to
  `main`: what changed goes to the branch `chore/update-previews` and
  one pull request, "chore: update project previews", updated each day
  until someone merges it (each merge is a deployment, so they batch).
  A pull request opened with the job's token starts no workflows, so
  the job starts CI and the PR title check on the branch itself
  (`workflow_dispatch`). It needs "Allow GitHub Actions to create and
  approve pull requests" on (Settings > Actions > General).
- The "ocra review" workflow (2026-09-29) has ocra, the owner's code
  reviewer (github.com/jma49/Open-CR-Agent), review each pull request
  from this repository on Vertex AI: inline comments and one summary
  comment, and on later pushes only what changed. It's a trial on the
  owner's Google Cloud credit. It calls Open-CR-Agent's
  `ocra-dogfood.yml` at `main`, the only ref Google Cloud issues its
  keyless login to, so unlike the actions it isn't pinned to a SHA. One
  review stops at $2, at most $2 of reviews start a day, and the
  repository stops at $12 in all (the variable `OCRA_REVIEW_BUDGET_USD`,
  counted by a ledger of workflow artifacts). Drafts, forks and
  Dependabot are skipped, and the verdict is advice, not a required
  check. Turn it off with
  `gh variable set OCRA_REVIEW -R jma49/jmos --body off`.
- The Hobby plan caps deployments a day, and a busy day of merges hit
  it (2026-09-26: "Deployment rate limited — retry in 24 hours"; the
  GitHub CI stays the gate meanwhile). Only `main` deploys now
  (`git.deploymentEnabled` in vercel.json), so a pull request spends no
  deployment until it merges, and `scripts/vercel-ignore.sh` (the
  `ignoreCommand`) skips `main`'s build when only docs, tests, CI, the
  database, the Edge Functions' own folders or tooling changed
  (`supabase/functions/_shared` is bundled into the site, so it builds:
  #209). On a busy day, batch merges.

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
- **The music library is in Supabase** (decided and built 2026-09-26):
  Jincheng adds songs and plays them for whoever is on the desktop from
  the Telegram bot. Limits and choices:
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
  modal, so Tab moves on to the rest of the desktop. The Dashboard and
  a full-screen app (Time Machine) cover the desktop, so they are: the
  rest of the page is `inert` under them (#194).
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
  pointers. How lyrics get synced is ROADMAP.md item 2.
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
  Jincheng's own hideout: features serve Jincheng (music, things kept
  for later, looking back, idling), not recruiters. Mostly open to
  visitors, with a few rooms only Jincheng can enter, locked by the database.
  New things are only what existed in Tiger or Leopard, drawn with the
  same styles and the ryOS icon set: an idea board framed for job hunting
  and its invented styles were rejected. From prototypes staged in the
  real site Jincheng kept all seven (ROADMAP.md item 1); on the Dock stack:
  "the interaction and the UI have to be done well". Live: the iTunes
  Artwork screen saver, Chess, the iPod's ratings and playlists, the
  home folder, stickies and iCal of one's own, and Time Machine (all
  2026-09-29); the Dock stack is what's left (ROADMAP.md).
- **The owner is a database fact** (decided 2026-09-29). ryOS gates its
  admin by username in code; here `private.owners` holds Jincheng's
  account id and `public.is_owner()` answers for the caller, so row-level
  security locks the owner's rooms and nothing in the browser decides
  who the owner is (docs/agents/supabase.md, "The owner").
- **DVD Player, as Jincheng chose it** (2026-09-29): all thirteen of the
  prototypes on the design board were kept, the wooden shelf (not
  Apple's) included, and all are built (#159, #161–#163, #165–#167): the
  shelf and `/dvd`, DVD Player with Movies, Quick Look and Burn, the slot
  and Eject, full screen, Cover Flow, the wooden shelf, and a notice with
  Play DVD for whoever is on the desktop when Jincheng burns a disc
  (`media/discWatch.ts`, loaded once the desktop has settled). The Controller
  is a panel the app draws above the windows while it's in front, not a
  second window, so the window manager didn't change. A disc starts at
  its menu, so Play Movie is the click that starts the sound. Visitors'
  DVD-Rs never leave their browser. Two of the thirteen were taken out
  again at Jincheng's word (2026-09-29): the disc on the desktop while
  it's in the drive, and the Trash turning into Eject as it's dragged.
  Nothing is added to the desktop; the Controller and ⌘E eject. That
  gave the first load back 0.3 KB (159.4 of 160 KB then; 149 since room
  was made on it, below).
- **The iPod's ratings and playlists, as Jincheng chose them**
  (2026-09-29): the Now Playing rating screen, On-The-Go and the smart
  playlists, from the design board. Where the board left it open:
  On-The-Go is every visitor's own, Jincheng's included, kept in the
  browser; Jincheng's has Save Playlist, which makes it one of the
  playlists everyone sees, named on a screen of its own (a real iPod
  can't name one; the board asked for "Rainy Days"). The centre button
  on Now Playing now shows the rating, as the board has it, so artwork
  or video is chosen in Settings only. Holding the centre button puts
  a song, an album, an artist or a playlist into On-The-Go, and takes a
  song out of a playlist that can be changed. A play counts only when
  Jincheng listens to the end, and visitors see "Jincheng's rating".
  Plays go through `song_played()`, the one `security definer` function
  of the three, so no one sets a count or a time; the Security Advisor
  lists it on purpose. The first load didn't change (159.7 KB).
- **Jincheng's home folder, as the board had it** (2026-09-29): Users ›
  jincheng with the folders a Mac's home has, locked to anyone else but
  for Public and Sites, with Mac OS X's badge and Tiger's alert word for
  word; signed in as the owner, they open. Where the board left it open:
  documents open in a TextEdit that saves as it's typed (not Tiger's
  Save dialog; ⌘S saves at once, and a draft stays in the browser until
  a save lands), since the database is the only copy; a new document
  goes into Documents as "Untitled.txt", and Save As renames it or moves
  it, to Public for everyone to read. The diary is an entry at a time on
  a day, shown a year to a document ("Diary 2026.rtf"), with today's line
  at the top. Throwing a document away asks first, since there's no
  Trash to take it back from. Sites lists the projects' live sites.
  The first load grew 0.1 KB for TextEdit's manifest (159.5 of 160 KB).
- **Stickies of one's own, for every account** (2026-09-29). The
  board had notes on Jincheng's desktop, for Jincheng alone, and left
  their name beside the visitors' Stickies to Jincheng. Jincheng decided
  there's nothing to tell apart: every account keeps its own, which only
  it sees (row-level security; not even the owner reads another's). So
  Stickies has two views: Everyone's, the guestbook wall as it was, and
  Yours; a member's own notes sit on their own desktop, above its icons
  and below every window, and are made from the desktop's right-click
  menu or Stickies' File › New Sticky. A phone, with no desktop for
  them, has them in Yours. The first load grew 0.3 KB for the layer that
  loads them after sign-in (159.8 of 160 KB).
- **iCal of one's own, for every account** (2026-09-29), by the same
  rule: each member's own events and to-dos, which only they see, in
  Tiger's iCal (brushed metal, the calendars on the left, the month in
  the middle, To Do on the right, the info drawer). Two calendars, Home
  and Work, as Tiger's iCal began; no repeating or multi-day events yet,
  and times are where the member is, as on a paper calendar. Deleting an
  event asks first, since there's no Undo. The first load grew 0.1 KB
  for its manifest (159.9 of 160 KB, before room was made on it, below).
- **The home folder from Telegram** (2026-09-29): the bot's `/diary
  <text>` writes a diary entry, on the day it was sent where Jincheng is
  (the place `/at` set), and `/doc <text>` a document in Documents named
  after its first line; `/diary` alone says how today looks. Not
  `/note`, as the roadmap first had it: that's the Soapbox's (a public
  post, the same as plain text), and a private note mustn't turn public
  by habit or the other way round. Each keeps the Telegram message it
  came from (`telegram_message_id`, never granted to the site), so
  editing the message edits it and a message delivered twice is saved
  once. A photo sent with either goes nowhere rather than onto the
  Soapbox.
- **YouTube's middle button is covered, not shown** (2026-09-29).
  YouTube's embed now shows its own play/pause button for about 4.3 s
  after every start, seek and resume, and no setting turns it off. The
  iPod and Karaoke keep their artwork over the first 5 s of a video and
  of every seek. DVD Player covered its picture the same way, with the
  chapter's frame, and Jincheng found the picture stopping at every
  pause and play "not smooth". Asked to choose, Jincheng picked a picture
  that never stops: DVD Player keeps it, paused or not, masks only the
  button with one of its own, and lets YouTube's darkening of the picture
  show for those seconds, the one exception to "YouTube's chrome never
  shows" (docs/agents/pitfalls.md).
- **Room on the first load** (2026-09-29, the roadmap's first item,
  done): a first visit's JavaScript went from 159.9 KB to 149.1. The
  budget stays 160, so the room is for what the first screen gets next,
  the Dock stack first; what moved, and why each kilobyte could, is in
  docs/agents/performance.md. Accepted with it: the menu bar's count of
  who's here, other people's pointers, AirDrop and chat's alerts for
  private messages and mentions start once the desktop has settled
  (eight seconds in and idle), not with it, and Spotlight opened in
  those first seconds waits for its code (1 KB). The genie looks as it
  did: its warp was measured frame by frame against the old one.
- **Time Machine, as Jincheng chose it** (2026-09-29): Leopard's space,
  a Finder window per day going back, the timeline, Cancel and Restore,
  from the prototype on the design board. Asked what it goes back
  through, Jincheng chose the apps the desktop had each day and the
  music library and DVD shelf, not the Soapbox or the guestbook; the
  home folder is there for Jincheng alone, as in Finder. Asked what
  Restore does, "bring it back to now": what's chosen opens in the
  present (an app, a song, a disc, a document, a folder in Finder). The
  database keeps no old versions, so nothing changed or thrown away
  comes back, and a document shows today's text on every day it
  existed. Each app's day is its manifest's `added`, from the first
  commit that had it (TextEdit's is the home folder's, 2026-09-29, not
  the older icon of the same name). It's in the default Dock after
  Chat; a Dock a visitor rearranged keeps what they chose.
- **Job Hunt, as Jincheng chose it** (2026-09-29), on a design review
  page: every company Jincheng has applied to, on a board in iCal's
  brushed metal, with a list beside it; Bento's icon from ryOS; five
  stages, Applied, Assessment, Interviewing, Offer and Closed (with why:
  rejected, withdrew, no reply or declined). Claude brings in what Gmail
  says when Jincheng asks, through the claude.ai Gmail connector, and
  only reads there (nothing labelled, drafted, sent or deleted); the site
  and Supabase hold no Gmail credentials and read no mail. It's written
  only by `scripts/job-hunt-import.mjs`, which Jincheng allows in Claude
  Code's permissions (`Bash(node scripts/job-hunt-import.mjs:*)`), and
  the first sync goes back three months. Jincheng wanted others to see
  it too; asked how much, chose the numbers only: how many at each
  stage, how far they got and when it last changed, never a company or a
  role. A sync: search Gmail for applications and what came of them
  (confirmations, assessments, interview invitations, offers,
  rejections), from a little before the newest message Job Hunt has (the
  first time, three months back; reading a message again changes
  nothing, so searches can overlap); write what was found in the format
  at the top of the script to a file in the scratchpad, never the
  repository; show Jincheng the companies, roles and stages, and only on
  Jincheng's word run the script with `--dry-run`, then without; delete
  the file. Jincheng's own moves stand: a sync moves an application on,
  never back, and reopens nothing closed.
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
- **Whose a key is** (2026-09-30, #186–#188): an app's window-level
  keys apply with focus on the page itself or inside its window; a
  focused control anywhere else (a Dock icon, the menu bar, a window's
  close box) keeps its own Return, Space and arrows, and in a text
  field ⌥ with a key types rather than running a shortcut. The rule is
  `ownsKey` in `core/useKeys.ts` (docs/agents/desktop.md, Windows and
  the shell).
- **The session and the home folder across tabs** (2026-09-30,
  #189–#191): a `?open=` link opens its target over the saved session
  and leaves the address once handled, so a reload brings the session
  back; TextEdit saves a draft it finds as a page opens; the owner's
  tabs follow each other's saves and deletes in the home folder over
  `os-home`, as stickies and iCal do (docs/agents/desktop.md).
- **Windows follow the browser** (2026-09-30, #192): a resize or a
  rotation fits every window as a reload does, once per animation frame;
  zoomed windows and a phone's apps take their frame from the store's
  `viewport`, Exposé lays out again, and a member's stickies are shown
  within reach without being moved in the database. Decided with it: a
  window shrunk to fit stays that size when the browser grows again (as
  after a reload), and the frames follow the browser's inner size, not
  `visualViewport`, so a phone's keyboard leaves them alone.
- No link back to a classic site; Chinese is on hold.
- Don't change ocra for now; it will be redesigned.
- The "Ask me" AI assistant is on hold.
- Stickies has no review step, by choice: members only, three notes a
  day. To hide a note, set `approved` to false in the Supabase Table
  editor.

## 4. Current state

**Waiting on Jincheng**: trying `/diary` and `/doc` in the bot (the
code is tested with a fake Telegram and database, not yet with the real
ones).

- Job Hunt's first sync (2026-09-30) brought in 149 applications and
  299 messages from the three months before, checked with Jincheng
  first. Jincheng's choices for it: applications with no word for weeks
  closed as no reply, a gig platform's talent pools left out, agencies
  kept under the names the mail gives, and one row to a company and role
  (repeat applications merged). The next sync starts a little before the
  newest message Job Hunt has (§3). No company goes in this file: the
  repository is public.
- Every migration in `supabase/migrations/` has run, through
  `20260930062024_job_hunt.sql`, and the project's
  migration history says so (`supabase migration list --project-ref
  hszogpoyyqgwjuznbegd`). On 2026-09-29 production's structure was
  compared with `schema.sql` (columns, policies, functions, triggers,
  indexes, grants, constraints, Realtime; no rows read): the chat rooms
  migration had never taken (no rooms or private conversations, so the
  site showed the Lobby alone, and public chat messages' moderation
  notices were silently dropped), and the recovery email functions and
  the hardened `recovery_request()` were missing. `20260926071227`,
  `…094533`, `…095149` and `…100511` were run again (`migration repair
  --status reverted`, then `db push --include-all`). Production now
  matches `schema.sql`, but for comments that only `schema.sql` has in
  `music_stop()` and `soapbox_add_images()`. Jincheng's account is the owner (the `insert` in
  the owner migration's header), as Jincheng reported on 2026-09-29;
  `/api/songs` serving `discs` confirmed the shelf. Both Edge
  Functions were deployed from `main` that day: `account-recovery`
  answers CORS for the site's own origins only and other methods with
  405 (checked). `soapbox-bot` was deployed again by the agent, with
  `/diary` and `/doc` (2026-09-29). Password reset sends
  mail, and the whole music loop (`/add`, `/play`, "Listen along",
  `/stop`) was checked live on 2026-09-27.
- The Security Advisor (checked with `supabase db advisors` on
  2026-09-29, after the home folder) shows only the findings kept on
  purpose, listed in `supabase/migrations/20260926100511_advisor.sql`:
  `song_limit()` callable by visitors (it returns only the limit),
  `my_reactions()` and the other member-only helpers callable by
  members, and leaked password protection (an Auth setting on the Pro
  plan). `is_owner()` joins them (callable by everyone, it says only
  whether the caller is the owner), `song_played()` (callable by
  members, it counts nothing but the owner's plays) and
  `job_hunt_totals()` (callable by everyone, it gives Job Hunt's counts
  and names no company). `chat_can_write()`,
  `my_recovery_email()` and `set_recovery_email()` are there for members
  too, as `advisor.sql` says; `rules.sql` checks the exact list for
  visitors and for members. At the info level
  it lists the tables no role may reach through the API
  (`private.owners`, `private.password_resets`,
  `private.recovery_emails`, `private.secrets`, `music_settings`,
  `soapbox_settings`): row-level security with no policy, on purpose.
  The performance advisor has nothing at the warning level since
  `20260929185931_rls_initplan.sql`, which has seven older policies
  (Stickies, Soapbox reactions, chat) ask `(select auth.uid())` once
  instead of `auth.uid()` for every row.
- DVD Player's disc lengths: until 2026-09-29 (#174) a disc put in
  after another could be given the other's length, which went to
  `public.discs` when the owner did it. A wrong length is put right the
  next time the disc goes in with the owner watching (a DVD-R's in its
  visitor's browser), so nothing needs clearing by hand.
- Merges to `main` deploy, except those the ignored build step skips
  (only docs, tests, CI, the database, the Edge Functions' own folders
  or tooling). Still unconfirmed: that
  Vercel builds on Node 24; only a deployment's build log shows it (its
  first lines).
- Only `main` is left; every other branch is deleted.

What's been built and checked, and when, is in the git history and the
pull requests.

## 5. Open issues and known limits

What comes next, in order, is in [ROADMAP.md](ROADMAP.md).

The 2026-09-30 audit and architecture review are issues #186–#220, fixed
one batch at a time in this order: the keys (#186–#188), the session and
data (#189–#191), guard rails and stale docs (#206, #208, #209, #211,
#213, #214), the viewport (#192), focus and modals (#193–#195), small
fixes in the site (#196–#199, #203, #205), the server side (#200–#202,
#204, #207, #215, #216), docs and tooling (#212, #218–#220), then the
architecture (#210, #217).

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
4. **The first load** is 150 of its 160 KB budget (150.5, 2026-09-30:
   149.6 after room was made on it and Time Machine and Job Hunt came,
   plus `core/useKeys.ts`, 0.5 KB, now shared with the desktop's
   shortcuts, less 0.1 when the desktop's start-up moved into
   `core/windowSession.ts` for #189, plus 0.3 for the viewport in the
   store and the fit of windows to it, #192), 67 of it react-dom. What
   else could move:
   Exposé's overlay (1.1 KB), the context menu (0.8) and the ⌥Tab
   switcher's panel (0.6), each making its first use in the first
   seconds wait for its code, and chat's watch, split from the Dock's
   badge (0.5).
5. **Not ported from ryOS**, in Chat: @ryo (AI replies, on hold with the
   AI assistant), voice messages, IRC rooms and admins making rooms from
   the app.
6. **Upkeep on Supabase:** the agent runs `supabase db advisors` after
   each migration; in the dashboard, keep Settings › API › Exposed
   schemas to `public` (plus `graphql_public` only if GraphQL is used).
7. **What CI checks** on every pull request: `node scripts/audit.mjs`
   (`npm audit` for what ships, with dated exceptions), the type check, the lint (hooks, the app
   boundaries, storage), the unit tests
   (Vitest), the build, a smoke test that opens every app in a browser,
   the download budgets of `npm run perf`, and `npm run test:db` (the
   database rules and races against the per-member limits, on Postgres
   with stand-ins for Supabase's auth, storage and pg_net). The
   workflows pin every action to a commit SHA and default to read-only
   tokens; Dependabot updates npm and the actions weekly.
