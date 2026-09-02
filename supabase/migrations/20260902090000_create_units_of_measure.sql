-- Units of measurement for products (piece, pack, carton, kg, litre, …).
--
-- Two kinds of row in one table, distinguished by organization_id:
--   * organization_id IS NULL  -> a SYSTEM unit. Seeded here, migration/
--     seed-managed only, read-only to tenants, visible to everyone.
--   * organization_id = <org>  -> a CUSTOM unit an admin added for their
--     own organization.
--
-- A table, not a TS constant array, for the same reason business_types and
-- business_type_category_suggestions are tables: the list is configuration a
-- Super Admin can curate and a tenant can extend, never a hard-coded branch.
--
-- Org-scoped rather than business-unit-scoped (unlike categories): "carton"
-- means the same thing across a tenant's outlets, and products.unit_of_
-- measurement stays a free text column keyed by name — no product-table
-- change, no FK.
create table public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  abbreviation text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  constraint units_of_measure_name_not_blank check (length(trim(name)) > 0),
  constraint units_of_measure_abbreviation_not_blank check (length(trim(abbreviation)) > 0)
);

create index units_of_measure_organization_id_idx
  on public.units_of_measure (organization_id);

-- System names are globally unique; a tenant's custom names are unique
-- within that tenant and free up on archive (docs/architecture/
-- database-conventions.md's archived_at convention, same as categories).
create unique index units_of_measure_system_name_key
  on public.units_of_measure (lower(name))
  where organization_id is null;
create unique index units_of_measure_org_name_key
  on public.units_of_measure (organization_id, lower(name))
  where organization_id is not null and archived_at is null;

create trigger trg_units_of_measure_updated_at
  before update on public.units_of_measure
  for each row execute function public.set_updated_at();

alter table public.units_of_measure enable row level security;

-- Table-level privilege (blanket public-schema grants were stripped in
-- 20260823140000) — the policies below only filter rows once this passes.
grant select, insert, update on public.units_of_measure to authenticated;

-- Anyone authenticated sees the system list plus their own org's custom
-- units.
create policy units_of_measure_select on public.units_of_measure
  for select
  to authenticated
  using (
    organization_id is null
    or public.user_has_org_access(organization_id)
  );

-- Custom units only: a tenant can never insert or edit a system row
-- (organization_id must be their own, non-null), and needs units.manage.
create policy units_of_measure_insert on public.units_of_measure
  for insert
  to authenticated
  with check (
    organization_id is not null
    and public.user_has_org_access(organization_id)
    and public.user_has_permission('units.manage', organization_id)
  );

create policy units_of_measure_update on public.units_of_measure
  for update
  to authenticated
  using (
    organization_id is not null
    and public.user_has_org_access(organization_id)
    and public.user_has_permission('units.manage', organization_id)
  )
  with check (
    organization_id is not null
    and public.user_has_org_access(organization_id)
    and public.user_has_permission('units.manage', organization_id)
  );

-- Seeded system units — piece up to pallet, plus the common weight / volume
-- / length units and a couple of service-billing ones. Kept in sync with
-- supabase/seed.sql's identical block.
insert into public.units_of_measure (organization_id, name, abbreviation) values
  (null, 'Unit', 'unit'),
  (null, 'Piece', 'pc'),
  (null, 'Pair', 'pr'),
  (null, 'Set', 'set'),
  (null, 'Dozen', 'dz'),
  (null, 'Pack', 'pk'),
  (null, 'Bundle', 'bdl'),
  (null, 'Roll', 'roll'),
  (null, 'Sheet', 'sht'),
  (null, 'Box', 'box'),
  (null, 'Carton', 'ctn'),
  (null, 'Case', 'cs'),
  (null, 'Crate', 'crt'),
  (null, 'Tray', 'tray'),
  (null, 'Bag', 'bag'),
  (null, 'Sack', 'sack'),
  (null, 'Sachet', 'sct'),
  (null, 'Bottle', 'btl'),
  (null, 'Can', 'can'),
  (null, 'Jar', 'jar'),
  (null, 'Tube', 'tube'),
  (null, 'Tin', 'tin'),
  (null, 'Strip', 'strip'),
  (null, 'Tablet', 'tab'),
  (null, 'Capsule', 'cap'),
  (null, 'Vial', 'vial'),
  (null, 'Milligram', 'mg'),
  (null, 'Gram', 'g'),
  (null, 'Kilogram', 'kg'),
  (null, 'Tonne', 't'),
  (null, 'Millilitre', 'ml'),
  (null, 'Centilitre', 'cl'),
  (null, 'Litre', 'L'),
  (null, 'Millimetre', 'mm'),
  (null, 'Centimetre', 'cm'),
  (null, 'Metre', 'm'),
  (null, 'Square Metre', 'm2'),
  (null, 'Foot', 'ft'),
  (null, 'Yard', 'yd'),
  (null, 'Pallet', 'plt'),
  (null, 'Container', 'cont'),
  (null, 'Hour', 'hr'),
  (null, 'Day', 'day'),
  (null, 'Service', 'svc')
on conflict do nothing;

-- Permission + default role grants. Mirrors categories.manage: added to the
-- seeded catalog (so a fresh `db reset` via seed.sql matches), granted to
-- every existing Owner and Branch Manager role here so applying this
-- migration to an existing deployment is enough.
insert into public.permissions (key, resource, action, description) values
  ('units.manage', 'units', 'manage', 'Create, update, and archive units of measurement.')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'units.manage'
where r.slug in ('owner', 'branch_manager')
on conflict (role_id, permission_id) do nothing;
