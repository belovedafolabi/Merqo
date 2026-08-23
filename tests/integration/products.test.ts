import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { fetchPermissionGrants } from '@/lib/auth/context'
import { resolvePermission } from '@/lib/auth/permissions'
import { pool, withTransaction } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Milestone 06's own product/pricing suite, following
 * tests/integration/business-structure.test.ts's/audit.test.ts's
 * established templates: raw `pg` pool for schema/constraint-level checks
 * (business-unit-scoped SKU/barcode uniqueness, the variant business_unit_id
 * sync trigger, product_prices' append-only enforcement), and real
 * supabase-js clients for the permission-resolution check (cost price
 * hidden from an unauthorized role).
 */

async function seedBusinessUnit(client: PoolClient, label: string) {
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
    `insert into public.business_units (branch_id, business_type_id, name, slug)
     values ($1, $2, $3, $4) returning id`,
    [branch.rows[0].id, businessType.rows[0].id, label, `${label.toLowerCase()}-bu-${suffix}`],
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
  overrides: { barcode?: string | null } = {},
) {
  const result = await client.query(
    `insert into public.products (business_unit_id, name, sku, barcode, base_price, cost_price)
     values ($1, 'Test Product', $2, $3, 500, 300) returning id`,
    [businessUnitId, sku, overrides.barcode ?? null],
  )
  return result.rows[0].id as string
}

// A single shared afterAll for the whole file — `pool` is one module-level
// singleton (tests/integration/helpers/db.ts), so calling pool.end() from
// more than one describe block's own afterAll would close it after the
// first block finishes and break every later block in this same file.
afterAll(async () => {
  await pool.end()
})

describe('products — business-unit-scoped uniqueness', () => {
  it('rejects a duplicate SKU within the same business unit', async () => {
    await withTransaction(async (client) => {
      const { businessUnitId } = await seedBusinessUnit(client, 'SkuDup')
      await insertProduct(client, businessUnitId, 'SKU-001')
      await expect(insertProduct(client, businessUnitId, 'SKU-001')).rejects.toMatchObject({
        code: '23505',
      })
    })
  })

  it('allows the same SKU across two different business units', async () => {
    await withTransaction(async (client) => {
      const a = await seedBusinessUnit(client, 'SkuCrossA')
      const b = await seedBusinessUnit(client, 'SkuCrossB')
      await expect(insertProduct(client, a.businessUnitId, 'SHARED-SKU')).resolves.toBeTruthy()
      await expect(insertProduct(client, b.businessUnitId, 'SHARED-SKU')).resolves.toBeTruthy()
    })
  })

  it('rejects a duplicate barcode within the same business unit', async () => {
    // A constraint-violating statement aborts the rest of its Postgres
    // transaction (25P02, "current transaction is aborted") — this needs
    // its own withTransaction block, separate from the "no barcode doesn't
    // conflict" case below, rather than continuing to insert afterward in
    // the same one.
    await withTransaction(async (client) => {
      const { businessUnitId } = await seedBusinessUnit(client, 'BarcodeDup')
      await insertProduct(client, businessUnitId, 'SKU-A', { barcode: '6001234567890' })
      await expect(
        insertProduct(client, businessUnitId, 'SKU-B', { barcode: '6001234567890' }),
      ).rejects.toMatchObject({ code: '23505' })
    })
  })

  it('allows multiple products with no barcode at all in the same business unit', async () => {
    await withTransaction(async (client) => {
      const { businessUnitId } = await seedBusinessUnit(client, 'BarcodeNull')
      await expect(insertProduct(client, businessUnitId, 'SKU-C')).resolves.toBeTruthy()
      await expect(insertProduct(client, businessUnitId, 'SKU-D')).resolves.toBeTruthy()
    })
  })

  it('an archived product’s SKU can be reused by a new one (partial-unique per archived_at convention)', async () => {
    await withTransaction(async (client) => {
      const { businessUnitId } = await seedBusinessUnit(client, 'SkuReuse')
      const productId = await insertProduct(client, businessUnitId, 'REUSABLE-SKU')
      await client.query(
        `update public.products set archived_at = now() where id = $1`,
        [productId],
      )
      await expect(insertProduct(client, businessUnitId, 'REUSABLE-SKU')).resolves.toBeTruthy()
    })
  })
})

describe('product_variants — business_unit_id is derived, not trusted', () => {
  it('sets business_unit_id from the parent product regardless of what the caller supplies', async () => {
    await withTransaction(async (client) => {
      const real = await seedBusinessUnit(client, 'VariantReal')
      const other = await seedBusinessUnit(client, 'VariantOther')
      const productId = await insertProduct(client, real.businessUnitId, 'VARIANT-PARENT')

      const variant = await client.query(
        `insert into public.product_variants (product_id, business_unit_id, name)
         values ($1, $2, 'Large') returning business_unit_id`,
        [productId, other.businessUnitId],
      )

      expect(variant.rows[0].business_unit_id).toBe(real.businessUnitId)
      expect(variant.rows[0].business_unit_id).not.toBe(other.businessUnitId)
    })
  })

  it('rejects a duplicate variant SKU within the same business unit', async () => {
    await withTransaction(async (client) => {
      const { businessUnitId } = await seedBusinessUnit(client, 'VariantSkuDup')
      const productId = await insertProduct(client, businessUnitId, 'PARENT-SKU')

      await client.query(
        `insert into public.product_variants (product_id, business_unit_id, name, sku) values ($1, $2, 'Small', 'VAR-SKU')`,
        [productId, businessUnitId],
      )
      await expect(
        client.query(
          `insert into public.product_variants (product_id, business_unit_id, name, sku) values ($1, $2, 'Medium', 'VAR-SKU')`,
          [productId, businessUnitId],
        ),
      ).rejects.toMatchObject({ code: '23505' })
    })
  })
})

describe('product_prices — append-only enforcement', () => {
  it('an authenticated user cannot INSERT into product_prices directly (only record_product_price() can)', async () => {
    await withTransaction(async (client) => {
      const { businessUnitId } = await seedBusinessUnit(client, 'PriceHistoryDirect')
      const productId = await insertProduct(client, businessUnitId, 'PRICE-DIRECT')

      await client.query('SET LOCAL ROLE authenticated')
      await expect(
        client.query(
          `insert into public.product_prices (product_id, price) values ($1, 999)`,
          [productId],
        ),
      ).rejects.toMatchObject({ code: '42501' })
    })
  })

  // Two separate transactions, not one — a failed statement (the expected
  // 42501) aborts the rest of its Postgres transaction (25P02), so the
  // UPDATE and DELETE checks each need their own withTransaction block,
  // same as tests/integration/audit.test.ts's own UPDATE/DELETE checks.
  it('an authenticated user cannot UPDATE product_prices', async () => {
    await withTransaction(async (client) => {
      const { businessUnitId } = await seedBusinessUnit(client, 'PriceHistoryTamperUpdate')
      const productId = await insertProduct(client, businessUnitId, 'PRICE-TAMPER-UPDATE')
      const row = await client.query(
        `select record_product_price($1, null, 500, null) as id`,
        [productId],
      )
      const priceId = row.rows[0].id

      await client.query('SET LOCAL ROLE authenticated')
      await expect(
        client.query('update public.product_prices set price = 1 where id = $1', [priceId]),
      ).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('an authenticated user cannot DELETE product_prices', async () => {
    await withTransaction(async (client) => {
      const { businessUnitId } = await seedBusinessUnit(client, 'PriceHistoryTamperDelete')
      const productId = await insertProduct(client, businessUnitId, 'PRICE-TAMPER-DELETE')
      const row = await client.query(
        `select record_product_price($1, null, 500, null) as id`,
        [productId],
      )
      const priceId = row.rows[0].id

      await client.query('SET LOCAL ROLE authenticated')
      await expect(
        client.query('delete from public.product_prices where id = $1', [priceId]),
      ).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('record_product_price() is the working insert path and is reachable by authenticated', async () => {
    await withTransaction(async (client) => {
      const { businessUnitId } = await seedBusinessUnit(client, 'PriceHistoryRpc')
      const productId = await insertProduct(client, businessUnitId, 'PRICE-RPC')

      await client.query('SET LOCAL ROLE authenticated')
      const result = await client.query(
        `select record_product_price($1, null, 750, null) as id`,
        [productId],
      )
      expect(result.rows[0].id).toBeTruthy()
    })
  })
})

describe('cost price — hidden from a role without products.view_cost_price', () => {
  it('Owner has products.view_cost_price; Branch Manager does not', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Cost Price Test Org')

    const manager = await createTestUser()
    const managerRole = await pool.query(
      `select id from public.roles where slug = 'branch_manager'`,
    )
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
      [manager.userId, managerRole.rows[0].id, organizationId],
    )

    const ownerGrants = await fetchPermissionGrants(owner.client)
    expect(resolvePermission(ownerGrants, 'products.view_cost_price', { organizationId })).toBe(
      true,
    )

    const managerGrants = await fetchPermissionGrants(manager.client)
    expect(
      resolvePermission(managerGrants, 'products.view_cost_price', { organizationId }),
    ).toBe(false)
    // Branch Manager still gets the general product-management permissions.
    expect(resolvePermission(managerGrants, 'products.view', { organizationId })).toBe(true)
    expect(resolvePermission(managerGrants, 'products.create', { organizationId })).toBe(true)
  })
})
