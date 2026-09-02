-- Suggested starter product categories per Business Type, surfaced in the
-- category manager (components/products/category-manager-dialog.tsx) after
-- onboarding so an owner isn't staring at a blank list.
--
-- A seeded reference table, NOT a slug->list map in application code: the
-- business_types migration is explicit that a Business Type "is a
-- configuration template, never a hard-coded behavior branch" — same reason
-- business_type_capabilities is a table. This also lets a Super Admin curate
-- the lists later without a code change.
--
-- Plain suggestions only: creating a category still goes through
-- createCategory() (name uniqueness, permission check). Nothing here writes
-- to `categories`.
create table public.business_type_category_suggestions (
  id uuid primary key default gen_random_uuid(),
  business_type_id uuid not null references public.business_types(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index business_type_category_suggestions_unique
  on public.business_type_category_suggestions (business_type_id, name);

create index business_type_category_suggestions_type_idx
  on public.business_type_category_suggestions (business_type_id, sort_order);

alter table public.business_type_category_suggestions enable row level security;

-- Platform-wide reference data (it describes business_types, not a tenant's
-- rows) — readable by any authenticated user, migration/seed-managed only.
-- Mirrors business_type_capabilities_select.
create policy business_type_category_suggestions_select on public.business_type_category_suggestions
  for select
  to authenticated
  using (true);
