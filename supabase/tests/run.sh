#!/usr/bin/env bash
# Loads supabase/schema.sql into a fresh Postgres database (with stand-ins
# for Supabase's own parts), runs the latest migrations again on top to
# show they can be rerun and that they end where schema.sql does (pg_dump
# before and after), checks the rules in rules.sql, and races the
# per-member limits (race.sh).
#
# Needs psql, pg_dump (as new as the server) and a Postgres server they
# can reach as a superuser: set the usual PGHOST, PGPORT, PGUSER (and
# PGPASSWORD) if the defaults don't.
# Usage: npm run test:db
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="jmos_test_$$"
DUMPS=$(mktemp -d)
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null; rm -rf "$DUMPS"' EXIT
# The API roles are cluster-wide; make them once.
psql -q -d postgres -c "do \$\$ begin create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; exception when duplicate_object then null; end \$\$" >/dev/null

# The database's structure as pg_dump writes it, without what changes from
# one dump to the next (the \restrict key, pg_dump's own version).
dump() {
  pg_dump --schema-only -d "$DB" | grep -v -e '^\\restrict ' -e '^\\unrestrict ' -e '^-- Dumped ' > "$1"
}

# Runs psql quietly; an error fails the test (it used to be printed and let through).
run() {
  local out status=0
  out=$(psql -q -v ON_ERROR_STOP=1 -d "$DB" "$@" 2>&1) || status=$?
  printf '%s\n' "$out" | grep -v -e 'NOTICE:.*skipping' -e 'wal_level' -e 'HINT:' -e '^$' || true
  return "$status"
}

run -c "$(grep -v '^create role' supabase/tests/stubs.sql)"
run -1 -f supabase/schema.sql
dump "$DUMPS/schema.sql"
# Every migration from the first rerunnable one on, in the order of their
# names (the three before it predate the rule that a migration runs twice
# without harm), so a new file is tested without being listed here.
FIRST_RERUNNABLE=20260926071227
for f in supabase/migrations/*.sql; do
  if [[ ${f##*/} < "$FIRST_RERUNNABLE" ]]; then continue; fi
  run -1 -f "$f"
done
# schema.sql makes a new project, the migrations change an existing one:
# both must end in the same database. This sees only what a rerun can
# change (create or replace, drop and create again, grants); a column only
# one side adds hides behind `create table if not exists`.
dump "$DUMPS/migrated.sql"
if ! diff -u "$DUMPS/schema.sql" "$DUMPS/migrated.sql" > "$DUMPS/drift.diff"; then
  echo "FAILED: schema.sql and the migrations rerun over it make different databases:"
  cat "$DUMPS/drift.diff"
  exit 1
fi
echo "ok: schema.sql and the migrations rerun over it make the same database"
out=$(psql -q -t -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/rules.sql 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -o 'ok: .*'
bash supabase/tests/race.sh "$DB"

# The music migration reruns with the library full, and brings back
# nothing removed since it seeded.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "delete from public.songs where id = 'OxtZF0WGXtE'; update public.music_settings set value = to_jsonb((select count(*) from public.songs)) where name = 'song_limit'" >/dev/null
before=$(psql -tA -d "$DB" -c "select count(*) from public.songs")
run -1 -f supabase/migrations/20260927030802_music_library.sql
after=$(psql -tA -d "$DB" -c "select count(*) from public.songs")
[ "$before" = "$after" ] || { echo "FAILED: rerunning the music migration changed the library ($before songs, then $after)"; exit 1; }
echo "ok: the music migration reruns with the library full, and a removed song stays removed"
echo "All database rules hold."
