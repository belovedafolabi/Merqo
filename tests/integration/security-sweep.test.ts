import { describe, expect, it } from 'vitest'

import { pool } from './helpers/db'

/**
 * The consolidated security sweep
 * (docs/milestones/15-security-qa-and-hardening.md Testing Requirements:
 * "A dedicated RLS test sweep re-running every earlier milestone's RLS tests
 * together, to catch any interaction/regression between policies added at
 * different times").
 *
 * This file is the durable half of Milestone 15. The audit checklists in
 * docs/milestones/15-audit/ record what was true on the day the audit ran;
 * these assertions are what stop it silently stopping being true. Every
 * finding this milestone fixed was invisible in the migration files and
 * visible in the catalog — finding 1's over-broad grant looked like a normal
 * `grant ... to anon, authenticated` line, and finding 5's PUBLIC EXECUTE
 * came from the ABSENCE of a statement rather than the presence of one. So
 * these tests read the catalog, not the migrations.
 *
 * Deliberately raw `pg` rather than supabase-js: this inspects
 * pg_catalog/information_schema, which PostgREST does not expose, and it must
 * see the true privilege picture rather than one filtered by whichever role a
 * client happens to authenticate as.
 *
 * EVERY exception below is a Record<string, string> mapping name -> REASON,
 * never a bare array. That is the whole design: adding an exception forces
 * writing down why, in the same commit, where a reviewer sees it. An
 * allow-list of bare names is how a real hole eventually blends in with the
 * deliberate ones.
 */

/** Tables permitted to run without RLS. Empty, and intended to stay empty. */
const RLS_DISABLED_ALLOWED: Record<string, string> = {}

/**
 * Tables permitted to have RLS enabled but zero policies. Both entries are
 * the same deliberate pattern: no GRANT to any role either, so the table is
 * reachable ONLY through SECURITY DEFINER functions. Default-deny plus
 * no-grant is stricter than any policy could be, not weaker.
 */
const POLICYLESS_TABLES_ALLOWED: Record<string, string> = {
  login_attempts:
    'Zero-policy/zero-grant by design (20260822093200): reachable only via check_login_throttle()/record_login_attempt(). A readable throttle table would let an attacker see which identifiers are near lockout.',
  rate_limits:
    'Same pattern (20260826090000): reachable only via consume_rate_limit()/rate_limit_count(). Readable, it would reveal which identifiers are near their limit.',
}

/**
 * Functions `anon` may execute. These five are the entire unauthenticated
 * attack surface of the database, and each exists because something must
 * happen before a session does.
 *
 * Milestone 15 finding 1 removed a sixth — record_audit_event() — whose full
 * argument surface let any holder of the public anon key forge audit rows for
 * any organization.
 */
const ANON_EXECUTABLE_FUNCTIONS: Record<string, string> = {
  check_login_throttle:
    'Pre-session brute-force check (20260822093400). Read-only, returns a boolean about one identifier.',
  record_login_attempt:
    'Pre-session throttle bookkeeping (20260822093400). Insert-only into a table nobody can read.',
  get_employee_invitation:
    'Token-hash lookup for the invite landing page (Milestone 11): a visitor with no account at all must be able to resolve their invitation.',
  consume_rate_limit:
    'The rate limiter itself (20260826090100) — the login, password-reset and unauthenticated-audit buckets all run before any session exists.',
  record_unauthenticated_audit_event:
    'The narrowed replacement for record_audit_event (20260826090200, Milestone 15 finding 1): allow-listed action, derived resource type, organization hardcoded null, user from auth.uid(), rate-limited in SQL.',
}

/**
 * Extension-owned functions (pg_trgm's similarity operators, and so on) are
 * excluded from the function sweep rather than allow-listed one by one. Their
 * privileges are the extension's business, they are recreated wholesale on
 * every `create extension`, and enumerating ~30 of them here would bury the
 * five entries above that actually matter.
 */
const EXCLUDE_EXTENSION_FUNCTIONS = `
  and not exists (
    select 1
    from pg_depend d
    join pg_extension e on e.oid = d.refobjid
    where d.objid = p.oid and d.deptype = 'e'
  )
`

