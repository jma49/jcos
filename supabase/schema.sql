-- Stickies: notes visitors leave on the JM/OS desktop.
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
