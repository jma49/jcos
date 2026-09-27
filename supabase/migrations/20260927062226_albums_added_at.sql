-- Visitors may read albums.added_at, as they may songs.added_at.
--
-- /api/songs lists albums in the order they were added (`order=added_at`),
-- and ordering by a column needs the right to read it: without this grant
-- the albums query was refused ("permission denied for table albums"),
-- and the function served the snapshot instead of the library, so songs
-- added from Telegram never showed. The music library migration granted
-- added_at on songs but not on albums.
--
-- Rerunnable: granting twice changes nothing.

grant select (added_at) on public.albums to anon, authenticated;

notify pgrst, 'reload schema';
