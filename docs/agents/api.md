# The site's API

What the browser and the Telegram bot can call, and the conventions
every endpoint follows. Most of the API isn't written by hand: Supabase
serves the database as a REST API, and the database's own rules
(row-level security, column grants, triggers) decide what each caller
may do ([supabase.md](supabase.md)). Code of ours stands in front only
where the database can't do the job: four Vercel Functions in `api/`
and two Supabase Edge Functions.

## Supabase

- **Tables and the storage bucket**: every table, who reads and writes
  it and its limit are in [supabase.md](supabase.md), "At a glance".
- **Functions visitors or members may call** (`grant execute` in
  `supabase/schema.sql`):

  | Function | Who | What it answers |
  | --- | --- | --- |
  | `username_available(name)` | everyone | whether a username is free, for signing up |
  | `chat_activity()` | everyone | the last message time of each room the caller can read, for unread counts |
  | `song_limit()` | everyone | how many songs the library may hold (read by `/api/songs`) |
  | `now_playing_position()` | everyone | where the song Jincheng is playing is now, by the database's clock |
  | `is_owner()` | everyone | whether the caller is Jincheng, the owner; owner-only policies call it, and the site asks only to decide what to show |
  | `my_reactions()` | members | the member's own Soapbox reactions |
  | `my_recovery_email()`, `set_recovery_email(address)` | members | the member's recovery address |
  | `chat_can_read(room)`, `chat_can_write(room)` | everyone / members | used by chat's row-level security, not called by the site |

- **Realtime** (`src/os/social/supabase.ts`): `desktop` (presence,
  pointers and short signals such as nudges and AirDrop offers, which
  anyone with the public key can send, so receivers check them),
  `chat-room` (new and removed chat messages, `postgres_changes`) and
  `now-playing` (what Jincheng plays, `postgres_changes` on a table only
  the bot writes).

## Vercel Functions (`api/`)

Each exports `GET` only; Vercel answers any other method with 405. All
are public and read-only.

### `GET /api/geo`

Where the visitor is, from the headers Vercel adds for their IP address.
Stores nothing.

- **200** `{ city, region, country, latitude, longitude, timeZone }`
  (city decoded and cut to 100 characters; a field Vercel didn't send is
  `null`).
- **204** without a usable location (local builds, unknown addresses).
- `cache-control: private, no-store` on both.

### `GET /api/lyrics?title=&artist=&duration=`

