# 0004. The music library lives in Supabase

- Date: 2026-09-26 (amended 2026-09-27 and 2026-09-29)
- Status: accepted

## Context

The iPod's and Karaoke's songs were a file in the repository, so adding
one meant a commit and a deployment. Jincheng wanted to add songs and
play them for whoever is on the desktop, from the Telegram bot.

## Decision

The library is a table in Supabase, written by the bot's Edge Function.

- It holds at most 200 songs, enforced in the database under an
  advisory lock. A full library refuses new songs (the bot says so)
  rather than dropping old ones.
- Only Jincheng requests songs for now; requests from visitors, approved
  from Telegram, may come later.
- A request reaches visitors through `postgres_changes` on a table only
  the Edge Function writes, never a Realtime broadcast, which anyone with
  the public key could forge. The visitor clicks to listen (browsers
  don't play sound unasked), under the one sound switch.
- "Listen along" joins at Jincheng's position, from the elapsed time the
  database computes (`now() - started_at`), not the visitor's clock.
- A visitor's iPod is theirs (2026-09-27): listening along starts the
  song once, and from then on it's the visitor's. `/stop` only takes the
  notice away and stops prompting late arrivals; it never stops anyone's
  music.
- Songs are validated in the database, not only by the bot, which builds
  every URL it fetches itself from the parsed video id. Covers stay
  links, to Apple's and YouTube's image hosts only.
- The site reads the library through `/api/songs`, cached at the edge
  for thirty seconds and served stale for thirty more (2026-09-29;
  before, five minutes and a day meant a song added on a quiet site
  reached visitors only some twenty minutes later, while a miss costs
  about 0.2 s). When Supabase can't be read, the function serves the
  snapshot in the repository (`npm run songs:snapshot`, refreshed by
  hand), since Vercel's CDN doesn't honour `stale-if-error`.

## Consequences

- The library left the first load. An open page picks up new songs
  when a music app opens or the tab comes back, at most once a minute,
  appended so every song keeps its place.
- 200 songs are about 100 KB of the free plan's database, and the edge
  cache keeps its egress out of reach.
- The snapshot isn't refreshed by a daily commit, which would spend a
  deployment a day.
- Details: [docs/agents/media.md](../agents/media.md),
  [docs/agents/supabase.md](../agents/supabase.md).
