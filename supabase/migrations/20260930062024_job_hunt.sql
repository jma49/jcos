-- Job Hunt: the companies Jincheng has applied to, and what Mail said
-- about each. When Jincheng asks, Claude reads Gmail, Jincheng checks what
-- it found, and scripts/job-hunt-import.mjs writes it here
-- (private.import_job_hunt). In the app Jincheng moves them along, adds
-- one by hand, renames, notes or deletes. Only Jincheng reads or writes
-- the rows (public.is_owner()). Jincheng decided on 2026-09-29 that
-- visitors see only the numbers, how many are at each stage and how far
-- they got (public.job_hunt_totals()), never a company.
--
-- - job_applications: the company and the role (one row to a pair,
--   whatever their case); the stage (applied, assessment, interviewing,
--   offer, closed) and, once closed, why (rejected, withdrew, no_reply,
--   declined); the furthest it got, which closing doesn't undo, for the
--   funnel; the day it was applied for, where (Greenhouse, Lever…), where
--   the job is, the posting, Jincheng's notes, and a version a save names.
-- - job_events: one row to a message Mail had about it: what it said
--   (applied, assessment, interview, offer, rejection, withdrawal,
--   reminder, other), when, its subject, and the Gmail thread and message
--   it came from, so reading one message again adds nothing. Only the
--   import writes them.
-- - At most job_limit applications (2,000) and job_event_limit messages
--   (20,000), counted under an advisory lock.
--
-- Applied with `supabase db push` after
-- 20260929202730_ical_of_their_own.sql (schema.sql already includes it).
-- It can be run again safely. The Security Advisor lists
-- public.job_hunt_totals() as a security definer function visitors can
-- call: it is, on purpose, and it answers only counts.

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  company text not null check (char_length(company) between 1 and 120 and company = btrim(company) and company !~ '[[:cntrl:]]'),
  role text not null default '' check (char_length(role) <= 160 and role = btrim(role) and role !~ '[[:cntrl:]]'),
  stage text not null default 'applied' check (stage in ('applied', 'assessment', 'interviewing', 'offer', 'closed')),
  outcome text check (outcome in ('rejected', 'withdrew', 'no_reply', 'declined')),
  reached text not null default 'applied' check (reached in ('applied', 'assessment', 'interviewing', 'offer')),
  applied_on date not null default current_date check (applied_on between date '2000-01-01' and date '2100-12-31'),
  source text not null default '' check (char_length(source) <= 40 and source = btrim(source) and source !~ '[[:cntrl:]]'),
  location text not null default '' check (char_length(location) <= 80 and location = btrim(location) and location !~ '[[:cntrl:]]'),
  posting text not null default '' check (posting = '' or (char_length(posting) <= 500 and posting ~ '^https?://[^[:space:][:cntrl:]]+$')),
  notes text not null default '' check (char_length(notes) <= 4000),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Why it closed, only once it has.
  constraint job_applications_outcome check (outcome is null or stage = 'closed')
);
-- One row to a company and a role, whatever their case.
create unique index if not exists job_applications_pair on public.job_applications (lower(company), lower(role));

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications (id) on delete cascade,
  kind text not null check (kind in ('applied', 'assessment', 'interview', 'offer', 'rejection', 'withdrawal', 'reminder', 'other')),
  happened_at timestamptz not null,
  subject text not null default '' check (char_length(subject) <= 300 and subject !~ '[[:cntrl:]]'),
  gmail_thread text check (gmail_thread ~ '^[0-9a-f]{8,32}$'),
  gmail_message text unique check (gmail_message ~ '^[0-9a-f]{8,32}$'),
  created_at timestamptz not null default now()
);
create index if not exists job_events_application on public.job_events (application_id, happened_at);

alter table public.job_applications enable row level security;
alter table public.job_events enable row level security;

drop policy if exists "Jincheng's job hunt is Jincheng's alone" on public.job_applications;
create policy "Jincheng's job hunt is Jincheng's alone" on public.job_applications for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists "What Mail said is Jincheng's alone" on public.job_events;
create policy "What Mail said is Jincheng's alone" on public.job_events for select to authenticated
  using ((select public.is_owner()));

