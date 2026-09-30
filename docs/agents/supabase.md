# Accounts, Stickies, Chat, presence and music (Supabase)

The browser talks to Supabase directly with the public anon key; row-level
security and triggers in `supabase/schema.sql` do the enforcing.

## At a glance

Every place the site keeps or fetches data, who can read it, who can
write it, and the limit the database holds it to. "Members" are
signed-in accounts; "the bot" is `supabase/functions/soapbox-bot`,
which writes with the service role. Limits that count rows take an
advisory lock (Security, below).

| Data | Read by | Written by | Limit |
| --- | --- | --- | --- |
| `profiles` | everyone (id, username) | the sign-up trigger | |
| `notes` (Stickies) | everyone, approved notes | members; each can delete their own | 3 per member in 24 hours |
| `chat_rooms` | everyone | Jincheng, in the Table editor | |
| `chat_messages` | everyone in rooms; only the two members in a `dm:` room | members; each can delete their own | 8 per member in 30 s, 120 a minute in all |
| `soapbox_posts` | everyone, visible posts | the bot | |
| `soapbox_reactions` | everyone | anyone; members can change or take back theirs | one per post per visitor (members by account, others by salted IP hash) |
| `soapbox_settings` | the bot only | the bot | |
| `songs`, `albums` | everyone | the bot | `music_settings.song_limit` songs (200) |
| `music_settings` | the bot; visitors only through `song_limit()` | Jincheng, in the Table editor | |
| `now_playing` | everyone, while the song plays | the bot, through `music_play()` and `music_stop()` | one song |
| `discs` (DVD Player's shelf) | everyone | Jincheng: the bot's `/dvd`, or the site signed in as the owner | `music_settings.disc_limit` discs (200) |
| `song_stats` (the iPod's ratings and plays) | everyone | Jincheng, signed in: ratings through `rate_song()`, plays only through `song_played()` | a row per song in the library |
| `playlists`, `playlist_songs` (Jincheng's playlists) | everyone | Jincheng, signed in: `save_playlist()`, and deletes | `music_settings.playlist_limit` playlists (50); a song once per playlist |
| `documents` (Jincheng's home folder) | everyone, those in Public; the rest, the owner | Jincheng, signed in | `music_settings.document_limit` documents (500), 100,000 characters each |
| `diary` (Jincheng's diary) | the owner | Jincheng, signed in | `music_settings.diary_limit` entries (10,000), 20,000 characters each |
| `stickies` (a member's own) | that member alone (not even the owner) | that member | `music_settings.sticky_limit` a member (50), 4,000 characters each |
| `events`, `todos` (a member's own iCal) | that member alone (not even the owner) | that member | `music_settings.event_limit` events (5,000) and `todo_limit` to-dos (1,000) a member |
| `private.recovery_emails`, `private.password_resets`, `private.secrets` | not reachable through the API | account functions and the database | resets: 3 per account and 3 per address an hour, 60 an hour in all; a link lasts 30 minutes |
| `private.owners` | not reachable through the API; `is_owner()` tells the caller whether they're in it | Jincheng, once, in the SQL editor | Jincheng's account |
| `soapbox` storage bucket | everyone | the bot | images only, 10 MB each |
| Presence channel (Realtime) | everyone on the desktop | anyone, unchecked: receivers check what arrives | pointers stop past 12 people |

The code that isn't in the browser (each endpoint's parameters, answers and conventions are in [api.md](api.md)):

| Function | Where | What it does | Caching |
| --- | --- | --- | --- |
| `/api/geo` | Vercel, `api/geo.ts` | the visitor's city, coordinates and time zone, from Vercel's IP headers; stores nothing | none; 204 without the headers |
| `/api/lyrics` | Vercel, `api/lyrics.ts` | relays NetEase's synced lyrics for songs lrclib doesn't have | a day at the edge, misses an hour |
| `/api/framing` | Vercel, `api/framing.ts` | whether a page lets the Browser frame it, from its X-Frame-Options and CSP; public addresses only (private ones refused at every redirect), and it passes on no content | a day at the edge |
| `/api/songs` | Vercel, `api/songs.ts` | the music library from Supabase, or the repository's snapshot when Supabase can't be read | fresh 30 s, stale 30 s more; the snapshot a minute |
| `account-recovery` | Supabase Edge Function | emails a one-time reset link through Resend | |
| `soapbox-bot` | Supabase Edge Function | Jincheng's Telegram bot: Soapbox posts, the music commands, moderation buttons | |

## In detail

- **Accounts** (`src/os/social/`, `apps/account/`): a username and a
  password, with an optional recovery address. They're Supabase Auth users
  whose address is made from the username
  (`<username>@users.majincheng.com`), so Authentication › Providers ›
  Email › "Confirm email" must be off. `public.profiles` holds usernames;
  recovery addresses sit in `private.recovery_emails`, out of the API's
  reach. `social/account.ts` tells the interface who's signed in. A
  forgotten password is reset with a one-time link emailed to the
  recovery address by `supabase/functions/account-recovery` (Resend;
  setup in its README); the link opens `/?open=account&reset=<token>`.
  The email (subject, text and the Aqua-window HTML) is `email.ts` there;
  `preview.mjs` renders it to a file.
- **The owner** (`supabase/migrations/20260929100000_owner.sql`):
  Jincheng's account id sits in `private.owners`, and `public.is_owner()`
  says whether the caller is Jincheng. Owner-only tables check
  `(select public.is_owner())` in their row-level security (in a
  sub-select, so it runs once per statement), and functions that change
  shared data on the owner's behalf check it too. `social/owner.ts` asks
  it once per sign-in, only to decide what to show. The `astro dev`
  stand-in treats a member named `jincheng` as the owner.
- **Stickies**: members only, three notes in any 24 hours, signed with the
  username; members can take their own down. Hide a note by setting
  `approved` to false in the Table editor.
- **Stickies of one's own** (`public.stickies`; migration
  `20260929194437_stickies_of_their_own.sql`): each member's own notes,
  on their own desktop, which row-level security gives that member alone,
  the owner no more than anyone. A note keeps its text, one of Tiger's
  six colours, and where it sits (`x`, `y`, `width`, `height`,
  `collapsed`); whose it is, its `version` and its times are the
  database's. `version` counts saves of the text alone, so moving a note
  in one tab doesn't make what's being typed into it in another out of
  date, while a save of the text names the version it was typed over. At
  most `music_settings.sticky_limit` a member (50), under an advisory
  lock per member. The site uses it through `stickies/mine.ts`
  ([desktop.md](desktop.md)).
- **iCal of one's own** (`public.events`, `public.todos`; migration
  `20260929202730_ical_of_their_own.sql`): each member's own events and
  to-dos, given to that member alone as stickies are. An event has a
  one-line title, a calendar (Home or Work), a day, and either no times
  (all day) or a start and an end after it, in minutes after midnight on
  that day where the member is, and notes. A to-do has a title, a
  calendar, a priority from 0 (none) to 3 (high), perhaps a day it's due,
  and whether it's done; when it was done is the database's (a trigger
  sets and clears `done_at`). The limits are counted under an advisory
  lock per member. iCal uses them through `apps/ical/calendar.ts`, which
  reads events a few weeks at a time.
- **Soapbox reactions**: members react as themselves and can change or take
  back a reaction; everyone else gets one per post, by salted IP hash.
- **The music library** (`public.songs`, `public.albums`; migration
  `20260927030802_music_library.sql`): the iPod's and Karaoke's songs,
  read by everyone and written only by the Telegram bot (service role).
  At most `music_settings.song_limit` songs (200; change it in the Table
  editor); a full library refuses new songs. `song_limit()` gives visitors
  that one number (the iPod shows "34/200"), and the limit trigger reads
  it too. The migration seeds today's
  library once (`music_settings.seeded`), so a rerun changes nothing. Covers are links to
  Apple's or YouTube's image hosts only (the `music_cover` domain).
  `public.now_playing` is the one song Jincheng is playing for everyone:
  the bot calls `music_play()` and `music_stop()`, visitors hear of it
  through Realtime (`postgres_changes`, which only a real write can
  trigger) and join at `now_playing_position()`, by the database's clock
  (`media/together.ts`). The bot's music commands are in
  `supabase/functions/soapbox-bot/music.ts`.
- **DVD Player's discs** (`public.discs`; migration
  `20260929120000_discs.sql`): YouTube videos Jincheng has burned onto
  discs, on everyone's shelf. Read by everyone (through `/api/songs`,
  with the music); written only by the owner, from Telegram (`/dvd`,
  `supabase/functions/soapbox-bot/discs.ts`) or from the site signed in
  (`is_owner()` in the policies). A disc's `cover` is the name of one of
  the video's own images on i.ytimg.com (`maxresdefault`, `hq2`…), never
  an address, and `cover_x` where the case crops it. At most
  `music_settings.disc_limit` discs (200), counted under an advisory
  lock. Changes reach open desktops over Realtime (`media/discWatch.ts`,
  loaded once the desktop has settled): the shelf stays current, and a
  new disc brings a notice with Play DVD, except on the page that burned
  it. Visitors' own discs (DVD-Rs) stay in their browser and never reach
  the database.
- **The iPod's ratings and playlists** (`public.song_stats`,
  `public.playlists`, `public.playlist_songs`; migration
  `20260929140000_playlists.sql`): Jincheng's rating of each song (one to
  five stars), how many times Jincheng has listened to it to the end and
  when, and Jincheng's own playlists, which every iPod shows. Everyone
  reads them (the iPod asks Supabase itself, not `/api/songs`, so a
  change shows at once); only the owner writes. `rate_song()` and
  `save_playlist()` run as the caller, so the owner-only policies decide;
  `song_played()` is `security definer`, because no one may set a count
  or a time directly, and asks `is_owner()` before anything else. A song
  that leaves the library leaves every playlist, and its rating and
  plays go (foreign keys). At most `music_settings.playlist_limit`
  playlists (50), counted under an advisory lock; songs saved into a
  playlist that's there pass even at the limit. A name is one line of at
  most 40 characters, never one of the iPod's own (On-The-Go, My Top
  Rated, Recently Played, Top 25 Most Played). A visitor's On-The-Go
  stays in their browser ([media.md](media.md)).
