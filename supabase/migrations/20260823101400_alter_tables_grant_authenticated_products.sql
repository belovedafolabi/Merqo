-- Table-level grants for this milestone's new tables, per
-- 20260822095000's own rule: a GRANT here plus the matching RLS policy is
-- what actually makes a table reachable by `authenticated` via PostgREST/
-- supabase-js. `product_prices` deliberately gets SELECT only — writes go
-- exclusively through the record_product_price() RPC (granted separately in
-- 20260823101200_alter_product_prices_add_policies_and_functions.sql),
-- mirroring audit_logs' append-only grant shape exactly.
grant select, insert, update on public.categories to authenticated;
grant select, insert, update on public.products to authenticated;
grant select, insert, update on public.product_variants to authenticated;
grant select, insert, update, delete on public.product_images to authenticated;
grant select, insert, update, delete on public.branch_price_overrides to authenticated;
grant select on public.product_prices to authenticated;
