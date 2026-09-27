-- The library's limit, readable by visitors, so the iPod can show how
-- full it is ("34/200").
--
-- The limit lives in music_settings (song_limit), which visitors can't
-- read: it also holds the bot's drafts. song_limit() returns that one
-- number and nothing else. It's SECURITY DEFINER so visitors needn't be
-- granted the table; the Security Advisor will list it as callable by
-- visitors, on purpose.
--
-- The limit trigger reads the limit through it too, so it's defined in
-- one place.
--
-- Rerunnable: create or replace.

create or replace function public.song_limit()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::int from public.music_settings where name = 'song_limit'), 200);
$$;
revoke execute on function public.song_limit() from public;
grant execute on function public.song_limit() to anon, authenticated, service_role;

create or replace function public.songs_within_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  most int := public.song_limit();
begin
  perform pg_advisory_xact_lock(hashtextextended('songs', 0));
  if (select count(*) from public.songs) >= most then
    raise exception using errcode = 'P0429', message = format('The library is full (%s songs). Remove one first.', most);
  end if;
  return new;
end;
$$;
revoke execute on function public.songs_within_limit() from public, anon, authenticated;

notify pgrst, 'reload schema';
