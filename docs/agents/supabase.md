# Accounts, Stickies, Chat and presence (Supabase)

The browser talks to Supabase directly with the public anon key; row-level
security and triggers in `supabase/schema.sql` do the enforcing.

- **Accounts** (`src/os/social/`, `apps/Account.tsx`): a username and a
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
- **Stickies**: members only, three notes in any 24 hours, signed with the
  username; members can take their own down. Hide a note by setting
  `approved` to false in the Table editor.
- **Soapbox reactions**: members react as themselves and can change or take
  back a reaction; everyone else gets one per post, by salted IP hash.
- **Chat** (`apps/Chat.tsx`, `social/chatState.ts`): public rooms listed
  in `public.chat_rooms` (add one in the Table editor) and private
  conversations between two members (rooms named
  `dm:<account id>:<account id>`, smaller id first, readable only by
  those two). Rooms are readable by anyone and written by members; kept
  for good and delivered over Realtime. Hide a message with `hidden`.
  Typing, nudges, @mentions and unread counts live in the browser; a
  signed-in member gets a notification and a Dock badge for private
  messages and mentions while Chat is closed.
- **Presence and signals** (`social/Presence.tsx`, `social/signals.ts`):
  one Realtime channel carries who's on the desktop (city, username,
  open chat room, whether AirDrop can reach them), their cursors, and
  signals: short-lived messages such as typing, nudges and AirDrop
  offers. Anyone can send anything there, so receivers check what
  arrives (`cleanInfo()` for presence).

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
order of their timestamped names. Test a migration against the live project inside `begin; …
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
- Policies check something real: no `with check (true)`. Run Supabase's
  Advisors › Security after each migration; the findings left on purpose
  are listed in `supabase/migrations/20260926100511_advisor.sql`.
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
