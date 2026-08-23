import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { deriveStoreCreditBalance } from '@/lib/customers/ledger'
import { pool, withTransaction } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Milestone 09's own suite, following tests/integration/sales.test.ts's
 * established templates exactly: a raw `pg` pool + withTransaction() for
 * schema/constraint/function-level checks (rolled back, self-contained), and
 * real supabase-js clients for authorization/RLS. The concurrency suite is
 * the one exception to withTransaction(), same reasoning sales.test.ts and
 * inventory.test.ts both document — it needs two real, separately-committing
 * backend connections to prove the row lock actually serializes them.
 *
 * record_store_credit_entry()/create_layaway()/record_layaway_payment()/
 * cancel_layaway() are exercised directly via raw SQL here (not through
 * lib/customers/mutations.ts, which needs a real Next.js request context for
 * requirePermission()) — same division as sales.test.ts's own coverage.
 * The pure balance arithmetic lives in tests/unit/customers/ledger.test.ts;
 * what this file proves is what only a real database can: atomicity,
 * locking, append-only-ness, and the cache never drifting from its ledger.
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

async function insertCustomer(client: PoolClient, organizationId: string, name = 'Ada Customer') {
  const result = await client.query(
    `insert into public.customers (organization_id, customer_code, name)
     values ($1, $2, $3) returning id`,
    [organizationId, `CUS-${randomUUID().slice(0, 8)}`, name],
  )
  return result.rows[0].id as string
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

function recordCredit(
  client: PoolClient,
  customerId: string,
  amount: number,
  entryType: 'issue' | 'spend' | 'refund_to_credit' | 'adjustment' = 'issue',
  reason: string | null = null,
) {
  return client.query(
    `select * from public.record_store_credit_entry($1, $2, $3, $4, null, null)`,
    [customerId, amount, entryType, reason],
  )
}

function layawayItemsJson(
  items: Array<{ productId: string; quantity: number; unitPrice: number }>,
) {
  return JSON.stringify(
    items.map((item) => ({
      product_id: item.productId,
      variant_id: null,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: item.quantity * item.unitPrice,
    })),
  )
}

function createLayaway(
  client: PoolClient,
  params: {
    organizationId: string
    branchId: string
    businessUnitId: string
    customerId: string
    items: Array<{ productId: string; quantity: number; unitPrice: number }>
  },
) {
  const total = params.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  return client.query(`select * from public.create_layaway($1, $2, $3, $4, $5, $6, $7::jsonb)`, [
    params.organizationId,
    params.branchId,
    params.businessUnitId,
    params.customerId,
    `LAY-${randomUUID().slice(0, 8)}`,
    total,
    layawayItemsJson(params.items),
  ])
}

async function balanceRow(client: PoolClient, branchId: string, productId: string) {
  const result = await client.query(
    `select quantity, reserved_quantity, available_quantity
     from public.inventory_balances where branch_id = $1 and product_id = $2`,
    [branchId, productId],
  )
  return {
    quantity: Number(result.rows[0].quantity),
    reserved: Number(result.rows[0].reserved_quantity),
    available: Number(result.rows[0].available_quantity),
  }
}

afterAll(async () => {
  await pool.end()
})

describe('record_store_credit_entry() — the shared ledger primitive', () => {
  it('creates the account on first use and derives the balance from the ledger', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seedOrgWithBranch(client, 'Credit')
      const customerId = await insertCustomer(client, organizationId)

      await recordCredit(client, customerId, 5000, 'issue', 'Goodwill')
      await recordCredit(client, customerId, -1500, 'spend')

      const entries = await client.query(
        `select l.amount, l.balance_after
         from public.store_credit_ledger l
         join public.store_credit_accounts a on a.id = l.account_id
         where a.customer_id = $1
         order by l.created_at`,
        [customerId],
      )
      expect(entries.rows).toHaveLength(2)
      expect(Number(entries.rows[1].balance_after)).toBe(3500)

      const account = await client.query(
        `select balance from public.store_credit_accounts where customer_id = $1`,
        [customerId],
      )

      // The cached balance and the independent TypeScript derivation must
      // agree — this milestone's Risks section names drift between them as
      // the main technical risk, so it is asserted directly, not assumed.
      const derived = deriveStoreCreditBalance(
        entries.rows.map((row) => ({ amount: Number(row.amount) })),
      )
      expect(Number(account.rows[0].balance)).toBe(3500)
      expect(derived).toBe(3500)
    })
  })

  it('allows an exact-balance spend down to zero', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seedOrgWithBranch(client, 'Exact')
      const customerId = await insertCustomer(client, organizationId)

      await recordCredit(client, customerId, 2500, 'issue')
      const spend = await recordCredit(client, customerId, -2500, 'spend')
      expect(Number(spend.rows[0].balance_after)).toBe(0)
    })
  })

  it('rejects an overdraw, leaving no ledger row behind', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seedOrgWithBranch(client, 'Overdraw')
      const customerId = await insertCustomer(client, organizationId)

      await recordCredit(client, customerId, 1000, 'issue')

      await client.query('SAVEPOINT before_overdraw')
      await expect(recordCredit(client, customerId, -1001, 'spend')).rejects.toThrow(
        /insufficient store credit/,
      )
      await client.query('ROLLBACK TO SAVEPOINT before_overdraw')

      const entries = await client.query(
        `select count(*) from public.store_credit_ledger l
         join public.store_credit_accounts a on a.id = l.account_id
         where a.customer_id = $1`,
        [customerId],
      )
      expect(Number(entries.rows[0].count)).toBe(1)
    })
  })

  it('rejects any spend against a customer who has never had credit', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seedOrgWithBranch(client, 'NoCredit')
      const customerId = await insertCustomer(client, organizationId)

      await expect(recordCredit(client, customerId, -1, 'spend')).rejects.toThrow(
        /insufficient store credit/,
      )
    })
  })

  it('refuses an entry whose sign contradicts its type', async () => {
    await withTransaction(async (client) => {
      const { organizationId } = await seedOrgWithBranch(client, 'SignCheck')
      const customerId = await insertCustomer(client, organizationId)

      // A negative 'issue' is nonsense — the CHECK on store_credit_ledger
      // makes it impossible rather than merely discouraged.
      await expect(recordCredit(client, customerId, -100, 'issue')).rejects.toThrow()
    })
  })

  it('rejects an unknown customer', async () => {
    await withTransaction(async (client) => {
      await expect(recordCredit(client, randomUUID(), 100, 'issue')).rejects.toThrow(
        /unknown customer/,
      )
    })
  })
})

