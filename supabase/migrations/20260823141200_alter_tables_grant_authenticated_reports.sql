-- Table- and function-level grants for this milestone, per 20260822095000's
-- rule: a GRANT here plus the matching RLS policy is what makes a table
-- reachable by `authenticated` via PostgREST/supabase-js.
--
-- `expenses` gets SELECT and INSERT and nothing else. Withholding UPDATE and
-- DELETE at the *grant* level, not merely via the absence of an RLS policy, is
-- what makes an expense's amount, category and date immutable as a property of
-- the database — the same structural guarantee, for the same reason, that
-- 20260823131200 gives `store_credit_accounts`. The only paths that can change
-- a recorded expense are decide_expense() and void_expense()
-- (20260823140200), both SECURITY DEFINER, both leaving the original figures
-- intact. Without this, an approved expense sitting inside a published
-- net-profit figure could be quietly edited afterwards.
--
-- `saved_reports` is ordinary mutable tenant data — select, insert, update, no
-- delete (archiving is an UPDATE of `archived_at`), the same shape as
-- `customers` and `products`.
grant select, insert on public.expenses to authenticated;
grant select, insert, update on public.saved_reports to authenticated;

-- Explicit function grants rather than relying on Postgres's default
-- grant-EXECUTE-to-PUBLIC behaviour for new functions — the standard this
-- project has applied since 20260822093300, and it matters more here than
-- usual: `anon` holding EXECUTE on a reporting function would be a
-- pre-authentication entry point into the aggregate layer. These are all
-- SECURITY INVOKER, so an anonymous caller would see nothing through RLS
-- anyway, but "deliberate" is the standard rather than "happens to be safe".
revoke execute on function public.decide_expense(uuid, boolean, text) from public;
grant execute on function public.decide_expense(uuid, boolean, text) to authenticated;

revoke execute on function public.void_expense(uuid, text) from public;
grant execute on function public.void_expense(uuid, text) to authenticated;

revoke execute on function public.report_sales_by_scope(uuid, uuid, uuid, timestamptz, timestamptz, text, int) from public;
grant execute on function public.report_sales_by_scope(uuid, uuid, uuid, timestamptz, timestamptz, text, int) to authenticated;

revoke execute on function public.report_sales_by_item(uuid, uuid, uuid, timestamptz, timestamptz, text, int) from public;
grant execute on function public.report_sales_by_item(uuid, uuid, uuid, timestamptz, timestamptz, text, int) to authenticated;

revoke execute on function public.report_sales_by_payment_method(uuid, uuid, uuid, timestamptz, timestamptz, int) from public;
grant execute on function public.report_sales_by_payment_method(uuid, uuid, uuid, timestamptz, timestamptz, int) to authenticated;

revoke execute on function public.report_accounting_aggregates(uuid, uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.report_accounting_aggregates(uuid, uuid, uuid, timestamptz, timestamptz) to authenticated;

revoke execute on function public.report_refunds(uuid, uuid, uuid, timestamptz, timestamptz, text, int) from public;
grant execute on function public.report_refunds(uuid, uuid, uuid, timestamptz, timestamptz, text, int) to authenticated;

revoke execute on function public.report_discounts(uuid, uuid, uuid, timestamptz, timestamptz, text, int) from public;
grant execute on function public.report_discounts(uuid, uuid, uuid, timestamptz, timestamptz, text, int) to authenticated;

revoke execute on function public.report_expenses(uuid, uuid, uuid, timestamptz, timestamptz, text, int) from public;
grant execute on function public.report_expenses(uuid, uuid, uuid, timestamptz, timestamptz, text, int) to authenticated;

revoke execute on function public.report_inventory_stock(uuid, uuid, uuid, boolean, int) from public;
grant execute on function public.report_inventory_stock(uuid, uuid, uuid, boolean, int) to authenticated;

revoke execute on function public.report_inventory_movements(uuid, uuid, uuid, timestamptz, timestamptz, int) from public;
grant execute on function public.report_inventory_movements(uuid, uuid, uuid, timestamptz, timestamptz, int) to authenticated;

revoke execute on function public.report_expiry(uuid, uuid, int, int) from public;
grant execute on function public.report_expiry(uuid, uuid, int, int) to authenticated;

revoke execute on function public.report_customer_transactions(uuid, uuid, uuid, timestamptz, timestamptz, int) from public;
grant execute on function public.report_customer_transactions(uuid, uuid, uuid, timestamptz, timestamptz, int) to authenticated;

revoke execute on function public.report_store_credit(uuid, timestamptz, timestamptz, int) from public;
grant execute on function public.report_store_credit(uuid, timestamptz, timestamptz, int) to authenticated;

revoke execute on function public.report_layaways(uuid, uuid, uuid, timestamptz, timestamptz, text, int) from public;
grant execute on function public.report_layaways(uuid, uuid, uuid, timestamptz, timestamptz, text, int) to authenticated;

revoke execute on function public.run_custom_report(uuid, text, text, text, text, text, text, text, uuid, uuid, timestamptz, timestamptz, text, text, int) from public;
grant execute on function public.run_custom_report(uuid, text, text, text, text, text, text, text, uuid, uuid, timestamptz, timestamptz, text, text, int) to authenticated;
