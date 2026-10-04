-- The baseline: the database as the first supabase/schema.sql made it,
-- before any migration (that file as of commit 56cddb5, with its commit
-- time as the version). With it, the migrations alone make the database:
-- a new project runs `supabase db push`, which applies this and then
-- every later file in the order of their names, and supabase/schema.sql
-- is generated from them (`npm run db:generate`).
--
-- The live project was made from that schema.sql in the SQL editor, so
-- this never runs there: its migration history marks it as applied
-- (`supabase migration repair --status applied 20260925084925`).
--
-- Like the three migrations after it, it predates the rule that a
-- migration runs twice without harm; supabase/tests/run.sh reruns only
-- the files from 20260926071227 on.
--
-- Stickies: notes visitors leave on the JM/OS desktop. A note only shows
-- up once it's approved (the next migration shows them right away).
-- Presence (the online count and cursors) uses Realtime channels and
-- needs no table.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(trim(body)) between 1 and 280),
  name text not null default '' check (char_length(name) <= 40),
  color text not null default 'yellow'
    check (color in ('yellow', 'blue', 'green', 'pink', 'purple', 'gray')),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index notes_approved_created_at on public.notes (created_at desc) where approved;

alter table public.notes enable row level security;

create policy "Approved notes are public"
  on public.notes for select
  to anon, authenticated
  using (approved);

create policy "Anyone can leave a note for review"
  on public.notes for insert
  to anon, authenticated
  with check (approved = false);

-- Visitors can only write the note itself, never `approved` or the id.
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
