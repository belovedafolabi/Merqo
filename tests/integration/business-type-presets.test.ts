import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyBusinessTypePresets } from '@/lib/business-structure/presets'
import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser, type TestUser } from './helpers/supabase'

/**
 * Milestone 17 Part B — applyBusinessTypePresets() runs against the real
 * business_type_presets seed. It is called once at the end of onboarding and
 * never again for that unit, so there is no "re-apply on type change" path to
 * regress — updateBusinessUnit() only writes `name`.
 */

let owner: TestUser
let organizationId: string
let restaurantTypeId: string

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8)
  owner = await createTestUser()
  ;({ organizationId } = await bootstrapOrganization(owner, `Presets${suffix}`))
  restaurantTypeId = (
    await pool.query(`select id from public.business_types where slug = 'restaurant'`)
  ).rows[0].id
})

afterAll(async () => {
  await pool.end()
})

async function newUnit(): Promise<string> {
  const suffix = randomUUID().slice(0, 8)
  const branch = (
    await pool.query(
      `insert into public.branches (organization_id, name, slug) values ($1, 'B', $2) returning id`,
      [organizationId, `pre-b-${suffix}`],
    )
  ).rows[0].id as string
  return (
    await pool.query(
      `insert into public.business_units (branch_id, business_type_id, name, slug)
       values ($1, $2, 'U', $3) returning id`,
      [branch, restaurantTypeId, `pre-u-${suffix}`],
    )
  ).rows[0].id as string
}

describe('applyBusinessTypePresets against the real seed', () => {
  it("seeds the restaurant type's dashboard widgets and pinned reports", async () => {
    const unitId = await newUnit()

    const result = await applyBusinessTypePresets(owner.client, {
      businessUnitId: unitId,
      businessTypeId: restaurantTypeId,
      userId: owner.userId,
    })

    expect(result.widgetsApplied).toBeGreaterThan(0)
    expect(result.reportsApplied).toBeGreaterThan(0)

    const widgets = await pool.query(
      `select widget_id from public.dashboard_widgets where user_id = $1 order by position`,
      [owner.userId],
    )
    // The seeded restaurant preset (20260906090200).
    expect(widgets.rows.map((r) => r.widget_id)).toEqual([
      'sales_summary',
      'sales_overview',
      'recent_sales',
      'top_products',
    ])

    const unit = await pool.query(
      `select pinned_reports from public.business_units where id = $1`,
      [unitId],
    )
    expect(unit.rows[0].pinned_reports).toEqual(['sales-summary', 'sales-by-product', 'discounts'])
  })

  it('is idempotent — a second call adds no duplicate widget rows', async () => {
    const unitId = await newUnit()

    await applyBusinessTypePresets(owner.client, {
      businessUnitId: unitId,
      businessTypeId: restaurantTypeId,
      userId: owner.userId,
    })
    const before = await pool.query(
      `select count(*)::int as n from public.dashboard_widgets where user_id = $1`,
      [owner.userId],
    )

    await applyBusinessTypePresets(owner.client, {
      businessUnitId: unitId,
      businessTypeId: restaurantTypeId,
      userId: owner.userId,
    })
    const after = await pool.query(
      `select count(*)::int as n from public.dashboard_widgets where user_id = $1`,
      [owner.userId],
    )

    expect(after.rows[0].n).toBe(before.rows[0].n)
  })

  it('an existing unit keeps its empty pinned_reports until presets run', async () => {
    const unitId = await newUnit()
    const unit = await pool.query(
      `select pinned_reports from public.business_units where id = $1`,
      [unitId],
    )
    expect(unit.rows[0].pinned_reports).toEqual([])
  })
})
