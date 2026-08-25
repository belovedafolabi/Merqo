-- Table-level grants for the four Milestone 13 tables — SELECT only.
-- No INSERT/UPDATE/DELETE grant anywhere: every write goes through a
-- SECURITY DEFINER function (20260825100600/100700), which is unaffected by
-- table-level grants and enforces its own authorization internally. This
-- mirrors 20260824100500's identical stance for notifications.
grant select on public.subscription_pricing to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.subscription_payments to authenticated;
grant select on public.webhook_events to authenticated;
