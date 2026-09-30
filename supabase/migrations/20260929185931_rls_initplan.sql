-- Policies ask who the caller is once per statement, not once per row.
-- Written as `auth.uid()`, Postgres calls it again for every row a policy
-- looks at; as `(select auth.uid())` it's an init plan, worked out once.
-- The rules are the same: only how often the question is asked changes.
-- Supabase's performance advisor flagged these seven (auth_rls_initplan);
-- rules.sql now checks that no policy asks per row.
--
-- Applied with `supabase db push` after 20260929160000_home.sql
-- (schema.sql already includes it). It can be run again safely.

drop policy if exists "Members can leave notes" on public.notes;
create policy "Members can leave notes"
  on public.notes for insert
  to authenticated
  with check (approved and user_id = (select auth.uid()));

drop policy if exists "Members can take their notes down" on public.notes;
create policy "Members can take their notes down"
  on public.notes for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Anyone can react" on public.soapbox_reactions;
create policy "Anyone can react"
  on public.soapbox_reactions for insert
  to anon, authenticated
  with check (
    exists (select 1 from public.soapbox_posts p where p.id = post_id)
    and ((select auth.uid()) is null or visitor = 'user:' || (select auth.uid()))
  );

drop policy if exists "Members can change their reaction" on public.soapbox_reactions;
create policy "Members can change their reaction"
  on public.soapbox_reactions for update
  to authenticated
  using (visitor = 'user:' || (select auth.uid()))
  with check (visitor = 'user:' || (select auth.uid()));

drop policy if exists "Members can take their reaction back" on public.soapbox_reactions;
create policy "Members can take their reaction back"
  on public.soapbox_reactions for delete
  to authenticated
  using (visitor = 'user:' || (select auth.uid()));

drop policy if exists "Members can talk" on public.chat_messages;
create policy "Members can talk"
  on public.chat_messages for insert
  to authenticated
  with check (user_id = (select auth.uid()) and public.chat_can_write(room));

drop policy if exists "Members can take their messages back" on public.chat_messages;
create policy "Members can take their messages back"
  on public.chat_messages for delete
  to authenticated
  using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