-- Visitors have nothing to ask for. How far one got, a save's version and
-- its times are the database's; the messages are the import's.
revoke all on public.job_applications, public.job_events from anon, authenticated;
grant select (id, company, role, stage, outcome, reached, applied_on, source, location, posting, notes, version, created_at, updated_at) on public.job_applications to authenticated;
grant insert (company, role, stage, outcome, applied_on, source, location, posting, notes) on public.job_applications to authenticated;
grant update (company, role, stage, outcome, applied_on, source, location, posting, notes) on public.job_applications to authenticated;
grant delete on public.job_applications to authenticated;
grant select (id, application_id, kind, happened_at, subject, gmail_thread, gmail_message) on public.job_events to authenticated;
grant select, insert, update, delete on public.job_applications, public.job_events to service_role;

-- A save counts (the version goes up, the time is now's); an application
-- gets as far as its stage, and never less far; a stage other than closed
-- has no outcome.
create or replace function public.job_saved()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ladder constant text[] := array['applied', 'assessment', 'interviewing', 'offer'];
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.updated_at := now();
    if array_position(ladder, old.reached) > array_position(ladder, new.reached) then
      new.reached := old.reached;
    end if;
  end if;
  if new.stage <> 'closed' then
    new.outcome := null;
    if array_position(ladder, new.stage) > array_position(ladder, new.reached) then
      new.reached := new.stage;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.job_saved() from public, anon, authenticated;

drop trigger if exists job_applications_saved on public.job_applications;
create trigger job_applications_saved before insert or update on public.job_applications for each row execute function public.job_saved();

insert into public.music_settings (name, value) values ('job_limit', '2000'), ('job_event_limit', '20000') on conflict (name) do nothing;

-- At most job_limit applications and job_event_limit messages. It reads
-- the limits, which Jincheng's session may not, hence security definer.
create or replace function public.job_within_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_events boolean := tg_table_name = 'job_events';
  most int := coalesce((select (value #>> '{}')::int from public.music_settings where name = case when is_events then 'job_event_limit' else 'job_limit' end), case when is_events then 20000 else 2000 end);
  counted int;
begin
  perform pg_advisory_xact_lock(hashtextextended(tg_table_name, 0));
  execute format('select count(*) from public.%I', tg_table_name) into counted;
  if counted >= most then
    raise exception using errcode = 'P0429', message = case
      when is_events then format('Job Hunt holds %s messages already.', most)
      else format('Job Hunt holds %s applications already. Delete some first.', most) end;
  end if;
  return new;
end;
$$;
revoke execute on function public.job_within_limit() from public, anon, authenticated;

drop trigger if exists job_applications_within_limit on public.job_applications;
create trigger job_applications_within_limit before insert on public.job_applications for each row execute function public.job_within_limit();
drop trigger if exists job_events_within_limit on public.job_events;
create trigger job_events_within_limit before insert on public.job_events for each row execute function public.job_within_limit();

-- What visitors see of it: how many are at each stage, how many got as
-- far as an assessment, interviews or an offer, and when it last changed.
-- Nothing that names a company.
create or replace function public.job_hunt_totals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'stages', jsonb_build_object(
      'applied', count(*) filter (where a.stage = 'applied'),
      'assessment', count(*) filter (where a.stage = 'assessment'),
      'interviewing', count(*) filter (where a.stage = 'interviewing'),
      'offer', count(*) filter (where a.stage = 'offer'),
      'closed', count(*) filter (where a.stage = 'closed')
    ),
    'reached', jsonb_build_object(
      'assessment', count(*) filter (where a.reached in ('assessment', 'interviewing', 'offer')),
      'interviewing', count(*) filter (where a.reached in ('interviewing', 'offer')),
      'offer', count(*) filter (where a.reached = 'offer')
    ),
    'updated', max(a.updated_at)
  )
  from public.job_applications a;
$$;
revoke all on function public.job_hunt_totals() from public;
grant execute on function public.job_hunt_totals() to anon, authenticated;

-- What Claude found in Mail and Jincheng checked, written in one go:
-- {"applications": [{company, role, stage, outcome, reached, applied_on,
-- source, location, posting, events: [{kind, at, subject, thread,
-- message}]}]}. An application already here is found by its company and
-- role; Mail moves it on but never back (Jincheng may have moved it
-- further by hand) and reopens nothing closed, fills in what's blank
-- without replacing what Jincheng wrote, and keeps the earliest day it
-- was applied for. A message already read is skipped. Anything malformed
-- stops the whole batch. Only scripts/job-hunt-import.mjs calls it, as the
-- database's owner; the API can't reach the private schema.
create or replace function private.import_job_hunt(batch jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  ladder constant text[] := array['applied', 'assessment', 'interviewing', 'offer'];
  item jsonb;
  message jsonb;
  app public.job_applications;
  next_stage text;
  next_reached text;
  added int := 0;
  moved int := 0;
  heard int := 0;
begin
  if jsonb_typeof(batch -> 'applications') is distinct from 'array' then
    raise exception 'Expected {"applications": [...]}';
  end if;
  for item in select value from jsonb_array_elements(batch -> 'applications') loop
    next_stage := coalesce(item ->> 'stage', 'applied');
    next_reached := coalesce(item ->> 'reached', 'applied');
    select * into app from public.job_applications
      where lower(company) = lower(btrim(item ->> 'company')) and lower(role) = lower(btrim(coalesce(item ->> 'role', '')));
    if not found then
      insert into public.job_applications (company, role, stage, outcome, reached, applied_on, source, location, posting)
      values (
        btrim(item ->> 'company'),
        btrim(coalesce(item ->> 'role', '')),
        next_stage,
        case when next_stage = 'closed' then item ->> 'outcome' end,
        next_reached,
        coalesce((item ->> 'applied_on')::date, current_date),
        btrim(coalesce(item ->> 'source', '')),
        btrim(coalesce(item ->> 'location', '')),
        btrim(coalesce(item ->> 'posting', ''))
      )
      returning * into app;
      added := added + 1;
    else
      if app.stage <> 'closed' and (next_stage = 'closed' or array_position(ladder, next_stage) > array_position(ladder, app.stage)) then
        update public.job_applications
          set stage = next_stage, outcome = case when next_stage = 'closed' then item ->> 'outcome' end
          where id = app.id;
        moved := moved + 1;
      end if;
      update public.job_applications set
        reached = case when array_position(ladder, next_reached) > array_position(ladder, reached) then next_reached else reached end,
        applied_on = least(applied_on, coalesce((item ->> 'applied_on')::date, applied_on)),
        source = case when source = '' then btrim(coalesce(item ->> 'source', '')) else source end,
        location = case when location = '' then btrim(coalesce(item ->> 'location', '')) else location end,
        posting = case when posting = '' then btrim(coalesce(item ->> 'posting', '')) else posting end
        where id = app.id
          and (array_position(ladder, next_reached) > array_position(ladder, reached)
            or (item ->> 'applied_on')::date < applied_on
            or (source = '' and coalesce(item ->> 'source', '') <> '')
            or (location = '' and coalesce(item ->> 'location', '') <> '')
            or (posting = '' and coalesce(item ->> 'posting', '') <> ''));
    end if;
    for message in select value from jsonb_array_elements(coalesce(item -> 'events', '[]'::jsonb)) loop
      insert into public.job_events (application_id, kind, happened_at, subject, gmail_thread, gmail_message)
      values (
        app.id,
        message ->> 'kind',
        (message ->> 'at')::timestamptz,
        left(regexp_replace(coalesce(message ->> 'subject', ''), '[[:cntrl:]]+', ' ', 'g'), 300),
        message ->> 'thread',
        message ->> 'message'
      )
      on conflict (gmail_message) do nothing;
      if found then
        heard := heard + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('added', added, 'moved', moved, 'messages', heard);
end;
$$;
revoke all on function private.import_job_hunt(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
