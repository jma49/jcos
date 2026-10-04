# 0020. The migrations are the schema

- Date: 2026-10-03
- Status: accepted

## Context

`supabase/schema.sql` (written by hand, 2,229 lines) made a new project,
and `supabase/migrations/` changed an existing one, so every change was
written twice. The first migrations depended on `schema.sql` having run,
nothing proved the two ended in the same database, and production
drifted once (#216). `npm run test:db` then loaded `schema.sql` and
reran the later migrations over it, which caught a function or a grant
one side lacked but not a column, hidden by `create table if not
exists`.

## Decision

The migrations are the one source (#237):

- A baseline migration, `20260925084925_baseline.sql`, is the first
  `schema.sql` (commit 56cddb5, with its commit time as the version), so
  the migrations alone, applied in order, make the whole database: a new
  project runs `supabase db push`. Applied that way to an empty
  database, they make exactly what the hand-written `schema.sql` made
  (checked with `pg_dump` when this was decided; only one column's
  position differed, as in any database the migrations made).
- The live project already has everything the baseline makes, so its
  migration history marks the baseline as applied
  (`supabase migration repair --status applied 20260925084925`) and it
  never runs there. The 26 migrations already there keep their names:
  renaming one would make the CLI run it again (pitfalls.md).
- `supabase/schema.sql` stays as the whole structure in one file, to
  read, but generated: `npm run db:generate` writes `pg_dump
  --schema-only` of the migrated database, less the test stand-ins for
  Supabase's own parts. `npm run test:db` fails when it's out of date.
  It loads the committed file and a freshly generated one and compares
  what they make, rather than their text, so a pg_dump of another
  version isn't a failure.
- New migrations are made with `supabase migration new`.

Turned down:

- Removing `schema.sql`: one readable file of every table, grant and
  policy is what agents and reviewers read first, and it costs nothing
  now that it's generated.
- Squashing every migration into one new baseline (`supabase migration
  squash`): the live project's history would need all 26 versions
  reverted and a new one marked applied, the files that explain each
  change would go, and the squash needs Docker.
- A baseline only up to the first rerunnable migration
  (`20260926071227`), dropping the three before it: their versions are
  in the live history, so it would need them reverted there too, for no
  gain; they run once in a new project like any other.
- Comparing `schema.sql`'s text with a fresh `pg_dump`: CI's and a
  laptop's pg_dump differ by version, and a dump loaded and dumped again
  doesn't give the same text (Postgres re-nests `and` in checks), hence
  comparing two loaded copies.

## Consequences

- A change to the database is one new migration plus `npm run
  db:generate`; `schema.sql` is never edited by hand.
- `test:db` now also checks that the migrations make a new project, from
  nothing, as `supabase db push` would.
- The rows the migrations seed (chat rooms, the music library) are in
  the migrations, not in `schema.sql`.
- The baseline, like the three migrations after it, runs only once:
  `run.sh` reruns the files from `20260926071227` on.