Synced lyrics from NetEase Cloud Music, for songs lrclib doesn't have.
`title` is required; `title` and `artist` are at most 200 characters,
`duration` (the video's length, in seconds) 0 to 7,200. Each call to
NetEase gives up after five seconds.

- **200** `{ source: "netease", duration, lrc }` (the LRC in Traditional
  characters, credit lines removed), `public, s-maxage=86400,
  stale-while-revalidate=604800`.
- **400** `{ error }` without a title (not cached), or with a value out
  of range (`public, s-maxage=86400`).
- **404** `{ error }` when no match has synced lyrics, `public,
  s-maxage=3600`.
- **502** `{ error }` when NetEase doesn't answer, `no-store`; logged.

### `GET /api/songs`

The music library (`{ albums, songs, limit }`) from Supabase, fresh at
the edge for 30 seconds and stale for 30 more (`public, s-maxage=30,
stale-while-revalidate=30`). When Supabase can't be read in five seconds,
or has no songs, the snapshot in `src/data/songs.json` is served with
`x-library: snapshot` and `public, s-maxage=60`, and the failure is
logged. Never an error status.

### `GET /api/framing?url=`

Whether a page lets `https://www.majincheng.com` frame it, from its
`X-Frame-Options` and CSP `frame-ancestors`; the Browser uses it to show
a notice instead of a blank window. It answers yes or no and passes on
nothing of the page (the body is cancelled unread).

- `url` is at most 2,000 characters, `http` or `https`, on port 80 or
  443, without credentials, and every address its name resolves to must
  be public (`publicUrl` refuses private, loopback, link-local and
  multicast ranges). Redirects are followed by hand, at most five, each
  checked the same way; each request gives up after five seconds.
- **200** `{ embeddable, url }` (`url` after redirects), `public,
  s-maxage=86400, stale-while-revalidate=604800`.
- **400** `{ error }` for an address it won't ask (`public,
  s-maxage=86400`) or a redirect to one (`public, s-maxage=3600`).
- **502** `{ error }` when the site doesn't answer (`public,
  s-maxage=300`) or redirects too many times (`public, s-maxage=3600`);
  logged.

## Edge Functions (`supabase/functions/`)

### `account-recovery` (POST)

Called from the Account window with `client.functions.invoke`, so it
answers CORS for the site's own pages only: `https://www.majincheng.com`,
`https://majincheng.com`, the origin of `RECOVERY_SITE_URL`, and any
listed in `RECOVERY_ORIGINS` (comma-separated, for trying a local build
with the real keys). Other pages get no CORS headers, so their browsers
won't send it. Every answer is JSON.

| Body | Answer |
| --- | --- |
| `{ action: "request", username }` | **200** `{ ok: true }` whether or not a link went out (nothing tells which accounts have a recovery address); **400** `{ error }` for a malformed username |
| `{ action: "check", token }` | **200** `{ username }`, or `{ username: null }` for a link that doesn't work |
| `{ action: "reset", token, password }` | **200** `{ ok: true, username }`; **400** `{ error }` for a password under 6 characters or over 72 bytes; **410** `{ error }` for a link that has expired or was used |

Also **400** `{ error }` for a body that isn't JSON or an unknown
action, **405** `{ error }` with `Allow: POST, OPTIONS` for any other
method, **204** for the browser's preflight, and **500** `{ error }`
(logged) when something fails underneath. Its limits live in the
database: three links per account and per address an hour, 60 an hour
in all, each working once for 30 minutes (`recovery_request` in
`supabase/schema.sql`).

### `soapbox-bot` (POST)

Jincheng's Telegram bot, and the database's moderation notices. It
acts only on requests carrying Telegram's
`x-telegram-bot-api-secret-token` equal to `TELEGRAM_WEBHOOK_SECRET`
(and then only on messages and buttons from `TELEGRAM_OWNER_ID`), or an
`x-moderation-secret` the database confirms (`moderation_check`).
Anything else gets a plain `404 Not found`, so it tells a stranger
nothing. See its README.

## Conventions

- **Errors** are `{ "error": "..." }`: one sentence, in sentence case,
  ending with a period, written for a person. The Account window shows
  the recovery function's errors as they are.
- **Status codes**: 200, 204 (nothing to say; a preflight), 400 (the
  request is wrong), 404 (nothing found), 405 (another method), 410 (a
  recovery link that no longer works), 429 (rate limited, below), 500
  (our failure), 502 (a service we relay to failed).
- **No CORS on the Vercel Functions**: they send no
  `Access-Control-Allow-*` headers, so only the site's own pages can read
  them in a browser. Only `account-recovery` needs CORS, since Supabase
  serves it from another host.
- **Any URL fetched on a visitor's behalf** goes through `publicUrl` in
  `api/framing.ts` (public addresses only, checked again at every
  redirect). The other functions fetch fixed hosts.
- **Caching** is said on each answer (`cache-control`): public data is
  kept at the edge for as long as it may be stale, anything about the
  visitor (`/api/geo`) not at all, and an error only when asking again
  soon wouldn't help.
- **A failure is logged** in one line, `console.error('/api/<name>:
  <what failed>:', reason)`, with no secrets and no more of the request
  than a host name.
- **Tests**: every Vercel Function has unit tests in `tests/api/` (not in
  `api/`, where Vercel would deploy them), and each Edge Function beside
  its code.
- **Rate limits**: the two functions that call other sites,
  `/api/lyrics` and `/api/framing`, share a Vercel Firewall rule: at most
  60 requests a minute per IP between them (fixed window), answered by
  Vercel with a plain-text **429** before the function runs. The site
  takes a 429 like any failure (no lyrics; the Browser tries the frame
  anyway). The Hobby plan allows one rate-limit rule, hence one for both.
  Change it with `vercel firewall rules list` / `edit`, then `vercel
  firewall publish` (from a checkout linked to the `jmos` project). The
  other endpoints are either cached (`/api/songs`) or limited by the
  database (`account-recovery`, and everything members write).
