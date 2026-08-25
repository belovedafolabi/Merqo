-- RLS for public.notification_preferences. Self-scoped read/write/upsert —
-- a preference row belongs to exactly the user it configures.
create policy notification_preferences_select_self on public.notification_preferences
  for select
  using (user_id = auth.uid() and public.user_is_active());

-- THE MANDATORY-CATEGORY GUARD. Design corpus §15: "some notifications
-- should be mandatory and cannot be disabled — security events, subscription
-- expiry, account lock events." lib/notifications/notification-preferences-
-- form.tsx renders security/billing as disabled switches with a "Required"
-- badge, but that is only the friendly version — a raw PostgREST write must
-- be refused by the database itself, or the friendly version is theater.
-- This WITH CHECK is that refusal: for security or billing, both booleans
-- must be true, or the write is rejected outright.
--
-- REPEATED ON BOTH INSERT AND UPDATE — not just UPDATE. Rows are created
-- lazily (20260824100200's design), so a user's very FIRST write to a
-- mandatory category is an INSERT (there is no existing row to trigger an
-- UPDATE against). Guarding only the UPDATE policy would leave that first
-- write ungoverned — a client could set email_enabled=false on its very
-- first call and the update policy would never even run.
create policy notification_preferences_insert_self on public.notification_preferences
  for insert
  with check (
    user_id = auth.uid()
    and public.user_is_active()
    and (category not in ('security', 'billing') or (in_app_enabled and email_enabled))
  );

create policy notification_preferences_update_self on public.notification_preferences
  for update
  using (user_id = auth.uid() and public.user_is_active())
  with check (
    user_id = auth.uid()
    and (category not in ('security', 'billing') or (in_app_enabled and email_enabled))
  );

-- No delete policy or grant: a user reverts to a category's default by
-- setting both booleans back to true, not by removing the row.
