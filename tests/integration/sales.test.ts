import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { fetchPermissionGrants } from '@/lib/auth/context'
import { resolvePermission } from '@/lib/auth/permissions'
import { pool, withTransaction } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Milestone 08's own sales suite, following tests/integration/
 * inventory.test.ts's established templates exactly: a raw `pg` pool +
 * withTransaction() for schema/constraint/function-level checks (rolled
 * back, self-contained), and real supabase-js clients for authorization/RLS.
 * The concurrency suite is the one exception to withTransaction(), same
 * reasoning as inventory.test.ts's own — it needs two real, separately-
 * committing backend connections to prove the row lock actually serializes
 * them.
 *
 * create_sale()/create_return()/request_refund()/decide_refund() are
 * exercised directly via raw SQL here (not through lib/sales/mutations.ts,
 * which needs a real Next.js request context for requirePermission()) —
 * same division as inventory.test.ts's own record_inventory_movement()
 * coverage. "Audit-event creation" for a completed sale is satisfied
 * structurally by lib/sales/mutations.ts calling the same recordAuditEvent()
 * helper tests/integration/audit.test.ts already proves correct — not
 * re-tested here.
 */

async function seedOrgWithBranch(client: PoolClient, label: string) {
  const suffix = randomUUID().slice(0, 8)
  const businessType = await client.query(
    `select id from public.business_types where slug = 'supermarket'`,
  )
  const org = await client.query(
    `insert into public.organizations (name, slug) values ($1, $2) returning id`,
    [`${label} Org`, `${label.toLowerCase()}-org-${suffix}`],
  )
  const branch = await client.query(
    `insert into public.branches (organization_id, name, slug) values ($1, 'Main', $2) returning id`,
    [org.rows[0].id, `${label.toLowerCase()}-branch-${suffix}`],
  )
  const businessUnit = await client.query(
    `insert into public.business_units (branch_id, business_type_id, name, slug) values ($1, $2, 'BU', $3) returning id`,
    [branch.rows[0].id, businessType.rows[0].id, `${label.toLowerCase()}-bu-${suffix}`],
  )
  return {
    organizationId: org.rows[0].id as string,
    branchId: branch.rows[0].id as string,
    businessUnitId: businessUnit.rows[0].id as string,
  }
}

async function insertProduct(
  client: PoolClient,
  businessUnitId: string,
  sku: string,
  basePrice = 500,
) {
  const result = await client.query(
    `insert into public.products (business_unit_id, name, sku, base_price, cost_price)
     values ($1, 'Test Product', $2, $3, 300) returning id`,
    [businessUnitId, sku, basePrice],
  )
  return result.rows[0].id as string
}

async function stockUp(client: PoolClient, branchId: string, productId: string, quantity: number) {
  await client.query(
    `select * from public.record_inventory_movement($1, $2, null, 'ADJUSTMENT', $3, 'seed', null, null)`,
    [branchId, productId, quantity],
  )
}

function saleItemsJson(items: Array<{ productId: string; quantity: number; unitPrice: number }>) {
  return JSON.stringify(
    items.map((item) => ({
      product_id: item.productId,
      variant_id: null,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_discount: 0,
      line_total: item.quantity * item.unitPrice,
    })),
  )
}

async function createSale(
  client: PoolClient,
  params: {
    organizationId: string
    branchId: string
    businessUnitId: string
    idempotencyKey: string
    items: Array<{ productId: string; quantity: number; unitPrice: number }>
  },
) {
  const total = params.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  return client.query(
    `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, $6, 0, null, 0, 0, $6, 'cash', $6, null)`,
    [
      params.organizationId,
      params.branchId,
      params.businessUnitId,
      params.idempotencyKey,
      saleItemsJson(params.items),
      total,
    ],
  )
}

afterAll(async () => {
  await pool.end()
})

