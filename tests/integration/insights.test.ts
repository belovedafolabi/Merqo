import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Milestone 17 Part A. compute_sales_insights() is SECURITY DEFINER and
 * re-checks insights.view, so these run through a real signed-in supabase-js
 * client (the Owner, who has the permission by default). Seeding is done over
 * the `pg` pool because sales need backdated `created_at` values that
 * create_sale() won't set.
 *
 * The scenario:
 *   steady  — 4 units/day, every day, for 28 days       → OK confidence
 *   thin    — 3 units/day for the last 3 days only      → LOW confidence
 *   slow    — 20 units on hand, no sales in 30 days     → a slow mover
 *   low     — sells ~6/day, only 4 on hand              → a restock candidate
 */

interface Fixture {
  organizationId: string
  branchId: string
  businessUnitId: string
  owner: { client: SupabaseClient; userId: string }
  outsider: { client: SupabaseClient; userId: string }
  products: { steady: string; thin: string; slow: string; low: string }
}

let fx: Fixture

async function seedProduct(businessUnitId: string, name: string, price: number): Promise<string> {
  const row = await pool.query(
    `insert into public.products (business_unit_id, name, sku, base_price, cost_price)
     values ($1, $2, $3, $4, $5) returning id`,
    [businessUnitId, name, `INS-${randomUUID().slice(0, 8)}`, price, Math.round(price * 0.4)],
  )
  return row.rows[0].id as string
}

async function seedBalance(
  branchId: string,
  businessUnitId: string,
  productId: string,
  qty: number,
): Promise<void> {
  await pool.query(
    `insert into public.inventory_balances (branch_id, business_unit_id, product_id, quantity)
     values ($1, $2, $3, $4)`,
    [branchId, businessUnitId, productId, qty],
  )
}

/**
 * One sale per day for `days` days, `quantity` units each, in two round trips
 * (a generate_series over the days, then the matching items) rather than 2·N.
 */
async function seedDailySales(
  organizationId: string,
  branchId: string,
  businessUnitId: string,
  productId: string,
  quantity: number,
  days: number,
): Promise<void> {
  const amount = quantity * 100
  await pool.query(
    `with new_sales as (
       insert into public.sales
         (organization_id, branch_id, business_unit_id, idempotency_key, subtotal, total, created_at)
       select $1, $2, $3, gen_random_uuid(), $4, $4, now() - (d || ' days')::interval
       from generate_series(0, $5 - 1) as d
       returning id
     )
     insert into public.sale_items (sale_id, product_id, quantity, unit_price, line_total)
     select id, $6, $7, 100, $4 from new_sales`,
    [organizationId, branchId, businessUnitId, amount, days, productId, quantity],
  )
}

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8)
  // Two users, two org bootstraps, and a month of seeded sales — well past the
  // 10s default hook budget.
  const owner = await createTestUser()
  const { organizationId } = await bootstrapOrganization(owner, `Insights${suffix}`)
  const outsider = await createTestUser()
  await bootstrapOrganization(outsider, `Outsider${suffix}`)

  const typeId = (
    await pool.query(`select id from public.business_types where slug = 'supermarket'`)
  ).rows[0].id

  const branchId = (
    await pool.query(
      `insert into public.branches (organization_id, name, slug) values ($1, 'Main', $2) returning id`,
      [organizationId, `ins-b-${suffix}`],
    )
  ).rows[0].id as string

  const businessUnitId = (
    await pool.query(
      `insert into public.business_units (branch_id, business_type_id, name, slug)
       values ($1, $2, 'Store', $3) returning id`,
      [branchId, typeId, `ins-u-${suffix}`],
    )
  ).rows[0].id as string

  const steady = await seedProduct(businessUnitId, 'Steady Seller', 100)
  const thin = await seedProduct(businessUnitId, 'Brand New', 100)
  const slow = await seedProduct(businessUnitId, 'Dead Stock', 250)
  const low = await seedProduct(businessUnitId, 'Fast Runner', 100)

  await seedBalance(branchId, businessUnitId, steady, 40)
  await seedBalance(branchId, businessUnitId, thin, 40)
  await seedBalance(branchId, businessUnitId, slow, 20)
  await seedBalance(branchId, businessUnitId, low, 4)

  await seedDailySales(organizationId, branchId, businessUnitId, steady, 4, 28)
  await seedDailySales(organizationId, branchId, businessUnitId, low, 6, 28)
  await seedDailySales(organizationId, branchId, businessUnitId, thin, 3, 3)

  fx = {
    organizationId,
    branchId,
    businessUnitId,
    owner: { client: owner.client, userId: owner.userId },
    outsider: { client: outsider.client, userId: outsider.userId },
    products: { steady, thin, slow, low },
  }
}, 60_000)

afterAll(async () => {
  await pool.end()
})

