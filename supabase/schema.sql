-- Stickies (notes visitors leave on the JM/OS desktop), Soapbox (Jincheng's
-- own posts), and accounts and chat (at the end).
--
-- Run this once in the Supabase SQL editor of a new project. (A project set
-- up with an earlier version needs the files in supabase/migrations.) The
-- browser talks to the tables directly with the public anon key, so
-- row-level security does the work. Members (accounts) can put three notes
-- a day up, which show right away. To hide a note, set `approved` to false
-- in the Table editor; to hide a chat message, set `hidden`.
--
-- Presence (the online count and cursors) uses Realtime channels and needs
-- no table.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(trim(body)) between 1 and 280),
  name text not null default '' check (char_length(name) <= 40),
  color text not null default 'yellow'
    check (color in ('yellow', 'blue', 'green', 'pink', 'purple', 'gray')),
  approved boolean not null default true,
  -- A salted hash of the poster's IP address, for one note per visitor.
  visitor text,
  created_at timestamptz not null default now()
);

create index notes_approved_created_at on public.notes (created_at desc) where approved;
create unique index notes_one_per_visitor on public.notes (visitor);

alter table public.notes enable row level security;

create policy "Approved notes are public"
  on public.notes for select
  to anon, authenticated
  using (approved);

create policy "Anyone can leave a note"
  on public.notes for insert
  to anon, authenticated
  with check (approved);

-- Visitors can only write the note itself, never `approved`, `visitor` or the id.
revoke all on public.notes from anon, authenticated;
grant select (id, body, name, color, created_at) on public.notes to anon, authenticated;
grant insert (body, name, color) on public.notes to anon, authenticated;

-- A backstop against floods: at most 30 new notes per 10 minutes overall.
create function public.notes_flood_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.notes where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many new notes right now. Try again later.';
  end if;
  return new;
end;
$$;

create trigger notes_flood_guard
  before insert on public.notes
  for each row execute function public.notes_flood_guard();

-- One note per visitor, told apart by IP address. Only a salted SHA-256 of
-- it is stored, and the salt lives in a schema the API can't reach. People
-- behind one shared address share one note. If the address isn't available,
-- the note is let through and the browser's own check is all that applies.

-- The salt, out of the API's reach.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.secrets (
  name text primary key,
  value text not null
);
-- Row-level security with no policies: even if the schema were ever
-- exposed, visitors could read nothing. The trigger below runs as the
-- table's owner, which RLS doesn't restrict.
alter table private.secrets enable row level security;
revoke all on private.secrets from public, anon, authenticated;
insert into private.secrets (name, value)
values ('visitor_salt', gen_random_uuid()::text || gen_random_uuid()::text)
on conflict (name) do nothing;

create or replace function public.notes_one_per_visitor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  headers json := current_setting('request.headers', true)::json;
  address text := coalesce(
    headers ->> 'cf-connecting-ip',
    headers ->> 'x-real-ip',
    trim(split_part(headers ->> 'x-forwarded-for', ',', 1))
  );
  salt text := (select value from private.secrets where name = 'visitor_salt');
begin
  if address is null or address = '' then
    new.visitor := null;
    return new;
  end if;
  new.visitor := encode(sha256(convert_to(salt || address, 'UTF8')), 'hex');
  if exists (select 1 from public.notes where visitor = new.visitor) then
    raise exception using errcode = '23505', message = 'This visitor has already left a note.';
  end if;
  return new;
end;
$$;

drop trigger if exists notes_one_per_visitor on public.notes;
create trigger notes_one_per_visitor
  before insert on public.notes
  for each row execute function public.notes_one_per_visitor();

-- ---------------------------------------------------------------------
-- Soapbox: Jincheng's own notes and rants, posted from Telegram by
-- supabase/functions/soapbox-bot (service role). Visitors read them and
-- leave one emoji reaction per post. Hide a post with `hidden`.

create table if not exists public.soapbox_posts (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(trim(body)) between 1 and 2000),
  kind text not null default 'note' check (kind in ('note', 'rant')),
  -- Where Jincheng was and the weather there, e.g. 'San Jose' and '🌤️ 64°F'.
  place text,
  weather text,
  hidden boolean not null default false,
  -- The Telegram message it came from, so edits and /delete find it.
  telegram_message_id bigint unique,
  created_at timestamptz not null default now()
);

create index if not exists soapbox_posts_visible on public.soapbox_posts (created_at desc) where not hidden;

alter table public.soapbox_posts enable row level security;

drop policy if exists "Visible posts are public" on public.soapbox_posts;
create policy "Visible posts are public"
  on public.soapbox_posts for select
  to anon, authenticated
  using (not hidden);

-- Read-only for visitors; no insert, update or delete policies.
revoke all on public.soapbox_posts from anon, authenticated;
grant select (id, body, kind, place, weather, created_at) on public.soapbox_posts to anon, authenticated;

