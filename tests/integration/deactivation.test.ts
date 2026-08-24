import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchPermissionGrants } from '@/lib/auth/context'
import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Milestone 11's Security Requirements: "Deactivating an employee immediately
 * invalidates their active session(s), not just future logins — verified
 * with an explicit test." This is that test.
 *
 * The property under test is specifically that an ALREADY-LIVE session dies,
 * not merely that a deactivated user can no longer sign in. Every assertion
 * below therefore reuses the SAME supabase-js client across the whole test —
 * the exact object holding the employee's original, never-refreshed access
 * token — rather than creating a fresh client per step.
 */

interface Fixture {
  organizationId: string
  branchId: string
  owner: { client: SupabaseClient; userId: string }
}

let fixture: Fixture

async function assignCashier(organizationId: string, userId: string): Promise<void> {
  const roleResult = await pool.query(`select id from public.roles where slug = 'cashier'`)
  await pool.query(
    `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
    [userId, roleResult.rows[0].id, organizationId],
  )
  // Cashier is seeded with zero permissions (least privilege) — give it one
  // so "can this user still read something" has something to read. Attached
  // to a fixture-only custom role rather than mutating the seeded Cashier
  // row, which every other test file also relies on being pristine.
  const grantRole = await pool.query(
    `insert into public.roles (name, slug, is_system_role) values ($1, $2, false) returning id`,
    [
      `deactivation-fixture-${randomUUID().slice(0, 8)}`,
      `deactivation-fixture-${randomUUID().slice(0, 8)}`,
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

describe('employee deactivation — invalidates an already-live session', () => {
  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, `Deactivation${suffix}`)
    const branchResult = await pool.query(
      `insert into public.branches (organization_id, name, slug) values ($1, $2, $3) returning id`,
      [organizationId, `Deactivation Branch ${suffix}`, `deactivation-branch-${suffix}`],
    )
    fixture = {
      organizationId,
      branchId: branchResult.rows[0].id as string,
      owner: { client: owner.client, userId: owner.userId },
    }
  })

  afterAll(async () => {
    await pool.end()
  })

  it('a live session loses all access the instant it is deactivated, and regains it on reactivation', async () => {
    const employee = await createTestUser()
    await assignCashier(fixture.organizationId, employee.userId)

    // CONTROL — asserted first. Without this, "grants come back empty" could
    // just as easily mean "grants were always empty" (a broken fixture), and
    // the test would pass whether or not deactivation does anything at all.
    const liveGrants = await fetchPermissionGrants(employee.client)
    expect(liveGrants.length).toBeGreaterThan(0)
    const { data: liveRead, error: liveError } = await employee.client
      .from('branches')
      .select('id')
      .eq('organization_id', fixture.organizationId)
    expect(liveError).toBeNull()
    expect(liveRead?.length).toBeGreaterThan(0)

    // Owner deactivates — via the real RPC, exactly as
    // app/(app)/employees/actions.ts will call it.
    const { error: deactivateError } = await fixture.owner.client.rpc('set_employee_active', {
      p_user_id: employee.userId,
      p_organization_id: fixture.organizationId,
      p_active: false,
    })
    expect(deactivateError).toBeNull()

    // SAME CLIENT, SAME UN-REFRESHED TOKEN. This is the property under test:
    // the token was valid a moment ago and nothing about it has changed —
    // only the database's deactivated_at flag has.
    const deadGrants = await fetchPermissionGrants(employee.client)
    expect(deadGrants).toHaveLength(0)

    const { data: deadRead, error: deadReadError } = await employee.client
      .from('branches')
      .select('id')
      .eq('organization_id', fixture.organizationId)
    expect(deadReadError).toBeNull() // RLS denies by returning zero rows, not an error
    expect(deadRead).toHaveLength(0)

    // Reactivation restores access on the same still-live client.
    const { error: reactivateError } = await fixture.owner.client.rpc('set_employee_active', {
      p_user_id: employee.userId,
      p_organization_id: fixture.organizationId,
      p_active: true,
    })
    expect(reactivateError).toBeNull()

    const restoredGrants = await fetchPermissionGrants(employee.client)
    expect(restoredGrants.length).toBeGreaterThan(0)
  })

  it('a deactivated user cannot see it coming: user_shares_org_with still resolves for an active viewer', async () => {
    const employee = await createTestUser()
    await assignCashier(fixture.organizationId, employee.userId)

    await fixture.owner.client.rpc('set_employee_active', {
      p_user_id: employee.userId,
      p_organization_id: fixture.organizationId,
      p_active: false,
    })

    // The ACTIVE owner must still see the DEACTIVATED employee's row — the
    // directory has to be able to display, and reactivate, someone it just
    // turned off. This is user_shares_org_with()'s caller-gated-not-target-
    // gated design (20260824090100's header) proven end-to-end.
    const { data, error } = await fixture.owner.client
      .from('users')
      .select('id, deactivated_at')
      .eq('id', employee.userId)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data?.deactivated_at).not.toBeNull()
  })

  it('an admin cannot deactivate their own account', async () => {
    const { error } = await fixture.owner.client.rpc('set_employee_active', {
      p_user_id: fixture.owner.userId,
      p_organization_id: fixture.organizationId,
      p_active: false,
    })
    expect(error).not.toBeNull()
  })

  it('a user without employees.deactivate cannot deactivate anyone', async () => {
    const employee = await createTestUser()
    await assignCashier(fixture.organizationId, employee.userId)

    const bystander = await createTestUser()
    await assignCashier(fixture.organizationId, bystander.userId)

    const { error } = await bystander.client.rpc('set_employee_active', {
      p_user_id: employee.userId,
      p_organization_id: fixture.organizationId,
      p_active: false,
    })
    expect(error).not.toBeNull()
  })

  it('cannot deactivate a user who is not a member of the calling organization', async () => {
    const suffix = randomUUID().slice(0, 8)
    const otherOwner = await createTestUser()
    const { organizationId: otherOrgId } = await bootstrapOrganization(
      otherOwner,
      `OtherOrg${suffix}`,
    )
    const outsider = await createTestUser()
    await assignCashier(otherOrgId, outsider.userId)

    const { error } = await fixture.owner.client.rpc('set_employee_active', {
      p_user_id: outsider.userId,
      p_organization_id: fixture.organizationId,
      p_active: false,
    })
    expect(error).not.toBeNull()
  })
})
