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
- the Chinese copy of the site: the `zh` entries in
  `src/i18n/content.ts` and `src/content/projects/zh/`;
- proper names in data, such as song titles and artists in
  `src/data/songs.json` and the music library's seed in `supabase/`
  (`schema.sql` and its migration), which may also be quoted in the docs;
- patterns that have to match Chinese text, such as the lyric credits in
  `api/lyrics.ts`.

File and folder names are English and ASCII. Before committing, check
that nothing else slipped in, for example with a search for CJK
characters over `git ls-files`.

## Where to read

| Changing… | Read |
| --- | --- |
| anything under `src/os/`: windows, the Dock, menus, apps, desktop pictures, the sky | [docs/agents/desktop.md](docs/agents/desktop.md) |
| the iPod, Karaoke, songs, lyrics, anything that makes a sound | [docs/agents/media.md](docs/agents/media.md) |
| accounts, Stickies, Chat, presence, AirDrop, Soapbox, the schema, migrations, Edge Functions | [docs/agents/supabase.md](docs/agents/supabase.md) (with its Security section) |
| the Vercel Functions in `api/`, the Edge Functions, or what the site calls | [docs/agents/api.md](docs/agents/api.md) |
| anything on the first load, or that runs per frame | [docs/agents/performance.md](docs/agents/performance.md) |
| adding an app, applet, song, desktop picture or project | [docs/agents/adding.md](docs/agents/adding.md) |
| anything at all | [docs/agents/pitfalls.md](docs/agents/pitfalls.md): mistakes already made once |

Keep [HANDOFF.md](HANDOFF.md) current without being asked: when a piece
of work is done (merged, deployed, or stopped partway), update what
production runs, what's merged but not deployed, what the owner still
has to do and any decision made, in the same pull request or one right
after. A new session starts from it.

Migrations and Edge Functions are the agent's to put live, once their
pull request has merged, from an up-to-date `main`, with the Supabase
CLI: how is in HANDOFF.md (§1). Tell the owner what ran.

Before opening a pull request for a significant change (a feature, a
migration, a dependency, anything touching accounts, data, Realtime,
the window manager or the first load), go through
[docs/agents/self-audit.md](docs/agents/self-audit.md).
[HANDOFF.md](HANDOFF.md) is the project's current state and open
issues; [ROADMAP.md](ROADMAP.md) is the plan: take the next item from
it, and when one is done, record it in HANDOFF.md and take it out.

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
| any code | `npm run check` (types), `npm run lint` (hooks, the app boundaries, storage), `npm test` |
| an app, the shell or anything a visitor sees | `npm run build`, then `npm run test:smoke`; open it in a browser too (`npm run serve`) |
| the first load, a dependency, or anything per frame | `npm run build`, then `npm run perf`: every line within budget |
| the schema, a migration, a policy or a limit | `npm run test:db`, with a check (and a race for a limit) for the new rule; once merged, `supabase db push` and `supabase db advisors` (HANDOFF.md §1) |
| an Edge Function | `npm test` (its `*.test.mjs`) |
| a project's cover or the home page's look | `npm run preview:capture` |

CI (`.github/workflows/ci.yml`) runs `node scripts/audit.mjs`
(`npm audit` for what ships, but for the listed exceptions), the type check, the lint, the unit tests, the
build, the smoke test, the download budgets of `npm run perf` (script
times are only reported there, since shared runners are noisy) and the
database tests on every pull request. Actions are pinned to a commit
SHA with the version in a comment; Dependabot updates both.

- Unit tests (Vitest) are `*.test.ts` next to the code in `src/`; the
  Vercel Functions' are in `tests/api/`, since Vercel deploys every file
  under `api/`; each Edge Function has its `*.test.mjs`. Keep logic worth
  testing in plain modules without React (as `applets/spider/rules.ts`
  and `applets/pinball/table.ts` are).
- `npm run test:db` loads the schema into a local Postgres, reruns every
  migration from `20260926071227` on over it (so a new migration is
  rerun-tested without being listed anywhere), checks the database's
  rules (`supabase/tests/rules.sql`), then races the per-member limits
  with overlapping sessions (`supabase/tests/race.sh`).
- `npm run test:smoke` opens every app in the registry in a production
  build and fails on an uncaught error, a console error or a crashed
  window. A new app is covered once it's registered.

## Pull requests

- Branch from an up-to-date `main`, one logical change per pull request.
  Merge when CI passes, then delete the branch. Only `main` deploys
  (`git.deploymentEnabled` in `vercel.json`): branches get no preview,
  since CI already builds the site, opens every app and checks the
  budgets, and each preview spent one of the Hobby plan's few daily
  deployments. A deployment of `main` that says "Deployment rate
  limited" is that cap: redeploy `main` once it resets (HANDOFF.md).
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
  and size [docs/agents/adding.md](docs/agents/adding.md) gives, don't
  commit a second copy of a picture already in the repo, and don't
  commit recaptured covers or `public/og.png` unless the page they show
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

- Subject: `<type>: <summary>` in the imperative mood, lowercase after
  the colon, no trailing period, at most 72 characters. Common types are
  `feat`, `fix`, `docs`, `style`, `refactor`, `chore`.
- Leave a blank line after the subject, then write a body wrapped at 72
  characters that explains what changed and why.
- Keep each commit to one logical change.
