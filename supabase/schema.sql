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
-- as supabase/migrations/20260927_accounts_chat.sql, whose header explains
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
-- supabase/migrations/20260928_chat_rooms.sql, whose header explains them)

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
-- Soapbox photos (the same as supabase/migrations/20260929_soapbox_images.sql,
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
-- Moderation by Telegram (the same as supabase/migrations/20260930_moderation.sql,
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