create table if not exists public.soapbox_reactions (
  post_id uuid not null references public.soapbox_posts (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '😂', '🫂', '🔥')),
  -- A salted hash of the visitor's IP address; never readable through the API.
  visitor text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, visitor)
);

alter table public.soapbox_reactions enable row level security;

drop policy if exists "Reactions are public" on public.soapbox_reactions;
create policy "Reactions are public"
  on public.soapbox_reactions for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can react" on public.soapbox_reactions;
create policy "Anyone can react"
  on public.soapbox_reactions for insert
  to anon, authenticated
  with check (true);

-- Visitors see which emoji each post got, not who gave them.
revoke all on public.soapbox_reactions from anon, authenticated;
grant select (post_id, emoji) on public.soapbox_reactions to anon, authenticated;
grant insert (post_id, emoji) on public.soapbox_reactions to anon, authenticated;

-- Fills in `visitor` from the request's IP address. Without an address a
-- reaction can't be told apart, so it's refused.
create or replace function public.soapbox_reaction_visitor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  headers json := current_setting('request.headers', true)::json;
  address text := coalesce(
    headers ->> 'cf-connecting-ip',
    headers ->> 'x-real-ip',
    trim(split_part(headers ->> 'x-forwarded-for', ',', 1))
  );
  salt text := (select value from private.secrets where name = 'visitor_salt');
begin
  if address is null or address = '' then
    raise exception 'Can''t tell who is reacting.';
  end if;
  new.visitor := encode(sha256(convert_to(salt || address, 'UTF8')), 'hex');
  if exists (select 1 from public.soapbox_posts where id = new.post_id and hidden) then
    raise exception 'No such post.';
  end if;
  return new;
end;
$$;

drop trigger if exists soapbox_reaction_visitor on public.soapbox_reactions;
create trigger soapbox_reaction_visitor
  before insert on public.soapbox_reactions
  for each row execute function public.soapbox_reaction_visitor();

-- The bot's own settings, such as the place posts are stamped with
-- (changed with /at <city>). Only the service role can reach it.
create table if not exists public.soapbox_settings (
  name text primary key,
  value jsonb not null
);
alter table public.soapbox_settings enable row level security;
revoke all on public.soapbox_settings from anon, authenticated;

-- ---------------------------------------------------------------------
-- Accounts, member-only Stickies, changeable reactions and chat (the same
-- as supabase/migrations/20260926040851_accounts_chat.sql, whose header explains
-- it). This replaces the one-note-per-visitor rule above: after it, only
-- members can put notes up, three a day. Turn off Authentication ›
-- Providers › Email › "Confirm email" too.

-- Accounts

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are public" on public.profiles;
create policy "Profiles are public"
  on public.profiles for select
  to anon, authenticated
  using (true);

