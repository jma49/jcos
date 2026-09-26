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
- `npm audit --omit=dev` reports nothing new. A new dependency is
  worth its weight.

**Performance:**
- `npm run build`, then `npm run perf` (it serves `dist/` itself). Every
  line is within budget; compare with the numbers before the change. CI
  checks the download budgets, but only a run on your machine checks
  the script times.
- New code that isn't needed at first paint is lazy. New store
  subscriptions are narrow. New timers and listeners stop and clean up.
- New images are sized and compressed; new fonts are subset.

**Record it.** The pull request says what was checked, with the numbers
from `npm run perf`. Findings are fixed in the same pull request.
Anything deliberately left goes to HANDOFF.md with the reason.
