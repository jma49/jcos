#!/usr/bin/env bash
# Makes the database as a new project gets it, every migration in order
# into a fresh Postgres (with stand-ins for Supabase's own parts), and
# checks that supabase/schema.sql, generated from it, is up to date. Then
# runs the latest migrations again on top to show they can be rerun
# (pg_dump before and after), checks the rules in rules.sql, and races the
# per-member limits (race.sh).
#
# With --write (npm run db:generate) it writes schema.sql instead of
# checking it, and stops there.
#
# Needs psql, pg_dump (as new as the server), Node and a Postgres server
# they can reach as a superuser: set the usual PGHOST, PGPORT, PGUSER (and
# PGPASSWORD) if the defaults don't.
# Usage: npm run test:db, or npm run db:generate
set -euo pipefail
cd "$(dirname "$0")/../.."

WRITE=0
[ "${1:-}" = "--write" ] && WRITE=1

# The migrations, as a new project gets them; the committed schema.sql;
# and schema.sql as the migrations generate it now.
DB="jmos_test_$$"
COMMITTED="jmos_committed_$$"
FRESH="jmos_fresh_$$"
DUMPS=$(mktemp -d)
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB" -c "create database $COMMITTED" -c "create database $FRESH"
trap 'psql -q -d postgres -c "drop database if exists $DB" -c "drop database if exists $COMMITTED" -c "drop database if exists $FRESH" >/dev/null; rm -rf "$DUMPS"' EXIT
# The API roles are cluster-wide; make them once.
psql -q -d postgres -c "do \$\$ begin create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; exception when duplicate_object then null; end \$\$" >/dev/null

# The database's structure as pg_dump writes it, without what changes from
# one dump to the next (the \restrict key, pg_dump's own version).
dump() {
  pg_dump --schema-only -d "$1" | grep -v -e '^\\restrict ' -e '^\\unrestrict ' -e '^-- Dumped ' > "$2"
}

# Runs psql quietly; an error fails the test (it used to be printed and let through).
run() {
  local out status=0
  out=$(psql -q -v ON_ERROR_STOP=1 "$@" 2>&1) || status=$?
  printf '%s\n' "$out" | grep -v -e 'NOTICE:.*skipping' -e 'wal_level' -e 'HINT:' -e '^$' || true
  return "$status"
}

run -d "$DB" -c "$(grep -v '^create role' supabase/tests/stubs.sql)"
dump "$DB" "$DUMPS/stubs.sql"
# A new project: `supabase db push` applies every migration once, in the
# order of their names, each in a transaction.
for f in supabase/migrations/*.sql; do
  run -d "$DB" -1 -f "$f"
done
dump "$DB" "$DUMPS/migrated.sql"

# schema.sql is that database's structure, generated (schema.mjs).
node supabase/tests/schema.mjs "$DUMPS/stubs.sql" "$DUMPS/migrated.sql" > "$DUMPS/schema.sql"
if [ "$WRITE" = 1 ]; then
  cp "$DUMPS/schema.sql" supabase/schema.sql
  echo "wrote supabase/schema.sql"
fi
# The check loads the committed file and the one generated now, and
# compares what they make rather than their text, so a pg_dump of another
# version writing it differently isn't a failure. Like any pg_dump,
# schema.sql grants what each object has and revokes only what Postgres
# itself grants, so it's loaded before the stand-ins' default grants
# (pg_dump puts default privileges last too).
load() {
  run -d "$1" -c "$(grep -v -e '^create role' -e '^alter default privileges' supabase/tests/stubs.sql)"
  run -d "$1" -1 -o /dev/null -f "$2"
  run -d "$1" -c "$(grep '^alter default privileges' supabase/tests/stubs.sql)"
  dump "$1" "$3"
}
load "$FRESH" "$DUMPS/schema.sql" "$DUMPS/fresh.sql"
load "$COMMITTED" supabase/schema.sql "$DUMPS/committed.sql"
if ! diff -u "$DUMPS/committed.sql" "$DUMPS/fresh.sql" > "$DUMPS/drift.diff"; then
  echo "FAILED: supabase/schema.sql isn't what the migrations make; run npm run db:generate. What differs (- schema.sql, + the migrations):"
  cat "$DUMPS/drift.diff"
  exit 1
fi
echo "ok: supabase/schema.sql is what the migrations make"
[ "$WRITE" = 1 ] && exit 0

# Every migration from the first rerunnable one on, again, in the order of
# their names (the baseline and the three after it predate the rule that
# a migration runs twice without harm), so a new file is tested without
# being listed here. A rerun must change nothing.
FIRST_RERUNNABLE=20260926071227
for f in supabase/migrations/*.sql; do
  if [[ ${f##*/} < "$FIRST_RERUNNABLE" ]]; then continue; fi
  run -d "$DB" -1 -f "$f"
done
dump "$DB" "$DUMPS/rerun.sql"
if ! diff -u "$DUMPS/migrated.sql" "$DUMPS/rerun.sql" > "$DUMPS/rerun.diff"; then
  echo "FAILED: running the migrations again changed the database:"
  cat "$DUMPS/rerun.diff"
  exit 1
fi
echo "ok: the migrations run again without changing the database"
out=$(psql -q -t -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/rules.sql 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -o 'ok: .*'
bash supabase/tests/race.sh "$DB"

# The music migration reruns with the library full, and brings back
# nothing removed since it seeded.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "delete from public.songs where id = 'OxtZF0WGXtE'; update public.music_settings set value = to_jsonb((select count(*) from public.songs)) where name = 'song_limit'" >/dev/null
before=$(psql -tA -d "$DB" -c "select count(*) from public.songs")
run -d "$DB" -1 -f supabase/migrations/20260927030802_music_library.sql
after=$(psql -tA -d "$DB" -c "select count(*) from public.songs")
[ "$before" = "$after" ] || { echo "FAILED: rerunning the music migration changed the library ($before songs, then $after)"; exit 1; }
echo "ok: the music migration reruns with the library full, and a removed song stays removed"
echo "All database rules hold."
