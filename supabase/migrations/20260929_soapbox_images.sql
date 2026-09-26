-- Soapbox photos: posts can carry pictures sent to the Telegram bot.
--
-- Run this once in the Supabase SQL editor of a project set up with an
-- earlier supabase/schema.sql (schema.sql itself already includes it). It
-- needs 20260926_soapbox.sql and can be run again safely.
--
-- • soapbox_posts.images: the pictures, in order, as
--   [{ "url", "width", "height", "message" }] (message: the Telegram
--   message each came from). A post can be pictures alone, without text.
-- • soapbox_posts.media_group_id: Telegram sends an album as one message
--   per picture; they share this id and become one post.
-- • soapbox_add_images(): adds a picture to its post, making the post if
--   it's the first, in one statement, so an album's messages can arrive
--   at once. Only the bot (service role) calls it.
-- • The "soapbox" storage bucket holds the pictures, readable by anyone
--   who has a picture's address; only the service role writes to it.
--   On some projects the insert into storage.buckets below doesn't take;
--   the bot then makes the bucket itself on the first photo (or make it
--   in Storage › New bucket: "soapbox", public).

alter table public.soapbox_posts add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.soapbox_posts add column if not exists media_group_id text unique;

alter table public.soapbox_posts drop constraint if exists soapbox_posts_images_shape;
alter table public.soapbox_posts add constraint soapbox_posts_images_shape
  check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 10);

-- Text up to 2000 characters, and some text unless there are pictures.
alter table public.soapbox_posts drop constraint if exists soapbox_posts_body_check;
alter table public.soapbox_posts drop constraint if exists soapbox_posts_body_shape;
alter table public.soapbox_posts add constraint soapbox_posts_body_shape
  check (char_length(trim(body)) <= 2000 and (char_length(trim(body)) >= 1 or jsonb_array_length(images) > 0));

grant select (id, body, kind, place, weather, images, created_at) on public.soapbox_posts to anon, authenticated;

create or replace function public.soapbox_add_images(
  p_group text,
  p_message bigint,
  p_body text,
  p_kind text,
  p_place text,
  p_weather text,
  p_images jsonb
)
returns table (id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_group is null then
    return query
      insert into public.soapbox_posts (body, kind, place, weather, telegram_message_id, images)
      values (coalesce(p_body, ''), p_kind, p_place, p_weather, p_message, p_images)
      returning soapbox_posts.id, true;
    return;
  end if;
  -- The first picture of an album makes the post; the rest join it. The
  -- caption comes with one of them, not necessarily the first to arrive.
  return query
    insert into public.soapbox_posts as p (body, kind, place, weather, telegram_message_id, media_group_id, images)
    values (coalesce(p_body, ''), p_kind, p_place, p_weather, p_message, p_group, p_images)
    on conflict (media_group_id) do update
      set images = p.images || excluded.images,
          body = case when trim(excluded.body) <> '' then excluded.body else p.body end,
          kind = case when trim(excluded.body) <> '' then excluded.kind else p.kind end,
          telegram_message_id = case when trim(excluded.body) <> '' then excluded.telegram_message_id else p.telegram_message_id end
    returning p.id, (xmax = 0);
end;
$$;

revoke all on function public.soapbox_add_images(text, bigint, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.soapbox_add_images(text, bigint, text, text, text, text, jsonb) to service_role;

-- The bucket. Some projects refuse this insert, and an error here used to
-- undo everything above; now it's only a notice, and the bot makes the
-- bucket itself on the first photo.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('soapbox', 'soapbox', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
exception when others then
  raise notice 'Couldn''t make the soapbox bucket here (%); the bot will make it.', sqlerrm;
end;
$$;

-- PostgREST picks up the new function and column; Supabase usually does
-- this by itself after a schema change, but not always.
notify pgrst, 'reload schema';