describe('store credit at checkout and from a refund — the Milestone 08 reconciliation', () => {
  it('deducts the balance atomically with the sale', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(client, 'Spend')
      const customerId = await insertCustomer(client, organizationId)
      const productId = await insertProduct(client, businessUnitId, 'SC-1')
      await stockUp(client, branchId, productId, 10)
      await recordCredit(client, customerId, 5000, 'issue')

      const sale = await client.query(
        `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, 1500, 0, null, 0, 0, 1500, 'store_credit', 1500, null, $6)`,
        [
          organizationId,
          branchId,
          businessUnitId,
          randomUUID(),
          JSON.stringify([
            {
              product_id: productId,
              variant_id: null,
              quantity: 3,
              unit_price: 500,
              line_discount: 0,
              line_total: 1500,
            },
          ]),
          customerId,
        ],
      )
      expect(sale.rows[0].customer_id).toBe(customerId)

      const account = await client.query(
        `select balance from public.store_credit_accounts where customer_id = $1`,
        [customerId],
      )
      expect(Number(account.rows[0].balance)).toBe(3500)

      // The spend entry points back at the sale that caused it, so the trail
      // reads in both directions.
      const entry = await client.query(
        `select l.entry_type, l.amount, l.reference_type, l.reference_id
         from public.store_credit_ledger l
         join public.store_credit_accounts a on a.id = l.account_id
         where a.customer_id = $1 and l.entry_type = 'spend'`,
        [customerId],
      )
      expect(entry.rows).toHaveLength(1)
      expect(entry.rows[0].reference_type).toBe('sale')
      expect(entry.rows[0].reference_id).toBe(sale.rows[0].id)
    })
  })

  it('rolls the whole sale back when the balance cannot cover it', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(client, 'Short')
      const customerId = await insertCustomer(client, organizationId)
      const productId = await insertProduct(client, businessUnitId, 'SC-2')
      await stockUp(client, branchId, productId, 10)
      await recordCredit(client, customerId, 100, 'issue')

      const idempotencyKey = randomUUID()
      await client.query('SAVEPOINT before_short')
      await expect(
        client.query(
          `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, 1500, 0, null, 0, 0, 1500, 'store_credit', 1500, null, $6)`,
          [
            organizationId,
            branchId,
            businessUnitId,
            idempotencyKey,
            JSON.stringify([
              {
                product_id: productId,
                variant_id: null,
                quantity: 3,
                unit_price: 500,
                line_discount: 0,
                line_total: 1500,
              },
            ]),
            customerId,
          ],
        ),
      ).rejects.toThrow(/insufficient store credit/)
      await client.query('ROLLBACK TO SAVEPOINT before_short')

      // No sale, and — critically — no stock deducted either. The whole
      // transaction unwound, not just the payment step.
      const orphan = await client.query(`select id from public.sales where idempotency_key = $1`, [
        idempotencyKey,
      ])
      expect(orphan.rows).toHaveLength(0)
      expect((await balanceRow(client, branchId, productId)).quantity).toBe(10)
    })
  })

  it('rejects a store-credit sale with no customer attached', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(client, 'NoCust')
      const productId = await insertProduct(client, businessUnitId, 'SC-3')
      await stockUp(client, branchId, productId, 10)

      await expect(
        client.query(
          `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, 500, 0, null, 0, 0, 500, 'store_credit', 500, null, null)`,
          [
            organizationId,
            branchId,
            businessUnitId,
            randomUUID(),
            JSON.stringify([
              {
                product_id: productId,
                variant_id: null,
                quantity: 1,
                unit_price: 500,
                line_discount: 0,
                line_total: 500,
              },
            ]),
          ],
        ),
      ).rejects.toThrow(/store credit sale requires a customer/)
    })
  })

  it('issues credit when a store-credit refund is approved — and only then', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(
        client,
        'RefundCredit',
      )
      const customerId = await insertCustomer(client, organizationId)
      const productId = await insertProduct(client, businessUnitId, 'RC-1')
      await stockUp(client, branchId, productId, 10)

      const sale = await client.query(
        `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, 1000, 0, null, 0, 0, 1000, 'cash', 1000, null, $6)`,
        [
          organizationId,
          branchId,
          businessUnitId,
          randomUUID(),
          JSON.stringify([
            {
              product_id: productId,
              variant_id: null,
              quantity: 2,
              unit_price: 500,
              line_discount: 0,
              line_total: 1000,
            },
          ]),
          customerId,
        ],
      )

      const refund = await client.query(
        `select * from public.request_refund($1, null, 1000, 'store_credit', 'Damaged on arrival')`,
        [sale.rows[0].id],
      )

      // A pending refund has issued nothing.
      const beforeDecision = await client.query(
        `select count(*) from public.store_credit_accounts where customer_id = $1`,
        [customerId],
      )
      expect(Number(beforeDecision.rows[0].count)).toBe(0)

      await client.query(`select * from public.decide_refund($1, true)`, [refund.rows[0].id])

      const account = await client.query(
        `select balance from public.store_credit_accounts where customer_id = $1`,
        [customerId],
      )
      expect(Number(account.rows[0].balance)).toBe(1000)

      const entry = await client.query(
        `select l.entry_type, l.reference_type, l.reference_id
         from public.store_credit_ledger l
         join public.store_credit_accounts a on a.id = l.account_id
         where a.customer_id = $1`,
        [customerId],
      )
      expect(entry.rows[0].entry_type).toBe('refund_to_credit')
      expect(entry.rows[0].reference_type).toBe('refund')
      expect(entry.rows[0].reference_id).toBe(refund.rows[0].id)
    })
  })

  it('issue via refund, then spend at checkout, leaves one consistent trail', async () => {
    // The walkthrough from this milestone's Definition of Done, end to end.
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(
        client,
        'RoundTrip',
      )
      const customerId = await insertCustomer(client, organizationId)
      const productId = await insertProduct(client, businessUnitId, 'RT-1')
      await stockUp(client, branchId, productId, 20)

      const itemsJson = (quantity: number, lineTotal: number) =>
        JSON.stringify([
          {
            product_id: productId,
            variant_id: null,
            quantity,
            unit_price: 500,
            line_discount: 0,
            line_total: lineTotal,
          },
        ])

      const firstSale = await client.query(
        `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, 2000, 0, null, 0, 0, 2000, 'cash', 2000, null, $6)`,
        [organizationId, branchId, businessUnitId, randomUUID(), itemsJson(4, 2000), customerId],
      )
      const refund = await client.query(
        `select * from public.request_refund($1, null, 2000, 'store_credit', 'Returned')`,
        [firstSale.rows[0].id],
      )
      await client.query(`select * from public.decide_refund($1, true)`, [refund.rows[0].id])

      await client.query(
        `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, 1500, 0, null, 0, 0, 1500, 'store_credit', 1500, null, $6)`,
        [organizationId, branchId, businessUnitId, randomUUID(), itemsJson(3, 1500), customerId],
      )

      const entries = await client.query(
        `select l.amount, l.balance_after
         from public.store_credit_ledger l
         join public.store_credit_accounts a on a.id = l.account_id
         where a.customer_id = $1
         order by l.created_at`,
        [customerId],
      )
      const account = await client.query(
        `select balance from public.store_credit_accounts where customer_id = $1`,
        [customerId],
      )

      expect(entries.rows).toHaveLength(2)
      expect(Number(account.rows[0].balance)).toBe(500)
      expect(
        deriveStoreCreditBalance(entries.rows.map((row) => ({ amount: Number(row.amount) }))),
      ).toBe(500)
      expect(Number(entries.rows.at(-1)!.balance_after)).toBe(500)
    })
  })
})

