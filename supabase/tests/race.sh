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

# Songs: with room for three more, six added at once by the bot.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "update public.music_settings set value = to_jsonb((select count(*) from public.songs) + 3) where name = 'song_limit'" >/dev/null
before=$(psql -tA -d "$DB" -c "select count(*) from public.songs")
for i in 1 2 3 4 5 6; do
  psql -q -d "$DB" >/dev/null 2>&1 <<SQL &
begin;
set local role service_role;
insert into public.songs (id, title, artist) values ('race0000${i}xx', 'Race $i', 'Racer');
select pg_sleep(0.3);
commit;
SQL
done
wait
added=$(( $(psql -tA -d "$DB" -c "select count(*) from public.songs") - before ))
[ "$added" = 3 ] || { echo "FAILED: six songs at once with room for three added $added"; exit 1; }
echo "ok: six songs at once, room for three, three added"

# Discs: with room for three more, six burned at once by the bot.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "update public.music_settings set value = to_jsonb((select count(*) from public.discs) + 3) where name = 'disc_limit'" >/dev/null
before=$(psql -tA -d "$DB" -c "select count(*) from public.discs")
for i in 1 2 3 4 5 6; do
  psql -q -d "$DB" >/dev/null 2>&1 <<SQL &
begin;
set local role service_role;
insert into public.discs (id, title) values ('race0000${i}xx', 'Race $i');
select pg_sleep(0.3);
commit;
SQL
done
wait
burned=$(( $(psql -tA -d "$DB" -c "select count(*) from public.discs") - before ))
[ "$burned" = 3 ] || { echo "FAILED: six discs at once with room for three burned $burned"; exit 1; }
echo "ok: six discs at once, room for three, three burned"

# Jincheng's plays: eight songs ending at once (tabs, devices) count eight.
JINCHENG=99999999-9999-9999-9999-999999999999
as_jincheng() {
  psql -q -d "$DB" >/dev/null 2>&1 <<SQL || true
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$JINCHENG', true);
$1;
select pg_sleep(0.3);
commit;
SQL
}
for i in $(seq 1 8); do as_jincheng "select public.song_played('QLHMhVonF-s')" & done
wait
plays=$(psql -tA -d "$DB" -c "select plays from public.song_stats where song_id = 'QLHMhVonF-s'")
[ "$plays" = 8 ] || { echo "FAILED: eight plays at once counted $plays"; exit 1; }
echo "ok: eight plays at once, eight counted"

# Playlists: with room for two more, five saved at once; and one name
# saved from four places at once is one playlist with every song.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "update public.music_settings set value = to_jsonb((select count(*) from public.playlists) + 2) where name = 'playlist_limit'" >/dev/null
before=$(psql -tA -d "$DB" -c "select count(*) from public.playlists")
for i in 1 2 3 4 5; do as_jincheng "select public.save_playlist('Race $i', array['OxtZF0WGXtE'])" & done
wait
made=$(( $(psql -tA -d "$DB" -c "select count(*) from public.playlists") - before ))
[ "$made" = 2 ] || { echo "FAILED: five playlists at once with room for two made $made"; exit 1; }
echo "ok: five playlists at once, room for two, two made"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "update public.music_settings set value = '50' where name = 'playlist_limit'" >/dev/null
for id in OxtZF0WGXtE QLHMhVonF-s TkmfOyuGSdQ 0o-s_8Wt9zc; do as_jincheng "select public.save_playlist('Same Name', array['$id'])" & done
wait
same=$(psql -tA -d "$DB" -c "select count(distinct l.id) || ' ' || count(*) from public.playlists l join public.playlist_songs p on p.playlist_id = l.id where lower(l.name) = 'same name'")
[ "$same" = "1 4" ] || { echo "FAILED: one name saved from four places at once gave (playlists, songs) $same, not 1 4"; exit 1; }
echo "ok: one new playlist saved from four places at once is one playlist with all four songs"

# Jincheng's documents: four saves from the same copy at once, one lands;
# and with room for two, five new documents at once, two are made.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "insert into public.documents (folder, name, body) values ('documents', 'Raced.txt', 'first')" >/dev/null
for i in 1 2 3 4; do as_jincheng "update public.documents set body = 'save $i' where name = 'Raced.txt' and version = 1" & done
wait
saved=$(psql -tA -d "$DB" -c "select version || ' ' || (body ~ '^save [1-4]\$') from public.documents where name = 'Raced.txt'")
[ "$saved" = "2 true" ] || { echo "FAILED: four saves from one copy at once gave (version, saved) $saved, not 2 true"; exit 1; }
echo "ok: four saves from one copy at once, one lands"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "update public.music_settings set value = to_jsonb((select count(*) from public.documents) + 2) where name = 'document_limit'" >/dev/null
before=$(psql -tA -d "$DB" -c "select count(*) from public.documents")
for i in 1 2 3 4 5; do as_jincheng "insert into public.documents (folder, name) values ('documents', 'Race $i.txt')" & done
wait
made=$(( $(psql -tA -d "$DB" -c "select count(*) from public.documents") - before ))
[ "$made" = 2 ] || { echo "FAILED: five documents at once with room for two made $made"; exit 1; }
echo "ok: five documents at once, room for two, two made"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "update public.music_settings set value = '500' where name = 'document_limit'" >/dev/null

# A member's own stickies: with room for two, five put up at once, two are made.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "update public.music_settings set value = to_jsonb((select count(*) from public.stickies where user_id = '$DAVE') + 2) where name = 'sticky_limit'" >/dev/null
for i in 1 2 3 4 5; do as_dave "insert into public.stickies (body) values ('race $i')" & done
wait
stuck=$(psql -tA -d "$DB" -c "select count(*) from public.stickies where user_id = '$DAVE'")
[ "$stuck" = 2 ] || { echo "FAILED: five stickies at once with room for two made $stuck"; exit 1; }
echo "ok: five stickies at once, room for two, two made"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "update public.music_settings set value = '50' where name = 'sticky_limit'" >/dev/null

