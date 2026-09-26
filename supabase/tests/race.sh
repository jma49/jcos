#!/usr/bin/env bash
# Races the database's per-member limits: several sessions insert as the
# same member at the same moment, each holding its transaction open a
# little so they overlap. The limits must hold anyway. Called by run.sh
# with the test database's name.
set -euo pipefail
DB="$1"
DAVE=44444444-4444-4444-4444-444444444444

psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "insert into auth.users (id, email, raw_user_meta_data) values ('$DAVE', 'dave@users.majincheng.com', '{\"username\":\"dave\",\"recovery_email\":\"d@example.com\"}')" >/dev/null

# Runs one statement as dave in its own session, holding the transaction for a moment.
as_dave() {
  psql -q -d "$DB" >/dev/null 2>&1 <<SQL || true
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$DAVE', true);
$1;
select pg_sleep(0.3);
commit;
SQL
}

for i in 1 2 3 4 5 6; do as_dave "insert into public.notes (body) values ('race $i')" & done
wait
notes=$(psql -tA -d "$DB" -c "select count(*) from public.notes where user_id = '$DAVE'")
[ "$notes" = 3 ] || { echo "FAILED: six notes at once let $notes through, not 3"; exit 1; }
echo "ok: six notes at once, three get through"

for i in $(seq 1 12); do as_dave "insert into public.chat_messages (body) values ('race $i')" & done
wait
chat=$(psql -tA -d "$DB" -c "select count(*) from public.chat_messages where user_id = '$DAVE'")
[ "$chat" = 8 ] || { echo "FAILED: twelve messages at once let $chat through, not 8"; exit 1; }
echo "ok: twelve messages at once, eight get through"

for i in 1 2 3 4 5 6; do
  psql -q -d "$DB" >/dev/null 2>&1 <<SQL &
begin;
set local role service_role;
select public.recovery_request('dave', encode(sha256('race $i'::bytea), 'hex'));
select pg_sleep(0.3);
commit;
SQL
done
wait
links=$(psql -tA -d "$DB" -c "select count(*) from private.password_resets where user_id = '$DAVE'")
[ "$links" = 3 ] || { echo "FAILED: six reset requests at once made $links links, not 3"; exit 1; }
echo "ok: six reset requests at once, three links"
