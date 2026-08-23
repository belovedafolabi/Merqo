-- Organization-scoped, not branch-scoped — the one place in the
-- transactional schema where that differs from every M06/M07/M08 table, and
-- deliberately so: this milestone's Scope requires a customer record to be
-- "shared across the organization's branches", and its Security Requirements
-- spell out that "RLS scopes access appropriately (business-wide, per the
-- customer model, rather than branch-restricted)". A Cashier at Branch B
-- must be able to find a customer created at Branch A to spend the credit
-- they earned there.
--
-- Ordinary mutable tenant data (INSERT/UPDATE, no DELETE), same shape as
-- categories_insert/update — archiving is an UPDATE of `archived_at`, so no
-- DELETE policy is needed. Unlike the ledger tables below, `customers` is
-- written through PostgREST rather than an RPC: nothing about a customer
-- record needs a lock or a derived value, so a SECURITY DEFINER function
-- would add a write path without adding a guarantee.
create policy customers_select on public.customers
  for select
  using (public.user_has_org_access(organization_id));

create policy customers_insert on public.customers
  for insert
  with check (
    public.user_has_org_access(organization_id)
    and public.user_has_permission('customers.create', organization_id)
  );

create policy customers_update on public.customers
  for update
  using (
    public.user_has_org_access(organization_id)
    and public.user_has_permission('customers.update', organization_id)
  )
  with check (
    public.user_has_org_access(organization_id)
    and public.user_has_permission('customers.update', organization_id)
  );
