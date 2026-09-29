-- The rules the database enforces, checked the way the site meets them:
-- as a visitor (anon), as a member (authenticated, with auth.uid() set)
-- or as the bot (service_role). Each check raises if a rule is broken.

\set ON_ERROR_STOP on

create or replace function pg_temp.act_as(who text, id text default null) returns void language plpgsql as $$
begin
  execute format('set role %I', who);
  perform set_config('request.jwt.claim.sub', coalesce(id, ''), false);
end $$;

create or replace function pg_temp.refused(statement text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  return true;
end $$;

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;

-- Accounts --------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@users.majincheng.com', '{"username":"alice","recovery_email":"a@example.com"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@users.majincheng.com', '{"username":"bob"}'),
  ('33333333-3333-3333-3333-333333333333', 'carol@users.majincheng.com', '{"username":"carol"}');

select pg_temp.check((select count(*) from public.profiles) = 3, 'an account gets a profile');
select pg_temp.check(not (select raw_user_meta_data ? 'recovery_email' from auth.users where email like 'alice@%'), 'the recovery address leaves the account''s metadata');
select pg_temp.check(pg_temp.refused($$insert into auth.users (email, raw_user_meta_data) values ('x@evil.com', '{"username":"xyz"}')$$), 'accounts are only made through JM/OS');
select pg_temp.check(pg_temp.refused($$insert into auth.users (email, raw_user_meta_data) values ('A!@users.majincheng.com', '{"username":"A!"}')$$), 'usernames are checked');

-- The owner -------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('99999999-9999-9999-9999-999999999999', 'jincheng@users.majincheng.com', '{"username":"jincheng"}');
select pg_temp.act_as('authenticated', '99999999-9999-9999-9999-999999999999');
select pg_temp.check(not public.is_owner(), 'no one is the owner until Jincheng''s account is added');
reset role;
-- What Jincheng runs once in the SQL editor.
insert into private.owners (user_id)
select id from auth.users where email = 'jincheng@users.majincheng.com'
on conflict do nothing;

select pg_temp.act_as('authenticated', '99999999-9999-9999-9999-999999999999');
select pg_temp.check(public.is_owner(), 'Jincheng is the owner');
select pg_temp.act_as('authenticated', '11111111-1111-1111-1111-111111111111');
select pg_temp.check(not public.is_owner(), 'another member isn''t');
select pg_temp.check(pg_temp.refused($$select 1 from private.owners$$), 'members can''t see who the owner is');
select pg_temp.check(pg_temp.refused($$insert into private.owners (user_id) values ('11111111-1111-1111-1111-111111111111')$$), 'no one makes themselves the owner');
select pg_temp.act_as('anon');
select pg_temp.check(not public.is_owner(), 'a visitor isn''t');
select pg_temp.check(pg_temp.refused($$select 1 from private.owners$$), 'visitors can''t see who the owner is');
reset role;

-- A room only the owner may enter, the way the private tables will do it.
create table public.owner_probe (id int primary key);
alter table public.owner_probe enable row level security;
create policy "Only the owner" on public.owner_probe for select to anon, authenticated using ((select public.is_owner()));
grant select on public.owner_probe to anon, authenticated;
insert into public.owner_probe values (1);
select pg_temp.act_as('authenticated', '99999999-9999-9999-9999-999999999999');
select pg_temp.check((select count(*) from public.owner_probe) = 1, 'the owner reads an owner-only row');
select pg_temp.act_as('authenticated', '11111111-1111-1111-1111-111111111111');
select pg_temp.check((select count(*) from public.owner_probe) = 0, 'another member doesn''t');
select pg_temp.act_as('anon');
select pg_temp.check((select count(*) from public.owner_probe) = 0, 'nor does a visitor');
reset role;
drop table public.owner_probe;

-- Stickies --------------------------------------------------------------

select pg_temp.act_as('anon');
select pg_temp.check(pg_temp.refused($$insert into public.notes (body) values ('hi')$$), 'visitors can''t put notes up');
select pg_temp.act_as('authenticated', '11111111-1111-1111-1111-111111111111');
insert into public.notes (body) values ('one'), ('two'), ('three');
select pg_temp.check((select bool_and(name = 'alice') from public.notes), 'notes are signed with the username');
select pg_temp.check(pg_temp.refused($$insert into public.notes (body) values ('four')$$), 'three notes a day');
reset role;

-- Chat ------------------------------------------------------------------

select pg_temp.act_as('authenticated', '11111111-1111-1111-1111-111111111111');
insert into public.chat_messages (body, room) values ('hello lobby', 'lobby');
insert into public.chat_messages (body, room) values ('hi bob', 'dm:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222');
select pg_temp.check(pg_temp.refused($$insert into public.chat_messages (body, room) values ('x', 'nosuchroom')$$), 'only rooms that exist');
select pg_temp.check(pg_temp.refused($$insert into public.chat_messages (body, room) values ('x', 'dm:22222222-2222-2222-2222-222222222222:33333333-3333-3333-3333-333333333333')$$), 'not someone else''s conversation');
select pg_temp.check(pg_temp.refused($$insert into public.chat_messages (body, room) values ('x', 'dm:22222222-2222-2222-2222-222222222222:11111111-1111-1111-1111-111111111111')$$), 'conversation names in order');
select pg_temp.check(pg_temp.refused($$insert into public.chat_messages (body, room, user_id) values ('x', 'lobby', '22222222-2222-2222-2222-222222222222')$$), 'no speaking as someone else');
select pg_temp.act_as('authenticated', '33333333-3333-3333-3333-333333333333');
select pg_temp.check((select count(*) from public.chat_messages) = 1, 'a third member sees the Lobby, not the conversation');
select pg_temp.act_as('authenticated', '22222222-2222-2222-2222-222222222222');
select pg_temp.check((select count(*) from public.chat_messages) = 2, 'the other member sees the conversation');
select pg_temp.act_as('anon');
select pg_temp.check((select count(*) from public.chat_messages) = 1, 'visitors read the Lobby');
select pg_temp.check(pg_temp.refused($$insert into public.chat_messages (body) values ('x')$$), 'visitors can''t talk');
select pg_temp.act_as('authenticated', '33333333-3333-3333-3333-333333333333');
insert into public.chat_messages (body) select 'm' || g from generate_series(1, 8) g;
select pg_temp.check(pg_temp.refused($$insert into public.chat_messages (body) values ('ninth')$$), 'eight messages in 30 seconds at most');
reset role;

-- Soapbox ---------------------------------------------------------------

select pg_temp.act_as('service_role');
select pg_temp.check((select created from public.soapbox_add_images(null, 100, '', 'note', 'San Jose', null, '[{"url":"u","width":1,"height":1,"message":100}]')), 'a photo alone makes a post');
select public.soapbox_add_images('G', 201, '', 'note', 'SJ', null, '[{"url":"b","width":1,"height":1,"message":201}]');
select public.soapbox_add_images('G', 200, 'Tahoe', 'note', 'SJ', null, '[{"url":"a","width":1,"height":1,"message":200}]');
reset role;
select pg_temp.check((select jsonb_array_length(images) = 2 and body = 'Tahoe' from public.soapbox_posts where media_group_id = 'G'), 'an album is one post, with its caption');
select pg_temp.act_as('anon');
select pg_temp.check(pg_temp.refused($$select public.soapbox_add_images(null, 1, 'x', 'note', null, null, '[]')$$), 'visitors can''t post');
select pg_temp.check(pg_temp.refused($$select public.moderation_register('https://evil.example')$$), 'visitors can''t redirect moderation');
reset role;
select pg_temp.check(pg_temp.refused($$insert into public.soapbox_posts (body) values ('  ')$$), 'a post needs text or photos');

-- Moderation ------------------------------------------------------------

truncate net.calls;
select pg_temp.act_as('service_role');
select public.moderation_register('https://fn.example/soapbox-bot');
reset role;
select pg_temp.act_as('authenticated', '22222222-2222-2222-2222-222222222222');
insert into public.notes (body) values ('a note to moderate');
insert into public.chat_messages (body) values ('a message to moderate');
insert into public.chat_messages (body, room) values ('private', 'dm:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222');
reset role;
select pg_temp.check((select count(*) from net.calls) = 2, 'new notes and public messages go to the bot');
select pg_temp.check(not exists (select 1 from net.calls where body ->> 'text' = 'private'), 'private conversations never do');
select pg_temp.check((select bool_and(headers ? 'x-moderation-secret') from net.calls), 'notices are signed');
select pg_temp.act_as('service_role');
select pg_temp.check(public.moderation_check((select headers ->> 'x-moderation-secret' from net.calls limit 1)), 'the bot can check a signature');
select pg_temp.check(not public.moderation_check('guess'), 'a guess isn''t a signature');
select public.moderation_register(null);
reset role;
truncate net.calls;
select pg_temp.act_as('authenticated', '11111111-1111-1111-1111-111111111111');
insert into public.chat_messages (body, room) values ('after off', 'music');
reset role;
select pg_temp.check((select count(*) from net.calls) = 0, '/watch off stops notices');

-- Password reset ------------------------------------------------------------

select pg_temp.act_as('anon');
select pg_temp.check(pg_temp.refused($$select public.recovery_request('alice', repeat('a', 64))$$), 'visitors can''t ask the database for a link');
select pg_temp.check(pg_temp.refused($$select public.recovery_consume(repeat('a', 64))$$), 'visitors can''t use a link themselves');
select pg_temp.check(pg_temp.refused($$select public.my_recovery_email()$$), 'visitors have no recovery address to read');
select pg_temp.act_as('authenticated', '22222222-2222-2222-2222-222222222222');
select pg_temp.check(pg_temp.refused($$select public.recovery_check(repeat('a', 64))$$), 'members can''t look links up');
select pg_temp.check(public.my_recovery_email() is null, 'bob has no recovery address yet');
select public.set_recovery_email(' bob@example.com ');
select pg_temp.check(public.my_recovery_email() = 'bob@example.com', 'a member sets their own recovery address');
select pg_temp.check(pg_temp.refused($$select public.set_recovery_email('not an address')$$), 'recovery addresses are checked');
select public.set_recovery_email('');
select pg_temp.check(public.my_recovery_email() is null, 'and can remove it');
reset role;

select pg_temp.act_as('service_role');
select pg_temp.check(public.recovery_request('bob', repeat('b', 64)) is null, 'no link for an account without a recovery address');
select pg_temp.check(public.recovery_request('nobody', repeat('b', 64)) is null, 'no link for an account that doesn''t exist');
select pg_temp.check(public.recovery_request(' Alice ', repeat('1', 64)) = 'a@example.com', 'a link goes to the recovery address');
select pg_temp.check(pg_temp.refused($$select public.recovery_request('alice', 'short')$$), 'only token hashes are kept');
select public.recovery_request('alice', repeat('2', 64));
select pg_temp.check(public.recovery_request('alice', repeat('3', 64)) is not null, 'three links an hour');
select pg_temp.check(public.recovery_request('alice', repeat('4', 64)) is null, 'but not a fourth');
select pg_temp.check(public.recovery_check(repeat('1', 64)) = 'alice', 'a link says whose it is');
select pg_temp.check((select username from public.recovery_consume(repeat('2', 64))) = 'alice', 'a link can be used');
select pg_temp.check(not exists (select from public.recovery_consume(repeat('2', 64))), 'only once');
select pg_temp.check(public.recovery_check(repeat('1', 64)) is null, 'and using one retires the others');
reset role;
update private.password_resets set used_at = null, expires_at = now() - interval '1 minute' where token_hash = repeat('3', 64);
select pg_temp.act_as('service_role');
select pg_temp.check(not exists (select from public.recovery_consume(repeat('3', 64))), 'an expired link doesn''t work');
reset role;
select pg_temp.act_as('authenticated', '33333333-3333-3333-3333-333333333333');
select public.set_recovery_email('A@example.com');
select pg_temp.act_as('service_role');
select pg_temp.check(public.recovery_request('carol', repeat('5', 64)) is null, 'three links an hour to any one address, whoever asks');
reset role;

-- Security Advisor ------------------------------------------------------------

select pg_temp.check(not has_function_privilege('anon', 'public.notes_by_member()', 'execute')
  and not has_function_privilege('authenticated', 'public.chat_flood_guard()', 'execute')
  and not has_function_privilege('authenticated', 'public.handle_new_account()', 'execute'), 'trigger functions can''t be called over the API');
select pg_temp.check(not exists (select from pg_proc where proname = 'notes_one_per_visitor'), 'the old one-note-per-visitor function is gone');
select pg_temp.check(not has_function_privilege('anon', 'public.my_reactions()', 'execute'), 'visitors can''t ask for members'' reactions');
select pg_temp.act_as('anon');
select pg_temp.check(public.username_available('someone_new') and not public.username_available('alice'), 'visitors can still check a username');
reset role;

-- Reactions, with the triggers' EXECUTE revoked: they still fire.
select set_config('test.post', (select id::text from public.soapbox_posts where media_group_id = 'G'), false);
select pg_temp.act_as('authenticated', '22222222-2222-2222-2222-222222222222');
insert into public.soapbox_reactions (post_id, emoji) values (current_setting('test.post')::uuid, '🔥');
reset role;
select pg_temp.check((select visitor from public.soapbox_reactions where emoji = '🔥') = 'user:22222222-2222-2222-2222-222222222222', 'a member reacts as themselves');
select set_config('request.headers', '{"x-real-ip":"203.0.113.9"}', false);
select pg_temp.act_as('anon');
insert into public.soapbox_reactions (post_id, emoji) values (current_setting('test.post')::uuid, '👍');
reset role;
select pg_temp.check((select count(*) from public.soapbox_reactions where visitor ~ '^[0-9a-f]{64}$') = 1, 'a visitor reacts, known by a salted address');
update public.soapbox_posts set hidden = true where media_group_id = 'G';
select pg_temp.act_as('authenticated', '33333333-3333-3333-3333-333333333333');
select pg_temp.check(pg_temp.refused($$insert into public.soapbox_reactions (post_id, emoji) values (current_setting('test.post')::uuid, '😂')$$), 'no reacting to a hidden post');
reset role;
select set_config('request.headers', '', false);

-- The music library ------------------------------------------------------

select pg_temp.check((select count(*) from public.songs) = 33 and (select count(*) from public.albums) = 1, 'the library starts as songs.json had it');

select pg_temp.act_as('anon');
select pg_temp.check((select count(*) from public.songs) = 33, 'visitors read the library');
-- Exactly what /api/songs asks for (src/lib/library.ts): the columns, and the order.
select pg_temp.check((select count(*) from (select title, artist, year, cover, note from public.albums order by added_at, title) a) = 1, 'visitors read albums as /api/songs asks for them');
select pg_temp.check((select count(*) from (select id, title, artist, album, cover, track, instrumental, lyrics_offset, lyrics_id from public.songs order by added_at, id) s) = 33, 'visitors read songs as /api/songs asks for them');
select pg_temp.check(public.song_limit() = 200, 'visitors read the library''s limit, and nothing else of its settings');
select pg_temp.check(pg_temp.refused($$insert into public.songs (id, title, artist) values ('aaaaaaaaaaa', 'x', 'y')$$), 'visitors can''t add songs');
select pg_temp.check(pg_temp.refused($$update public.songs set title = 'x'$$), 'visitors can''t change songs');
select pg_temp.check(pg_temp.refused($$delete from public.songs$$), 'visitors can''t remove songs');
select pg_temp.check(pg_temp.refused($$select * from public.music_settings$$), 'visitors can''t read the library''s settings');
select pg_temp.check(pg_temp.refused($$insert into public.now_playing (song_id, ends_at) values ('OxtZF0WGXtE', now() + interval '1 minute')$$), 'visitors can''t play songs for everyone');
select pg_temp.check(pg_temp.refused($$select public.music_play('OxtZF0WGXtE')$$), 'visitors can''t call music_play');
select pg_temp.act_as('authenticated', '11111111-1111-1111-1111-111111111111');
select pg_temp.check(pg_temp.refused($$insert into public.songs (id, title, artist) values ('aaaaaaaaaaa', 'x', 'y')$$), 'members can''t add songs');
select pg_temp.check(pg_temp.refused($$select public.music_stop()$$), 'members can''t stop what''s playing');

select pg_temp.act_as('service_role');
insert into public.songs (id, title, artist, cover, duration_ms) values ('dQw4w9WgXcQ', 'Test Song', 'Tester', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', 213000);
select pg_temp.check(exists (select 1 from public.songs where id = 'dQw4w9WgXcQ'), 'the bot adds a song');
select pg_temp.check(pg_temp.refused($$insert into public.songs (id, title, artist) values ('not a video', 'x', 'y')$$), 'a song is a YouTube video id');
select pg_temp.check(pg_temp.refused($$insert into public.songs (id, title, artist) values ('bbbbbbbbbbb', '   ', 'y')$$), 'a song has a title');
select pg_temp.check(pg_temp.refused(format($$insert into public.songs (id, title, artist) values ('bbbbbbbbbbb', %L, 'y')$$, repeat('x', 201))), 'titles are at most 200 characters');
select pg_temp.check(pg_temp.refused($$insert into public.songs (id, title, artist, cover) values ('bbbbbbbbbbb', 'x', 'y', 'https://evil.example.com/a.jpg')$$), 'covers come from Apple''s or YouTube''s image hosts only');
select pg_temp.check(pg_temp.refused($$insert into public.songs (id, title, artist, cover) values ('bbbbbbbbbbb', 'x', 'y', 'http://i.ytimg.com/vi/a/b.jpg')$$), 'covers are https');
select pg_temp.check(pg_temp.refused($$insert into public.songs (id, title, artist, cover) values ('bbbbbbbbbbb', 'x', 'y', 'https://i.ytimg.com/a.jpg");background:url(x')$$), 'a cover can''t break out of url()');
select pg_temp.check(pg_temp.refused($$insert into public.songs (id, title, artist, lyrics_offset) values ('bbbbbbbbbbb', 'x', 'y', 99999)$$), 'lyric offsets stay within 30 seconds');

-- Playing: by the database's clock, public while it plays.
select pg_temp.check((select song_id from public.music_play('dQw4w9WgXcQ')) = 'dQw4w9WgXcQ', 'the bot plays a song');
select pg_temp.check((select ends_at - started_at from public.now_playing) = interval '213 seconds', 'a play lasts the song''s length');
select public.music_play('OxtZF0WGXtE');
select pg_temp.check((select count(*) from public.now_playing) = 1 and (select song_id from public.now_playing) = 'OxtZF0WGXtE', 'playing another song replaces the first');
select pg_temp.check((select ends_at - started_at from public.now_playing) = interval '10 minutes', 'a song of unknown length plays for ten minutes');
select pg_temp.check(pg_temp.refused($$select public.music_play('nosuchsongx')$$), 'only songs in the library play');

select pg_temp.act_as('anon');
select pg_temp.check((select song_id from public.now_playing_position()) = 'OxtZF0WGXtE' and (select elapsed_ms from public.now_playing_position()) >= 0 and (select remaining_ms from public.now_playing_position()) between 1 and 600000, 'visitors see what''s playing, how far in and how long it has left');
reset role;
update public.now_playing set started_at = now() - interval '2 hours', ends_at = now() - interval '1 hour';
select pg_temp.act_as('anon');
select pg_temp.check(not exists (select 1 from public.now_playing) and not exists (select 1 from public.now_playing_position()), 'a song that has ended isn''t playing');
select pg_temp.act_as('service_role');
select public.music_play('dQw4w9WgXcQ');
delete from public.songs where id = 'dQw4w9WgXcQ';
select pg_temp.check(not exists (select 1 from public.now_playing), 'removing the song playing stops it');
select public.music_play('OxtZF0WGXtE');
select public.music_stop();
select pg_temp.check(not exists (select 1 from public.now_playing), 'the bot stops what''s playing');
reset role;
select pg_temp.check(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'now_playing'), 'what''s playing reaches visitors over Realtime');

-- The limit: a full library refuses another song.
update public.music_settings set value = to_jsonb((select count(*) from public.songs) + 1) where name = 'song_limit';
select pg_temp.act_as('service_role');
insert into public.songs (id, title, artist) values ('ccccccccccc', 'Last', 'One');
select pg_temp.check(pg_temp.refused($$insert into public.songs (id, title, artist) values ('ddddddddddd', 'Too many', 'One')$$), 'a full library refuses another song');
reset role;
delete from public.songs where id = 'ccccccccccc';
update public.music_settings set value = '200' where name = 'song_limit';

-- DVD Player's discs ----------------------------------------------------

select pg_temp.act_as('service_role');
insert into public.discs (id, title, artist, cover) values ('jWQx2f-CErU', 'Whiplash', 'aespa', 'maxresdefault');
select pg_temp.check((select cover_x = 50 and duration_ms is null from public.discs where id = 'jWQx2f-CErU'), 'the bot burns a disc, cropped in the middle');
reset role;

select pg_temp.act_as('anon');
select pg_temp.check((select count(*) from (select id, title, artist, cover, cover_x, duration_ms, added_at from public.discs order by added_at, id) d) = 1, 'visitors read discs as /api/songs asks for them');
select pg_temp.check(pg_temp.refused($$insert into public.discs (id, title) values ('aaaaaaaaaaa', 'x')$$), 'visitors can''t burn discs');
select pg_temp.check(pg_temp.refused($$update public.discs set title = 'x' where id = 'jWQx2f-CErU'$$), 'visitors can''t relabel discs');
select pg_temp.check(pg_temp.refused($$delete from public.discs where id = 'jWQx2f-CErU'$$), 'visitors can''t throw discs away');

select pg_temp.act_as('authenticated', '11111111-1111-1111-1111-111111111111');
select pg_temp.check(pg_temp.refused($$insert into public.discs (id, title) values ('aaaaaaaaaaa', 'x')$$), 'members can''t burn discs');
update public.discs set title = 'Mine now' where id = 'jWQx2f-CErU';
delete from public.discs where id = 'jWQx2f-CErU';
reset role;
select pg_temp.check((select title from public.discs where id = 'jWQx2f-CErU') = 'Whiplash', 'members can''t relabel or throw away discs');

select pg_temp.act_as('authenticated', '99999999-9999-9999-9999-999999999999');
insert into public.discs (id, title, artist, cover, cover_x) values ('kKsivrgoyDw', 'Cool with You', 'NewJeans', 'hq2', 38);
update public.discs set title = 'Whiplash (MV)', duration_ms = 191000 where id = 'jWQx2f-CErU';
select pg_temp.check((select count(*) from public.discs) = 2 and (select title from public.discs where id = 'jWQx2f-CErU') = 'Whiplash (MV)', 'the owner burns and relabels discs');
delete from public.discs where id = 'kKsivrgoyDw';
select pg_temp.check((select count(*) from public.discs) = 1, 'the owner throws a disc away');
select pg_temp.check(pg_temp.refused($$insert into public.discs (id, title, cover) values ('bbbbbbbbbbb', 'x', 'https://evil.example/a.jpg')$$), 'a case''s picture is one of the video''s own, by name');
select pg_temp.check(pg_temp.refused($$insert into public.discs (id, title) values ('short', 'x')$$), 'a disc is a YouTube video id');
select pg_temp.check(pg_temp.refused($$insert into public.discs (id, title) values ('bbbbbbbbbbb', '   ')$$), 'a disc has a title');
select pg_temp.check(pg_temp.refused($$insert into public.discs (id, title, cover_x) values ('bbbbbbbbbbb', 'x', 101)$$), 'the crop stays on the picture');
select pg_temp.check(pg_temp.refused($$insert into public.discs (id, title, added_at) values ('bbbbbbbbbbb', 'x', now() - interval '1 year')$$), 'a disc''s burn date is the database''s');
reset role;

-- The limit: a full shelf refuses another disc.
update public.music_settings set value = to_jsonb((select count(*) from public.discs) + 1) where name = 'disc_limit';
select pg_temp.act_as('service_role');
insert into public.discs (id, title) values ('ccccccccccc', 'Last');
select pg_temp.check(pg_temp.refused($$insert into public.discs (id, title) values ('ddddddddddd', 'Too many')$$), 'a full shelf refuses another disc');
reset role;
delete from public.discs where id = 'ccccccccccc';
update public.music_settings set value = '200' where name = 'disc_limit';
select pg_temp.check(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'discs'), 'the shelf''s changes reach open desktops over Realtime');

-- Supabase's API loads pg_safeupdate, which refuses a DELETE or UPDATE
-- without a WHERE clause, even inside a function ("DELETE requires a
-- WHERE clause"). This Postgres doesn't have it, so every function's
-- statements are checked for one instead.
select pg_temp.check(not exists (
  select 1
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace,
    regexp_split_to_table(p.prosrc, ';') as statement
  where n.nspname = 'public'
    and statement ~* '\m(delete\s+from|update\s+[a-z_."]+\s+set)\M'
    and statement !~* '\mwhere\M'
), 'every function''s DELETE and UPDATE has a WHERE (Supabase''s pg_safeupdate refuses one without)');

-- Realtime reads each changed row by its primary key, as the subscriber,
-- before sending it; a visitor who can't read the key gets nothing (plays
-- never reached open desktops until now_playing.id was granted).
select pg_temp.check(not exists (
  select 1
  from pg_publication_tables t
  join pg_class c on c.relname = t.tablename
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
  join pg_index i on i.indrelid = c.oid and i.indisprimary
  join pg_attribute a on a.attrelid = c.oid and a.attnum = any (i.indkey)
  where t.pubname = 'supabase_realtime' and t.schemaname = 'public'
    and not has_column_privilege('anon', c.oid, a.attname, 'select')
), 'visitors can read the primary key of every table Realtime sends them');
