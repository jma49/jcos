-- Chat rooms and private conversations.
--
-- Run this once in the Supabase SQL editor of a project set up with an
-- earlier supabase/schema.sql (schema.sql itself already includes it). It
-- needs 20260926040851_accounts_chat.sql and can be run again safely.
--
-- • Rooms: public.chat_rooms lists the public rooms, in order. Everyone can
--   read them; add, rename or reorder rooms in the Table editor. The Lobby
--   holds every message from before rooms.
-- • Private conversations: a room named `dm:<id>:<id>` from two members'
--   account ids (the smaller first). Only those two can read or write it,
--   and Realtime only delivers it to them.
-- • chat_activity(): the newest message's time in each room the caller
--   can read, for unread markers.

create table if not exists public.chat_rooms (
  id text primary key check (id ~ '^[a-z0-9-]{2,24}$'),
  name text not null check (char_length(name) between 1 and 24),
  topic text not null default '' check (char_length(topic) <= 80),
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.chat_rooms enable row level security;

drop policy if exists "Rooms are public" on public.chat_rooms;
create policy "Rooms are public"
  on public.chat_rooms for select
  to anon, authenticated
  using (true);

revoke all on public.chat_rooms from anon, authenticated;
grant select (id, name, topic, position) on public.chat_rooms to anon, authenticated;

insert into public.chat_rooms (id, name, topic, position) values
  ('lobby', 'Lobby', 'Everyone, about anything', 0),
  ('music', 'Music', 'What’s on your iPod', 1),
  ('dev', 'Dev', 'Code, tools and testing', 2),
  ('photography', 'Photography', 'Pictures and places', 3)
on conflict (id) do nothing;

alter table public.chat_messages add column if not exists room text not null default 'lobby';

alter table public.chat_messages drop constraint if exists chat_messages_room_shape;
alter table public.chat_messages add constraint chat_messages_room_shape
  check (room ~ '^([a-z0-9-]{2,24}|dm:[0-9a-f-]{36}:[0-9a-f-]{36})$');

create index if not exists chat_messages_room_visible on public.chat_messages (room, created_at desc) where not hidden;

-- Whether the caller may read a room: any public room, or a private
-- conversation they're one of the two members of.
create or replace function public.chat_can_read(target text)
returns boolean
language sql
stable
set search_path = public
as $$
  select target not like 'dm:%'
    or (auth.uid() is not null
        and auth.uid()::text in (split_part(target, ':', 2), split_part(target, ':', 3)))
$$;

-- Whether the caller may write to a room: a public room that exists, or a
-- private conversation between them and another member, named in order.
create or replace function public.chat_can_write(target text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when target like 'dm:%' then
      auth.uid() is not null
      and auth.uid()::text in (split_part(target, ':', 2), split_part(target, ':', 3))
      and split_part(target, ':', 2) collate "C" < split_part(target, ':', 3) collate "C"
      and (select count(*) from public.profiles p
           where p.id::text in (split_part(target, ':', 2), split_part(target, ':', 3))) = 2
    else exists (select 1 from public.chat_rooms r where r.id = target)
  end
$$;

revoke all on function public.chat_can_read(text) from public;
revoke all on function public.chat_can_write(text) from public;
grant execute on function public.chat_can_read(text) to anon, authenticated;
grant execute on function public.chat_can_write(text) to authenticated;

drop policy if exists "Chat is public" on public.chat_messages;
drop policy if exists "Rooms are public, conversations private" on public.chat_messages;
create policy "Rooms are public, conversations private"
  on public.chat_messages for select
  to anon, authenticated
  using (not hidden and public.chat_can_read(room));

drop policy if exists "Members can talk" on public.chat_messages;
create policy "Members can talk"
  on public.chat_messages for insert
  to authenticated
  with check (user_id = auth.uid() and public.chat_can_write(room));

revoke all on public.chat_messages from anon, authenticated;
grant select (id, user_id, body, room, created_at) on public.chat_messages to anon, authenticated;
grant insert (body, room) on public.chat_messages to authenticated;
grant delete on public.chat_messages to authenticated;

create or replace function public.chat_activity()
returns table (room text, last_at timestamptz)
language sql
stable
set search_path = public
as $$
  select m.room, max(m.created_at)
  from public.chat_messages m
  -- Row-level security leaves out hidden messages and others' conversations.
  group by m.room
$$;

revoke all on function public.chat_activity() from public;
grant execute on function public.chat_activity() to anon, authenticated;
