import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchPermissionGrants } from '@/lib/auth/context'
import { pool } from './helpers/db'
import {
  bootstrapOrganization,
  createTestUser,
  promoteToSuperAdmin,
  setSubscriptionPeriodEnd,
} from './helpers/supabase'

interface AccessStateRow {
  organization_id: string
  locked: boolean
  can_renew: boolean
  is_platform_admin: boolean
}

/**
 * Milestone 13's Acceptance Criteria: "On expiry, non-Super-Admin login and
 * active sessions are blocked; Super Admin access is unaffected." Same
 * property, same testing shape as tests/integration/deactivation.test.ts:
 * the SAME supabase-js client, holding the SAME un-refreshed access token,
 * loses (and regains) access purely because the database's predicate
 * changed underneath it — proving the lock is a database-level boundary,
 * not a session-refresh artifact.
 */

async function assignCashier(organizationId: string, userId: string): Promise<void> {
  const roleResult = await pool.query(`select id from public.roles where slug = 'cashier'`)
  await pool.query(
    `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
    [userId, roleResult.rows[0].id, organizationId],
  )
  const grantRole = await pool.query(
    `insert into public.roles (name, slug, is_system_role, organization_id) values ($1, $2, false, $3) returning id`,
    [
      `lock-fixture-${randomUUID().slice(0, 8)}`,
      `lock-fixture-${randomUUID().slice(0, 8)}`,
      organizationId,
    ],
  )
  const permissionResult = await pool.query(
    `select id from public.permissions where key = 'branches.view'`,
  )
  await pool.query(`insert into public.role_permissions (role_id, permission_id) values ($1, $2)`, [
    grantRole.rows[0].id,
    permissionResult.rows[0].id,
  ])
  await pool.query(
    `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
    [userId, grantRole.rows[0].id, organizationId],
  )
}

interface Fixture {
  organizationId: string
  owner: { client: SupabaseClient; userId: string }
}

async function makeFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8)
  const owner = await createTestUser()
  const { organizationId } = await bootstrapOrganization(owner, `Lock${suffix}`)
  return { organizationId, owner: { client: owner.client, userId: owner.userId } }
}

afterAll(async () => {
  await pool.end()
})

describe('subscription lock — organization_access_permitted()', () => {
  it('a fresh organization is on an unexpired trial and is not locked', async () => {
    const { organizationId, owner } = await makeFixture()
    const grants = await fetchPermissionGrants(owner.client)
    expect(grants.length).toBeGreaterThan(0)

    const { data, error } = await owner.client
      .rpc('subscription_access_state')
      .maybeSingle<AccessStateRow>()
    expect(error).toBeNull()
    expect(data?.organization_id).toBe(organizationId)
    expect(data?.locked).toBe(false)
  })

  it("expiry reduces the Owner's grants to exactly subscription.view/subscription.renew, and a cashier's to zero", async () => {
    const { organizationId, owner } = await makeFixture()
    const cashier = await createTestUser()
    await assignCashier(organizationId, cashier.userId)

    // CONTROL — asserted before expiry, same discipline as deactivation.test.ts.
    const liveOwnerGrants = await fetchPermissionGrants(owner.client)
    expect(liveOwnerGrants.length).toBeGreaterThan(2)
    const { data: liveRead } = await cashier.client.from('branches').select('id')
    expect(liveRead).not.toBeNull()

    await setSubscriptionPeriodEnd(organizationId, new Date(Date.now() - 1000))

    const lockedOwnerGrants = await fetchPermissionGrants(owner.client)
    const ownerKeys = lockedOwnerGrants.map((g) => g.permissionKey).sort()
    expect(ownerKeys).toEqual(['subscription.renew', 'subscription.view'])

    const lockedCashierGrants = await fetchPermissionGrants(cashier.client)
    expect(lockedCashierGrants).toHaveLength(0)

    // Every ordinary business table is denied for both — RLS returns zero
    // rows, not an error, exactly like deactivation's equivalent assertion.
    const { data: ownerRead, error: ownerReadError } = await owner.client
      .from('branches')
      .select('id')
    expect(ownerReadError).toBeNull()
    expect(ownerRead).toHaveLength(0)

    const { data: cashierRead, error: cashierReadError } = await cashier.client
      .from('branches')
      .select('id')
    expect(cashierReadError).toBeNull()
    expect(cashierRead).toHaveLength(0)

    // But subscription_access_state() itself — the one read the locked
    // screen depends on — must still resolve, for BOTH of them.
    const { data: ownerState } = await owner.client
      .rpc('subscription_access_state')
      .maybeSingle<AccessStateRow>()
    expect(ownerState?.locked).toBe(true)
    expect(ownerState?.can_renew).toBe(true)

    const { data: cashierState } = await cashier.client
      .rpc('subscription_access_state')
      .maybeSingle<AccessStateRow>()
    expect(cashierState?.locked).toBe(true)
    expect(cashierState?.can_renew).toBe(false)
  })

  it('grants restore in the same session, with no re-login, once the period is extended', async () => {
    const { organizationId, owner } = await makeFixture()
    await setSubscriptionPeriodEnd(organizationId, new Date(Date.now() - 1000))

    const lockedGrants = await fetchPermissionGrants(owner.client)
    expect(lockedGrants.length).toBe(2)

    // Simulates what apply_subscription_payment() does to current_period_end
    // — no re-login, same still-live client and token as above.
    await setSubscriptionPeriodEnd(organizationId, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))

    const restoredGrants = await fetchPermissionGrants(owner.client)
    expect(restoredGrants.length).toBeGreaterThan(2)

    const { data } = await owner.client
      .rpc('subscription_access_state')
      .maybeSingle<AccessStateRow>()
    expect(data?.locked).toBe(false)
  })
})

describe('subscription lock — Super Admin exemption', () => {
  it('a promoted Super Admin keeps full access under an expired subscription', async () => {
    const { organizationId } = await makeFixture()
    await setSubscriptionPeriodEnd(organizationId, new Date(Date.now() - 1000))

    const admin = await createTestUser()
    await promoteToSuperAdmin(admin.email, organizationId)

    const { data: state } = await admin.client
      .rpc('subscription_access_state')
      .maybeSingle<AccessStateRow>()
    expect(state?.locked).toBe(false)
    expect(state?.is_platform_admin).toBe(true)

    const grants = await fetchPermissionGrants(admin.client)
    expect(grants.length).toBeGreaterThan(2)
  })
})
