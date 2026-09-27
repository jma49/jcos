-- The music library, moved from src/data/songs.json into the database so
-- Jincheng can add songs and play them for whoever is on the desktop from
-- the Telegram bot (supabase/functions/soapbox-bot), without a deploy.
--
-- - songs: one YouTube video each, with its title, artist, album, cover
--   and lyrics timing; albums: whole albums, with a note.
-- - At most 200 songs (music_settings.song_limit, changeable in the Table
--   editor). A full library refuses a new song rather than dropping an old
--   one. The count takes an advisory lock, so songs added at once can't
--   pass it together (supabase/tests/race.sh).
-- - Covers are links to Apple's or YouTube's image hosts only
--   (music_cover), never an arbitrary address a visitor's browser would
--   fetch. Every field is checked here, not only by the bot.
-- - now_playing: what Jincheng is playing, one row at most. The bot sets it
--   with music_play() and clears it with music_stop(); both use the
--   database's clock. Visitors hear of it through Realtime (postgres_changes
--   on this table, which only the bot writes, so it can't be forged the
--   way a broadcast could) and join at now_playing_position(), the time
--   since it started by the same clock, not their own.
-- - Visitors read; only the service role (the bot) writes.
--
-- Rerunnable: the seed (today's library) goes in once, on the first run.

-- A cover: an https link to Apple's (is1–is5-ssl.mzstatic.com) or
-- YouTube's (i.ytimg.com) images, without characters that could break
-- out of a CSS url() or an attribute.
do $$
begin
  create domain public.music_cover as text
    check (char_length(value) <= 400 and value ~ '^https://(is[1-5]-ssl\.mzstatic\.com|i\.ytimg\.com)/[A-Za-z0-9._~/%+=,:@-]+$');
exception when duplicate_object then null;
end
$$;

create table if not exists public.albums (
  title text primary key check (char_length(trim(title)) between 1 and 200),
  artist text not null check (char_length(trim(artist)) between 1 and 200),
  year int not null check (year between 1900 and 2100),
  cover public.music_cover not null,
  note text check (char_length(note) <= 1000),
  added_at timestamptz not null default now()
);

create table if not exists public.songs (
  -- The YouTube video id.
  id text primary key check (id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null check (char_length(trim(title)) between 1 and 200),
  artist text not null check (char_length(trim(artist)) between 1 and 200),
  -- The album it's from; an albums.title when the whole album is here.
  album text check (char_length(trim(album)) between 1 and 200),
  -- Square cover art; album tracks share their album's.
  cover public.music_cover,
  -- Position on its album, for albums in `albums`.
  track int check (track between 1 and 99),
  -- No words to sing: Karaoke shows the album instead of lyrics.
  instrumental boolean not null default false,
  -- Milliseconds the lyrics run ahead of the video (negative: behind).
  lyrics_offset int not null default 0 check (lyrics_offset between -30000 and 30000),
  -- An lrclib.net id, when its search picks the wrong lyrics.
  lyrics_id bigint check (lyrics_id > 0),
  -- The song's length, so a play knows when it ends.
  duration_ms int check (duration_ms between 1000 and 3600000),
  added_at timestamptz not null default now()
);

create table if not exists public.music_settings (
  name text primary key,
  value jsonb not null
);
insert into public.music_settings (name, value) values ('song_limit', '200') on conflict (name) do nothing;

create table if not exists public.now_playing (
  -- Only ever one row.
  id boolean primary key default true check (id),
  song_id text not null references public.songs (id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  check (ends_at > started_at)
);

alter table public.albums enable row level security;
alter table public.songs enable row level security;
alter table public.music_settings enable row level security;
alter table public.now_playing enable row level security;

drop policy if exists "The library is public" on public.albums;
create policy "The library is public" on public.albums for select to anon, authenticated using (true);
drop policy if exists "The library is public" on public.songs;
create policy "The library is public" on public.songs for select to anon, authenticated using (true);
drop policy if exists "What's playing is public while it plays" on public.now_playing;
create policy "What's playing is public while it plays" on public.now_playing for select to anon, authenticated using (ends_at > now());

-- Visitors read the library and what's playing; nothing else, no writes.
revoke all on public.albums, public.songs, public.music_settings, public.now_playing from anon, authenticated;
grant select (title, artist, year, cover, note) on public.albums to anon, authenticated;
grant select (id, title, artist, album, cover, track, instrumental, lyrics_offset, lyrics_id, duration_ms, added_at) on public.songs to anon, authenticated;
grant select (song_id, started_at, ends_at) on public.now_playing to anon, authenticated;
grant select, insert, update, delete on public.albums, public.songs, public.music_settings, public.now_playing to service_role;

-- At most song_limit songs.
create or replace function public.songs_within_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  most int := coalesce((select (value #>> '{}')::int from public.music_settings where name = 'song_limit'), 200);
begin
  perform pg_advisory_xact_lock(hashtextextended('songs', 0));
  if (select count(*) from public.songs) >= most then
    raise exception using errcode = 'P0429', message = format('The library is full (%s songs). Remove one first.', most);
  end if;
  return new;
end;
$$;
revoke execute on function public.songs_within_limit() from public, anon, authenticated;

drop trigger if exists songs_within_limit on public.songs;
create trigger songs_within_limit
  before insert on public.songs
  for each row execute function public.songs_within_limit();

-- Plays a song for everyone on the desktop, from now until it ends (ten
-- minutes when its length isn't known). Only the bot calls it.
create or replace function public.music_play(p_song text)
returns public.now_playing
language plpgsql
security definer
set search_path = public
as $$
declare
  length_ms int;
  playing public.now_playing;
begin
  select coalesce(duration_ms, 600000) into length_ms from public.songs where id = p_song;
  if not found then
    raise exception using errcode = 'P0002', message = 'No such song.';
  end if;
  insert into public.now_playing (id, song_id, started_at, ends_at)
    values (true, p_song, now(), now() + make_interval(secs => length_ms / 1000.0))
    on conflict (id) do update set song_id = excluded.song_id, started_at = excluded.started_at, ends_at = excluded.ends_at
    returning * into playing;
  return playing;
end;
$$;
revoke execute on function public.music_play(text) from public, anon, authenticated;
grant execute on function public.music_play(text) to service_role;

create or replace function public.music_stop()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.now_playing;
$$;
revoke execute on function public.music_stop() from public, anon, authenticated;
grant execute on function public.music_stop() to service_role;

-- What's playing, how far in and how long it has left, by the database's
-- clock, for joining. It reads only what its caller may read. (Dropped
-- first: a function's result columns can't change in place.)
drop function if exists public.now_playing_position();
create or replace function public.now_playing_position()
returns table (song_id text, elapsed_ms bigint, remaining_ms bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select song_id,
    (extract(epoch from now() - started_at) * 1000)::bigint,
    (extract(epoch from ends_at - now()) * 1000)::bigint
  from public.now_playing
  where ends_at > now();
$$;
revoke execute on function public.now_playing_position() from public;
grant execute on function public.now_playing_position() to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'now_playing'
  ) then
    alter publication supabase_realtime add table public.now_playing;
  end if;
end;
$$;

-- Today's library (src/data/songs.json), in its order: a new project's
-- first songs. Seeded once: a rerun doesn't bring back a song removed with
-- /remove, and isn't stopped by the limit (which counts an insert even when
-- `on conflict` would skip it).
do $$
begin
  if exists (select 1 from public.music_settings where name = 'seeded') then
    return;
  end if;
  insert into public.albums (title, artist, year, cover, note) values
    ('BTTB -20th Anniversary Edition-', 'Ryuichi Sakamoto', 2018, 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/6e/8d/82/6e8d82ee-ee42-9020-51ed-daa71ea624ad/881036000154_cover.jpg/600x600bb.jpg', 'Back to the basics: solo piano, first released in 1998. The 20th anniversary edition gathers the original album, “snake eyes” and “tong poo” from the 1999 reissue, “reversing” from the international edition and “energy flow”.')
  on conflict (title) do nothing;

  insert into public.songs (id, title, artist, album, cover, track, instrumental, lyrics_offset, lyrics_id, added_at) values
    ('OxtZF0WGXtE', '寧夏', '梁靜茹', '燕尾蝶', 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/83/c1/66/83c1665d-af9a-ae17-769a-8995018e143f/dj.nbokcidv.jpg/600x600bb.jpg', null, false, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '0 seconds'),
    ('QLHMhVonF-s', '黄昏のBAY CITY', '八神純子', 'Full Moon', 'https://is1-ssl.mzstatic.com/image/thumb/Music/y2005/m07/d13/h06/s07.usbmmjal.tif/600x600bb.jpg', null, false, 150, null, timestamptz '2026-09-01 00:00:00+00' + interval '1 seconds'),
    ('TkmfOyuGSdQ', 'OH NO, OH YES!', '中森明菜', 'CRIMSON', 'https://is1-ssl.mzstatic.com/image/thumb/Music1/v4/93/82/35/93823581-bc38-2d16-8920-7d07c0f1b6c0/825646249701.jpg/600x600bb.jpg', null, false, 500, null, timestamptz '2026-09-01 00:00:00+00' + interval '2 seconds'),
    ('0o-s_8Wt9zc', '寫信給你', '黃韻玲', '平凡', 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/68/db/8e/68db8e27-29d5-0cba-837b-6f9dcf489343/4710149911438_cover.jpg/600x600bb.jpg', null, false, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '3 seconds'),
    ('bX33UI9ZPLk', '黑色毛衣', '周杰倫', '11月的蕭邦', 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/9e/35/ad/9e35ad1e-749e-75b6-0539-1e80cea1817b/JAY11.jpg/600x600bb.jpg', null, false, 3750, null, timestamptz '2026-09-01 00:00:00+00' + interval '4 seconds'),
    ('RNBiaZbFGII', 'come again', 'm-flo', 'MF10 - 10th ANNIVERSARY BEST', 'https://is1-ssl.mzstatic.com/image/thumb/Music/d8/cc/76/mzi.wmjxzjse.jpg/600x600bb.jpg', null, false, -6800, null, timestamptz '2026-09-01 00:00:00+00' + interval '5 seconds'),
    ('Dlz_XHeUUis', 'White Ferrari', 'Frank Ocean', 'Blonde', 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bb/45/68/bb4568f3-68cd-619d-fbcb-4e179916545d/BlondCover-Final.jpg/600x600bb.jpg', null, false, 850, null, timestamptz '2026-09-01 00:00:00+00' + interval '6 seconds'),
    ('xGqZ9lsc6Ck', '心動 (2018錄音棚現場版)', '黃韻玲', '心動 (2018錄音棚現場版)', 'https://is1-ssl.mzstatic.com/image/thumb/Music118/v4/16/03/57/1603573b-def7-eecc-503b-31bc1730f14f/4718009857179.jpg/600x600bb.jpg', null, false, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '7 seconds'),
    ('rwFUxoLq3Ss', 'Kiss & Tell', '陳淑樺', '淑樺盛開', 'https://is1-ssl.mzstatic.com/image/thumb/Features114/v4/ea/e2/1c/eae21cef-7f7e-2a86-4a9e-7c81b5f7b70c/dj.rdpbhefl.jpg/600x600bb.jpg', null, false, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '8 seconds'),
    ('jG6RnLVX07I', 'Hold On', 'The Internet', 'Hive Mind', 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/a7/9a/2d/a79a2dda-d97d-4225-bd7c-6a8b80715a01/886447110089.jpg/600x600bb.jpg', null, false, -850, null, timestamptz '2026-09-01 00:00:00+00' + interval '9 seconds'),
    ('fXivMSJm_kA', 'YUKON', 'Justin Bieber', 'SWAG', 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/f9/09/36/f9093663-c05f-7f95-0a60-4e95d52fbb22/25UMGIM93915.rgb.jpg/600x600bb.jpg', null, false, 650, null, timestamptz '2026-09-01 00:00:00+00' + interval '10 seconds'),
    ('uUcZHrGnJ54', '三個人的晚餐', '黃韻玲', '平凡', 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/68/db/8e/68db8e27-29d5-0cba-837b-6f9dcf489343/4710149911438_cover.jpg/600x600bb.jpg', null, false, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '11 seconds'),
    ('kKsivrgoyDw', 'Cool with You', 'NewJeans', 'Get Up', 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/d3/4b/7e/d34b7e1e-af3b-43b6-2949-7a8c652a1bc9/196922462726_Cover.jpg/600x600bb.jpg', null, false, 500, null, timestamptz '2026-09-01 00:00:00+00' + interval '12 seconds'),
    ('jWQx2f-CErU', 'Whiplash', 'aespa', 'Whiplash', 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d5/c1/f5/d5c1f505-f588-775f-df05-c672a8ec22e9/888735949562_Cover.jpg/600x600bb.jpg', null, false, 500, null, timestamptz '2026-09-01 00:00:00+00' + interval '13 seconds'),
    ('QiYOkmrI1jg', 'IYKYK', 'XG', 'AWE', 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/ae/69/ce/ae69ce7b-6007-c83a-f692-93ebfca55449/ANTCD-A0000014930.jpg/600x600bb.jpg', null, false, 500, null, timestamptz '2026-09-01 00:00:00+00' + interval '14 seconds'),
    ('n59qeMSCAgA', 'opus', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 1, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '15 seconds'),
    ('qG0moUzt2wY', 'sonatine', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 2, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '16 seconds'),
    ('mcBuwynaCsY', 'intermezzo', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 3, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '17 seconds'),
    ('fJKGBLTzHLA', 'lorenz and watson', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 4, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '18 seconds'),
    ('MtiqsRvASDI', 'choral no.1', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 5, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '19 seconds'),
    ('IxnyhXJJyls', 'choral no.2', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 6, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '20 seconds'),
    ('TQ-pIBU5g-E', 'do bacteria sleep?', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 7, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '21 seconds'),
    ('dod5yASOmfU', 'bachata', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 8, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '22 seconds'),
    ('-KS71VBbMpg', 'chanson', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 9, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '23 seconds'),
    ('VtuUg1AcSbA', 'distant echo', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 10, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '24 seconds'),
    ('K-rsp6m55cQ', 'prelude', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 11, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '25 seconds'),
    ('59mCjeHk0sc', 'sonata', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 12, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '26 seconds'),
    ('66HGO2Pl3kk', 'uetax', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 13, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '27 seconds'),
    ('SJcbMTz2oNw', 'aqua', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 14, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '28 seconds'),
    ('jHC_yMY9N0I', 'energy flow', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 15, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '29 seconds'),
    ('H-Tj_pTZ0aM', 'snake eyes', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 16, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '30 seconds'),
    ('4DIWZ5qi03g', 'tong poo', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 17, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '31 seconds'),
    ('WKEuD1Ak3iM', 'reversing', 'Ryuichi Sakamoto', 'BTTB -20th Anniversary Edition-', null, 18, true, 0, null, timestamptz '2026-09-01 00:00:00+00' + interval '32 seconds')
  on conflict (id) do nothing;
  insert into public.music_settings (name, value) values ('seeded', 'true');
end
$$;

notify pgrst, 'reload schema';
