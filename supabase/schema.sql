-- Stickies (notes visitors leave on the JM/OS desktop) and Soapbox
-- (Jincheng's own posts, at the end).
--
-- Run this once in the Supabase SQL editor of a new project. (A project set
-- up with an earlier version needs the files in supabase/migrations.) The
-- browser talks to the table directly with the public anon key, so
-- row-level security does the work: anyone may add one note, which shows
-- right away. To hide a note, set `approved` to false in the Table editor.
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
