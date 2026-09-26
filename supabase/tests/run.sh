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

run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" "$@" 2>&1 | grep -v -e 'NOTICE:.*skipping' -e 'wal_level' -e 'HINT:' || true; }

run -c "$(grep -v '^create role' supabase/tests/stubs.sql)"
run -1 -f supabase/schema.sql
for f in supabase/migrations/20260926071227_chat_rooms.sql supabase/migrations/20260926080833_soapbox_images.sql supabase/migrations/20260926091033_moderation.sql supabase/migrations/20260926094533_password_reset.sql supabase/migrations/20260926095149_hardening.sql supabase/migrations/20260926100511_advisor.sql; do
  run -1 -f "$f"
done
out=$(psql -q -t -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/rules.sql 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -o 'ok: .*'
bash supabase/tests/race.sh "$DB"
echo "All database rules hold."
