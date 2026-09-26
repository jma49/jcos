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