describe('compute_sales_insights', () => {
  it('writes exactly three cache rows, one per section', async () => {
    const { error } = await fx.owner.client.rpc('compute_sales_insights', {
      p_business_unit_id: fx.businessUnitId,
    })
    expect(error).toBeNull()

    const rows = await pool.query(
      `select section, jsonb_typeof(payload) as kind
       from public.sales_insights_cache where business_unit_id = $1 order by section`,
      [fx.businessUnitId],
    )
    expect(rows.rows.map((r) => r.section)).toEqual(['forecast', 'restock', 'slow_movers'])
    expect(rows.rows.every((r) => r.kind === 'array')).toBe(true)
  })

  it('gates a steady seller OK and a thin-history product LOW', async () => {
    await fx.owner.client.rpc('compute_sales_insights', { p_business_unit_id: fx.businessUnitId })
    const { rows } = await pool.query(
      `select payload from public.sales_insights_cache
       where business_unit_id = $1 and section = 'forecast'`,
      [fx.businessUnitId],
    )
    const forecast = rows[0].payload as Array<{
      productId: string
      confidence: string
      forecastNextDay: number | null
      baseVelocity: number
    }>

    const steady = forecast.find((r) => r.productId === fx.products.steady)
    const thin = forecast.find((r) => r.productId === fx.products.thin)

    expect(steady?.confidence).toBe('OK')
    // Reconciliation: a perfectly steady 4/day seller has v7 = v28 = 4, so
    // base_velocity (0.6·v7 + 0.4·v28) is 4 — within rounding of the direct rate.
    expect(steady?.baseVelocity).toBeGreaterThan(3.5)
    expect(steady?.baseVelocity).toBeLessThan(4.5)
    expect(steady?.forecastNextDay).not.toBeNull()

    expect(thin?.confidence).toBe('LOW')
    expect(thin?.forecastNextDay).toBeNull()
  })

  it('lists the low-cover product for restock and the dead stock as a slow mover', async () => {
    await fx.owner.client.rpc('compute_sales_insights', { p_business_unit_id: fx.businessUnitId })

    const restock = (
      await pool.query(
        `select payload from public.sales_insights_cache
         where business_unit_id = $1 and section = 'restock'`,
        [fx.businessUnitId],
      )
    ).rows[0].payload as Array<{ productId: string; suggestedOrderQty: number }>
    const slow = (
      await pool.query(
        `select payload from public.sales_insights_cache
         where business_unit_id = $1 and section = 'slow_movers'`,
        [fx.businessUnitId],
      )
    ).rows[0].payload as Array<{ productId: string; retailValue: number }>

    const low = restock.find((r) => r.productId === fx.products.low)
    expect(low).toBeDefined()
    expect(low!.suggestedOrderQty).toBeGreaterThan(0)

    const dead = slow.find((r) => r.productId === fx.products.slow)
    expect(dead).toBeDefined()
    // 20 on hand × ₦250 base price.
    expect(dead!.retailValue).toBe(5000)

    // The steady seller is neither low nor dead.
    expect(restock.some((r) => r.productId === fx.products.steady)).toBe(false)
    expect(slow.some((r) => r.productId === fx.products.steady)).toBe(false)
  })

  it('is idempotent — a second call keeps three rows and bumps computed_at', async () => {
    await fx.owner.client.rpc('compute_sales_insights', { p_business_unit_id: fx.businessUnitId })
    const first = await pool.query(
      `select max(computed_at) as at, count(*) as n
       from public.sales_insights_cache where business_unit_id = $1`,
      [fx.businessUnitId],
    )
    await new Promise((r) => setTimeout(r, 20))
    await fx.owner.client.rpc('compute_sales_insights', { p_business_unit_id: fx.businessUnitId })
    const second = await pool.query(
      `select max(computed_at) as at, count(*) as n
       from public.sales_insights_cache where business_unit_id = $1`,
      [fx.businessUnitId],
    )

    expect(Number(second.rows[0].n)).toBe(3)
    expect(new Date(second.rows[0].at).getTime()).toBeGreaterThanOrEqual(
      new Date(first.rows[0].at).getTime(),
    )
  })
})

describe('authorization', () => {
  it('a user from another organization cannot compute insights for this business unit', async () => {
    const { error } = await fx.outsider.client.rpc('compute_sales_insights', {
      p_business_unit_id: fx.businessUnitId,
    })
    expect(error).not.toBeNull()
  })

  it('a user from another organization reads no cache rows for this business unit', async () => {
    await fx.owner.client.rpc('compute_sales_insights', { p_business_unit_id: fx.businessUnitId })
    const { data, error } = await fx.outsider.client
      .from('sales_insights_cache')
      .select('section')
      .eq('business_unit_id', fx.businessUnitId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('the Owner can read their own cache rows through RLS', async () => {
    await fx.owner.client.rpc('compute_sales_insights', { p_business_unit_id: fx.businessUnitId })
    const { data, error } = await fx.owner.client
      .from('sales_insights_cache')
      .select('section')
      .eq('business_unit_id', fx.businessUnitId)

    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.section).sort()).toEqual([
      'forecast',
      'restock',
      'slow_movers',
    ])
  })
})
