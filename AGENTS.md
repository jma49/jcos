# AGENTS.md

Guidance for coding agents working in this repository: majincheng.com,
which is JM/OS, a Mac OS X–style desktop in the browser (one Astro page
with a React island in `src/os/`), with accounts, chat and a guestbook on
Supabase. This file has the rules that always apply; the details are in
`docs/agents/`, to read when a change touches that part.

## Language

Write everything in English: commit messages, pull request titles and
descriptions, issues, code comments, documentation, and file names.

The only exceptions are content that is Chinese by nature:
- proper names in data, such as song titles and artists in
  `src/data/songs.json`, the music library's seed in
  `supabase/migrations/` and Jincheng's name in Chinese
  (`alternateName` in `src/content/site.ts`), which may also be quoted
  in the docs;
- patterns that have to match Chinese text, such as the lyric credits in
  `api/lyrics.ts`.

File and folder names are English and ASCII. Before committing, check
that nothing else slipped in, for example with a search for CJK
characters over `git ls-files`.

## Where to read

| Changing… | Read |
| --- | --- |
| anything under `src/os/`: windows, the Dock, menus, apps, desktop pictures, the sky | [docs/agents/desktop.md](docs/agents/desktop.md) (the map, boundaries, naming and the shared shell), then the header comment of the component you change (each app's own behaviour) |
| the iPod, Karaoke, songs, lyrics, anything that makes a sound | [docs/agents/media.md](docs/agents/media.md) |
| accounts, Stickies, Chat, presence, AirDrop, Soapbox, the schema, migrations, Edge Functions | [docs/agents/supabase.md](docs/agents/supabase.md) (with its Security section) |
| the Vercel Functions in `api/`, the Edge Functions, or what the site calls | [docs/agents/api.md](docs/agents/api.md) |
| anything on the first load, or that runs per frame | [docs/agents/performance.md](docs/agents/performance.md) (the budgets and today's readings) |
| adding an app, applet, song, desktop picture or project | [docs/agents/adding.md](docs/agents/adding.md) |
| why something is the way it is, before proposing to change it | [docs/decisions/](docs/decisions/) |
| anything at all | [docs/agents/pitfalls.md](docs/agents/pitfalls.md): mistakes already made once |

## State and decisions

The operating state and procedures (what production runs and where, how
migrations and Edge Functions go live, what's merged but not live, what
the owner still has to do, open issues) are in `HANDOFF.md` in the
private repository `jma49/jmos-ops`, cloned next to this checkout as
`../jmos-ops/HANDOFF.md`. A new session starts from it. Keep it current
without being asked: when a piece of work is done (merged, deployed, or
stopped partway), update it, then commit and push in jmos-ops, which
has no pull requests (commit to its `main`). Never copy it, or anything
from it, into this repository: this one is public, and every commit
stays in its history. Without access to jmos-ops (a contributor), leave
it to the owner.

Decisions worth keeping (what was chosen, what was turned down and why)
go in [docs/decisions/](docs/decisions/) as a new numbered record, in
the pull request that makes the change; operational details stay in
jmos-ops.

Migrations and Edge Functions are the agent's to put live, once their
pull request has merged, from an up-to-date `main`, with the Supabase
CLI: how is in jmos-ops's HANDOFF.md (§1). Tell the owner what ran.

Before opening a pull request for a significant change (a feature, a
migration, a dependency, anything touching accounts, data, Realtime,
the window manager or the first load), go through
[docs/agents/self-audit.md](docs/agents/self-audit.md).
[ROADMAP.md](ROADMAP.md) is the plan: take the next item from it, and
when one is done, record it in jmos-ops's HANDOFF.md (and any decision
in docs/decisions/) and take it out.

## Rules that always hold

- The database enforces every rule; the browser only has the public
  key. New tables get row-level security and column grants; limits take
  an advisory lock (docs/agents/supabase.md).
- Nothing secret goes in the repository, Vercel or a `PUBLIC_*`
  variable. What visitors write renders as text.
- One sound switch and volume govern every sound, the music included.
- YouTube's own chrome never shows.
- Jincheng's own photos appear only in Photos, never as the desktop
  picture or the screen saver.
- Apps and anything not on screen at first paint load lazily; store
  subscriptions select the narrowest slice.
- Anything remembered in the browser goes through
  `src/os/core/storage.ts` (the lint refuses `localStorage` and
  `sessionStorage` anywhere else under `src/os/`).
- Before deciding, check that it's the best practice, and that fixing
  the problem in front of you doesn't bring in more. Find the cause
  before changing anything: when it isn't known, first make it
  observable (a log, a measurement, a test that fails), and fix what the
  evidence shows, not a guess. A fix that silences a check (a raised
  budget, a skipped test, an ignored error) needs a reason that holds
  beyond today.
- Design for many visitors at once and one visitor in several tabs:
  limits and claims hold under races, tabs don't overwrite each other,
  fan-out stays small, and no one's actions reach another's screen
  uninvited (docs/agents/self-audit.md, Concurrency).
- Don't reformat whole files (there's no Prettier config); match the
  surrounding code.

## Checking a change

| Changed | Run |
| --- | --- |
| any code | `npm run check` (types), `npm run lint` (hooks, the app boundaries, storage, the scripts), `npm test` |
| an app, the shell or anything a visitor sees | `npm run build`, then `npm run test:smoke`; open it in a browser too (`npm run serve`) |
| the first load, a dependency, or anything per frame | `npm run perf` (it builds the site itself): every line within budget |
| the schema, a migration, a policy or a limit | `npm run test:db`, with a check (and a race for a limit) for the new rule; once merged, put it live as jmos-ops's HANDOFF.md (§1) says |
| an Edge Function | `npm test` (its `*.test.mjs`) and `deno check supabase/functions/*/index.ts` (its types) |
| a project's cover or the home page's look | `npm run preview:capture` |
| a doc | `npm test` (every path cited in backticks exists: `scripts/check-doc-paths.mjs`) |

