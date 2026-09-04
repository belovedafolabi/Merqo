import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { pool, withTransaction } from './helpers/db'

/**
 * Milestone 17 Part B's deliberate contract exception. `services` adds a schema
 * column and touches create_sale(), which Part B's "configuration only" rule
 * would otherwise forbid — so the tracked path must be proven byte-for-byte
 * unchanged, and the non-tracked path must genuinely skip stock.
 *
 * Runs over the `pg` pool inside a rolled-back transaction — this is a
 * correctness check on create_sale()'s arithmetic and side effects, not an RLS
 * check.
 */

afterAll(async () => {
  await pool.end()
})

async function seedUnit(client: Parameters<Parameters<typeof withTransaction>[0]>[0]) {
  const suffix = randomUUID().slice(0, 8)
  const typeId = (
    await client.query(`select id from public.business_types where slug = 'beauty_salons_barbers'`)
  ).rows[0].id
  const org = (
    await client.query(
      `insert into public.organizations (name, slug) values ('Svc Org', $1) returning id`,
      [`svc-org-${suffix}`],
    )
  ).rows[0].id as string
  const branch = (
    await client.query(
      `insert into public.branches (organization_id, name, slug) values ($1, 'Main', $2) returning id`,
      [org, `svc-b-${suffix}`],
    )
  ).rows[0].id as string
  const unit = (
    await client.query(
      `insert into public.business_units (branch_id, business_type_id, name, slug)
       values ($1, $2, 'Salon', $3) returning id`,
      [branch, typeId, `svc-u-${suffix}`],
    )
  ).rows[0].id as string
  return { org, branch, unit, suffix }
}

async function newProduct(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  unit: string,
  suffix: string,
  trackInventory: boolean,
): Promise<string> {
  return (
    await client.query(
      `insert into public.products (business_unit_id, name, sku, base_price, cost_price, track_inventory)
       values ($1, $2, $3, 1000, 400, $4) returning id`,
      [
        unit,
        trackInventory ? 'Shampoo' : 'Haircut',
        `SVC-${suffix}-${trackInventory}`,
        trackInventory,
      ],
    )
  ).rows[0].id as string
}

function sale(org: string, branch: string, unit: string, productId: string, qty: number) {
  return [
    org,
    branch,
    unit,
    randomUUID(),
    JSON.stringify([
      {
        product_id: productId,
        variant_id: null,
        quantity: qty,
        unit_price: 1000,
        line_discount: 0,
        line_total: 1000 * qty,
      },
    ]),
    1000 * qty,
  ]
}

/** Returns exactly one sale_item row for a single-line sale — the id create_return() needs. */
async function soleSaleItemId(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  saleId: string,
): Promise<string> {
  return (await client.query(`select id from public.sale_items where sale_id = $1`, [saleId]))
    .rows[0].id as string
}

describe('services — a non-tracked product sells with no stock', () => {
  it('records the sale and its item, but no inventory movement and no balance', async () => {
    await withTransaction(async (client) => {
      const { org, branch, unit, suffix } = await seedUnit(client)
      const serviceId = await newProduct(client, unit, suffix, false)

      const result = await client.query(
        `select id from public.create_sale($1,$2,$3,$4,$5::jsonb,$6,0,null,0,0,$6,'cash',$6,null,null)`,
        sale(org, branch, unit, serviceId, 3),
      )
      const saleId = result.rows[0].id

      const items = await client.query(
        `select quantity from public.sale_items where sale_id = $1`,
        [saleId],
      )
      expect(items.rows).toHaveLength(1)
      expect(Number(items.rows[0].quantity)).toBe(3)

      const movements = await client.query(
        `select count(*)::int as n from public.inventory_movements where product_id = $1`,
        [serviceId],
      )
      expect(movements.rows[0].n).toBe(0)

      const balance = await client.query(
        `select count(*)::int as n from public.inventory_balances where product_id = $1`,
        [serviceId],
      )
      expect(balance.rows[0].n).toBe(0)
    })
  })
})

