-- Milestone 16 — post-provision / post-restore / post-migrate database
-- verification. Pure SQL: it runs from `supabase db query -f`, from psql, or
-- pasted straight into the Supabase dashboard SQL editor. Every check raises
-- an exception on failure, so a caller that checks the exit code (or watches
-- for ERROR) gets a hard pass/fail — a silently half-restored database
-- cannot report success.
--
-- What it proves: the schema is RLS-locked exactly as designed, and the seed
-- catalog every deployment needs is present. It does NOT re-derive the
-- anon-executable-function allow-list — tests/integration/security-sweep.test.ts
-- owns that and runs it on every CI build; duplicating the list here would
-- only drift.

do $$
declare
  v_unprotected text;
  v_policyless text;
  v_count int;
begin
  -- 1. Every base table in `public` has row-level security enabled. A dump/
  --    restore that drops RLS is the exact security regression Milestone 16's
  --    Security Requirements call out by name.
  select string_agg(c.relname, ', ' order by c.relname)
    into v_unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if v_unprotected is not null then
    raise exception 'RLS not enabled on public table(s): %', v_unprotected;
  end if;

  -- 2. Every RLS-enabled table has at least one policy — except the two
  --    that are deliberately policyless AND grantless (login_attempts,
  --    rate_limits), reachable only through SECURITY DEFINER functions.
  --    tests/integration/security-sweep.test.ts owns that allow-list; this
  --    mirrors it. Any OTHER policyless table means a policy failed to
  --    restore.
  select string_agg(c.relname, ', ' order by c.relname)
    into v_policyless
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity
    and c.relname not in ('login_attempts', 'rate_limits')
    and not exists (
      select 1 from pg_policy p where p.polrelid = c.oid
    );

  if v_policyless is not null then
    raise exception 'RLS enabled but no policy on: %', v_policyless;
  end if;

  -- 3. Seed catalog — the rows every deployment needs to function at all.
  select count(*) into v_count from public.business_types;
  if v_count <> 13 then
    raise exception 'expected 13 business_types, found %', v_count;
  end if;

  select count(*) into v_count from public.roles where is_system_role;
  if v_count <> 8 then
    raise exception 'expected 8 system roles, found %', v_count;
  end if;

  if not exists (select 1 from public.roles where slug = 'super_admin' and is_system_role) then
    raise exception 'super_admin system role is missing';
  end if;

  select count(*) into v_count from public.subscription_pricing;
  if v_count <> 4 then
    raise exception 'expected 4 subscription_pricing rows, found %', v_count;
  end if;

  select count(*) into v_count from public.permissions;
  if v_count < 50 then
    raise exception 'permission catalog looks truncated: only % rows', v_count;
  end if;

  -- 4. roles_org_scope_check (20260830090000) is present — the constraint
  --    that keeps custom roles tenant-scoped after a restore.
  if not exists (
    select 1 from pg_constraint
    where conname = 'roles_org_scope_check' and conrelid = 'public.roles'::regclass
  ) then
    raise exception 'roles_org_scope_check constraint is missing';
  end if;

  raise notice 'verify-client-db: all checks passed (% base tables, RLS + policies intact, seed catalog present)',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r');
end $$;
