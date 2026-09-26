-- Accounts, member-only Stickies, changeable reactions and a chat room.
--
-- Run this once in the Supabase SQL editor of a project set up with an
-- earlier supabase/schema.sql (schema.sql itself already includes it). It
-- can be run again safely. Also turn off Authentication › Providers ›
-- Email › "Confirm email": accounts are a username and a password, and the
-- address Supabase Auth needs is made up from the username
-- (<username>@users.majincheng.com), so there's no inbox to confirm.
--
-- • Accounts: public.profiles holds each account's username (3–20 lower-case
--   letters, digits or underscores). An optional recovery address is kept
--   in private.recovery_emails, out of the API's reach.
-- • Stickies: only signed-in visitors can put a note up, at most three in
--   any 24 hours; the note is signed with their username and they can take
--   it down. The one-note-per-IP rule goes.
-- • Soapbox reactions: signed-in visitors react as themselves and can change
--   or take back their reaction; others still get one per IP address.
-- • Chat: one room, readable by anyone, written by members, kept for good.
--   Delivered live through Realtime.

-- ---------------------------------------------------------------------
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
