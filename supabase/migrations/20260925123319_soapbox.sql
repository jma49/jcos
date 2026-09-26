-- Soapbox: Jincheng's own notes and rants, posted from Telegram.
--
-- Run this once in the Supabase SQL editor of a project set up with an
-- earlier supabase/schema.sql (schema.sql itself already includes it). It
-- can be run again safely. It needs the `private.secrets` salt from
-- 20260925093143_one_note_per_visitor.sql.
--
-- Only the Telegram bot (supabase/functions/soapbox-bot, which uses the
-- service role key) writes posts. Visitors can read them and leave one
-- emoji reaction per post, told apart by the same salted IP hash Stickies
-- uses. To hide a post, set `hidden` to true in the Table editor, or reply
-- /delete to it in Telegram.

create table if not exists public.soapbox_posts (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(trim(body)) between 1 and 2000),
  kind text not null default 'note' check (kind in ('note', 'rant')),
  -- Where Jincheng was and the weather there, e.g. 'San Jose' and '🌤️ 64°F'.
  place text,
  weather text,
  hidden boolean not null default false,
  -- The Telegram message it came from, so edits and /delete find it.
  telegram_message_id bigint unique,
  created_at timestamptz not null default now()
);

create index if not exists soapbox_posts_visible on public.soapbox_posts (created_at desc) where not hidden;

alter table public.soapbox_posts enable row level security;

drop policy if exists "Visible posts are public" on public.soapbox_posts;
create policy "Visible posts are public"
  on public.soapbox_posts for select
  to anon, authenticated
  using (not hidden);

-- Read-only for visitors; no insert, update or delete policies.
revoke all on public.soapbox_posts from anon, authenticated;
grant select (id, body, kind, place, weather, created_at) on public.soapbox_posts to anon, authenticated;

create table if not exists public.soapbox_reactions (
  post_id uuid not null references public.soapbox_posts (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '😂', '🫂', '🔥')),
  -- A salted hash of the visitor's IP address; never readable through the API.
  visitor text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, visitor)
);

alter table public.soapbox_reactions enable row level security;

drop policy if exists "Reactions are public" on public.soapbox_reactions;
create policy "Reactions are public"
  on public.soapbox_reactions for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can react" on public.soapbox_reactions;
create policy "Anyone can react"
  on public.soapbox_reactions for insert
  to anon, authenticated
  with check (true);

-- Visitors see which emoji each post got, not who gave them.
revoke all on public.soapbox_reactions from anon, authenticated;
grant select (post_id, emoji) on public.soapbox_reactions to anon, authenticated;
grant insert (post_id, emoji) on public.soapbox_reactions to anon, authenticated;

-- Fills in `visitor` from the request's IP address. Without an address a
-- reaction can't be told apart, so it's refused.
create or replace function public.soapbox_reaction_visitor()
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
    raise exception 'Can''t tell who is reacting.';
  end if;
  new.visitor := encode(sha256(convert_to(salt || address, 'UTF8')), 'hex');
  if exists (select 1 from public.soapbox_posts where id = new.post_id and hidden) then
    raise exception 'No such post.';
  end if;
  return new;
end;
$$;

drop trigger if exists soapbox_reaction_visitor on public.soapbox_reactions;
create trigger soapbox_reaction_visitor
  before insert on public.soapbox_reactions
  for each row execute function public.soapbox_reaction_visitor();

-- The bot's own settings, such as the place posts are stamped with
-- (changed with /at <city>). Only the service role can reach it.
create table if not exists public.soapbox_settings (
  name text primary key,
  value jsonb not null
);
alter table public.soapbox_settings enable row level security;
revoke all on public.soapbox_settings from anon, authenticated;
