-- Moderation by Telegram: each new Stickies note and each message in a
-- public chat room is sent to the Soapbox bot, which forwards it to the
-- owner with a Hide button. Private conversations are never sent.
--
-- Run this once in the Supabase SQL editor of a project set up with an
-- earlier supabase/schema.sql (schema.sql itself already includes it). It
-- can be run again safely. Nothing else to set up: the bot registers its
-- own address (and a secret for these calls) the next time the owner
-- messages it, and /watch off turns it off.
--
-- The notice is sent with pg_net after the row is saved; if it can't be
-- sent, the note or message is saved all the same.

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net isn''t available here (%); moderation notices stay off.', sqlerrm;
end;
$$;

-- Sends one row to the bot, if the bot has registered.
create or replace function private.moderation_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  url text := (select value from private.secrets where name = 'moderation_url');
  secret text := (select value from private.secrets where name = 'moderation_secret');
  payload jsonb;
begin
  if url is null or secret is null then
    return new;
  end if;
  if tg_table_name = 'notes' then
    payload := jsonb_build_object('kind', 'note', 'id', new.id::text, 'author', new.name, 'text', new.body);
  else
    if new.room like 'dm:%' then
      return new;
    end if;
    payload := jsonb_build_object(
      'kind', 'chat',
      'id', new.id::text,
      'author', (select username from public.profiles where id = new.user_id),
      'text', new.body,
      'room', new.room
    );
  end if;
  perform net.http_post(
    url := url,
    body := payload,
    headers := jsonb_build_object('content-type', 'application/json', 'x-moderation-secret', secret)
  );
  return new;
exception when others then
  -- A notice is never worth losing the note or message over.
  return new;
end;
$$;

revoke all on function private.moderation_notify() from public, anon, authenticated;

drop trigger if exists moderation_notify on public.notes;
create trigger moderation_notify
  after insert on public.notes
  for each row execute function private.moderation_notify();

drop trigger if exists moderation_notify on public.chat_messages;
create trigger moderation_notify
  after insert on public.chat_messages
  for each row execute function private.moderation_notify();

-- The bot turns notices on (with its own address) or off. Turning on
-- keeps an existing secret, so notices already on their way still check.
create or replace function public.moderation_register(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_url is null then
    delete from private.secrets where name = 'moderation_url';
    return;
  end if;
  insert into private.secrets (name, value) values ('moderation_url', p_url)
  on conflict (name) do update set value = excluded.value;
  insert into private.secrets (name, value)
  values ('moderation_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (name) do nothing;
end;
$$;

-- Whether a notice really came from this database.
create or replace function public.moderation_check(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from private.secrets where name = 'moderation_secret' and value = p_secret)
$$;

revoke all on function public.moderation_register(text) from public, anon, authenticated;
revoke all on function public.moderation_check(text) from public, anon, authenticated;
grant execute on function public.moderation_register(text) to service_role;
grant execute on function public.moderation_check(text) to service_role;

notify pgrst, 'reload schema';
