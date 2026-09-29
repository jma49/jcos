-- The iPod's ratings and playlists: Jincheng's rating and plays of each
-- song, and Jincheng's own playlists, which everyone's iPod shows.
--
-- - song_stats: a song's rating (one to five stars, none until rated),
--   how many times Jincheng has listened to it to the end on the site,
--   and when last. The iPod makes its smart playlists (My Top Rated,
--   Recently Played, Top 25 Most Played) from them.
-- - playlists and playlist_songs: Jincheng's own playlists (Rainy Days,
--   While Coding…), saved from the iPod's On-The-Go. At most
--   playlist_limit playlists (music_settings, 50 to start), counted under
--   an advisory lock. A song is in a playlist once, and a song that leaves
--   the library leaves every playlist, and its rating and plays go too.
-- - Everyone reads all of it; only Jincheng writes, signed in on the site
--   (public.is_owner(), 20260929100000_owner.sql):
--   - rate_song() sets or clears a rating, and save_playlist() makes a
--     playlist, or adds songs to the one of that name. Both run as the
--     caller, so the owner-only policies below decide.
--   - Taking a song out of a playlist, or deleting a playlist, is a plain
--     delete under the same policies.
--   - song_played() counts one play at a time, at the database's clock.
--     No one may set a count or a time directly, so it is SECURITY
--     DEFINER, and it asks is_owner() before anything else. The Security
--     Advisor lists it, on purpose.
-- - A visitor's own On-The-Go stays in their browser and never reaches
--   the database.
--
-- Run this in the Supabase SQL editor after 20260929120000_discs.sql
-- (schema.sql already includes it). It can be run again safely.

create table if not exists public.song_stats (
  song_id text primary key references public.songs (id) on delete cascade,
  -- Jincheng's rating: one to five stars, none until rated.
  rating smallint check (rating between 1 and 5),
  -- How many times Jincheng has listened to it to the end, on the site.
  plays int not null default 0 check (plays >= 0),
  -- When Jincheng last did.
  played_at timestamptz
);

create table if not exists public.playlists (
  id bigint generated always as identity primary key,
  -- Shown on the iPod's screen: one line, and none of the iPod's own playlists' names.
  name text not null check (
    char_length(name) between 1 and 40
    and name = btrim(name)
    and name !~ '[[:cntrl:]]'
    and lower(name) not in ('on-the-go', 'my top rated', 'recently played', 'top 25 most played')
  ),
  created_at timestamptz not null default now()
);
-- One playlist to a name, whatever its case.
create unique index if not exists playlists_name on public.playlists (lower(name));

create table if not exists public.playlist_songs (
  playlist_id bigint not null references public.playlists (id) on delete cascade,
  song_id text not null references public.songs (id) on delete cascade,
  -- The playlist's order: a song added later comes after.
  position bigint generated always as identity,
  primary key (playlist_id, song_id)
);

alter table public.song_stats enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_songs enable row level security;

drop policy if exists "Jincheng's listening is public" on public.song_stats;
create policy "Jincheng's listening is public" on public.song_stats for select to anon, authenticated using (true);
drop policy if exists "Jincheng rates songs" on public.song_stats;
create policy "Jincheng rates songs" on public.song_stats for insert to authenticated with check ((select public.is_owner()));
drop policy if exists "Jincheng changes ratings" on public.song_stats;
create policy "Jincheng changes ratings" on public.song_stats for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "Playlists are public" on public.playlists;
create policy "Playlists are public" on public.playlists for select to anon, authenticated using (true);
drop policy if exists "Jincheng makes playlists" on public.playlists;
create policy "Jincheng makes playlists" on public.playlists for insert to authenticated with check ((select public.is_owner()));
drop policy if exists "Jincheng deletes playlists" on public.playlists;
create policy "Jincheng deletes playlists" on public.playlists for delete to authenticated using ((select public.is_owner()));

