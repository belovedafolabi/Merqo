-- Table-level grants for this milestone's new tables, per 20260822095000's
-- own rule: a GRANT here plus the matching RLS policy is what makes a table
-- reachable by `authenticated` via PostgREST/supabase-js.
--
-- `customers` is ordinary mutable tenant data — select, insert, and update,
-- no delete (archiving is an UPDATE of `archived_at`), same shape as
-- categories/products.
--
-- Everything else is SELECT only. store_credit_accounts is deliberately in
-- that list despite being a mutable cache: withholding UPDATE at the grant
-- level, not just via RLS, is what makes this milestone's Acceptance
-- Criterion "no code path writes a bare balance value" a property of the
-- database rather than a code-review promise. The balance can only ever
-- change inside record_store_credit_entry(), in the same transaction as the
-- ledger row that justifies it — which is exactly the drift this
-- milestone's Risks section warns about, closed off structurally.
--
-- store_credit_ledger/layaways/layaway_items/layaway_payments follow
-- sales/inventory_movements' append-only-via-RPC precedent for the same
-- reason: their write paths (record_store_credit_entry()/create_layaway()/
-- record_layaway_payment()/cancel_layaway()) are SECURITY DEFINER and
-- bypass grants entirely, so no authenticated code path can UPDATE or
-- DELETE a recorded financial entry.
grant select, insert, update on public.customers to authenticated;

grant select on public.store_credit_accounts to authenticated;
grant select on public.store_credit_ledger to authenticated;
grant select on public.layaways to authenticated;
grant select on public.layaway_items to authenticated;
grant select on public.layaway_payments to authenticated;
