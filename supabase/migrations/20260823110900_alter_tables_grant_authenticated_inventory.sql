-- Table-level grants for this milestone's new tables, per 20260822095000's
-- own rule: a GRANT here plus the matching RLS policy is what makes a table
-- reachable by `authenticated` via PostgREST/supabase-js.
--
-- inventory_balances gets SELECT plus a column-restricted UPDATE (only
-- `low_stock_threshold` — see 20260823110500's own comment for why
-- `quantity`/`reserved_quantity` are deliberately excluded even at the
-- grant level, not just by RLS). inventory_movements/stock_transfers/
-- stock_transfer_items are SELECT only, matching product_prices/audit_logs'
-- append-only-via-RPC shape: their real write paths
-- (record_inventory_movement()/execute_stock_transfer()) are SECURITY
-- DEFINER and bypass grants entirely. batches is an ordinary mutable table
-- (20260823110800's own comment).
grant select, update (low_stock_threshold) on public.inventory_balances to authenticated;
grant select on public.inventory_movements to authenticated;
grant select on public.stock_transfers to authenticated;
grant select on public.stock_transfer_items to authenticated;
grant select, insert, update on public.batches to authenticated;
