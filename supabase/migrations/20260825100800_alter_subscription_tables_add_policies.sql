-- RLS policies for the four Milestone 13 tables. Deliberately NO
-- insert/update/delete policy on ANY of them — same stance
-- notifications takes (20260824100100): every write is a SECURITY DEFINER
-- function call (20260825100600/100700), never a direct table write, so
-- "what can a caller directly INSERT/UPDATE" is zero across the board and
-- the RPCs are the only surface that needs auditing for correctness.

-- Everyone signed in needs to see the price list before renewing — it is
-- not secret.
create policy subscription_pricing_select on public.subscription_pricing
  for select
  to authenticated
  using (true);

create policy subscriptions_select on public.subscriptions
  for select
  to authenticated
  using (public.user_has_permission('subscription.view', organization_id));

create policy subscription_payments_select on public.subscription_payments
  for select
  to authenticated
  using (public.user_has_permission('subscription.view', organization_id));

-- Platform-admin only: this is the ledger of raw Paystack webhook deliveries,
-- not something an Owner needs to see.
create policy webhook_events_select on public.webhook_events
  for select
  to authenticated
  using (public.user_is_platform_admin());
