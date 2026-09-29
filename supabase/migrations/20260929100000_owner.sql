-- Jincheng's account is the owner.
--
-- The secret base has rooms only Jincheng can enter, and a few shared
-- things only Jincheng may change (the owner's ratings and playlists, a
-- song's lyrics timing). private.owners holds Jincheng's account id;
-- public.is_owner() says whether the caller is in it. Private tables use
-- it in their row-level security as `(select public.is_owner())`, so it's
-- asked once per statement, not once per row; functions that change
-- shared data check it. The browser asks it only to decide what to show:
-- the database keeps the doors shut.
--
-- Run this once in the Supabase SQL editor (schema.sql already includes
-- it), then add Jincheng's account, once, with its username:
--
--   insert into private.owners (user_id)
--   select id from auth.users where email = '<username>@users.majincheng.com'
--   on conflict do nothing;
--
-- The Security Advisor lists is_owner() as a SECURITY DEFINER function
-- visitors and members can call, on purpose: it answers only whether the
-- caller is the owner, never who is. Policies visitors meet call it, so
-- they need the right to.
--
-- It can be run again safely.

create schema if not exists private;

create table if not exists private.owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table private.owners enable row level security;
revoke all on private.owners from public, anon, authenticated;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from private.owners where user_id = auth.uid());
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;

notify pgrst, 'reload schema';