describe('layaway lifecycle', () => {
  it('reserves stock at creation without changing on-hand quantity', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(client, 'Lay')
      const customerId = await insertCustomer(client, organizationId)
      const productId = await insertProduct(client, businessUnitId, 'LAY-1')
      await stockUp(client, branchId, productId, 10)

      await createLayaway(client, {
        organizationId,
        branchId,
        businessUnitId,
        customerId,
        items: [{ productId, quantity: 2, unitPrice: 500 }],
      })

      const balance = await balanceRow(client, branchId, productId)
      expect(balance.quantity).toBe(10)
      expect(balance.reserved).toBe(2)
      expect(balance.available).toBe(8)
    })
  })

  it('refuses to reserve stock that is not there, rolling the layaway back entirely', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(
        client,
        'LayShort',
      )
      const customerId = await insertCustomer(client, organizationId)
      const productId = await insertProduct(client, businessUnitId, 'LAY-2')
      await stockUp(client, branchId, productId, 1)

      await client.query('SAVEPOINT before_layaway')
      await expect(
        createLayaway(client, {
          organizationId,
          branchId,
          businessUnitId,
          customerId,
          items: [{ productId, quantity: 5, unitPrice: 500 }],
        }),
      ).rejects.toThrow(/insufficient stock to reserve/)
      await client.query('ROLLBACK TO SAVEPOINT before_layaway')

      const layaways = await client.query(
        `select count(*) from public.layaways where customer_id = $1`,
        [customerId],
      )
      expect(Number(layaways.rows[0].count)).toBe(0)
    })
  })

  it('reserved stock cannot be sold at the till', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(
        client,
        'Protect',
      )
      const customerId = await insertCustomer(client, organizationId)
      const productId = await insertProduct(client, businessUnitId, 'LAY-3')
      await stockUp(client, branchId, productId, 3)

      await createLayaway(client, {
        organizationId,
        branchId,
        businessUnitId,
        customerId,
        items: [{ productId, quantity: 3, unitPrice: 500 }],
      })

      // The failure mode docs/Customer Management_… §28 describes: without
      // reservations respected by the movement guard, this sale would
      // succeed and leave the layaway customer with nothing.
      await expect(
        client.query(
          `select * from public.create_sale($1, $2, $3, $4, $5::jsonb, 500, 0, null, 0, 0, 500, 'cash', 500, null, null)`,
          [
            organizationId,
            branchId,
            businessUnitId,
            randomUUID(),
            JSON.stringify([
              {
                product_id: productId,
                variant_id: null,
                quantity: 1,
                unit_price: 500,
                line_discount: 0,
                line_total: 500,
              },
            ]),
          ],
        ),
      ).rejects.toThrow(/insufficient stock/)
    })
  })

  it('progresses through partial payments to completion, deducting stock exactly once', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(client, 'Pay')
      const customerId = await insertCustomer(client, organizationId)
      const productId = await insertProduct(client, businessUnitId, 'PAY-1')
      await stockUp(client, branchId, productId, 10)

      const layaway = await createLayaway(client, {
        organizationId,
        branchId,
        businessUnitId,
        customerId,
        items: [{ productId, quantity: 2, unitPrice: 500 }],
      })
      const layawayId = layaway.rows[0].id as string
      expect(Number(layaway.rows[0].total_amount)).toBe(1000)

      const first = await client.query(
        `select * from public.record_layaway_payment($1, 400, 'cash', null)`,
        [layawayId],
      )
      expect(Number(first.rows[0].balance_after)).toBe(400)

      const midway = await client.query(
        `select status, amount_paid from public.layaways where id = $1`,
        [layawayId],
      )
      expect(midway.rows[0].status).toBe('active')
      expect(Number(midway.rows[0].amount_paid)).toBe(400)

      // Still reserved, still not deducted, while money is outstanding.
      const midBalance = await balanceRow(client, branchId, productId)
      expect(midBalance.quantity).toBe(10)
      expect(midBalance.reserved).toBe(2)

      await client.query(`select * from public.record_layaway_payment($1, 600, 'cash', null)`, [
        layawayId,
      ])

      const settled = await client.query(
        `select status, amount_paid, completed_at from public.layaways where id = $1`,
        [layawayId],
      )
      expect(settled.rows[0].status).toBe('paid')
      expect(Number(settled.rows[0].amount_paid)).toBe(1000)
      expect(settled.rows[0].completed_at).not.toBeNull()

      // Reservation released and real stock deducted, once.
      const finalBalance = await balanceRow(client, branchId, productId)
      expect(finalBalance.quantity).toBe(8)
      expect(finalBalance.reserved).toBe(0)
      expect(finalBalance.available).toBe(8)

      const movements = await client.query(
        `select count(*) from public.inventory_movements
         where reference_type = 'layaway' and reference_id = $1`,
        [layawayId],
      )
      expect(Number(movements.rows[0].count)).toBe(1)
    })
  })

  it('rejects an overpayment', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(client, 'Over')
      const customerId = await insertCustomer(client, organizationId)
      const productId = await insertProduct(client, businessUnitId, 'OVER-L1')
      await stockUp(client, branchId, productId, 10)

      const layaway = await createLayaway(client, {
        organizationId,
        branchId,
        businessUnitId,
        customerId,
        items: [{ productId, quantity: 1, unitPrice: 500 }],
      })

      await expect(
        client.query(`select * from public.record_layaway_payment($1, 501, 'cash', null)`, [
          layaway.rows[0].id,
        ]),
      ).rejects.toThrow(/exceeds the .* outstanding/)
    })
  })

  it('refuses further payments once a layaway is settled', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(client, 'Done')
      const customerId = await insertCustomer(client, organizationId)
      const productId = await insertProduct(client, businessUnitId, 'DONE-1')
      await stockUp(client, branchId, productId, 10)

      const layaway = await createLayaway(client, {
        organizationId,
        branchId,
        businessUnitId,
        customerId,
        items: [{ productId, quantity: 1, unitPrice: 500 }],
      })
      await client.query(`select * from public.record_layaway_payment($1, 500, 'cash', null)`, [
        layaway.rows[0].id,
      ])

      await expect(
        client.query(`select * from public.record_layaway_payment($1, 100, 'cash', null)`, [
          layaway.rows[0].id,
        ]),
      ).rejects.toThrow(/is paid and cannot take further payments/)
    })
  })

  it('an installment is immutable — no UPDATE or DELETE grant exists for it', async () => {
    await withTransaction(async (client) => {
      const grants = await client.query(
        `select privilege_type from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'layaway_payments' and grantee = 'authenticated'`,
      )
      const privileges = grants.rows.map((row) => row.privilege_type as string)
      expect(privileges).toContain('SELECT')
      expect(privileges).not.toContain('UPDATE')
      expect(privileges).not.toContain('DELETE')
      expect(privileges).not.toContain('INSERT')
    })
  })

  it('cancelling releases the reservation and keeps every payment on the record', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchId, businessUnitId } = await seedOrgWithBranch(client, 'Cancel')
      const customerId = await insertCustomer(client, organizationId)
      const productId = await insertProduct(client, businessUnitId, 'CAN-1')
      await stockUp(client, branchId, productId, 10)

      const layaway = await createLayaway(client, {
        organizationId,
        branchId,
        businessUnitId,
        customerId,
        items: [{ productId, quantity: 2, unitPrice: 500 }],
      })
      await client.query(`select * from public.record_layaway_payment($1, 300, 'cash', null)`, [
        layaway.rows[0].id,
      ])

      await client.query(`select * from public.cancel_layaway($1, 'Customer changed their mind')`, [
        layaway.rows[0].id,
      ])

      const balance = await balanceRow(client, branchId, productId)
      expect(balance.quantity).toBe(10)
      expect(balance.reserved).toBe(0)

      const payments = await client.query(
        `select count(*) from public.layaway_payments where layaway_id = $1`,
        [layaway.rows[0].id],
      )
      expect(Number(payments.rows[0].count)).toBe(1)

      const row = await client.query(`select status from public.layaways where id = $1`, [
        layaway.rows[0].id,
      ])
      expect(row.rows[0].status).toBe('cancelled')
    })
  })
})