describe('tracked products are unchanged', () => {
  it('still deducts stock and still rejects overselling', async () => {
    await withTransaction(async (client) => {
      const { org, branch, unit, suffix } = await seedUnit(client)
      const stockedId = await newProduct(client, unit, suffix, true)

      // 10 in stock.
      await client.query(
        `select public.record_inventory_movement($1, $2, null, 'ADJUSTMENT', 10, 'seed', null, null)`,
        [branch, stockedId],
      )

      await client.query(
        `select id from public.create_sale($1,$2,$3,$4,$5::jsonb,$6,0,null,0,0,$6,'cash',$6,null,null)`,
        sale(org, branch, unit, stockedId, 4),
      )

      const balance = await client.query(
        `select available_quantity from public.inventory_balances where product_id = $1`,
        [stockedId],
      )
      expect(Number(balance.rows[0].available_quantity)).toBe(6)

      // Overselling the remaining 6 still fails.
      await expect(
        client.query(
          `select id from public.create_sale($1,$2,$3,$4,$5::jsonb,$6,0,null,0,0,$6,'cash',$6,null,null)`,
          sale(org, branch, unit, stockedId, 99),
        ),
      ).rejects.toThrow()
    })
  })

  it('a mixed cart deducts only the tracked line', async () => {
    await withTransaction(async (client) => {
      const { org, branch, unit, suffix } = await seedUnit(client)
      const serviceId = await newProduct(client, unit, suffix, false)
      const stockedId = await newProduct(client, unit, suffix, true)
      await client.query(
        `select public.record_inventory_movement($1, $2, null, 'ADJUSTMENT', 5, 'seed', null, null)`,
        [branch, stockedId],
      )

      await client.query(
        `select id from public.create_sale($1,$2,$3,$4,$5::jsonb,3000,0,null,0,0,3000,'cash',3000,null,null)`,
        [
          org,
          branch,
          unit,
          randomUUID(),
          JSON.stringify([
            {
              product_id: serviceId,
              variant_id: null,
              quantity: 2,
              unit_price: 1000,
              line_discount: 0,
              line_total: 2000,
            },
            {
              product_id: stockedId,
              variant_id: null,
              quantity: 1,
              unit_price: 1000,
              line_discount: 0,
              line_total: 1000,
            },
          ]),
        ],
      )

      const stocked = await client.query(
        `select available_quantity from public.inventory_balances where product_id = $1`,
        [stockedId],
      )
      expect(Number(stocked.rows[0].available_quantity)).toBe(4)

      const svcMovements = await client.query(
        `select count(*)::int as n from public.inventory_movements where product_id = $1`,
        [serviceId],
      )
      expect(svcMovements.rows[0].n).toBe(0)
    })
  })
})

/**
 * create_return() (20260907090100) needed the identical track_inventory
 * guard create_sale() got in Part B — it called record_inventory_movement()
 * unconditionally for every returned line, missed when the sale-path fix
 * shipped.
 */
describe('returns — the track_inventory guard mirrors create_sale()', () => {
  it('a non-tracked product returns with no inventory movement and no balance', async () => {
    await withTransaction(async (client) => {
      const { org, branch, unit, suffix } = await seedUnit(client)
      const serviceId = await newProduct(client, unit, suffix, false)

      const saleResult = await client.query(
        `select id from public.create_sale($1,$2,$3,$4,$5::jsonb,$6,0,null,0,0,$6,'cash',$6,null,null)`,
        sale(org, branch, unit, serviceId, 3),
      )
      const saleId = saleResult.rows[0].id
      const saleItemId = await soleSaleItemId(client, saleId)

      await client.query(`select id from public.create_return($1, 'changed mind', $2::jsonb)`, [
        saleId,
        JSON.stringify([{ sale_item_id: saleItemId, quantity: 1, reason: 'changed mind' }]),
      ])

      const returnItems = await client.query(
        `select quantity from public.return_items where sale_item_id = $1`,
        [saleItemId],
      )
      expect(returnItems.rows).toHaveLength(1)
      expect(Number(returnItems.rows[0].quantity)).toBe(1)

      const movements = await client.query(
        `select count(*)::int as n from public.inventory_movements where product_id = $1`,
        [serviceId],
      )
      expect(movements.rows[0].n).toBe(0)

      const balance = await client.query(
        `select count(*)::int as n from public.inventory_balances where product_id = $1`,
        [serviceId],
      )
      expect(balance.rows[0].n).toBe(0)
    })
  })

  it('a tracked product still records the RETURN movement and restores the balance', async () => {
    await withTransaction(async (client) => {
      const { org, branch, unit, suffix } = await seedUnit(client)
      const stockedId = await newProduct(client, unit, suffix, true)
      await client.query(
        `select public.record_inventory_movement($1, $2, null, 'ADJUSTMENT', 10, 'seed', null, null)`,
        [branch, stockedId],
      )

      const saleResult = await client.query(
        `select id from public.create_sale($1,$2,$3,$4,$5::jsonb,$6,0,null,0,0,$6,'cash',$6,null,null)`,
        sale(org, branch, unit, stockedId, 4),
      )
      const saleId = saleResult.rows[0].id
      const saleItemId = await soleSaleItemId(client, saleId)

      const balanceAfterSale = await client.query(
        `select available_quantity from public.inventory_balances where product_id = $1`,
        [stockedId],
      )
      expect(Number(balanceAfterSale.rows[0].available_quantity)).toBe(6)

      await client.query(`select id from public.create_return($1, 'damaged', $2::jsonb)`, [
        saleId,
        JSON.stringify([{ sale_item_id: saleItemId, quantity: 2, reason: 'damaged' }]),
      ])

      const movements = await client.query(
        `select movement_type, quantity_delta from public.inventory_movements
         where product_id = $1 and movement_type = 'RETURN'`,
        [stockedId],
      )
      expect(movements.rows).toHaveLength(1)
      expect(Number(movements.rows[0].quantity_delta)).toBe(2)

      const balanceAfterReturn = await client.query(
        `select available_quantity from public.inventory_balances where product_id = $1`,
        [stockedId],
      )
      expect(Number(balanceAfterReturn.rows[0].available_quantity)).toBe(8)
    })
  })
})
