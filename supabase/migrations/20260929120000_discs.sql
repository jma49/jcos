-- DVD Player's discs: YouTube videos Jincheng has burned, on everyone's
-- shelf (Finder's Movies folder).
--
-- A disc is a YouTube video with a title, an artist and a picture for its
-- case: one of the video's own on i.ytimg.com (its thumbnail, or a frame
-- a quarter, half or three quarters of the way in), cropped where
-- cover_x says. Everyone reads the shelf; only Jincheng writes it, from
-- Telegram (the bot's /dvd, as the service role) or from the site when
-- signed in as the owner (public.is_owner(), 20260929100000_owner.sql).
-- Visitors burn DVD-Rs that stay in their own browser and never reach
-- the database.
--
-- At most disc_limit discs (music_settings, 200 to start), counted under
-- an advisory lock as the songs are. Realtime sends changes to open
-- desktops, so a new disc shows up without a reload.
--
-- Run this in the Supabase SQL editor after 20260929100000_owner.sql
-- (schema.sql already includes it). It can be run again safely.

create table if not exists public.discs (
  -- The YouTube video id.
  id text primary key check (id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null check (char_length(trim(title)) between 1 and 200),
  artist text check (char_length(trim(artist)) between 1 and 200),
  -- The case's picture: the name of one of the video's own images on
  -- i.ytimg.com, its thumbnail or a frame (1, 2 and 3 are a quarter, half
  -- and three quarters of the way in). Only a name, never an address.
  cover text not null default 'hqdefault'
    check (cover ~ '^(maxresdefault|sddefault|hqdefault|mqdefault|(maxres|sd|hq|mq)[1-3])$'),
  -- Where the case crops the picture, from its left edge (0) to its right (100).
  cover_x smallint not null default 50 check (cover_x between 0 and 100),
  -- The video's length, once known.
  duration_ms int check (duration_ms between 1000 and 86400000),
  added_at timestamptz not null default now()
);

alter table public.discs enable row level security;

drop policy if exists "The shelf is public" on public.discs;
create policy "The shelf is public" on public.discs for select to anon, authenticated using (true);
drop policy if exists "Jincheng burns discs" on public.discs;
create policy "Jincheng burns discs" on public.discs for insert to authenticated with check ((select public.is_owner()));
drop policy if exists "Jincheng relabels discs" on public.discs;
create policy "Jincheng relabels discs" on public.discs for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists "Jincheng throws discs away" on public.discs;
create policy "Jincheng throws discs away" on public.discs for delete to authenticated using ((select public.is_owner()));

-- Everyone reads the shelf; the owner's writes go through the policies above.
revoke all on public.discs from anon, authenticated;
grant select (id, title, artist, cover, cover_x, duration_ms, added_at) on public.discs to anon, authenticated;
grant insert (id, title, artist, cover, cover_x, duration_ms) on public.discs to authenticated;
grant update (title, artist, cover, cover_x, duration_ms) on public.discs to authenticated;
grant delete on public.discs to authenticated;
grant select, insert, update, delete on public.discs to service_role;

insert into public.music_settings (name, value) values ('disc_limit', '200') on conflict (name) do nothing;

-- At most disc_limit discs.
create or replace function public.discs_within_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  most int := coalesce((select (value #>> '{}')::int from public.music_settings where name = 'disc_limit'), 200);
begin
  perform pg_advisory_xact_lock(hashtextextended('discs', 0));
  if (select count(*) from public.discs) >= most then
    raise exception using errcode = 'P0429', message = format('The shelf is full (%s discs). Remove one first.', most);
  end if;
  return new;
end;
$$;
revoke execute on function public.discs_within_limit() from public, anon, authenticated;

drop trigger if exists discs_within_limit on public.discs;
create trigger discs_within_limit
  before insert on public.discs
  for each row execute function public.discs_within_limit();

-- New, relabelled and removed discs reach open desktops.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'discs') then
    alter publication supabase_realtime add table public.discs;
  end if;
end
$$;

notify pgrst, 'reload schema';