describe('create_sale() — the atomic sale primitive', () => {
  it('creates a sale, sale_items, and a payment, deducting inventory', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(client, 'Sale')
      const productId = await insertProduct(client, businessUnitId, 'SALE-1')
      await stockUp(client, branchId, productId, 10)

      const result = await createSale(client, {
        organizationId,
        branchId,
        businessUnitId,
        idempotencyKey: randomUUID(),
        items: [{ productId, quantity: 3, unitPrice: 500 }],
      })
      const sale = result.rows[0]
      expect(Number(sale.total)).toBe(1500)

      const items = await client.query(`select * from public.sale_items where sale_id = $1`, [
        sale.id,
      ])
      expect(items.rows).toHaveLength(1)
      expect(Number(items.rows[0].quantity)).toBe(3)

      const payments = await client.query(`select * from public.payments where sale_id = $1`, [
        sale.id,
      ])
      expect(payments.rows).toHaveLength(1)
      expect(Number(payments.rows[0].amount)).toBe(1500)

      const balance = await client.query(
        `select quantity from public.inventory_balances where branch_id = $1 and product_id = $2`,
        [branchId, productId],
      )
      expect(Number(balance.rows[0].quantity)).toBe(7)
    })
  })

  it('rejects overselling — the entire sale rolls back, leaving no orphan sale/sale_items rows', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(
        client,
        'Oversell',
      )
      const productId = await insertProduct(client, businessUnitId, 'OVER-1')
      await stockUp(client, branchId, productId, 2)

      const idempotencyKey = randomUUID()
      // A raised exception poisons the entire enclosing transaction, not just
      // the failing statement (Postgres has no implicit per-statement
      // savepoint) — an explicit SAVEPOINT/ROLLBACK TO around the
      // expected-to-fail call is what lets the orphan-row check below run in
      // the same withTransaction() rather than getting "current transaction
      // is aborted" (25P02) itself.
      await client.query('SAVEPOINT before_oversell')
      await expect(
        createSale(client, {
          organizationId,
          branchId,
          businessUnitId,
          idempotencyKey,
          items: [{ productId, quantity: 5, unitPrice: 500 }],
        }),
      ).rejects.toThrow()
      await client.query('ROLLBACK TO SAVEPOINT before_oversell')

      const orphanSale = await client.query(
        `select id from public.sales where idempotency_key = $1`,
        [idempotencyKey],
      )
      expect(orphanSale.rows).toHaveLength(0)
    })
  })

  it('idempotency: a retried request with the same key returns the original sale, not a second one', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(client, 'Idem')
      const productId = await insertProduct(client, businessUnitId, 'IDEM-1')
      await stockUp(client, branchId, productId, 10)

      const idempotencyKey = randomUUID()
      const params = {
        organizationId,
        branchId,
        businessUnitId,
        idempotencyKey,
        items: [{ productId, quantity: 2, unitPrice: 500 }],
      }

      const first = await createSale(client, params)
      const second = await createSale(client, params)
      expect(second.rows[0].id).toBe(first.rows[0].id)

      const salesCount = await client.query(
        `select count(*) from public.sales where idempotency_key = $1`,
        [idempotencyKey],
      )
      expect(Number(salesCount.rows[0].count)).toBe(1)

      // Stock was only deducted once — the retried call did not re-run the
      // item loop, since it returned before ever reaching it.
      const balance = await client.query(
        `select quantity from public.inventory_balances where branch_id = $1 and product_id = $2`,
        [branchId, productId],
      )
      expect(Number(balance.rows[0].quantity)).toBe(8)
    })
  })

  it('rejects a line item whose product does not belong to the claimed business unit', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(
        client,
        'WrongBU',
      )
      const { businessUnitId: otherBusinessUnitId } = await seedOrgWithBranch(client, 'OtherBU')
      const productId = await insertProduct(client, otherBusinessUnitId, 'WRONGBU-1')

      await expect(
        createSale(client, {
          organizationId,
          branchId,
          businessUnitId,
          idempotencyKey: randomUUID(),
          items: [{ productId, quantity: 1, unitPrice: 500 }],
        }),
      ).rejects.toThrow()
    })
  })
})

