-- Hardening after a review of the database's limits.
--
-- 1. Limits hold under concurrency. "Three notes a day", "eight messages
--    in 30 seconds" and "three reset links an hour" were checked by
--    counting rows and then inserting. Requests sent at the same moment
--    each counted before any had inserted, so all got through. Each check
--    now first takes a transaction-scoped advisory lock for that member
--    (or account), so a second request waits for the first to finish and
--    then counts it.
-- 2. Site-wide backstops, so that many accounts together can't flood the
--    database or the mailer: at most 120 chat messages a minute, 100 new
--    accounts an hour and 60 reset emails an hour across the site, and 3
--    reset emails an hour to any one address (a member can set any
--    address as their recovery email).
-- 3. An index for the per-member chat check, which otherwise read every
--    message ever sent, a little slower with each one.
--
-- Run this once in the Supabase SQL editor, after 20260926094533_password_reset.sql
-- (schema.sql itself already includes it). It can be run again safely.

create index if not exists chat_messages_user_created on public.chat_messages (user_id, created_at desc);
create index if not exists chat_messages_created on public.chat_messages (created_at desc);
create index if not exists profiles_created on public.profiles (created_at desc);
create index if not exists password_resets_requested on private.password_resets (requested_at desc);

-- Stickies: three notes in any 24 hours, one member's notes one at a time.
create or replace function public.notes_by_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member text := (select username from public.profiles where id = auth.uid());
begin
  if member is null then
    raise exception using errcode = '42501', message = 'Sign in to leave a note.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('notes:' || auth.uid()::text, 0));
  if (select count(*) from public.notes
      where user_id = auth.uid() and created_at > now() - interval '24 hours') >= 3 then
    raise exception using errcode = 'P0429', message = 'That’s three notes today. Come back tomorrow.';
  end if;
  new.user_id := auth.uid();
  new.name := member;
  return new;
end;
$$;

-- Chat: eight messages in 30 seconds per member, 120 a minute in all.
create or replace function public.chat_flood_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('chat:' || coalesce(auth.uid()::text, ''), 0));
  if (select count(*) from public.chat_messages
      where user_id = auth.uid() and created_at > now() - interval '30 seconds') >= 8 then
    raise exception using errcode = 'P0429', message = 'Slow down a little.';
  end if;
  if (select count(*) from public.chat_messages where created_at > now() - interval '1 minute') >= 120 then
    raise exception using errcode = 'P0429', message = 'Chat is very busy right now. Try again in a minute.';
  end if;
  return new;
end;
$$;

-- Accounts: at most 100 new ones an hour across the site.
create or replace function public.handle_new_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  name text := lower(new.raw_user_meta_data ->> 'username');
  recovery text := nullif(trim(new.raw_user_meta_data ->> 'recovery_email'), '');
begin
  if name is null or name !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'A username is 3 to 20 letters, digits or underscores.';
  end if;
  if new.email is distinct from name || '@users.majincheng.com' then
    raise exception 'Accounts are made through JM/OS.';
  end if;
  if (select count(*) from public.profiles where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many new accounts right now. Try again later.';
  end if;
  insert into public.profiles (id, username) values (new.id, name);
  if recovery is not null then
    insert into private.recovery_emails (user_id, email) values (new.id, recovery);
    -- Not left in the account's own metadata, which its session can read.
    update auth.users
      set raw_user_meta_data = raw_user_meta_data - 'recovery_email'
      where id = new.id;
  end if;
  return new;
end;
$$;

-- Reset links: three an hour per account and per address, 60 an hour in all.
create or replace function public.recovery_request(p_username text, p_token_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  address text;
begin
  select p.id, r.email into uid, address
    from public.profiles p
    join private.recovery_emails r on r.user_id = p.id
    where p.username = lower(trim(p_username));
  if uid is null then
    return null;
  end if;
  -- One request per address at a time, so the counts below can't be raced.
  perform pg_advisory_xact_lock(hashtextextended('recovery:' || lower(address), 0));
  if (select count(*) from private.password_resets
        where user_id = uid and requested_at > now() - interval '1 hour') >= 3 then
    return null;
  end if;
  if (select count(*) from private.password_resets r
        join private.recovery_emails e on e.user_id = r.user_id
        where lower(e.email) = lower(address) and r.requested_at > now() - interval '1 hour') >= 3 then
    return null;
  end if;
  if (select count(*) from private.password_resets where requested_at > now() - interval '1 hour') >= 60 then
    return null;
  end if;
  insert into private.password_resets (user_id, token_hash, expires_at)
    values (uid, p_token_hash, now() + interval '30 minutes');
  return address;
end;
$$;

revoke all on function public.recovery_request(text, text) from public, anon, authenticated;
grant execute on function public.recovery_request(text, text) to service_role;

notify pgrst, 'reload schema';
