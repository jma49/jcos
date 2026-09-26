-- Supabase Security Advisor findings, addressed.
--
-- 1. Trigger functions were executable over the API
--    (/rest/v1/rpc/notes_by_member and so on). PostgREST refuses to run a
--    trigger function outside a trigger, but nothing should be callable
--    that isn't meant to be. EXECUTE is only checked when a trigger is
--    created, not when it fires, so revoking it changes nothing for the
--    triggers themselves.
-- 2. notes_one_per_visitor() is gone: its trigger was dropped when notes
--    became members-only.
-- 3. username_available() runs as the caller. It only reads usernames,
--    which everyone may read anyway, so it needs no extra rights.
-- 4. my_reactions() is for members; visitors can no longer call it.
-- 5. "Anyone can react" checked nothing (WITH CHECK (true)). It now
--    requires a post the caller can see (hidden ones aren't), and a member
--    reacts only as themselves. The trigger that fills in `visitor` runs
--    first, so the check sees the finished row.
--
-- Two findings stay, on purpose:
--   - my_reactions(), my_recovery_email(), set_recovery_email() and
--     chat_can_write() are SECURITY DEFINER and callable by members. They
--     read or write only the caller's own rows, through auth.uid().
--   - Leaked password protection is an Auth setting (Pro plan): Auth >
--     Attack Protection.
--
-- Run this once in the Supabase SQL editor, after 20261002_hardening.sql
-- (schema.sql itself already includes it). It can be run again safely.

drop function if exists public.notes_one_per_visitor();

revoke all on function public.notes_flood_guard() from public, anon, authenticated;
revoke all on function public.notes_by_member() from public, anon, authenticated;
revoke all on function public.chat_flood_guard() from public, anon, authenticated;
revoke all on function public.soapbox_reaction_visitor() from public, anon, authenticated;
revoke all on function public.handle_new_account() from public, anon, authenticated;

alter function public.username_available(text) security invoker;

revoke all on function public.my_reactions() from public, anon;
grant execute on function public.my_reactions() to authenticated;

drop policy if exists "Anyone can react" on public.soapbox_reactions;
create policy "Anyone can react"
  on public.soapbox_reactions for insert
  to anon, authenticated
  with check (
    exists (select 1 from public.soapbox_posts p where p.id = post_id)
    and (auth.uid() is null or visitor = 'user:' || auth.uid())
  );

notify pgrst, 'reload schema';
