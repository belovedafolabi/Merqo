-- Shared trigger function that keeps `updated_at` current on every table that
-- includes the standard audit columns. See docs/architecture/database-conventions.md
-- for the full audit-column convention.
--
-- Uses clock_timestamp(), not now()/current_timestamp: now() is fixed for the
-- entire enclosing transaction, so two UPDATEs of the same row within one
-- transaction (or an INSERT followed by an UPDATE in the same transaction,
-- as integration tests naturally do) would otherwise get an identical
-- updated_at instead of reflecting when each statement actually ran.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
