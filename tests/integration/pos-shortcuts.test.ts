import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser, type TestUser } from './helpers/supabase'

/**
 * pos_product_shortcuts() (20260908090100) was flipped from SECURITY INVOKER
 * to SECURITY DEFINER + one upfront user_has_business_unit_access() check —
 * under INVOKER the per-row RLS on the sales/sale_items join it aggregates
 * hit an 8s statement timeout at ~2000 sales and crashed the Admin
 * dashboard's "top products" card. This guards both halves: the function
 * stays DEFINER, and the access check still keeps a caller out of a business
 * unit they can't reach (no error, no rows — the same "another tenant gets
 * zero" contract the INVOKER version relied on RLS for).
 */

let owner: TestUser
let organizationId: string
let branchId: string
let businessUnitId: string

afterAll(async () => {
  await pool.end()
})

describe('pos_product_shortcuts — SECURITY DEFINER + access guard', () => {
  it('is SECURITY DEFINER', async () => {
    const { rows } = await pool.query<{ prosecdef: boolean }>(
      `select prosecdef from pg_proc where proname = 'pos_product_shortcuts'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.prosecdef).toBe(true)
  })

  it('returns [] (not an error) for a member with no sales, and for an unreachable business unit', async () => {
    owner = await createTestUser()
    ;({ organizationId } = await bootstrapOrganization(
      owner,
      `Shortcuts${randomUUID().slice(0, 8)}`,
    ))

    const suffix = randomUUID().slice(0, 8)
    branchId = (
      await pool.query(
        `insert into public.branches (organization_id, name, slug) values ($1, 'B', $2) returning id`,
        [organizationId, `sc-b-${suffix}`],
      )
    ).rows[0].id
    const typeId = (
      await pool.query(`select id from public.business_types where slug = 'restaurant'`)
    ).rows[0].id
    businessUnitId = (
      await pool.query(
        `insert into public.business_units (branch_id, business_type_id, name, slug)
         values ($1, $2, 'U', $3) returning id`,
        [branchId, typeId, `sc-u-${suffix}`],
      )
    ).rows[0].id

    // The owner (org-wide role) can reach this BU — no sales yet, so an
    // empty list, but crucially not an error.
    const reachable = await owner.client.rpc('pos_product_shortcuts', {
      p_branch_id: branchId,
      p_business_unit_id: businessUnitId,
      p_limit: 12,
    })
    expect(reachable.error).toBeNull()
    expect(reachable.data).toEqual([])

    // A branch/BU the caller has no user_roles row for: the upfront guard
    // returns before touching any sales row.
    const unreachable = await owner.client.rpc('pos_product_shortcuts', {
      p_branch_id: randomUUID(),
      p_business_unit_id: randomUUID(),
      p_limit: 12,
    })
    expect(unreachable.error).toBeNull()
    expect(unreachable.data).toEqual([])
  })

  it('a user from another organization gets [] for this org’s business unit', async () => {
    const outsider = await createTestUser()
    await bootstrapOrganization(outsider, `Outsider${randomUUID().slice(0, 8)}`)

    const { data, error } = await outsider.client.rpc('pos_product_shortcuts', {
      p_branch_id: branchId,
      p_business_unit_id: businessUnitId,
      p_limit: 12,
    })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
