-- iCal of one's own: each member's own events and to-dos, which only they
-- read and write, as with their stickies (Jincheng decided on 2026-09-29
-- that every account keeps its own). iCal shows them as Tiger's did: the
-- calendars on the left, the month in the middle, To Do on the right.
--
-- - events: a title, a calendar (Home or Work, the two Tiger's iCal
--   started with), a day, and either all day or a time it starts and
--   ends, in minutes after midnight, as a paper calendar keeps them (the
--   day and times where the member is); notes.
-- - todos: a title, a calendar, a priority (0 none, 1 low, 2 medium,
--   3 high), perhaps a day it's due, and whether it's done; when it was
--   done is the database's.
-- - At most event_limit events (5,000) and todo_limit to-dos (1,000) a
--   member, counted under an advisory lock for that member.
--
-- Applied with `supabase db push` after
-- 20260929194437_stickies_of_their_own.sql (schema.sql already includes
-- it). It can be run again safely.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title) and title !~ '[[:cntrl:]]'),
  calendar text not null default 'home' check (calendar in ('home', 'work')),
  day date not null check (day between date '2000-01-01' and date '2100-12-31'),
  starts int check (starts between 0 and 1439),
  ends int check (ends between 1 and 1440),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- All day (no times), or a start and an end after it.
  constraint events_times check ((starts is null and ends is null) or (starts is not null and ends is not null and ends > starts))
);
create index if not exists events_member_day on public.events (user_id, day);

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title) and title !~ '[[:cntrl:]]'),
  calendar text not null default 'home' check (calendar in ('home', 'work')),
  priority int not null default 0 check (priority between 0 and 3),
  due date check (due between date '2000-01-01' and date '2100-12-31'),
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists todos_member on public.todos (user_id, created_at);

alter table public.events enable row level security;
alter table public.todos enable row level security;

drop policy if exists "A member's events are theirs alone" on public.events;
create policy "A member's events are theirs alone" on public.events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "A member's to-dos are theirs alone" on public.todos;
create policy "A member's to-dos are theirs alone" on public.todos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Visitors have nothing to ask for. Whose a row is, and its times, are the database's.
revoke all on public.events, public.todos from anon, authenticated;
grant select (id, title, calendar, day, starts, ends, notes, created_at, updated_at) on public.events to authenticated;
grant insert (title, calendar, day, starts, ends, notes) on public.events to authenticated;
grant update (title, calendar, day, starts, ends, notes) on public.events to authenticated;
grant delete on public.events to authenticated;
grant select (id, title, calendar, priority, due, done, done_at, created_at, updated_at) on public.todos to authenticated;
grant insert (title, calendar, priority, due, done) on public.todos to authenticated;
grant update (title, calendar, priority, due, done) on public.todos to authenticated;
grant delete on public.todos to authenticated;
grant select, insert, update, delete on public.events, public.todos to service_role;

-- A change is stamped; a to-do knows when it was done, and forgets when it isn't.
create or replace function public.calendar_saved()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  if tg_table_name = 'todos' then
    new.done_at := case when not new.done then null when tg_op = 'UPDATE' and old.done then old.done_at else now() end;
  end if;
  return new;
end;
$$;
revoke execute on function public.calendar_saved() from public, anon, authenticated;

drop trigger if exists events_saved on public.events;
create trigger events_saved before update on public.events for each row execute function public.calendar_saved();
drop trigger if exists todos_saved on public.todos;
create trigger todos_saved before insert or update on public.todos for each row execute function public.calendar_saved();

insert into public.music_settings (name, value) values ('event_limit', '5000'), ('todo_limit', '1000') on conflict (name) do nothing;

-- At most event_limit events and todo_limit to-dos a member. It reads the
-- limits, which no member may, hence security definer.
create or replace function public.calendar_within_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_events boolean := tg_table_name = 'events';
  most int := coalesce((select (value #>> '{}')::int from public.music_settings where name = case when is_events then 'event_limit' else 'todo_limit' end), case when is_events then 5000 else 1000 end);
  counted int;
begin
  perform pg_advisory_xact_lock(hashtextextended(tg_table_name || ':' || new.user_id::text, 0));
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into counted using new.user_id;
  if counted >= most then
    raise exception using errcode = 'P0429', message = case
      when is_events then format('Your calendar holds %s events already. Delete some first.', most)
      else format('You have %s to-dos already. Delete some you''ve done first.', most) end;
  end if;
  return new;
end;
$$;
revoke execute on function public.calendar_within_limit() from public, anon, authenticated;

drop trigger if exists events_within_limit on public.events;
create trigger events_within_limit before insert on public.events for each row execute function public.calendar_within_limit();
drop trigger if exists todos_within_limit on public.todos;
create trigger todos_within_limit before insert on public.todos for each row execute function public.calendar_within_limit();

notify pgrst, 'reload schema';
