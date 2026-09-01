import { afterAll, describe, expect, it } from 'vitest'

import { pool, withTransaction } from './helpers/db'
import { bootstrapOrganization, createAnonClient, createTestUser } from './helpers/supabase'

/**
 * The dedicated RLS suite this milestone calls "the template every later
 * milestone's own RLS tests follow"
 * (docs/milestones/03-authentication-and-rbac-foundation.md Testing
 * Requirements). Every assertion goes through a real authenticated
 * supabase-js client — never the `pg` pool — so denial is proven "via
 * direct Supabase client calls that bypass application code," exactly as
 * the milestone's Security Requirements demand.
 */
afterAll(async () => {
  await pool.end()
})

describe('RLS — cross-organization isolation', () => {
  it('a user can read their own organization but not another', async () => {
    const ownerA = await createTestUser()
    const { organizationId: orgA } = await bootstrapOrganization(ownerA, 'Org A')

    const ownerB = await createTestUser()
    const { organizationId: orgB } = await bootstrapOrganization(ownerB, 'Org B')

    const { data: ownOrg, error: ownError } = await ownerA.client
      .from('organizations')
      .select('id')
      .eq('id', orgA)
    expect(ownError).toBeNull()
    expect(ownOrg).toHaveLength(1)

    const { data: otherOrg, error: otherError } = await ownerA.client
      .from('organizations')
      .select('id')
      .eq('id', orgB)
    expect(otherError).toBeNull()
    expect(otherOrg).toHaveLength(0)
  })

  it('a user cannot update another organization even by targeting its id directly', async () => {
    const ownerA = await createTestUser()
    await bootstrapOrganization(ownerA, 'Org C')

    const ownerB = await createTestUser()
    const { organizationId: orgB } = await bootstrapOrganization(ownerB, 'Org D')

    const { data, error } = await ownerA.client
      .from('organizations')
      .update({ name: 'Hijacked' })
      .eq('id', orgB)
      .select('id')

    // RLS silently filters the row rather than erroring — zero rows
    // affected is the correct, expected denial outcome.
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('a user cannot read branches belonging to another organization', async () => {
    const ownerA = await createTestUser()
    const { organizationId: orgA } = await bootstrapOrganization(ownerA, 'Org E')

    const ownerB = await createTestUser()
    await bootstrapOrganization(ownerB, 'Org F')

    const { data: branchInsert, error: insertError } = await ownerA.client
      .from('branches')
      .insert({ organization_id: orgA, name: 'HQ', slug: 'hq' })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    const { data: crossOrgRead, error: crossOrgError } = await ownerB.client
      .from('branches')
      .select('id')
      .eq('id', branchInsert!.id)
    expect(crossOrgError).toBeNull()
    expect(crossOrgRead).toHaveLength(0)

    const { data: ownRead, error: ownReadError } = await ownerA.client
      .from('branches')
      .select('id')
      .eq('id', branchInsert!.id)
    expect(ownReadError).toBeNull()
    expect(ownRead).toHaveLength(1)
  })

  it('a user cannot read user_roles belonging to another organization', async () => {
    const ownerA = await createTestUser()
    await bootstrapOrganization(ownerA, 'Org G')

    const ownerB = await createTestUser()
    const { userRoleId: ownerBRoleId } = await bootstrapOrganization(ownerB, 'Org H')

    const { data, error } = await ownerA.client
      .from('user_roles')
      .select('id')
      .eq('id', ownerBRoleId)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('a user cannot read a custom role belonging to another organization', async () => {
    // 20260830090000 replaced the created_by-chain visibility predicate with
    // roles.organization_id + user_has_org_access(). This is the property
    // that change exists to guarantee: one tenant's custom role names and
    // permission mappings are invisible to every other tenant.
    const ownerA = await createTestUser()
    const { organizationId: orgA } = await bootstrapOrganization(ownerA, 'Org RolesA')

    const ownerB = await createTestUser()
    await bootstrapOrganization(ownerB, 'Org RolesB')

    const { data: role, error: roleError } = await ownerA.client
      .from('roles')
      .insert({
        name: 'Secret Auditor',
        slug: `secret-auditor-${crypto.randomUUID().slice(0, 8)}`,
        is_system_role: false,
        organization_id: orgA,
        created_by: ownerA.userId,
      })
      .select('id')
      .single()
    expect(roleError).toBeNull()

    // Org B's owner cannot see it...
    const { data: crossOrg, error: crossErr } = await ownerB.client
      .from('roles')
      .select('id')
      .eq('id', role!.id)
    expect(crossErr).toBeNull()
    expect(crossOrg).toHaveLength(0)

    // ...its author still can.
    const { data: ownRead } = await ownerA.client.from('roles').select('id').eq('id', role!.id)
    expect(ownRead).toHaveLength(1)

    // System roles stay globally visible to both.
    const { data: systemRole } = await ownerB.client
      .from('roles')
      .select('id')
      .eq('slug', 'cashier')
    expect(systemRole).toHaveLength(1)
  })

  // Regression coverage for a real bug found while building this suite:
  // user_has_branch_access()/user_has_business_unit_access() originally
  // re-queried their own target table (branches/business_units) to resolve
  // organization/branch context, which is invisible to that nested query
  // for a row being inserted in the SAME statement — so `.insert().select()`
  // (exactly what these two round trips do) incorrectly denied a user their
  // own just-created row. Fixed in 20260822093300_create_authorization_functions.sql
  // by passing organization_id/branch_id directly instead of re-deriving
  // them via a self-join. These two tests pin that fix.
  it('a user can insert a business unit under their own branch and immediately read it back', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Org J')

    const { data: branch, error: branchError } = await owner.client
      .from('branches')
      .insert({ organization_id: organizationId, name: 'Main', slug: 'main' })
      .select('id')
      .single()
    expect(branchError).toBeNull()

    const { data: businessType } = await owner.client
      .from('business_types')
      .select('id')
      .eq('slug', 'supermarket')
      .single()

    const { data: businessUnit, error: buError } = await owner.client
      .from('business_units')
      .insert({
        branch_id: branch!.id,
        business_type_id: businessType!.id,
        name: 'Shop',
        slug: 'shop',
      })
      .select('id')
      .single()

    expect(buError).toBeNull()
    expect(businessUnit).not.toBeNull()
  })

  it('assigning a role to a different user and reading it back in the same round trip succeeds', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Org K')

    const employee = await createTestUser()
    const cashierRole = await pool.query(`select id from public.roles where slug = 'cashier'`)

    const { data, error } = await owner.client
      .from('user_roles')
      .insert({
        user_id: employee.userId,
        role_id: cashierRole.rows[0].id,
        organization_id: organizationId,
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })

  it('the anon (unauthenticated) role reads nothing from organizations', async () => {
    const ownerA = await createTestUser()
    await bootstrapOrganization(ownerA, 'Org I')

    const anon = createAnonClient()
    const { data, error } = await anon.from('organizations').select('id')

    // anon has no table-level GRANT on tenant tables at all (see
    // 20260822095000_alter_tables_grant_authenticated.sql) — a hard
    // "permission denied" is an equally valid denial outcome here as an
    // RLS-filtered empty result, matching the precedent set in
    // tests/integration/rls.test.ts (Milestone 02).
    if (error) {
      expect((error as { code?: string }).code).toBe('42501')
    } else {
      expect(data).toHaveLength(0)
    }
  })
})

describe('RLS — dangerous grants withheld schema-wide', () => {
  it('no table in public grants TRUNCATE, REFERENCES, or TRIGGER to anon or authenticated', async () => {
    // Supabase's platform bootstrap used to grant TRUNCATE, REFERENCES, and
    // TRIGGER to `anon`/`authenticated` on every table in `public` by
    // default (a default ACL for the `postgres` role — see
    // pg_default_acl). REFERENCES/TRIGGER are inert through PostgREST, but
    // TRUNCATE is not filtered by RLS at all: it would let either role wipe
    // every tenant's rows in one statement on any table, append-only or
    // not. 20260823140000_revoke_authenticated_anon_dangerous_grants.sql
    // revokes all three schema-wide and corrects the default ACL so future
    // `create table` migrations don't reacquire them — asserted here so a
    // migration that re-grants any of the three, on any table, fails loudly
    // instead of silently reopening the gap.
    await withTransaction(async (client) => {
      const grants = await client.query(
        `select table_name, grantee, privilege_type
         from information_schema.role_table_grants
         where table_schema = 'public'
           and grantee in ('anon', 'authenticated')
           and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')`,
      )
      expect(grants.rows).toHaveLength(0)
    })
  })
})
