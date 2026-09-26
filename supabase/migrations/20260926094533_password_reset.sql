-- Password reset through the recovery address: a member who has one asks
-- for a link in the Account window, the account-recovery Edge Function
-- emails it (with Resend), and the link lets them choose a new password.
-- Members can also add, change or remove their recovery address.
--
-- Run this once in the Supabase SQL editor of a project set up with an
-- earlier supabase/schema.sql (schema.sql itself already includes it). It
-- can be run again safely. Then deploy the function; see
-- supabase/functions/account-recovery/README.md.
--
-- Only a hash of each link's token is kept. A link works once, for 30
-- minutes, and using it retires the account's other links. At most three
-- links an hour go out for any account.

create table if not exists private.password_resets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table private.password_resets enable row level security;
revoke all on private.password_resets from public, anon, authenticated;

create index if not exists password_resets_user on private.password_resets (user_id, requested_at);

-- A link is asked for: returns the address to send it to, or null when
-- the account doesn't exist, has no recovery address, or has asked too
-- often. The function answers the visitor the same way in every case.
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
  if (select count(*) from private.password_resets
        where user_id = uid and requested_at > now() - interval '1 hour') >= 3 then
    return null;
  end if;
  insert into private.password_resets (user_id, token_hash, expires_at)
    values (uid, p_token_hash, now() + interval '30 minutes');
  return address;
end;
$$;

-- Whose a link is, while it still works (for "a new password for …").
create or replace function public.recovery_check(p_token_hash text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.username
    from private.password_resets r
    join public.profiles p on p.id = r.user_id
    where r.token_hash = p_token_hash and r.used_at is null and r.expires_at > now();
$$;

-- A link is used: retires it (and the account's other links) and says
-- whose it was, or nothing when it has expired or been used.
create or replace function public.recovery_consume(p_token_hash text)
returns table (user_id uuid, username text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  update private.password_resets r
    set used_at = now()
    where r.token_hash = p_token_hash and r.used_at is null and r.expires_at > now()
    returning r.user_id into uid;
  if uid is null then
    return;
  end if;
  update private.password_resets r set used_at = now() where r.user_id = uid and r.used_at is null;
  return query select p.id, p.username from public.profiles p where p.id = uid;
end;
$$;

revoke all on function public.recovery_request(text, text) from public, anon, authenticated;
revoke all on function public.recovery_check(text) from public, anon, authenticated;
revoke all on function public.recovery_consume(text) from public, anon, authenticated;
grant execute on function public.recovery_request(text, text) to service_role;
grant execute on function public.recovery_check(text) to service_role;
grant execute on function public.recovery_consume(text) to service_role;

-- A member's own recovery address: read it, or set it (null or blank
-- removes it).
create or replace function public.my_recovery_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email from private.recovery_emails where user_id = auth.uid();
$$;

create or replace function public.set_recovery_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  address text := nullif(trim(p_email), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if address is null then
    delete from private.recovery_emails where user_id = auth.uid();
  else
    insert into private.recovery_emails (user_id, email) values (auth.uid(), address)
      on conflict (user_id) do update set email = excluded.email;
  end if;
end;
$$;

revoke all on function public.my_recovery_email() from public, anon;
revoke all on function public.set_recovery_email(text) from public, anon;
grant execute on function public.my_recovery_email() to authenticated;
grant execute on function public.set_recovery_email(text) to authenticated;

notify pgrst, 'reload schema';
