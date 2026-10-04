-- iCal's events and to-dos are version-checked, as documents, the diary
-- and stickies are (#202). The same event edited on a phone and a laptop
-- used to go to whichever saved last, and the other device's change was
-- lost without a word.
--
-- - version counts saves: the trigger that stamps updated_at adds one on
--   every update, so a save names the version it was made from
--   (`update … where id = … and version = …`) and one from an older copy
--   reaches no row; iCal then says so and shows what was saved elsewhere.
-- - Members read it and never write it (no insert or update grant).
--
-- Applied with `supabase db push` after 20260930062024_job_hunt.sql
-- (schema.sql already includes it). It can be run again safely.

alter table public.events add column if not exists version int not null default 1;
alter table public.todos add column if not exists version int not null default 1;

grant select (version) on public.events, public.todos to authenticated;

-- A change is stamped and counted; a to-do knows when it was done, and forgets when it isn't.
create or replace function public.calendar_saved()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  if tg_table_name = 'todos' then
    new.done_at := case when not new.done then null when tg_op = 'UPDATE' and old.done then old.done_at else now() end;
  end if;
  return new;
end;
$$;
revoke execute on function public.calendar_saved() from public, anon, authenticated;

notify pgrst, 'reload schema';
