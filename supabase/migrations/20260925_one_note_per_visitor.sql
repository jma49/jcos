-- Notes go up right away, one per visitor.
--
-- Run this once in the Supabase SQL editor of a project set up with an
-- earlier supabase/schema.sql. (schema.sql itself already includes it.)
--
-- A visitor is told apart by IP address. Only a salted SHA-256 of it is
-- stored, and the salt lives in a schema the API can't reach, so the column
-- can't be turned back into addresses. People behind one shared address
-- (an office, a home network) share one note. If the address isn't
-- available, the note is let through and the browser's own check is all
-- that applies.

-- Show notes without review. Visitors still can't set `approved`
-- themselves; the default does it.
alter table public.notes alter column approved set default true;

drop policy "Anyone can leave a note for review" on public.notes;
create policy "Anyone can leave a note"
  on public.notes for insert
  to anon, authenticated
  with check (approved);

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

-- Not granted to visitors, so it's neither readable nor writable through the API.
alter table public.notes add column if not exists visitor text;
create unique index if not exists notes_one_per_visitor on public.notes (visitor);

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
