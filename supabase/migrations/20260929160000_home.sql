-- Jincheng's home folder: Users › jincheng in Finder, with the folders a
-- Mac's home has. Visitors see them locked, as Mac OS X showed another
-- user's, except Public and Sites; signed in as the owner, they open.
--
-- - documents: Jincheng's own documents, written in TextEdit on the site
--   (and, later, sent from Telegram). Each is in one of the home's
--   folders; those in Public are everyone's to read, the rest only the
--   owner's. A name is one line and unique in its folder, whatever its
--   case. `version` counts saves, so a save made from an older copy (in
--   another tab, or after a note came from Telegram) is refused instead
--   of overwriting what's newer.
-- - diary: Jincheng's diary, an entry at a time, each on a day (the day
--   in the writer's own time zone, as the site or the bot works it out).
--   TextEdit shows a year's entries as "Diary 2026.rtf" in Documents.
--   Only the owner reads or writes it.
-- - At most document_limit documents (500) and diary_limit entries
--   (10000), in music_settings, counted under advisory locks.
-- - Everything is written only by the owner, through row-level security
--   (public.is_owner(), 20260929100000_owner.sql), or by the bot with the
--   service role. Sites holds no documents: it lists Jincheng's sites,
--   from the site's own project pages.
--
-- Run this in the Supabase SQL editor after 20260929140000_playlists.sql
-- (schema.sql already includes it). It can be run again safely.

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

notify pgrst, 'reload schema';