describe('store credit — the append-only guarantee', () => {
  it('neither the ledger nor the cached balance is writable by `authenticated`', async () => {
    await withTransaction(async (client) => {
      // This milestone's Acceptance Criteria: "no code path writes a bare
      // balance value". Withholding the grant is what makes that structural
      // rather than a convention — asserted here so a future migration
      // loosening it fails loudly.
      //
      // Asserted as "SELECT and nothing else" rather than "no
      // INSERT/UPDATE/DELETE": Supabase's own bootstrap used to also grant
      // REFERENCES, TRIGGER, and TRUNCATE to `authenticated` on every table
      // in `public` — unreachable through PostgREST (no verb maps to them)
      // but not filtered by RLS either, which mattered for TRUNCATE in
      // particular. 20260823140000_revoke_authenticated_anon_dangerous_grants.sql
      // revoked all three schema-wide, so this table's grant set is exactly
      // SELECT — see tests/integration/rls-policies.test.ts for the
      // schema-wide assertion that keeps it that way.
      const grants = await client.query(
        `select table_name, privilege_type from information_schema.role_table_grants
         where table_schema = 'public'
           and table_name in ('store_credit_ledger', 'store_credit_accounts')
           and grantee = 'authenticated'`,
      )
      const byTable = new Map<string, string[]>()
      for (const row of grants.rows) {
        const table = row.table_name as string
        byTable.set(table, [...(byTable.get(table) ?? []), row.privilege_type as string])
      }
      expect(byTable.get('store_credit_ledger')).toEqual(['SELECT'])
      expect(byTable.get('store_credit_accounts')).toEqual(['SELECT'])
    })
  })
})