describe('concurrency — two simultaneous sales against the same low-stock product', () => {
  it('only the sale(s) that can be fulfilled succeed; the rest are rejected', async () => {
    const client = await pool.connect()
    let organizationId = ''
    let branchId = ''
    let productId = ''
    try {
      const seeded = await seedOrgWithBranch(client, 'Conc')
      organizationId = seeded.organizationId
      branchId = seeded.branchId
      const businessUnitId = seeded.businessUnitId
      productId = await insertProduct(client, businessUnitId, `CONC-${randomUUID().slice(0, 8)}`)
      await stockUp(client, branchId, productId, 1)

      const clientA = await pool.connect()
      const clientB = await pool.connect()
      try {
        await clientA.query('BEGIN')
        await clientB.query('BEGIN')

        const itemsA = saleItemsJson([{ productId, quantity: 1, unitPrice: 500 }])
        const itemsB = saleItemsJson([{ productId, quantity: 1, unitPrice: 500 }])

        // clientA's create_sale() takes the row lock inside
        // record_inventory_movement(); clientB's identical attempt against
        // the same balance blocks until clientA commits — the same
        // concurrency guarantee inventory.test.ts's own suite proves, now
        // exercised through the sale engine that reuses it.
        const first = clientA.query(
          `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, 500, 0, null, 0, 0, 500, 'cash', 500, null)`,
          [organizationId, branchId, businessUnitId, randomUUID(), itemsA],
        )
        await new Promise((resolve) => setTimeout(resolve, 50))
        const second = clientB.query(
          `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, 500, 0, null, 0, 0, 500, 'cash', 500, null)`,
          [organizationId, branchId, businessUnitId, randomUUID(), itemsB],
        )

        const firstResult = await first.then(
          (r) => ({ ok: true as const, r }),
          (e) => ({ ok: false as const, e }),
        )
        await clientA.query('COMMIT')

        const secondResult = await second.then(
          (r) => ({ ok: true as const, r }),
          (e) => ({ ok: false as const, e }),
        )
        if (secondResult.ok) await clientB.query('COMMIT')
        else await clientB.query('ROLLBACK')

        // Exactly one of the two succeeds against a stock of 1 — never both.
        expect([firstResult.ok, secondResult.ok].filter(Boolean)).toHaveLength(1)

        const balance = await pool.query(
          `select quantity from public.inventory_balances where branch_id = $1 and product_id = $2`,
          [branchId, productId],
        )
        expect(Number(balance.rows[0].quantity)).toBe(0)
      } finally {
        clientA.release()
        clientB.release()
      }
    } finally {
      await pool.query(
        `delete from public.payments where sale_id in (select id from public.sales where branch_id = $1)`,
        [branchId],
      )
      await pool.query(
        `delete from public.sale_items where sale_id in (select id from public.sales where branch_id = $1)`,
        [branchId],
      )
      await pool.query(`delete from public.sales where branch_id = $1`, [branchId])
      await pool.query(`delete from public.inventory_movements where branch_id = $1`, [branchId])
      await pool.query(`delete from public.inventory_balances where branch_id = $1`, [branchId])
      await pool.query(`delete from public.products where id = $1`, [productId])
      await pool.query(`delete from public.business_units where branch_id = $1`, [branchId])
      await pool.query(`delete from public.branches where id = $1`, [branchId])
      await pool.query(`delete from public.organizations where id = $1`, [organizationId])
      client.release()
    }
  })
})

describe('create_return() — reverses inventory and references the original sale', () => {
  it('a return credits inventory back via a RETURN movement and leaves the sale untouched', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(client, 'Return')
      const productId = await insertProduct(client, businessUnitId, 'RET-1')
      await stockUp(client, branchId, productId, 10)

      const saleResult = await createSale(client, {
        organizationId,
        branchId,
        businessUnitId,
        idempotencyKey: randomUUID(),
        items: [{ productId, quantity: 5, unitPrice: 500 }],
      })
      const sale = saleResult.rows[0]
      const saleItem = await client.query(`select id from public.sale_items where sale_id = $1`, [
        sale.id,
      ])
      const saleItemId = saleItem.rows[0].id

      const returnItems = JSON.stringify([
        { sale_item_id: saleItemId, quantity: 2, reason: 'Defective' },
      ])
      const returnResult = await client.query(
        `select * from public.create_return($1, $2, $3::jsonb)`,
        [sale.id, 'Customer return', returnItems],
      )
      expect(returnResult.rows[0].sale_id).toBe(sale.id)

      const balance = await client.query(
        `select quantity from public.inventory_balances where branch_id = $1 and product_id = $2`,
        [branchId, productId],
      )
      // 10 - 5 (sale) + 2 (return) = 7
      expect(Number(balance.rows[0].quantity)).toBe(7)

      const unchangedSale = await client.query(`select total from public.sales where id = $1`, [
        sale.id,
      ])
      expect(Number(unchangedSale.rows[0].total)).toBe(2500)
    })
  })

  it('rejects returning more than was sold, across multiple separate return transactions', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(
        client,
        'OverReturn',
      )
      const productId = await insertProduct(client, businessUnitId, 'OVERRET-1')
      await stockUp(client, branchId, productId, 10)

      const saleResult = await createSale(client, {
        organizationId,
        branchId,
        businessUnitId,
        idempotencyKey: randomUUID(),
        items: [{ productId, quantity: 3, unitPrice: 500 }],
      })
      const sale = saleResult.rows[0]
      const saleItem = await client.query(`select id from public.sale_items where sale_id = $1`, [
        sale.id,
      ])
      const saleItemId = saleItem.rows[0].id

      await client.query(`select * from public.create_return($1, $2, $3::jsonb)`, [
        sale.id,
        'Partial return',
        JSON.stringify([{ sale_item_id: saleItemId, quantity: 2, reason: null }]),
      ])

      await expect(
        client.query(`select * from public.create_return($1, $2, $3::jsonb)`, [
          sale.id,
          'Second return',
          JSON.stringify([{ sale_item_id: saleItemId, quantity: 2, reason: null }]),
        ]),
      ).rejects.toThrow()
    })
  })
})

