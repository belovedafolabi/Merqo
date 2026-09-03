import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { pool, withTransaction } from './helpers/db'

/**
 * Coupon redemption invariants, exercised at the SQL level (rolled back,
 * self-contained) the same way tests/integration/sales.test.ts covers
 * create_sale(). The things that MUST be race-free — the redemption-count
 * increment and the max-redemptions cap — live inside create_sale()
 * (20260904090500), so they are tested through it, not through the
 * lib/coupons pre-check.
 */

async function seed(client: PoolClient) {
  const suffix = randomUUID().slice(0, 8)
  const businessType = await client.query(
    `select id from public.business_types where slug = 'supermarket'`,
  )
  const org = await client.query(
    `insert into public.organizations (name, slug) values ($1, $2) returning id`,
    [`Coupon Org ${suffix}`, `coupon-org-${suffix}`],
  )
  const branch = await client.query(
    `insert into public.branches (organization_id, name, slug) values ($1, 'Main', $2) returning id`,
    [org.rows[0].id, `coupon-branch-${suffix}`],
  )
  const businessUnit = await client.query(
    `insert into public.business_units (branch_id, business_type_id, name, slug) values ($1, $2, 'BU', $3) returning id`,
    [branch.rows[0].id, businessType.rows[0].id, `coupon-bu-${suffix}`],
  )
  const product = await client.query(
    `insert into public.products (business_unit_id, name, sku, base_price, cost_price)
     values ($1, 'Test Product', $2, 500, 300) returning id`,
    [businessUnit.rows[0].id, `coupon-sku-${suffix}`],
  )
  await client.query(
    `select public.record_inventory_movement($1, $2, null, 'ADJUSTMENT', 100, 'seed', null, null)`,
    [branch.rows[0].id, product.rows[0].id],
  )
  return {
    organizationId: org.rows[0].id as string,
    branchId: branch.rows[0].id as string,
    businessUnitId: businessUnit.rows[0].id as string,
    productId: product.rows[0].id as string,
  }
}

async function insertCoupon(
  client: PoolClient,
  organizationId: string,
  overrides: Record<string, unknown> = {},
) {
  const row = {
    code: `SAVE${randomUUID().slice(0, 6)}`,
    discount_type: 'fixed',
    discount_value: 100,
    minimum_purchase: 0,
    max_redemptions: null,
    starts_at: null,
    expires_at: null,
    ...overrides,
  }
  const result = await client.query(
    `insert into public.coupons
       (organization_id, code, discount_type, discount_value, minimum_purchase, max_redemptions, starts_at, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      organizationId,
      row.code,
      row.discount_type,
      row.discount_value,
      row.minimum_purchase,
      row.max_redemptions,
      row.starts_at,
      row.expires_at,
    ],
  )
  return result.rows[0].id as string
}

function itemsJson(productId: string, quantity: number, unitPrice: number) {
  return JSON.stringify([
    {
      product_id: productId,
      variant_id: null,
      quantity,
      unit_price: unitPrice,
      line_discount: 0,
      line_total: quantity * unitPrice,
    },
  ])
}

async function createSaleWithCoupon(
  client: PoolClient,
  s: { organizationId: string; branchId: string; businessUnitId: string; productId: string },
  couponId: string | null,
  discountAmount = 100,
) {
  const subtotal = 500
  return client.query(
    `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, $6, $7, null, 0, 0, $8, 'cash', $8, null, null, $9)`,
    [
      s.organizationId,
      s.branchId,
      s.businessUnitId,
      randomUUID(),
      itemsJson(s.productId, 1, subtotal),
      subtotal,
      discountAmount,
      subtotal - discountAmount,
      couponId,
    ],
  )
}

afterAll(async () => {
  await pool.end()
})

describe('coupon redemption via create_sale()', () => {
  it('stamps sales.coupon_id and increments redemption_count', async () => {
    await withTransaction(async (client) => {
      const s = await seed(client)
      const couponId = await insertCoupon(client, s.organizationId)

      const sale = await createSaleWithCoupon(client, s, couponId)
      expect(sale.rows[0].coupon_id).toBe(couponId)

      const coupon = await client.query(
        `select redemption_count from public.coupons where id = $1`,
        [couponId],
      )
      expect(coupon.rows[0].redemption_count).toBe(1)
    })
  })

  it('rejects a redemption past max_redemptions', async () => {
    await withTransaction(async (client) => {
      const s = await seed(client)
      const couponId = await insertCoupon(client, s.organizationId, { max_redemptions: 1 })

      await createSaleWithCoupon(client, s, couponId)
      await expect(createSaleWithCoupon(client, s, couponId)).rejects.toThrow(/redemption limit/i)
    })
  })

  it('rejects an expired coupon', async () => {
    await withTransaction(async (client) => {
      const s = await seed(client)
      const couponId = await insertCoupon(client, s.organizationId, {
        expires_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      await expect(createSaleWithCoupon(client, s, couponId)).rejects.toThrow(/expired/i)
    })
  })

  it('rejects when the subtotal is below minimum_purchase', async () => {
    await withTransaction(async (client) => {
      const s = await seed(client)
      const couponId = await insertCoupon(client, s.organizationId, { minimum_purchase: 100000 })
      await expect(createSaleWithCoupon(client, s, couponId)).rejects.toThrow(/minimum purchase/i)
    })
  })

  it('a sale with no coupon leaves coupon_id null', async () => {
    await withTransaction(async (client) => {
      const s = await seed(client)
      const sale = await createSaleWithCoupon(client, s, null, 0)
      expect(sale.rows[0].coupon_id).toBeNull()
    })
  })
})