CI (`.github/workflows/ci.yml`) runs `node scripts/audit.mjs`
(`npm audit` for what ships, but for the listed exceptions), the type check (the Edge Functions' with `deno check`), the lint, the unit tests
(with their coverage, reported but not yet held to a threshold), the build, the smoke test, the download budgets of `npm run perf` (script
times are only reported there, since shared runners are noisy) and the
database tests on every pull request; `pr-title.yml` checks that the
pull request's title is a Conventional Commit. Actions are pinned to a
commit SHA with the version in a comment; Dependabot updates both. The
`Update project previews` workflow never pushes to `main`: it opens a
pull request and starts CI on it itself.

- Unit tests (Vitest) are `*.test.ts` (or `.tsx`) next to the code in
  `src/`; the Vercel Functions' are in `tests/api/`, since Vercel deploys
  every file under `api/`; each Edge Function has its `*.test.mjs`. Keep logic worth
  testing in plain modules without React (as `applets/spider/rules.ts`
  and `applets/pinball/table.ts` are).
- `src/os/social/contract/` holds both social backends (the Supabase
  slices over a fake client, and the `astro dev` stand-in) to the same
  rules, a file per domain: a rule a slice adds gets a case there.
- `npm run test:db` applies every migration in order to an empty local
  Postgres, as a new project gets them, fails if the generated
  `supabase/schema.sql` or `src/lib/database.types.ts` isn't what they
  make (`npm run db:generate` rewrites both), reruns every migration from `20260926071227` on over the
  result (so a new migration is rerun-tested without being listed
  anywhere) and fails if that changes anything, checks the database's rules
  (`supabase/tests/rules.sql`), then races the per-member limits with
  overlapping sessions (`supabase/tests/race.sh`).
- `npm run test:smoke` opens every app in the registry in a production
  build and fails on an uncaught error, a console error, a crashed
  window or anything the Content Security Policy in `vercel.json`
  refuses or would refuse (its Report-Only one included). A new app is
  covered once it's registered; a new origin the site fetches from, or a
  changed inline script's hash, goes in the policy in the same change.

## Pull requests

- Branch from an up-to-date `main`, one logical change per pull request.
  `main` takes changes only through pull requests, and only once CI
  passes (a ruleset requires both). Merge when CI passes, then delete
  the branch.
- Merges are squash merges, the only kind the repository allows: the
  pull request becomes one commit on `main`, whose subject is the pull
  request's title and whose body is the branch's commit messages (so
  their `Co-Authored-By` trailers carry over). The title follows the
  commit rules below (the "PR title" check enforces the format). Stacked
  pull requests merge from the bottom up, each rebased on `main` after
  the one below lands.
- Only `main` deploys
  (`git.deploymentEnabled` in `vercel.json`): branches get no preview,
  since CI already builds the site, opens every app and checks the
  budgets, and each preview spent one of the Hobby plan's few daily
  deployments. A deployment of `main` that says "Deployment rate
  limited" is that cap: redeploy `main` once it resets (jmos-ops's
  HANDOFF.md has how).
- Check `git status` and `git diff --cached` before committing.
- When a file, script or asset is no longer used, delete it in the same
  change, and update the README and these docs.
- Remove agent worktrees (`git worktree remove`) and their local
  branches when the work is done.

## What stays out of git

Every version of every committed file stays in history for good, so a
later delete does not undo a commit.

- No secrets or env files: only `.env.example`, with empty values. Real
  values live in `.env` locally and in Vercel and Supabase.
- No build output or caches: `dist/`, `.astro/`, `node_modules/`,
  `*.tsbuildinfo`, test and Playwright reports, logs.
- No personal tool files: `.claude/settings.local.json`,
  `.claude/worktrees/`, `CLAUDE.local.md`, `.cursor/`, editor settings.
- Images are most of the repository's weight. Add one at the format
  and size [docs/agents/adding.md](docs/agents/adding.md) gives
  (`npm test` holds each file in `public/` to a budget:
  `scripts/check-public-sizes.mjs`), don't commit a second copy of a
  picture already in the repo, and don't
  commit recaptured covers or `public/og.jpg` unless the page they show
  actually changed.
- When a new tool or script writes files into the repo, add its output
  to `.gitignore` in the same change.
- If something secret was committed, stop and tell the owner: it needs
  the key rotated and the history rewritten.

## README

`README.md` is the project's front page: what JM/OS is, how to run and
configure it, the backend setup, the layout, security and scripts. Update
it in the same pull request as any major change: a new part of the
desktop, a new service, secret or setup step, a new top-level folder or
script, or a changed command.

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- Subject: `<type>: <summary>` or `<type>(<scope>): <summary>` in the
  imperative mood, lowercase after the colon unless it starts with a
  name, no trailing period, at most 72 characters. The types are
  `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
  `ci`, `chore` and `revert`.
- Leave a blank line after the subject, then write a body wrapped at 72
  characters that explains what changed and why.
- Keep each commit to one logical change.
- Commits are authored as the owner (Git's own identity); `.mailmap`
  folds the older identities into one. Credit AI help with a trailer at
  the end of the body, never as the author, such as
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- A pull request's title is its squash commit's subject, so the same
  rules apply to it.
