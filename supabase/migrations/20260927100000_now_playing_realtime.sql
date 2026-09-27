-- Visitors may read now_playing.id, so Realtime sends them plays and stops.
--
-- Realtime checks each change against a subscriber's rights by reading
-- the row by its primary key, as that subscriber. Visitors were granted
-- song_id, started_at and ends_at but not id, so the check was refused
-- ("permission denied for table now_playing") and no /play or /stop
-- reached an open desktop; only a reload, which asks
-- now_playing_position(), showed the song. id is always true: it tells
-- nothing. supabase/tests/rules.sql now checks that every table Realtime
-- publishes has its primary key readable by visitors.
--
-- Rerunnable: granting twice changes nothing.

grant select (id) on public.now_playing to anon, authenticated;

notify pgrst, 'reload schema';