describe('concurrency — two simultaneous spends of the same store credit', () => {
  it('the balance can only be spent once; the second attempt is rejected', async () => {
    const client = await pool.connect()
    let customerId = ''
    try {
      const { organizationId } = await seedOrgWithBranch(client, 'ConcCredit')
      customerId = await insertCustomer(client, organizationId)
      await recordCredit(client, customerId, 1000, 'issue')

      const clientA = await pool.connect()
      const clientB = await pool.connect()
      try {
        await clientA.query('BEGIN')
        await clientB.query('BEGIN')

        // clientA takes the FOR UPDATE lock on the account row; clientB's
        // identical spend blocks until clientA commits, then re-reads the
        // committed balance — which is what stops both from individually
        // deciding they can afford the same ₦1,000.
        const first = clientA.query(
          `select * from public.record_store_credit_entry($1, -1000, 'spend', null, null, null)`,
          [customerId],
        )
        await new Promise((resolve) => setTimeout(resolve, 50))
        const second = clientB.query(
          `select * from public.record_store_credit_entry($1, -1000, 'spend', null, null, null)`,
          [customerId],
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
        await clientB.query(secondResult.ok ? 'COMMIT' : 'ROLLBACK')

        expect(firstResult.ok).toBe(true)
        expect(secondResult.ok).toBe(false)

        const account = await client.query(
          `select balance from public.store_credit_accounts where customer_id = $1`,
          [customerId],
        )
        expect(Number(account.rows[0].balance)).toBe(0)

        const entries = await client.query(
          `select count(*) from public.store_credit_ledger l
           join public.store_credit_accounts a on a.id = l.account_id
           where a.customer_id = $1 and l.entry_type = 'spend'`,
          [customerId],
        )
        expect(Number(entries.rows[0].count)).toBe(1)
      } finally {
        clientA.release()
        clientB.release()
      }
    } finally {
      // This suite commits for real (two separate connections are the whole
      // point), so it cleans up after itself rather than relying on a
      // rollback — same shape as sales.test.ts's own concurrency suite.
      if (customerId) {
        await client.query(
          `delete from public.store_credit_ledger where account_id in
             (select id from public.store_credit_accounts where customer_id = $1)`,
          [customerId],
        )
        await client.query(`delete from public.store_credit_accounts where customer_id = $1`, [
          customerId,
        ])
        await client.query(`delete from public.customers where id = $1`, [customerId])
      }
      client.release()
    }
  })
})

describe('customers — authorization and RLS', () => {
  it('a user cannot read customers belonging to another organization', async () => {
    const client = await pool.connect()
    let customerId = ''
    try {
      const outsider = await createTestUser()
      await bootstrapOrganization(outsider, 'Outsider Co')

      const { organizationId } = await seedOrgWithBranch(client, 'Private')
      customerId = await insertCustomer(client, organizationId, 'Private Customer')

      const { data, error } = await outsider.client
        .from('customers')
        .select('id')
        .eq('id', customerId)

      // RLS filters the row out rather than erroring — an outsider learns
      // nothing about whether it exists.
      expect(error).toBeNull()
      expect(data).toEqual([])
    } finally {
      if (customerId) await client.query(`delete from public.customers where id = $1`, [customerId])
      client.release()
    }
  })

  it('a customer is visible across every branch of its own organization', async () => {
    await withTransaction(async (client) => {
      // The business-wide requirement, asserted at the policy level: the
      // customers_select policy uses user_has_org_access(), so no branch
      // scoping narrows it. Verified structurally here since seeding two
      // branches plus two role assignments through GoTrue would prove the
      // same thing far more slowly.
      const policy = await client.query(
        `select qual from pg_policies
         where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_select'`,
      )
      expect(policy.rows).toHaveLength(1)
      expect(policy.rows[0].qual).toContain('user_has_org_access')
      expect(policy.rows[0].qual).not.toContain('user_has_branch_access')
    })
  })

  it("a fresh Owner holds this milestone's permissions; a Cashier holds only the till subset", async () => {
    await withTransaction(async (client) => {
      const ownerKeys = await client.query(
        `select p.key from public.role_permissions rp
         join public.roles r on r.id = rp.role_id
         join public.permissions p on p.id = rp.permission_id
         where r.slug = 'owner' and p.resource in ('customers', 'store_credit', 'layaway')`,
      )
      const owner = ownerKeys.rows.map((row) => row.key as string)
      expect(owner).toContain('store_credit.issue')
      expect(owner).toContain('store_credit.adjust')
      expect(owner).toContain('layaway.cancel')

      const cashierKeys = await client.query(
        `select p.key from public.role_permissions rp
         join public.roles r on r.id = rp.role_id
         join public.permissions p on p.id = rp.permission_id
         where r.slug = 'cashier' and p.resource in ('customers', 'store_credit', 'layaway')`,
      )
      const cashier = cashierKeys.rows.map((row) => row.key as string)
      expect(cashier).toContain('customers.create')
      expect(cashier).toContain('layaway.record_payment')

      // Least privilege: a cashier can take an installment but cannot mint
      // balance or release reserved stock (supabase/seed.sql section 5e).
      expect(cashier).not.toContain('store_credit.issue')
      expect(cashier).not.toContain('store_credit.adjust')
      expect(cashier).not.toContain('layaway.cancel')
      expect(cashier).not.toContain('customers.update')
    })
  })

  it('mutating store credit requires going through the RPC, not a direct table write', async () => {
    const user = await createTestUser()
    const { organizationId } = await bootstrapOrganization(user, 'Direct Write Co')

    const { data: customer, error: insertError } = await user.client
      .from('customers')
      .insert({
        organization_id: organizationId,
        customer_code: `CUS-${randomUUID().slice(0, 8)}`,
        name: 'Direct Write Target',
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    // An Owner holds every permission and still cannot write a balance by
    // hand — the grant simply does not exist.
    const { error } = await user.client.from('store_credit_accounts').insert({
      customer_id: (customer as { id: string }).id,
      organization_id: organizationId,
      balance: 999999,
    })
    expect(error).not.toBeNull()
  })
})
