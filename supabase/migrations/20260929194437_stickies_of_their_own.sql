-- Stickies of one's own: each member's own sticky notes, on their own
-- desktop (and under Stickies › Yours on a phone), which only they read
-- and write. The Stickies wall (public.notes) stays everyone's guestbook.
-- Planned as Jincheng's alone; Jincheng decided (2026-09-29) that every
-- account keeps its own instead.
--
-- - body: what's written, 4,000 characters at most; color: one of
--   Tiger's six; x, y, width, height, collapsed: where it sits.
-- - version counts saves of the text alone, so a note moved in one tab
--   doesn't put the words being typed into it in another out of date; a
--   save of the text names the version it was typed over.
-- - At most sticky_limit notes a member (50), counted under an advisory
--   lock for that member.
--
-- Applied with `supabase db push` after
-- 20260929192005_home_from_telegram.sql (schema.sql already includes
-- it). It can be run again safely.

create table if not exists public.stickies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  color text not null default 'yellow' check (color in ('yellow', 'blue', 'green', 'pink', 'purple', 'gray')),
  -- Where it sits on the desktop, in CSS pixels from its top left corner, and its size.
  x int not null default 60 check (x between 0 and 10000),
  y int not null default 60 check (y between 0 and 10000),
  width int not null default 220 check (width between 120 and 900),
  height int not null default 180 check (height between 60 and 900),
  collapsed boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stickies_member on public.stickies (user_id, created_at);

alter table public.stickies enable row level security;

drop policy if exists "A member's stickies are theirs alone" on public.stickies;
create policy "A member's stickies are theirs alone" on public.stickies for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Visitors have nothing to ask for. Whose a note is, its version and its
-- times are the database's.
revoke all on public.stickies from anon, authenticated;
grant select (id, body, color, x, y, width, height, collapsed, version, created_at, updated_at) on public.stickies to authenticated;
grant insert (body, color, x, y, width, height, collapsed) on public.stickies to authenticated;
grant update (body, color, x, y, width, height, collapsed) on public.stickies to authenticated;
grant delete on public.stickies to authenticated;
grant select, insert, update, delete on public.stickies to service_role;

-- A save of the text counts; moving, sizing, colouring or collapsing a note doesn't.
create or replace function public.stickies_saved()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version := case when new.body is distinct from old.body then old.version + 1 else old.version end;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.stickies_saved() from public, anon, authenticated;

drop trigger if exists stickies_saved on public.stickies;
create trigger stickies_saved before update on public.stickies for each row execute function public.stickies_saved();

insert into public.music_settings (name, value) values ('sticky_limit', '50') on conflict (name) do nothing;

-- At most sticky_limit notes a member. It reads the limit, which no
-- member may, hence security definer.
create or replace function public.stickies_within_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  most int := coalesce((select (value #>> '{}')::int from public.music_settings where name = 'sticky_limit'), 50);
begin
  perform pg_advisory_xact_lock(hashtextextended('stickies:' || new.user_id::text, 0));
  if (select count(*) from public.stickies where user_id = new.user_id) >= most then
    raise exception using errcode = 'P0429', message = format('You have %s stickies already. Close one first.', most);
  end if;
  return new;
end;
$$;
revoke execute on function public.stickies_within_limit() from public, anon, authenticated;

drop trigger if exists stickies_within_limit on public.stickies;
create trigger stickies_within_limit before insert on public.stickies for each row execute function public.stickies_within_limit();

notify pgrst, 'reload schema';
