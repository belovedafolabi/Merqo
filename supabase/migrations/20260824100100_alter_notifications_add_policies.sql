-- RLS for public.notifications. Self-scoped, following the precedent set by
-- users_update_self (20260822094400): `user_id = auth.uid()` is the entire
-- authorization rule, because a notification belongs to exactly the person
-- it was written for and no one else has a legitimate reason to read it.
--
-- NO INSERT POLICY. Every row is written by a SECURITY DEFINER notify_*()
-- function (20260824100400), which bypasses RLS entirely by design. An
-- insert policy here would only ever gate a PostgREST insert that the
-- deliberately-absent grant in 20260824100500 already blocks — writing one
-- would be a second, redundant door onto a table that must have exactly one.
--
-- NO DELETE POLICY. The inbox is append-only in effect; retention is
-- Milestone 13's scheduled sweep, not a user-initiated delete.
create policy notifications_select_self on public.notifications
  for select
  using (user_id = auth.uid() and public.user_is_active());

-- WITH CHECK repeats user_id = auth.uid() even though the grant in
-- 20260824100500 restricts UPDATE to the read_at column alone (a user
-- literally cannot supply a different user_id in the SET list). It is kept
-- for the same reason users_update_self keeps it: correct read in isolation,
-- and correct if the column grant is ever loosened without this file being
-- revisited.
create policy notifications_update_self on public.notifications
  for update
  using (user_id = auth.uid() and public.user_is_active())
  with check (user_id = auth.uid());
