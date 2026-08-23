-- First real use of Supabase Storage in this repo (branding's `logo_url` is
-- a bare text URL — its own upload flow is Milestone 11's scope). Private
-- bucket: objects are only reachable through this migration's RLS policies
-- (mirroring how every tenant table here is RLS-gated), never via public
-- URL. Paths follow docs/TAS.md §35's convention:
-- `organizations/{organization_id}/products/{product_id}/{filename}`.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', false)
on conflict (id) do nothing;

-- Scope is resolved from `product_id` (path segment 4), not the
-- `organization_id` segment (2) — joining back to products/business_units/
-- branches gives the same branch_id/business_unit_id-aware scope check
-- products_update itself uses, so a Branch-Manager-level grant (scoped to
-- one branch, not the whole organization) works here exactly as it does on
-- the products table; checking organization_id alone would incorrectly
-- reject narrower grants. `((storage.foldername(objects.name))[4])::uuid`
-- throws (and so denies) for any object path that doesn't match the
-- convention. `objects.name` is qualified rather than bare `name` because
-- the joined `business_units` table also has its own `name` column —
-- unqualified `name` inside the subquery is ambiguous between the two.
create policy product_images_storage_select on storage.objects
  for select
  using (
    bucket_id = 'product-images'
    and exists (
      select 1
      from public.products p
      join public.business_units bu on bu.id = p.business_unit_id
      where p.id = ((storage.foldername(objects.name))[4])::uuid
        and public.user_has_business_unit_access(p.business_unit_id, bu.branch_id)
    )
  );

create policy product_images_storage_insert on storage.objects
  for insert
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1
      from public.products p
      join public.business_units bu on bu.id = p.business_unit_id
      join public.branches b on b.id = bu.branch_id
      where p.id = ((storage.foldername(objects.name))[4])::uuid
        and public.user_has_business_unit_access(p.business_unit_id, bu.branch_id)
        and public.user_has_permission('products.update', b.organization_id, bu.branch_id, p.business_unit_id)
    )
  );

create policy product_images_storage_update on storage.objects
  for update
  using (
    bucket_id = 'product-images'
    and exists (
      select 1
      from public.products p
      join public.business_units bu on bu.id = p.business_unit_id
      join public.branches b on b.id = bu.branch_id
      where p.id = ((storage.foldername(objects.name))[4])::uuid
        and public.user_has_business_unit_access(p.business_unit_id, bu.branch_id)
        and public.user_has_permission('products.update', b.organization_id, bu.branch_id, p.business_unit_id)
    )
  )
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1
      from public.products p
      join public.business_units bu on bu.id = p.business_unit_id
      join public.branches b on b.id = bu.branch_id
      where p.id = ((storage.foldername(objects.name))[4])::uuid
        and public.user_has_business_unit_access(p.business_unit_id, bu.branch_id)
        and public.user_has_permission('products.update', b.organization_id, bu.branch_id, p.business_unit_id)
    )
  );

create policy product_images_storage_delete on storage.objects
  for delete
  using (
    bucket_id = 'product-images'
    and exists (
      select 1
      from public.products p
      join public.business_units bu on bu.id = p.business_unit_id
      join public.branches b on b.id = bu.branch_id
      where p.id = ((storage.foldername(objects.name))[4])::uuid
        and public.user_has_business_unit_access(p.business_unit_id, bu.branch_id)
        and public.user_has_permission('products.update', b.organization_id, bu.branch_id, p.business_unit_id)
    )
  );
