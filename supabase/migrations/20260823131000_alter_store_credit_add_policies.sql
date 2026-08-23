-- SELECT-only for both tables, mirroring inventory_balances/
-- inventory_movements and sales exactly: the sole write path is
-- record_store_credit_entry() (SECURITY DEFINER, bypasses RLS), combined
-- with never granting INSERT/UPDATE/DELETE to any application role
-- (20260823131200_alter_tables_grant_authenticated_customers.sql). That
-- pairing is what makes the ledger append-only and the cached balance
-- un-editable at the database level rather than only by convention — this
-- milestone's Acceptance Criteria require that "no code path writes a bare
-- balance value", and the absence of an UPDATE grant on
-- store_credit_accounts is what enforces it.
--
-- Visibility follows the customer (organization-wide), not the branch where
-- an entry happened, for the same reason customers_select does: credit
-- earned at one branch is spendable at another.
create policy store_credit_accounts_select on public.store_credit_accounts
  for select
  using (public.user_has_org_access(organization_id));

-- store_credit_ledger has no organization_id of its own — resolved through
-- its account, same shape as sale_items_select resolving through sales.
create policy store_credit_ledger_select on public.store_credit_ledger
  for select
  using (
    exists (
      select 1 from public.store_credit_accounts a
      where a.id = account_id
        and public.user_has_org_access(a.organization_id)
    )
  );