describe('security sweep — row level security', () => {
  it('every table in the public schema has RLS enabled', async () => {
    const { rows } = await pool.query<{ tablename: string }>(`
      select c.relname as tablename
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relrowsecurity = false
      order by 1
    `)

    const offenders = rows
      .map((row) => row.tablename)
      .filter((name) => !(name in RLS_DISABLED_ALLOWED))

    expect(offenders).toEqual([])
  })

  it('every RLS-enabled table has at least one policy, or a documented reason', async () => {
    const { rows } = await pool.query<{ tablename: string }>(`
      select c.relname as tablename
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relrowsecurity = true
        and not exists (
          select 1 from pg_policy pol where pol.polrelid = c.oid
        )
      order by 1
    `)

    const offenders = rows
      .map((row) => row.tablename)
      .filter((name) => !(name in POLICYLESS_TABLES_ALLOWED))

    expect(offenders).toEqual([])
  })

  it('the policyless allow-list stays accurate — every entry still has zero policies', async () => {
    // Guards the allow-list from the other direction. If a table listed above
    // later gains a policy, the entry is stale and its stated reason is no
    // longer the reason — that should be noticed, not silently tolerated.
    const { rows } = await pool.query<{ tablename: string }>(`
      select c.relname as tablename
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = any($1::text[])
        and exists (select 1 from pg_policy pol where pol.polrelid = c.oid)
    `, [Object.keys(POLICYLESS_TABLES_ALLOWED)])

    expect(rows.map((row) => row.tablename)).toEqual([])
  })
})

describe('security sweep — grants', () => {
  it('no table in the public schema is granted to anon', async () => {
    // The strongest single tenancy guarantee in the system: with no table
    // grant at all, the public anon key cannot read or write ANY table
    // regardless of what its policies say. 20260823140000 exists specifically
    // to strip the broad grants that Supabase's defaults hand out.
    const { rows } = await pool.query<{ table_name: string; privilege_type: string }>(`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
      order by 1, 2
    `)

    expect(rows).toEqual([])
  })

  it('only the documented functions are executable by anon', async () => {
    // Uses pg_proc.proacl with aclexplode rather than
    // information_schema.role_routine_grants, for two reasons that both
    // caused real under-reporting during Milestone 15's audit:
    //
    //   1. information_schema views are filtered by what the CURRENT role can
    //      see, so they quietly omit rows depending on who is connected.
    //   2. A function with a NULL proacl has never had a GRANT or REVOKE
    //      applied, and Postgres treats that as EXECUTE for PUBLIC — which
    //      includes anon. coalesce(proacl, acldefault(...)) is what surfaces
    //      those; a naive grant query shows nothing at all. That is exactly
    //      the class finding 5 was, and it is invisible in the migrations
    //      because it comes from an absent statement.
    //
    // grantee 0 is PUBLIC.
    const { rows } = await pool.query<{ proname: string }>(`
      select distinct p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname = 'public'
        and a.privilege_type = 'EXECUTE'
        and a.grantee in (0, 'anon'::regrole)
        ${EXCLUDE_EXTENSION_FUNCTIONS}
      order by 1
    `)

    expect(rows.map((row) => row.proname).sort()).toEqual(
      Object.keys(ANON_EXECUTABLE_FUNCTIONS).sort(),
    )
  })
})

describe('security sweep — function hardening', () => {
  it('every SECURITY DEFINER function pins search_path', async () => {
    // An unpinned SECURITY DEFINER function runs with the owner's privileges
    // while resolving unqualified names through the CALLER's search_path — so
    // a caller who can create objects can shadow a table or function the body
    // references and have it executed as the owner. Pinning removes the
    // ambiguity entirely.
    //
    // Deliberately allows no exceptions. Milestone 15 closed the last unpinned
    // function (set_updated_at, 20260826090400) specifically so this
    // assertion could stay absolute — the moment it grows an allow-list, the
    // next unpinned function has somewhere to hide.
    const { rows } = await pool.query<{ proname: string }>(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and not (coalesce(p.proconfig, '{}') @> array['search_path=public'])
        ${EXCLUDE_EXTENSION_FUNCTIONS}
      order by 1
    `)

    expect(rows.map((row) => row.proname)).toEqual([])
  })

  it('audit_logs has no INSERT, UPDATE or DELETE policy — it is append-only via RPC', async () => {
    // The property Milestone 03 claimed and Milestone 15 verified: audit_logs
    // is append-only at the database level, not by convention. No write policy
    // exists, and no write grant either, so the ONLY way a row lands there is
    // through record_audit_event()/record_unauthenticated_audit_event().
    //
    // polcmd: 'r' = SELECT, 'a' = INSERT, 'w' = UPDATE, 'd' = DELETE, '*' = ALL.
    const { rows } = await pool.query<{ polname: string; polcmd: string }>(`
      select pol.polname, pol.polcmd::text
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'audit_logs'
        and pol.polcmd::text <> 'r'
    `)

    expect(rows).toEqual([])

    const { rows: grants } = await pool.query<{ privilege_type: string }>(`
      select privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'audit_logs'
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
        and grantee in ('anon', 'authenticated')
    `)

    expect(grants).toEqual([])
  })
})