drop policy if exists "Playlists are public" on public.playlist_songs;
create policy "Playlists are public" on public.playlist_songs for select to anon, authenticated using (true);
drop policy if exists "Jincheng adds songs to playlists" on public.playlist_songs;
create policy "Jincheng adds songs to playlists" on public.playlist_songs for insert to authenticated with check ((select public.is_owner()));
drop policy if exists "Jincheng takes songs out of playlists" on public.playlist_songs;
create policy "Jincheng takes songs out of playlists" on public.playlist_songs for delete to authenticated using ((select public.is_owner()));

-- Everyone reads; the owner's writes go through the policies above. Plays
-- and their times aren't granted: only song_played() changes them.
revoke all on public.song_stats, public.playlists, public.playlist_songs from anon, authenticated;
grant select (song_id, rating, plays, played_at) on public.song_stats to anon, authenticated;
grant insert (song_id, rating) on public.song_stats to authenticated;
grant update (rating) on public.song_stats to authenticated;
grant select (id, name, created_at) on public.playlists to anon, authenticated;
grant insert (name) on public.playlists to authenticated;
grant delete on public.playlists to authenticated;
grant select (playlist_id, song_id, position) on public.playlist_songs to anon, authenticated;
grant insert (playlist_id, song_id) on public.playlist_songs to authenticated;
grant delete on public.playlist_songs to authenticated;
grant select, insert, update, delete on public.song_stats, public.playlists, public.playlist_songs to service_role;

insert into public.music_settings (name, value) values ('playlist_limit', '50') on conflict (name) do nothing;

-- At most playlist_limit playlists. Songs saved into one that exists
-- aren't a new playlist, so they pass even when the limit is reached.
create or replace function public.playlists_within_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  most int := coalesce((select (value #>> '{}')::int from public.music_settings where name = 'playlist_limit'), 50);
begin
  perform pg_advisory_xact_lock(hashtextextended('playlists', 0));
  if (select count(*) from public.playlists) >= most
    and not exists (select 1 from public.playlists where lower(name) = lower(new.name)) then
    raise exception using errcode = 'P0429', message = format('There are %s playlists already. Delete one first.', most);
  end if;
  return new;
end;
$$;
revoke execute on function public.playlists_within_limit() from public, anon, authenticated;

drop trigger if exists playlists_within_limit on public.playlists;
create trigger playlists_within_limit
  before insert on public.playlists
  for each row execute function public.playlists_within_limit();

-- Rates a song one to five stars, or clears its rating (null or 0).
create or replace function public.rate_song(p_song text, p_rating int)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.song_stats (song_id, rating) values (p_song, nullif(p_rating, 0))
  on conflict (song_id) do update set rating = excluded.rating;
$$;
revoke all on function public.rate_song(text, int) from public, anon;
grant execute on function public.rate_song(text, int) to authenticated;

-- Counts one play of a song, now: Jincheng listened to it to the end.
create or replace function public.song_played(p_song text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'Only Jincheng''s plays are counted.';
  end if;
  insert into public.song_stats (song_id, plays, played_at) values (p_song, 1, now())
  on conflict (song_id) do update set plays = song_stats.plays + 1, played_at = now();
end;
$$;
revoke all on function public.song_played(text) from public, anon;
grant execute on function public.song_played(text) to authenticated;

-- Saves songs into the playlist called p_name, making it if there's none
-- (the name's case aside), after the songs it has: each song once, songs
-- no longer in the library left out. Returns the playlist's id.
create or replace function public.save_playlist(p_name text, p_songs text[])
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  playlist bigint;
begin
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'Only Jincheng saves playlists.';
  end if;
  insert into public.playlists (name) values (btrim(p_name))
  on conflict ((lower(name))) do nothing
  returning id into playlist;
  if playlist is null then
    select id into playlist from public.playlists where lower(name) = lower(btrim(p_name));
  end if;
  insert into public.playlist_songs (playlist_id, song_id)
  select playlist, t.id
  from unnest(p_songs) with ordinality as t(id, n)
  where exists (select 1 from public.songs s where s.id = t.id)
  order by t.n
  on conflict do nothing;
  return playlist;
end;
$$;
revoke all on function public.save_playlist(text, text[]) from public, anon;
grant execute on function public.save_playlist(text, text[]) to authenticated;

notify pgrst, 'reload schema';