revoke all on public.profiles from anon, authenticated;
grant select (id, username, created_at) on public.profiles to anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.recovery_emails (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
alter table private.recovery_emails enable row level security;
revoke all on private.recovery_emails from public, anon, authenticated;

-- A new account gets its profile from the sign-up's metadata. Accounts are
-- only made through JM/OS: the address must be the one made from the
-- username, which also keeps usernames unique.
create or replace function public.handle_new_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  name text := lower(new.raw_user_meta_data ->> 'username');
  recovery text := nullif(trim(new.raw_user_meta_data ->> 'recovery_email'), '');
begin
  if name is null or name !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'A username is 3 to 20 letters, digits or underscores.';
  end if;
  if new.email is distinct from name || '@users.majincheng.com' then
    raise exception 'Accounts are made through JM/OS.';
  end if;
  insert into public.profiles (id, username) values (new.id, name);
  if recovery is not null then
    insert into private.recovery_emails (user_id, email) values (new.id, recovery);
    -- Not left in the account's own metadata, which its session can read.
    update auth.users
      set raw_user_meta_data = raw_user_meta_data - 'recovery_email'
      where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_account();

-- Whether a username is free, for the sign-up form.
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select name ~ '^[a-z0-9_]{3,20}$'
    and not exists (select 1 from public.profiles where username = lower(name));
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Stickies: members only, three a day

alter table public.notes
  add column if not exists user_id uuid references public.profiles (id) on delete set null;
create index if not exists notes_user_created_at on public.notes (user_id, created_at desc);

-- The one-note-per-address rule is replaced by accounts.
drop trigger if exists notes_one_per_visitor on public.notes;
drop index if exists public.notes_one_per_visitor;

drop policy if exists "Anyone can leave a note" on public.notes;
drop policy if exists "Members can leave notes" on public.notes;
create policy "Members can leave notes"
  on public.notes for insert
  to authenticated
  with check (approved and user_id = auth.uid());

drop policy if exists "Members can take their notes down" on public.notes;
create policy "Members can take their notes down"
  on public.notes for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.notes from anon, authenticated;
grant select (id, body, name, color, user_id, created_at) on public.notes to anon, authenticated;
grant insert (body, color) on public.notes to authenticated;
grant delete on public.notes to authenticated;

-- Signs the note with the member's username and holds them to three notes
-- in any 24 hours.
create or replace function public.notes_by_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member text := (select username from public.profiles where id = auth.uid());
begin
  if member is null then
    raise exception using errcode = '42501', message = 'Sign in to leave a note.';
  end if;
  if (select count(*) from public.notes
      where user_id = auth.uid() and created_at > now() - interval '24 hours') >= 3 then
    raise exception using errcode = 'P0429', message = 'That’s three notes today. Come back tomorrow.';
  end if;
  new.user_id := auth.uid();
  new.name := member;
  return new;
end;
$$;

drop trigger if exists notes_by_member on public.notes;
create trigger notes_by_member
  before insert on public.notes
  for each row execute function public.notes_by_member();

-- ---------------------------------------------------------------------
-- Soapbox reactions: members react as themselves

-- Members are told apart by account, everyone else by IP address.
create or replace function public.soapbox_reaction_visitor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  headers json := current_setting('request.headers', true)::json;
  address text := coalesce(
    headers ->> 'cf-connecting-ip',
    headers ->> 'x-real-ip',
    trim(split_part(headers ->> 'x-forwarded-for', ',', 1))
  );
  salt text := (select value from private.secrets where name = 'visitor_salt');
begin
  if exists (select 1 from public.soapbox_posts where id = new.post_id and hidden) then
    raise exception 'No such post.';
  end if;
  if auth.uid() is not null then
    new.visitor := 'user:' || auth.uid();
    return new;
  end if;
  if address is null or address = '' then
    raise exception 'Can''t tell who is reacting.';
  end if;
  new.visitor := encode(sha256(convert_to(salt || address, 'UTF8')), 'hex');
  return new;
end;
$$;

drop policy if exists "Members can change their reaction" on public.soapbox_reactions;
create policy "Members can change their reaction"
  on public.soapbox_reactions for update
  to authenticated
  using (visitor = 'user:' || auth.uid())
  with check (visitor = 'user:' || auth.uid());

drop policy if exists "Members can take their reaction back" on public.soapbox_reactions;
create policy "Members can take their reaction back"
  on public.soapbox_reactions for delete
  to authenticated
  using (visitor = 'user:' || auth.uid());

grant update (emoji) on public.soapbox_reactions to authenticated;
grant delete on public.soapbox_reactions to authenticated;

-- A member's own reactions, so their choices show on any device.
create or replace function public.my_reactions()
returns table (post_id uuid, emoji text)
language sql
stable
security definer
set search_path = public
as $$
  select post_id, emoji from public.soapbox_reactions
  where auth.uid() is not null and visitor = 'user:' || auth.uid();
$$;

revoke all on function public.my_reactions() from public;
grant execute on function public.my_reactions() to authenticated;

-- ---------------------------------------------------------------------
-- Chat

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  -- Set by hand in the Table editor to take a message down.
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_visible on public.chat_messages (created_at desc) where not hidden;

alter table public.chat_messages enable row level security;

drop policy if exists "Chat is public" on public.chat_messages;
create policy "Chat is public"
  on public.chat_messages for select
  to anon, authenticated
  using (not hidden);

drop policy if exists "Members can talk" on public.chat_messages;
create policy "Members can talk"
  on public.chat_messages for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Members can take their messages back" on public.chat_messages;
create policy "Members can take their messages back"
  on public.chat_messages for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.chat_messages from anon, authenticated;
grant select (id, user_id, body, created_at) on public.chat_messages to anon, authenticated;
grant insert (body) on public.chat_messages to authenticated;
grant delete on public.chat_messages to authenticated;

-- A backstop against floods: eight messages in 30 seconds per member.
create or replace function public.chat_flood_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.chat_messages
      where user_id = auth.uid() and created_at > now() - interval '30 seconds') >= 8 then
    raise exception using errcode = 'P0429', message = 'Slow down a little.';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_flood_guard on public.chat_messages;
create trigger chat_flood_guard
  before insert on public.chat_messages
  for each row execute function public.chat_flood_guard();

-- Live delivery: new messages (and ones taken down) reach open chat windows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Chat rooms and private conversations (the same as
-- supabase/migrations/20260926071227_chat_rooms.sql, whose header explains them)

