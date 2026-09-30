-- chat_can_write() is for members: visitors never write to chat. The chat
-- rooms migration revoked it from `public` only, but Supabase grants every
-- function made in public to anon and authenticated by default, so
-- visitors could call it (the Security Advisor's
-- anon_security_definer_function_executable). It only says whether a room
-- can be written to, so nothing leaked; members keep it, as the chat
-- policy asks it for them. supabase/tests/stubs.sql now makes the same
-- default grants, and rules.sql checks which such functions each role may
-- call.
--
-- Applied with `supabase db push` after 20260929185931_rls_initplan.sql
-- (schema.sql already includes it). It can be run again safely.

revoke execute on function public.chat_can_write(text) from anon;
