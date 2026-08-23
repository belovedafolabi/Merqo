-- Table-level grants for this milestone's new tables, per 20260822095000's
-- own rule: a GRANT here plus the matching RLS policy is what makes a table
-- reachable by `authenticated` via PostgREST/supabase-js.
--
-- sales/sale_items/payments/returns/return_items/refunds are SELECT only —
-- their real write paths (create_sale()/create_return()/request_refund()/
-- decide_refund()) are SECURITY DEFINER and bypass grants entirely, same
-- append-only-via-RPC shape as inventory_movements/stock_transfers. This is
-- what makes a completed sale row (and every record chained off it)
-- impossible to UPDATE/DELETE through any authenticated code path, per this
-- milestone's own Database Changes requirement.
--
-- held_sales/held_sale_items are ordinary mutable draft tables
-- (20260823120600/700's own comments) — select, insert, and delete, no
-- update (a held line is dropped and re-added, never edited in place,
-- keeping the mutation surface as small as record_inventory_movement()'s
-- own "one thing changes, one way" precedent).
grant select on public.sales to authenticated;
grant select on public.sale_items to authenticated;
grant select on public.payments to authenticated;
grant select on public.returns to authenticated;
grant select on public.return_items to authenticated;
grant select on public.refunds to authenticated;

grant select, insert, delete on public.held_sales to authenticated;
grant select, insert, delete on public.held_sale_items to authenticated;
