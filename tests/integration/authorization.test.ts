import { afterAll, describe, expect, it } from 'vitest'

import { resolvePermission } from '@/lib/auth/permissions'
import { fetchPermissionGrants } from '@/lib/auth/context'
import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Server Action-layer authorization, exercised the way this milestone's
 * Definition of Done describes: "a manual walk-through confirms a
 * Cashier-scoped test user genuinely cannot perform an Owner-only action
 * even by calling the Server Action directly." fetchPermissionGrants() +
 * resolvePermission() here ARE requirePermission()'s own implementation
 * (lib/auth/guard.ts) minus the next/headers-dependent redirect wrapper —
 * see lib/auth/context.ts's module doc for why the split exists.
 */
describe('authorization guard — permission resolution against real data', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('an Owner is allowed an owner-only action; a Cashier at the same org is denied', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Guard Test Org')

    const cashier = await createTestUser()
    const cashierRole = await pool.query(`select id from public.roles where slug = 'cashier'`)

    // Assigning the Cashier's role requires roles.assign, which only the
    // Owner holds — done here via the pg pool (test setup), not the app
    // layer, to isolate what's under test (the guard's own decision).
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
      [cashier.userId, cashierRole.rows[0].id, organizationId],
    )

    const ownerGrants = await fetchPermissionGrants(owner.client)
    expect(resolvePermission(ownerGrants, 'organizations.update', { organizationId })).toBe(true)

    const cashierGrants = await fetchPermissionGrants(cashier.client)
    expect(resolvePermission(cashierGrants, 'organizations.update', { organizationId })).toBe(false)
  })

  it('a user with no role assignment at all has zero grants', async () => {
    const bystander = await createTestUser()
    const grants = await fetchPermissionGrants(bystander.client)
    expect(grants).toHaveLength(0)
  })

  it('a Branch Manager is allowed business_units.create but not organizations.update', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Branch Manager Test Org')

    const manager = await createTestUser()
    const managerRole = await pool.query(
      `select id from public.roles where slug = 'branch_manager'`,
    )
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
      [manager.userId, managerRole.rows[0].id, organizationId],
    )

    const grants = await fetchPermissionGrants(manager.client)
    expect(resolvePermission(grants, 'business_units.create', { organizationId })).toBe(true)
    expect(resolvePermission(grants, 'organizations.update', { organizationId })).toBe(false)
  })
})
