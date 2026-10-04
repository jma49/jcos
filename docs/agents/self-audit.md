# Self-audit after significant changes

Performance and security follow the practices in this file, not
"whatever works". After every significant change, audit your own work
before opening the pull request, so the change brings no new risk,
vulnerability or bottleneck. Significant means any of these:
- a new app or feature;
- a table, function, policy or migration;
- a new dependency or major upgrade, or a new third-party service or
  secret;
- anything that touches accounts, data, Realtime, the window manager or
  the first load.

**Security:**
- Every new input is validated where it can't be bypassed (database
  constraints, row-level security, the Edge Function), with a length
  limit. Checks in the browser are a convenience.
- New tables and functions follow the Security section.
  - Run `npm run test:db` with checks for the new rules, and races for
    any new limit.
  - After the migration, run the Supabase Security Advisor. Any finding
    left in place is explained in the migration.
- Nothing secret reaches the browser, the repository or Vercel. Check
  `git diff` for keys and tokens, and keep `.env.example` current.
- What visitors write renders as text. Answers about accounts don't
  reveal whether one exists, in their content or their timing.
- `node scripts/audit.mjs` (`npm audit --omit=dev`) reports nothing new. An
  advisory that can't apply here goes in its exceptions, with the reason
  and a date to look again, never by loosening the gate. A new dependency is
  worth its weight.

**Performance:**
- `npm run perf` (it builds the site itself, with placeholder Supabase
  settings, as production is built, and serves it). Every line is
  within budget; compare with the numbers before the change. CI
  checks the download budgets, but only a run on your machine checks
  the script times.
- New code that isn't needed at first paint is lazy. New store
  subscriptions are narrow. New timers and listeners stop and clean up.
- New images are sized and compressed; new fonts are subset.

**Concurrency.** JM/OS is used by many people at once, and by one
person in several tabs. Every feature is checked against these before
it's called done:
- **Limits** hold when requests arrive together: an advisory lock, and a
  race in `supabase/tests/race.sh` that fails without it.
- **Claims are atomic** in the database (`update`/`delete … returning`,
  `on conflict`, a unique key), never read-then-write across two
  requests: two taps on a button, or Telegram delivering an update twice,
  act once and say so.
- **Every tab of a visitor shares storage.** A change builds on what's
  stored now (`updateJSON`, `saved().update`), never on this tab's copy,
  and state other tabs change is picked up (`onStored`). Deliberately
  per tab: the open windows (`os-windows`), last writer wins.
- **Fan-out** stays proportional to what's used: an event that reaches
  every visitor carries what they need (a Realtime row) rather than
  sending all of them to the database at once; nothing is sent that no
  one has asked to see (pointers go only to those watching); count what
  a change costs in Realtime messages and requests per visitor against
  the free plan (2 million messages and 200 connections).
- **One visitor's actions don't reach another's screen uninvited.**
  Anything shared (pointers, plays, AirDrop) is opt-in or asks first.
- **Order-independent**: a Realtime event before the data it refers to,
  a song removed while someone plays it, a deploy under an open page.

**Record it.** The pull request says what was checked, with the numbers
from `npm run perf`. Findings are fixed in the same pull request.
Anything deliberately left is written down with the reason: a choice
that holds beyond today as a record in
[docs/decisions/](../decisions/), a known limit or a follow-up in the
private operating notes (`../jmos-ops/HANDOFF.md`, AGENTS.md).