- **Jincheng's home folder** (`public.documents`, `public.diary`;
  migration `20260929160000_home.sql`): Jincheng's documents, each in one
  of the home's folders, and the diary, an entry at a time on a day.
  Row-level security gives everyone the documents in Public and nothing
  else; the rest, and the diary, only the owner reads, and only the owner
  writes anything (the diary isn't even granted to visitors). A name is
  one line of at most 80 characters, with no slash or colon, not hidden,
  and unique in its folder whatever its case. Every save names the
  `version` it was made from (`update … where id = … and version = …`);
  a trigger counts saves and stamps the time, so a save from an older
  copy reaches no row and is refused, and races can't lose one
  (`race.sh`: four saves from one copy at once, one lands). At most
  `music_settings.document_limit` documents (500) and `diary_limit`
  entries (10,000), counted under advisory locks. Finder and TextEdit use
  it through `home/home.ts` ([desktop.md](desktop.md)). The bot writes
  entries and documents too (`/diary`, `/doc`, with the service role;
  `20260929192005_home_from_telegram.sql`), each with the Telegram
  message it came from in `telegram_message_id` (unique, and not granted
  to the site), so an edited message edits it and a redelivered one is
  saved once.
- **Chat** (`apps/chat/`, `social/chatState.ts`): public rooms listed
  in `public.chat_rooms` (add one in the Table editor) and private
  conversations between two members (rooms named
  `dm:<account id>:<account id>`, smaller id first, readable only by
  those two). Rooms are readable by anyone and written by members; kept
  for good and delivered over Realtime. Hide a message with `hidden`.
  Typing, nudges, @mentions and unread counts live in the browser; a
  signed-in member gets a notification and a Dock badge for private
  messages and mentions while Chat is closed.
- **Presence and signals** (`social/Presence.tsx`, `social/signals.ts`,
  joined once the desktop has settled; the menu bar's count is
  `social/online.tsx`): one Realtime channel carries who's on the desktop (city, username,
  open chat room, whether AirDrop can reach them), their cursors, and
  signals: short-lived messages such as typing, nudges and AirDrop
  offers. Anyone can send anything there, so receivers check what
  arrives (`cleanInfo()` for presence). Pointers are drawn only for a
  visitor who has turned on "Show other people's pointers" (off by
  default, `showOthersPointers`), who says so in their presence
  (`watching`); a pointer is sent only while someone else watches
  (`anyoneWatching()`), so a desktop where nobody does sends none, the
  bulk of Realtime's messages otherwise. Past `CROWD` (12) people, every
  visitor stops sending and drawing pointers, since pointer traffic grows
  with the square of the crowd; they come back at `CALM` (10). The menu
  bar's list names the first 30.

