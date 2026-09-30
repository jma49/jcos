#!/usr/bin/env bash
# Loads supabase/schema.sql into a fresh Postgres database (with stand-ins
# for Supabase's own parts), checks the rules in rules.sql, then runs the
# latest migrations again on top to show they can be rerun, and races
# the per-member limits (race.sh).
#
# Needs psql and a Postgres server it can reach as a superuser: set the
# usual PGHOST, PGPORT, PGUSER (and PGPASSWORD) if the defaults don't.
# Usage: npm run test:db
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="jmos_test_$$"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
# The API roles are cluster-wide; make them once.
psql -q -d postgres -c "do \$\$ begin create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; exception when duplicate_object then null; end \$\$" >/dev/null

# Runs psql quietly; an error fails the test (it used to be printed and let through).
run() {
  local out status=0
  out=$(psql -q -v ON_ERROR_STOP=1 -d "$DB" "$@" 2>&1) || status=$?
  printf '%s\n' "$out" | grep -v -e 'NOTICE:.*skipping' -e 'wal_level' -e 'HINT:' -e '^$' || true
  return "$status"
}

run -c "$(grep -v '^create role' supabase/tests/stubs.sql)"
run -1 -f supabase/schema.sql
for f in supabase/migrations/20260926071227_chat_rooms.sql supabase/migrations/20260926080833_soapbox_images.sql supabase/migrations/20260926091033_moderation.sql supabase/migrations/20260926094533_password_reset.sql supabase/migrations/20260926095149_hardening.sql supabase/migrations/20260926100511_advisor.sql supabase/migrations/20260927030802_music_library.sql supabase/migrations/20260927062226_albums_added_at.sql supabase/migrations/20260927062914_song_limit.sql supabase/migrations/20260927093000_music_stop_where.sql supabase/migrations/20260927100000_now_playing_realtime.sql supabase/migrations/20260929100000_owner.sql supabase/migrations/20260929120000_discs.sql supabase/migrations/20260929140000_playlists.sql supabase/migrations/20260929160000_home.sql supabase/migrations/20260929185931_rls_initplan.sql supabase/migrations/20260929191409_chat_can_write_members.sql supabase/migrations/20260929192005_home_from_telegram.sql supabase/migrations/20260929194437_stickies_of_their_own.sql supabase/migrations/20260929202730_ical_of_their_own.sql; do
  run -1 -f "$f"
done
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
