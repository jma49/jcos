# 0009. What waits for the desktop to settle

- Date: 2026-09-27 (amended 2026-09-29 and 2026-10-04)
- Status: accepted

## Context

A first visit's JavaScript has a budget of 160 KB (gzipped), checked by
`npm run perf`. By 2026-09-29 it stood at 159.9 KB, with more to come on
the first screen.

## Decision

- The Dashboard loads after the desktop settles (#86). Opened in the
  first eight seconds on fast 3G, it takes 210 ms instead of 90 (on 4G,
  90 either way); loading it up front would add 4 KB to every first load.
- Room was made on the first load (159.9 KB to 149.1), and the budget
  stayed at 160: the room is for what the first screen gets next. The
  menu bar's count of who's here, other people's pointers, AirDrop and
  chat's alerts start once the desktop has settled (eight seconds in and
  idle), not with it, and Spotlight opened in those first seconds waits
  for its code (1 KB).
- The Supabase client (58 KB) waits too, for a visitor (#255). Without a
  stored session no one is signed in, which is known without it; it
  loads with Presence once the desktop has settled, or as soon as
  something needs it (an app, signing in, a password reset link). A
  stored session still loads it at the start: a member's name and
  stickies are on their first screen. `npm run perf` builds with
  placeholder Supabase settings since, so it measures what production
  sends; without them it had missed the client (212 KB, not 152).

## Consequences

- A few things are a moment late in the first seconds of a visit.
- The genie looks as it did: its warp was measured frame by frame
  against the old one.
- What moved, and why each kilobyte could, is in
  [docs/agents/performance.md](../agents/performance.md).