describe('request_refund() / decide_refund()', () => {
  it('a refund starts pending, and decide_refund() records the authorizing user and a terminal status', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(client, 'Refund')
      const productId = await insertProduct(client, businessUnitId, 'REFUND-1')
      await stockUp(client, branchId, productId, 10)

      const saleResult = await createSale(client, {
        organizationId,
        branchId,
        businessUnitId,
        idempotencyKey: randomUUID(),
        items: [{ productId, quantity: 1, unitPrice: 500 }],
      })
      const sale = saleResult.rows[0]

      const refundResult = await client.query(
        `select * from public.request_refund($1, null, $2, 'cash', $3)`,
        [sale.id, 500, 'Not satisfied'],
      )
      expect(refundResult.rows[0].status).toBe('pending')
      expect(refundResult.rows[0].sale_id).toBe(sale.id)

      const decided = await client.query(`select * from public.decide_refund($1, true)`, [
        refundResult.rows[0].id,
      ])
      expect(decided.rows[0].status).toBe('approved')
      expect(decided.rows[0].decided_at).not.toBeNull()

      // The original sale remains completely unmodified.
      const unchangedSale = await client.query(`select total from public.sales where id = $1`, [
        sale.id,
      ])
      expect(Number(unchangedSale.rows[0].total)).toBe(500)
    })
  })

  it('rejects deciding a refund that has already been decided', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(
        client,
        'RefundTwice',
      )
      const productId = await insertProduct(client, businessUnitId, 'REFUNDTWICE-1')
      await stockUp(client, branchId, productId, 10)

      const saleResult = await createSale(client, {
        organizationId,
        branchId,
        businessUnitId,
        idempotencyKey: randomUUID(),
        items: [{ productId, quantity: 1, unitPrice: 500 }],
      })

      const refundResult = await client.query(
        `select * from public.request_refund($1, null, $2, 'cash', $3)`,
        [saleResult.rows[0].id, 500, 'Not satisfied'],
      )
      await client.query(`select * from public.decide_refund($1, true)`, [refundResult.rows[0].id])

      await expect(
        client.query(`select * from public.decide_refund($1, false)`, [refundResult.rows[0].id]),
      ).rejects.toThrow()
    })
  })
})