- **Moderation** (`supabase/migrations/20260926091033_moderation.sql`, the
  Soapbox bot): new Stickies notes and public chat messages go to the
  owner on Telegram through `pg_net`, signed with a secret in
  `private.secrets`, with Hide / Show again buttons; `/watch on|off`.

To set it up, create a Supabase project, run the schema in its SQL editor,
turn off "Confirm email", and set `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`) in Vercel and in `.env`,
for both Production and Preview. The names the Supabase integration for
Vercel uses, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, work as well. A project set up from
an older schema needs the files in `supabase/migrations/`, run in the
order of their timestamped names: `supabase db push` runs the ones the
project's migration history hasn't recorded (HANDOFF.md §1 has the
commands for this project). Test a migration against the live project inside `begin; …
rollback;` first (`supabase db query --linked -f`).

Without those variables, production hides these features, and `astro dev`
falls back to `src/os/social/local.ts`, which keeps accounts, notes and
chat in `localStorage` and shares chat and presence between tabs of one
browser.

## Security

- The browser holds only the public key; the database enforces every
  rule. A new table gets row-level security, `revoke all` from `anon`
  and `authenticated`, and column-level grants for exactly what the site
  reads and writes.
- Functions that bypass row-level security are `security definer` with
  `set search_path = public`, and have `execute` revoked from `public`,
  `anon` and `authenticated` unless the site calls them. Ones only an
  Edge Function calls are granted to `service_role` alone. Trigger
  functions get `execute` revoked from all three (triggers still fire:
  the right is only checked when a trigger is created). A function that
  only reads what its caller may read anyway is `security invoker`.
