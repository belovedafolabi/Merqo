-- RLS for public.notification_preferences. Self-scoped read/write/upsert —
-- a preference row belongs to exactly the user it configures.
create policy notification_preferences_select_self on public.notification_preferences
  for select
  using (user_id = auth.uid() and public.user_is_active());

create policy notification_preferences_insert_self on public.notification_preferences
  for insert
  with check (user_id = auth.uid() and public.user_is_active());

-- THE MANDATORY-CATEGORY GUARD. Design corpus §15: "some notifications
-- should be mandatory and cannot be disabled — security events, subscription
-- expiry, account lock events." lib/notifications/notification-preferences-
-- form.tsx renders security/billing as disabled switches with a "Required"
-- badge, but that is only the friendly version — a raw PostgREST PATCH must
-- be refused by the database itself, or the friendly version is theater.
-- This WITH CHECK is that refusal: for security or billing, both booleans
-- must remain true, or the write is rejected outright.
create policy notification_preferences_update_self on public.notification_preferences
  for update
  using (user_id = auth.uid() and public.user_is_active())
  with check (
    user_id = auth.uid()
    and (category not in ('security', 'billing') or (in_app_enabled and email_enabled))
  );

-- No delete policy or grant: a user reverts to a category's default by
-- setting both booleans back to true, not by removing the row.