describe('sales — authorization (permission resolution against real data)', () => {
  it('an Owner is allowed sales.create/discount.override/refund.approve; a user with no role is denied', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Sales Auth Org')
    const branch = await pool.query(
      `insert into public.branches (organization_id, name, slug) values ($1, 'Main', $2) returning id`,
      [organizationId, `sales-auth-branch-${randomUUID().slice(0, 8)}`],
    )
    const branchId = branch.rows[0].id as string

    const ownerGrants = await fetchPermissionGrants(owner.client)
    for (const key of ['sales.create', 'discount.override', 'refund.approve', 'returns.create']) {
      expect(resolvePermission(ownerGrants, key, { organizationId, branchId })).toBe(true)
    }

    const bystander = await createTestUser()
    const bystanderGrants = await fetchPermissionGrants(bystander.client)
    expect(resolvePermission(bystanderGrants, 'sales.create', { organizationId, branchId })).toBe(
      false,
    )
  })

  it('a Cashier can create sales but cannot override discounts or approve refunds', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Cashier Org')
    const branch = await pool.query(
      `insert into public.branches (organization_id, name, slug) values ($1, 'Main', $2) returning id`,
      [organizationId, `cashier-branch-${randomUUID().slice(0, 8)}`],
    )
    const branchId = branch.rows[0].id as string

    const cashier = await createTestUser()
    const cashierRole = await pool.query(`select id from public.roles where slug = 'cashier'`)
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id, branch_id) values ($1, $2, $3, $4)`,
      [cashier.userId, cashierRole.rows[0].id, organizationId, branchId],
    )

    const grants = await fetchPermissionGrants(cashier.client)
    expect(resolvePermission(grants, 'sales.create', { organizationId, branchId })).toBe(true)
    expect(resolvePermission(grants, 'discount.apply', { organizationId, branchId })).toBe(true)
    expect(resolvePermission(grants, 'discount.override', { organizationId, branchId })).toBe(false)
    expect(resolvePermission(grants, 'refund.approve', { organizationId, branchId })).toBe(false)
  })
})

describe('sales — RLS', () => {
  it('a user cannot read sales belonging to another organization', async () => {
    const client = await pool.connect()
    let branchId = ''
    let saleId = ''
    try {
      const ownerA = await createTestUser()
      const { organizationId: orgA } = await bootstrapOrganization(ownerA, 'Sales RLS Org A')
      const branch = await client.query(
        `insert into public.branches (organization_id, name, slug) values ($1, 'Main', $2) returning id`,
        [orgA, `sales-rls-branch-${randomUUID().slice(0, 8)}`],
      )
      branchId = branch.rows[0].id
      const businessType = await client.query(
        `select id from public.business_types where slug = 'supermarket'`,
      )
      const businessUnit = await client.query(
        `insert into public.business_units (branch_id, business_type_id, name, slug) values ($1, $2, 'BU', $3) returning id`,
        [branchId, businessType.rows[0].id, `sales-rls-bu-${randomUUID().slice(0, 8)}`],
      )
      const productId = await insertProduct(
        client,
        businessUnit.rows[0].id,
        `RLS-${randomUUID().slice(0, 8)}`,
      )
      await stockUp(client, branchId, productId, 5)

      const saleResult = await createSale(client, {
        organizationId: orgA,
        branchId,
        businessUnitId: businessUnit.rows[0].id,
        idempotencyKey: randomUUID(),
        items: [{ productId, quantity: 1, unitPrice: 500 }],
      })
      saleId = saleResult.rows[0].id

      const ownerB = await createTestUser()
      await bootstrapOrganization(ownerB, 'Sales RLS Org B')

      const { data: crossOrgSales, error: crossOrgError } = await ownerB.client
        .from('sales')
        .select('id')
        .eq('id', saleId)
      expect(crossOrgError).toBeNull()
      expect(crossOrgSales).toHaveLength(0)

      const { data: ownSales, error: ownError } = await ownerA.client
        .from('sales')
        .select('id')
        .eq('id', saleId)
      expect(ownError).toBeNull()
      expect(ownSales).toHaveLength(1)
    } finally {
      if (saleId) {
        await pool.query(`delete from public.payments where sale_id = $1`, [saleId])
        await pool.query(`delete from public.sale_items where sale_id = $1`, [saleId])
        await pool.query(`delete from public.sales where id = $1`, [saleId])
      }
      if (branchId) {
        await pool.query(`delete from public.inventory_movements where branch_id = $1`, [branchId])
        await pool.query(`delete from public.inventory_balances where branch_id = $1`, [branchId])
      }
      client.release()
    }
  })

  it('an authenticated user cannot UPDATE or DELETE a completed sale (no grant on the application role)', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(
        client,
        'Immutable',
      )
      const productId = await insertProduct(client, businessUnitId, 'IMMUT-1')
      await stockUp(client, branchId, productId, 5)

      const saleResult = await createSale(client, {
        organizationId,
        branchId,
        businessUnitId,
        idempotencyKey: randomUUID(),
        items: [{ productId, quantity: 1, unitPrice: 500 }],
      })

      await client.query('SET LOCAL ROLE authenticated')

      // Each expected-to-fail statement needs its own SAVEPOINT/ROLLBACK TO —
      // otherwise the UPDATE's 42501 poisons the transaction and the
      // following DELETE surfaces "current transaction is aborted" (25P02)
      // instead of exercising its own grant check.
      await client.query('SAVEPOINT before_update')
      await expect(
        client.query(`update public.sales set total = 0 where id = $1`, [saleResult.rows[0].id]),
      ).rejects.toMatchObject({ code: '42501' })
      await client.query('ROLLBACK TO SAVEPOINT before_update')

      await client.query('SAVEPOINT before_delete')
      await expect(
        client.query(`delete from public.sales where id = $1`, [saleResult.rows[0].id]),
      ).rejects.toMatchObject({ code: '42501' })
      await client.query('ROLLBACK TO SAVEPOINT before_delete')
    })
  })
})
