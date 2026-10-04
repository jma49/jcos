-- The limits a member is held to, defined once, in the database, and
-- read by the site through member_limits() (#238).
--
-- The site repeated them as constants: three notes a day
-- (NOTES_PER_DAY), 50 stickies, 5,000 events and 1,000 to-dos. The last
-- three live in music_settings, where Jincheng can change them in the
-- Table editor, and then the site would still refuse at the old number
-- (and Stickies say "of 50").
--
-- - The notes' limit joins them in music_settings (note_limit, 3), and
--   the notes trigger and notes_left() read it, rather than each holding
--   its own 3.
-- - member_limits() returns the four numbers and nothing else of the
--   settings, which visitors and members can't read (they hold the bot's
--   drafts too). It's security definer for that, as song_limit() is: the
--   Security Advisor lists it as callable by visitors, on purpose. It
--   takes no argument and reads no member's data. Visitors may call it:
--   Stickies tells them how many notes a member may leave.
--
-- Rerunnable: the setting is inserted only if missing, and the functions
-- are replaced.

insert into public.music_settings (name, value) values ('note_limit', '3') on conflict (name) do nothing;

create or replace function public.member_limits()
returns table (notes_per_day int, stickies int, events int, todos int)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select (value #>> '{}')::int from public.music_settings where name = 'note_limit'), 3),
    coalesce((select (value #>> '{}')::int from public.music_settings where name = 'sticky_limit'), 50),
    coalesce((select (value #>> '{}')::int from public.music_settings where name = 'event_limit'), 5000),
    coalesce((select (value #>> '{}')::int from public.music_settings where name = 'todo_limit'), 1000);
$$;
revoke execute on function public.member_limits() from public;
grant execute on function public.member_limits() to anon, authenticated, service_role;

-- As before (20260926095149_hardening.sql), with the limit read from
-- member_limits().
create or replace function public.notes_by_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member text := (select username from public.profiles where id = auth.uid());
  most int := (select notes_per_day from public.member_limits());
begin
  if member is null then
    raise exception using errcode = '42501', message = 'Sign in to leave a note.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('notes:' || auth.uid()::text, 0));
  if (select count(*) from public.notes
      where user_id = auth.uid() and created_at > now() - interval '24 hours') >= most then
    raise exception using errcode = 'P0429', message = format('That’s %s notes today. Come back tomorrow.', most);
  end if;
  new.user_id := auth.uid();
  new.name := member;
  return new;
end;
$$;

-- As before (20261004015011_notes_left.sql), with the same limit.
create or replace function public.notes_left()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when (select auth.uid()) is null then 0 else greatest(0, (select notes_per_day from public.member_limits()) - (
    select count(*)::int from public.notes
    where user_id = (select auth.uid()) and created_at > now() - interval '24 hours'
  )) end;
$$;

notify pgrst, 'reload schema';
