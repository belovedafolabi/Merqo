-- Shared trigger function that keeps `updated_at` current on every table that
-- includes the standard audit columns. See docs/architecture/database-conventions.md
-- for the full audit-column convention.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