- A policy asks who the caller is with `(select auth.uid())` (and
  `(select public.is_owner())`), worked out once per statement; a bare
  `auth.uid()` is asked again for every row (the performance advisor's
  auth_rls_initplan). `rules.sql` checks every policy.
- Policies check something real: no `with check (true)`. Run the
  Security Advisor after each migration (`supabase db advisors --linked
  --type security`); the findings left on purpose
  are listed in `supabase/migrations/20260926100511_advisor.sql`,
  `20260929100000_owner.sql` and `20260929140000_playlists.sql`.
- A limit that counts rows before inserting ("three a day") takes a
  transaction-scoped advisory lock for whoever it limits first
  (`pg_advisory_xact_lock`), or concurrent requests all get through.
  Add a race for it in `supabase/tests/race.sh`, and a site-wide cap
  where many accounts together could flood it.
- Private data (recovery addresses, reset tokens, secrets) lives in the
  `private` schema, which the API doesn't expose. Keep tokens as hashes.
- Secrets (service role, Telegram, Resend) exist only as Supabase Edge
  Function secrets; nothing server-side goes in `PUBLIC_*` variables,
  Vercel or the repository. `.env` is ignored; `.env.example` lists
  what's safe.
- Presence and signals are unauthenticated claims: check shape and
  size, tie a name to the sender's own presence, and throttle anything
  that notifies.
- Anything a visitor wrote renders as text: links only for `http(s)`,
  never `dangerouslySetInnerHTML` (project Markdown, built at build time,
  is the one exception).
- Security headers are set in `vercel.json`. Dependabot proposes updates
  weekly; review majors (Astro, Vite) with a full build and the tests.
