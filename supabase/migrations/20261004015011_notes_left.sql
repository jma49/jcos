-- How many Stickies notes a member has left today, counted as the limit
-- counts them (#204).
--
-- Stickies showed "1 of 3 left today" after one of a member's three notes
-- was hidden, and posting it was refused: the site counted the member's
-- notes of the last 24 hours as row-level security shows them (approved
-- ones only), while notes_by_member() counts all of them.
--
-- notes_left() counts the way notes_by_member() does (the caller's notes
-- of the last 24 hours, hidden or not; three a day) and returns what's
-- left. It's security definer because hidden notes aren't the member's to
-- read. The Security Advisor lists it as a SECURITY DEFINER function
-- members can call, on purpose: it takes no argument, reads only the
-- caller's own notes through auth.uid(), and answers a number, never a
-- note. Visitors can't call it (no account, no notes).
--
-- Applied with `supabase db push` after 20261004014420_ical_versions.sql
-- (schema.sql already includes it). It can be run again safely.

create or replace function public.notes_left()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when (select auth.uid()) is null then 0 else greatest(0, 3 - (
    select count(*)::int from public.notes
    where user_id = (select auth.uid()) and created_at > now() - interval '24 hours'
  )) end;
$$;
revoke all on function public.notes_left() from public, anon, authenticated;
grant execute on function public.notes_left() to authenticated;

notify pgrst, 'reload schema';
