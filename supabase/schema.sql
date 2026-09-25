-- Stickies: notes visitors leave on the JM/OS desktop.
--
-- Run this once in the Supabase SQL editor. The browser talks to the table
-- directly with the public anon key, so row-level security does the work:
-- anyone may add a note, but a note only shows up once it's approved. To
-- approve one, set `approved` to true in the Table editor.
--
-- Presence (the online count and cursors) uses Realtime channels and needs
-- no table.

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
