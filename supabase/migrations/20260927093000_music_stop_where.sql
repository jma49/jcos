-- /stop failed in production: "DELETE requires a WHERE clause".
--
-- Supabase's API loads pg_safeupdate, which refuses a DELETE or UPDATE
-- without a WHERE clause, even inside a SECURITY DEFINER function, and
-- music_stop() deleted from now_playing without one. The table holds one
-- row at most, whose id is always true, so `where id` deletes the same
-- row. supabase/tests/rules.sql now checks every function for this, since
-- the local Postgres doesn't load pg_safeupdate.
--
-- Rerunnable: create or replace.

create or replace function public.music_stop()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.now_playing where id;
$$;
revoke execute on function public.music_stop() from public, anon, authenticated;
grant execute on function public.music_stop() to service_role;

notify pgrst, 'reload schema';
