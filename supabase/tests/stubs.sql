-- Just enough of a Supabase project for schema.sql to load into a plain
-- Postgres: the API's roles, auth.users and auth.uid() (read from the
-- request.jwt.claim.sub setting, which the tests set to act as someone),
-- a storage.buckets table and a pg_net stand-in that records its calls.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
grant usage on schema auth to anon, authenticated, service_role;

create schema extensions;
create publication supabase_realtime;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);

create schema net;
create table net.calls (url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.calls values (url, body, headers) returning 1::bigint $$;
-- So the tests can look at the calls while acting as the bot.
grant usage on schema net to service_role;
grant select on net.calls to service_role;