create table if not exists public.chat_rooms (
  id text primary key check (id ~ '^[a-z0-9-]{2,24}$'),
  name text not null check (char_length(name) between 1 and 24),
  topic text not null default '' check (char_length(topic) <= 80),
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.chat_rooms enable row level security;

drop policy if exists "Rooms are public" on public.chat_rooms;
create policy "Rooms are public"
  on public.chat_rooms for select
  to anon, authenticated
  using (true);

revoke all on public.chat_rooms from anon, authenticated;
grant select (id, name, topic, position) on public.chat_rooms to anon, authenticated;

insert into public.chat_rooms (id, name, topic, position) values
  ('lobby', 'Lobby', 'Everyone, about anything', 0),
  ('music', 'Music', 'What’s on your iPod', 1),
  ('dev', 'Dev', 'Code, tools and testing', 2),
  ('photography', 'Photography', 'Pictures and places', 3)
on conflict (id) do nothing;

alter table public.chat_messages add column if not exists room text not null default 'lobby';

alter table public.chat_messages drop constraint if exists chat_messages_room_shape;
alter table public.chat_messages add constraint chat_messages_room_shape
  check (room ~ '^([a-z0-9-]{2,24}|dm:[0-9a-f-]{36}:[0-9a-f-]{36})$');

create index if not exists chat_messages_room_visible on public.chat_messages (room, created_at desc) where not hidden;

-- Whether the caller may read a room: any public room, or a private
-- conversation they're one of the two members of.
create or replace function public.chat_can_read(target text)
returns boolean
language sql
stable
set search_path = public
as $$
  select target not like 'dm:%'
    or (auth.uid() is not null
        and auth.uid()::text in (split_part(target, ':', 2), split_part(target, ':', 3)))
$$;

-- Whether the caller may write to a room: a public room that exists, or a
-- private conversation between them and another member, named in order.
create or replace function public.chat_can_write(target text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when target like 'dm:%' then
      auth.uid() is not null
      and auth.uid()::text in (split_part(target, ':', 2), split_part(target, ':', 3))
      and split_part(target, ':', 2) collate "C" < split_part(target, ':', 3) collate "C"
      and (select count(*) from public.profiles p
           where p.id::text in (split_part(target, ':', 2), split_part(target, ':', 3))) = 2
    else exists (select 1 from public.chat_rooms r where r.id = target)
  end
$$;

revoke all on function public.chat_can_read(text) from public;
revoke all on function public.chat_can_write(text) from public;
grant execute on function public.chat_can_read(text) to anon, authenticated;
grant execute on function public.chat_can_write(text) to authenticated;

drop policy if exists "Chat is public" on public.chat_messages;
drop policy if exists "Rooms are public, conversations private" on public.chat_messages;
create policy "Rooms are public, conversations private"
  on public.chat_messages for select
  to anon, authenticated
  using (not hidden and public.chat_can_read(room));

drop policy if exists "Members can talk" on public.chat_messages;
create policy "Members can talk"
  on public.chat_messages for insert
  to authenticated
  with check (user_id = auth.uid() and public.chat_can_write(room));

revoke all on public.chat_messages from anon, authenticated;
grant select (id, user_id, body, room, created_at) on public.chat_messages to anon, authenticated;
grant insert (body, room) on public.chat_messages to authenticated;
grant delete on public.chat_messages to authenticated;

create or replace function public.chat_activity()
returns table (room text, last_at timestamptz)
language sql
stable
set search_path = public
as $$
  select m.room, max(m.created_at)
  from public.chat_messages m
  -- Row-level security leaves out hidden messages and others' conversations.
  group by m.room
$$;

revoke all on function public.chat_activity() from public;
grant execute on function public.chat_activity() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Soapbox photos (the same as supabase/migrations/20260926080833_soapbox_images.sql,
-- whose header explains them)

alter table public.soapbox_posts add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.soapbox_posts add column if not exists media_group_id text unique;

alter table public.soapbox_posts drop constraint if exists soapbox_posts_images_shape;
alter table public.soapbox_posts add constraint soapbox_posts_images_shape
  check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 10);

-- Text up to 2000 characters, and some text unless there are pictures.
alter table public.soapbox_posts drop constraint if exists soapbox_posts_body_check;
alter table public.soapbox_posts drop constraint if exists soapbox_posts_body_shape;
alter table public.soapbox_posts add constraint soapbox_posts_body_shape
  check (char_length(trim(body)) <= 2000 and (char_length(trim(body)) >= 1 or jsonb_array_length(images) > 0));

grant select (id, body, kind, place, weather, images, created_at) on public.soapbox_posts to anon, authenticated;

create or replace function public.soapbox_add_images(
  p_group text,
  p_message bigint,
  p_body text,
  p_kind text,
  p_place text,
  p_weather text,
  p_images jsonb
)
returns table (id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_group is null then
    return query
      insert into public.soapbox_posts (body, kind, place, weather, telegram_message_id, images)
      values (coalesce(p_body, ''), p_kind, p_place, p_weather, p_message, p_images)
      returning soapbox_posts.id, true;
    return;
  end if;
  -- The first picture of an album makes the post; the rest join it. The
  -- caption comes with one of them, not necessarily the first to arrive.
  return query
    insert into public.soapbox_posts as p (body, kind, place, weather, telegram_message_id, media_group_id, images)
    values (coalesce(p_body, ''), p_kind, p_place, p_weather, p_message, p_group, p_images)
    on conflict (media_group_id) do update
      set images = p.images || excluded.images,
          body = case when trim(excluded.body) <> '' then excluded.body else p.body end,
          kind = case when trim(excluded.body) <> '' then excluded.kind else p.kind end,
          telegram_message_id = case when trim(excluded.body) <> '' then excluded.telegram_message_id else p.telegram_message_id end
    returning p.id, (xmax = 0);
end;
$$;

revoke all on function public.soapbox_add_images(text, bigint, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.soapbox_add_images(text, bigint, text, text, text, text, jsonb) to service_role;

-- The bucket. Some projects refuse this insert, and an error here used to
-- undo everything above; now it's only a notice, and the bot makes the
-- bucket itself on the first photo.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('soapbox', 'soapbox', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
exception when others then
  raise notice 'Couldn''t make the soapbox bucket here (%); the bot will make it.', sqlerrm;
end;
$$;

-- PostgREST picks up the new function and column; Supabase usually does
-- this by itself after a schema change, but not always.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Moderation by Telegram (the same as supabase/migrations/20260926091033_moderation.sql,
-- whose header explains it)

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net isn''t available here (%); moderation notices stay off.', sqlerrm;
end;
$$;

-- Sends one row to the bot, if the bot has registered.
create or replace function private.moderation_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  url text := (select value from private.secrets where name = 'moderation_url');
  secret text := (select value from private.secrets where name = 'moderation_secret');
  payload jsonb;
begin
  if url is null or secret is null then
    return new;
  end if;
  if tg_table_name = 'notes' then
    payload := jsonb_build_object('kind', 'note', 'id', new.id::text, 'author', new.name, 'text', new.body);
  else
    if new.room like 'dm:%' then
      return new;
    end if;
    payload := jsonb_build_object(
      'kind', 'chat',
      'id', new.id::text,
      'author', (select username from public.profiles where id = new.user_id),
      'text', new.body,
      'room', new.room
    );
  end if;
  perform net.http_post(
    url := url,
    body := payload,
    headers := jsonb_build_object('content-type', 'application/json', 'x-moderation-secret', secret)
  );
  return new;
exception when others then
  -- A notice is never worth losing the note or message over.
  return new;
end;
$$;

revoke all on function private.moderation_notify() from public, anon, authenticated;

drop trigger if exists moderation_notify on public.notes;
create trigger moderation_notify
  after insert on public.notes
  for each row execute function private.moderation_notify();

drop trigger if exists moderation_notify on public.chat_messages;
create trigger moderation_notify
  after insert on public.chat_messages
  for each row execute function private.moderation_notify();

-- The bot turns notices on (with its own address) or off. Turning on
-- keeps an existing secret, so notices already on their way still check.
create or replace function public.moderation_register(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_url is null then
    delete from private.secrets where name = 'moderation_url';
    return;
  end if;
  insert into private.secrets (name, value) values ('moderation_url', p_url)
  on conflict (name) do update set value = excluded.value;
  insert into private.secrets (name, value)
  values ('moderation_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (name) do nothing;
end;
$$;

-- Whether a notice really came from this database.
create or replace function public.moderation_check(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from private.secrets where name = 'moderation_secret' and value = p_secret)
$$;

revoke all on function public.moderation_register(text) from public, anon, authenticated;
revoke all on function public.moderation_check(text) from public, anon, authenticated;
grant execute on function public.moderation_register(text) to service_role;
grant execute on function public.moderation_check(text) to service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Password reset through the recovery address (the same as
-- supabase/migrations/20260926094533_password_reset.sql, whose header explains it)

create table if not exists private.password_resets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table private.password_resets enable row level security;
revoke all on private.password_resets from public, anon, authenticated;

create index if not exists password_resets_user on private.password_resets (user_id, requested_at);

-- A link is asked for: returns the address to send it to, or null when
-- the account doesn't exist, has no recovery address, or has asked too
-- often. The function answers the visitor the same way in every case.
create or replace function public.recovery_request(p_username text, p_token_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  address text;
begin
  select p.id, r.email into uid, address
    from public.profiles p
    join private.recovery_emails r on r.user_id = p.id
    where p.username = lower(trim(p_username));
  if uid is null then
    return null;
  end if;
  if (select count(*) from private.password_resets
        where user_id = uid and requested_at > now() - interval '1 hour') >= 3 then
    return null;
  end if;
  insert into private.password_resets (user_id, token_hash, expires_at)
    values (uid, p_token_hash, now() + interval '30 minutes');
  return address;
end;
$$;

-- Whose a link is, while it still works (for "a new password for …").
create or replace function public.recovery_check(p_token_hash text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.username
    from private.password_resets r
    join public.profiles p on p.id = r.user_id
    where r.token_hash = p_token_hash and r.used_at is null and r.expires_at > now();
$$;

-- A link is used: retires it (and the account's other links) and says
-- whose it was, or nothing when it has expired or been used.
create or replace function public.recovery_consume(p_token_hash text)
returns table (user_id uuid, username text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  update private.password_resets r
    set used_at = now()
    where r.token_hash = p_token_hash and r.used_at is null and r.expires_at > now()
    returning r.user_id into uid;
  if uid is null then
    return;
  end if;
  update private.password_resets r set used_at = now() where r.user_id = uid and r.used_at is null;
  return query select p.id, p.username from public.profiles p where p.id = uid;
end;
$$;

revoke all on function public.recovery_request(text, text) from public, anon, authenticated;
revoke all on function public.recovery_check(text) from public, anon, authenticated;
revoke all on function public.recovery_consume(text) from public, anon, authenticated;
grant execute on function public.recovery_request(text, text) to service_role;
grant execute on function public.recovery_check(text) to service_role;
grant execute on function public.recovery_consume(text) to service_role;

-- A member's own recovery address: read it, or set it (null or blank
-- removes it).
create or replace function public.my_recovery_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email from private.recovery_emails where user_id = auth.uid();
$$;

create or replace function public.set_recovery_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  address text := nullif(trim(p_email), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if address is null then
    delete from private.recovery_emails where user_id = auth.uid();
  else
    insert into private.recovery_emails (user_id, email) values (auth.uid(), address)
      on conflict (user_id) do update set email = excluded.email;
  end if;
end;
$$;

revoke all on function public.my_recovery_email() from public, anon;
revoke all on function public.set_recovery_email(text) from public, anon;
grant execute on function public.my_recovery_email() to authenticated;
grant execute on function public.set_recovery_email(text) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Limits that hold under concurrency, and site-wide backstops (the same as
-- supabase/migrations/20260926095149_hardening.sql, whose header explains them)

create index if not exists chat_messages_user_created on public.chat_messages (user_id, created_at desc);
create index if not exists chat_messages_created on public.chat_messages (created_at desc);
create index if not exists profiles_created on public.profiles (created_at desc);
create index if not exists password_resets_requested on private.password_resets (requested_at desc);

-- Stickies: three notes in any 24 hours, one member's notes one at a time.
create or replace function public.notes_by_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member text := (select username from public.profiles where id = auth.uid());
begin
  if member is null then
    raise exception using errcode = '42501', message = 'Sign in to leave a note.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('notes:' || auth.uid()::text, 0));
  if (select count(*) from public.notes
      where user_id = auth.uid() and created_at > now() - interval '24 hours') >= 3 then
    raise exception using errcode = 'P0429', message = 'That’s three notes today. Come back tomorrow.';
  end if;
  new.user_id := auth.uid();
  new.name := member;
  return new;
end;
$$;

-- Chat: eight messages in 30 seconds per member, 120 a minute in all.
create or replace function public.chat_flood_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('chat:' || coalesce(auth.uid()::text, ''), 0));
  if (select count(*) from public.chat_messages
      where user_id = auth.uid() and created_at > now() - interval '30 seconds') >= 8 then
    raise exception using errcode = 'P0429', message = 'Slow down a little.';
  end if;
  if (select count(*) from public.chat_messages where created_at > now() - interval '1 minute') >= 120 then
    raise exception using errcode = 'P0429', message = 'Chat is very busy right now. Try again in a minute.';
  end if;
  return new;
end;
$$;

-- Accounts: at most 100 new ones an hour across the site.
create or replace function public.handle_new_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  name text := lower(new.raw_user_meta_data ->> 'username');
  recovery text := nullif(trim(new.raw_user_meta_data ->> 'recovery_email'), '');
begin
  if name is null or name !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'A username is 3 to 20 letters, digits or underscores.';
  end if;
  if new.email is distinct from name || '@users.majincheng.com' then
    raise exception 'Accounts are made through JM/OS.';
  end if;
  if (select count(*) from public.profiles where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many new accounts right now. Try again later.';
  end if;
  insert into public.profiles (id, username) values (new.id, name);
  if recovery is not null then
    insert into private.recovery_emails (user_id, email) values (new.id, recovery);
    -- Not left in the account's own metadata, which its session can read.
    update auth.users
      set raw_user_meta_data = raw_user_meta_data - 'recovery_email'
      where id = new.id;
  end if;
  return new;
end;
$$;

-- Reset links: three an hour per account and per address, 60 an hour in all.
create or replace function public.recovery_request(p_username text, p_token_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  address text;
begin
  select p.id, r.email into uid, address
    from public.profiles p
    join private.recovery_emails r on r.user_id = p.id
    where p.username = lower(trim(p_username));
  if uid is null then
    return null;
  end if;
  -- One request per address at a time, so the counts below can't be raced.
  perform pg_advisory_xact_lock(hashtextextended('recovery:' || lower(address), 0));
  if (select count(*) from private.password_resets
        where user_id = uid and requested_at > now() - interval '1 hour') >= 3 then
    return null;
  end if;
  if (select count(*) from private.password_resets r
        join private.recovery_emails e on e.user_id = r.user_id
        where lower(e.email) = lower(address) and r.requested_at > now() - interval '1 hour') >= 3 then
    return null;
  end if;
  if (select count(*) from private.password_resets where requested_at > now() - interval '1 hour') >= 60 then
    return null;
  end if;
  insert into private.password_resets (user_id, token_hash, expires_at)
    values (uid, p_token_hash, now() + interval '30 minutes');
  return address;
end;
$$;

revoke all on function public.recovery_request(text, text) from public, anon, authenticated;
grant execute on function public.recovery_request(text, text) to service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Security Advisor findings (the same as
-- supabase/migrations/20260926100511_advisor.sql, whose header explains them)

drop function if exists public.notes_one_per_visitor();

revoke all on function public.notes_flood_guard() from public, anon, authenticated;
revoke all on function public.notes_by_member() from public, anon, authenticated;
revoke all on function public.chat_flood_guard() from public, anon, authenticated;
revoke all on function public.soapbox_reaction_visitor() from public, anon, authenticated;
revoke all on function public.handle_new_account() from public, anon, authenticated;

alter function public.username_available(text) security invoker;

revoke all on function public.my_reactions() from public, anon;
grant execute on function public.my_reactions() to authenticated;

drop policy if exists "Anyone can react" on public.soapbox_reactions;
create policy "Anyone can react"
  on public.soapbox_reactions for insert
  to anon, authenticated
  with check (
    exists (select 1 from public.soapbox_posts p where p.id = post_id)
    and (auth.uid() is null or visitor = 'user:' || auth.uid())
  );

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- The music library and what Jincheng is playing (the same as
-- supabase/migrations/20260927030802_music_library.sql, whose header
-- explains it).

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
grant select (title, artist, year, cover, note, added_at) on public.albums to anon, authenticated;
grant select (id, title, artist, album, cover, track, instrumental, lyrics_offset, lyrics_id, duration_ms, added_at) on public.songs to anon, authenticated;
-- id too: Realtime reads a changed row by its primary key, as the subscriber.
grant select (id, song_id, started_at, ends_at) on public.now_playing to anon, authenticated;
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
  -- With a WHERE: Supabase's API refuses a DELETE without one (pg_safeupdate).
  delete from public.now_playing where id;
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

-- ---------------------------------------------------------------------
-- The library's limit, readable by visitors (the same as
-- supabase/migrations/20260927062914_song_limit.sql, whose header explains it).

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


-- ---------------------------------------------------------------------
-- Jincheng's account is the owner (the same as
-- supabase/migrations/20260929100000_owner.sql, whose header explains it).
-- Private tables check `(select public.is_owner())` in their policies.
-- After a new project is set up, Jincheng's account is added once:
--   insert into private.owners (user_id)
--   select id from auth.users where email = '<username>@users.majincheng.com'
--   on conflict do nothing;

create table if not exists private.owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table private.owners enable row level security;
revoke all on private.owners from public, anon, authenticated;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from private.owners where user_id = auth.uid());
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;

-- ---------------------------------------------------------------------
-- DVD Player's discs (the same as
-- supabase/migrations/20260929120000_discs.sql, whose header explains it).
-- Everyone reads the shelf; only the owner and the bot write it.

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

-- ---------------------------------------------------------------------
-- The iPod's ratings and playlists (the same as
-- supabase/migrations/20260929140000_playlists.sql, whose header explains it).
-- Everyone reads Jincheng's ratings, plays and playlists; only the owner writes them.

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

-- ---------------------------------------------------------------------
-- Jincheng's home folder (the same as
-- supabase/migrations/20260929160000_home.sql, whose header explains it).
-- Documents in Public are everyone's to read; everything else, and the diary, only the owner's.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  -- Which of the home's folders it's in; Public is everyone's to read.
  folder text not null check (folder in ('desktop', 'documents', 'downloads', 'library', 'movies', 'music', 'pictures', 'public')),
  -- Its name with its extension ("Things to remember.txt"): one line, no
  -- slash or colon (Finder's separators), not hidden.
  name text not null check (
    char_length(name) between 1 and 80
    and name = btrim(name)
    and name !~ '[[:cntrl:]/:]'
    and left(name, 1) <> '.'
  ),
  body text not null default '' check (char_length(body) <= 100000),
  -- Counts saves: a save names the version it was made from.
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One document to a name in a folder, whatever its case.
create unique index if not exists documents_name on public.documents (folder, lower(name));

create table if not exists public.diary (
  id uuid primary key default gen_random_uuid(),
  -- The day it's about, in the writer's own time zone.
  day date not null check (day between date '2000-01-01' and date '2100-12-31'),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists diary_day on public.diary (day desc, created_at desc);

alter table public.documents enable row level security;
alter table public.diary enable row level security;

drop policy if exists "Public is everyone's to read; the rest is Jincheng's" on public.documents;
create policy "Public is everyone's to read; the rest is Jincheng's" on public.documents for select to anon, authenticated
  using (folder = 'public' or (select public.is_owner()));
drop policy if exists "Jincheng writes documents" on public.documents;
create policy "Jincheng writes documents" on public.documents for insert to authenticated with check ((select public.is_owner()));
drop policy if exists "Jincheng changes documents" on public.documents;
create policy "Jincheng changes documents" on public.documents for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists "Jincheng throws documents away" on public.documents;
create policy "Jincheng throws documents away" on public.documents for delete to authenticated using ((select public.is_owner()));

drop policy if exists "Jincheng's diary is Jincheng's" on public.diary;
create policy "Jincheng's diary is Jincheng's" on public.diary for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- Visitors read documents in Public (the policy above); the diary isn't
-- theirs to ask for at all. Versions and times are the database's.
revoke all on public.documents, public.diary from anon, authenticated;
grant select (id, folder, name, body, version, created_at, updated_at) on public.documents to anon, authenticated;
grant insert (folder, name, body) on public.documents to authenticated;
grant update (folder, name, body) on public.documents to authenticated;
grant delete on public.documents to authenticated;
grant select (id, day, body, version, created_at, updated_at) on public.diary to authenticated;
grant insert (day, body) on public.diary to authenticated;
grant update (day, body) on public.diary to authenticated;
grant delete on public.diary to authenticated;
grant select, insert, update, delete on public.documents, public.diary to service_role;

-- A save counts: the version goes up and the time is now's.
create or replace function public.home_saved()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.home_saved() from public, anon, authenticated;

drop trigger if exists documents_saved on public.documents;
create trigger documents_saved before update on public.documents for each row execute function public.home_saved();
drop trigger if exists diary_saved on public.diary;
create trigger diary_saved before update on public.diary for each row execute function public.home_saved();

insert into public.music_settings (name, value) values ('document_limit', '500'), ('diary_limit', '10000') on conflict (name) do nothing;

-- At most document_limit documents and diary_limit entries.
create or replace function public.home_within_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  setting text := case tg_table_name when 'documents' then 'document_limit' else 'diary_limit' end;
  most int := coalesce((select (value #>> '{}')::int from public.music_settings where name = setting), 500);
  counted int;
begin
  perform pg_advisory_xact_lock(hashtextextended(tg_table_name, 0));
  execute format('select count(*) from public.%I', tg_table_name) into counted;
  if counted >= most then
    raise exception using errcode = 'P0429', message = case tg_table_name
      when 'documents' then format('There are %s documents already. Throw one away first.', most)
      else format('The diary is full (%s entries).', most) end;
  end if;
  return new;
end;
$$;
revoke execute on function public.home_within_limit() from public, anon, authenticated;

drop trigger if exists documents_within_limit on public.documents;
create trigger documents_within_limit before insert on public.documents for each row execute function public.home_within_limit();
drop trigger if exists diary_within_limit on public.diary;
create trigger diary_within_limit before insert on public.diary for each row execute function public.home_within_limit();

-- ---------------------------------------------------------------------
-- Policies ask who the caller is once per statement (the same as
-- supabase/migrations/20260929185931_rls_initplan.sql, whose header explains it).

drop policy if exists "Members can leave notes" on public.notes;
create policy "Members can leave notes"
  on public.notes for insert
  to authenticated
  with check (approved and user_id = (select auth.uid()));

drop policy if exists "Members can take their notes down" on public.notes;
create policy "Members can take their notes down"
  on public.notes for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Anyone can react" on public.soapbox_reactions;
create policy "Anyone can react"
  on public.soapbox_reactions for insert
  to anon, authenticated
  with check (
    exists (select 1 from public.soapbox_posts p where p.id = post_id)
    and ((select auth.uid()) is null or visitor = 'user:' || (select auth.uid()))
  );

drop policy if exists "Members can change their reaction" on public.soapbox_reactions;
create policy "Members can change their reaction"
  on public.soapbox_reactions for update
  to authenticated
  using (visitor = 'user:' || (select auth.uid()))
  with check (visitor = 'user:' || (select auth.uid()));

drop policy if exists "Members can take their reaction back" on public.soapbox_reactions;
create policy "Members can take their reaction back"
  on public.soapbox_reactions for delete
  to authenticated
  using (visitor = 'user:' || (select auth.uid()));

drop policy if exists "Members can talk" on public.chat_messages;
create policy "Members can talk"
  on public.chat_messages for insert
  to authenticated
  with check (user_id = (select auth.uid()) and public.chat_can_write(room));

drop policy if exists "Members can take their messages back" on public.chat_messages;
create policy "Members can take their messages back"
  on public.chat_messages for delete
  to authenticated
  using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- chat_can_write() is for members only (the same as
-- supabase/migrations/20260929191409_chat_can_write_members.sql, whose header explains it).

revoke execute on function public.chat_can_write(text) from anon;

-- ---------------------------------------------------------------------
-- The home folder from Telegram (the same as
-- supabase/migrations/20260929192005_home_from_telegram.sql, whose header explains it).

alter table public.diary add column if not exists telegram_message_id bigint;
create unique index if not exists diary_telegram_message on public.diary (telegram_message_id);

alter table public.documents add column if not exists telegram_message_id bigint;
create unique index if not exists documents_telegram_message on public.documents (telegram_message_id);

notify pgrst, 'reload schema';
