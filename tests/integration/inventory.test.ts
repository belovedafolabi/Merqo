import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { fetchPermissionGrants } from '@/lib/auth/context'
import { resolvePermission } from '@/lib/auth/permissions'
import { pool, withTransaction } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Milestone 07's own inventory suite, following tests/integration/
 * products.test.ts's established templates: a raw `pg` pool +
 * withTransaction() for schema/constraint/function-level checks (rolled
 * back, self-contained), and real supabase-js clients for authorization/RLS
 * (need cross-connection visibility a rolled-back transaction can never
 * provide — PostgREST is a separate process from the `pg` pool). The
 * concurrency suite is the one exception to withTransaction(): it needs two
 * real, separately-committing backend connections to prove the row lock
 * actually serializes them, so it manages its own commits/cleanup.
 */

async function seedOrgWithTwoBranches(client: PoolClient, label: string) {
  const suffix = randomUUID().slice(0, 8)
  const businessType = await client.query(
    `select id from public.business_types where slug = 'supermarket'`,
  )
  const org = await client.query(
    `insert into public.organizations (name, slug) values ($1, $2) returning id`,
    [`${label} Org`, `${label.toLowerCase()}-org-${suffix}`],
  )
  const branchA = await client.query(
    `insert into public.branches (organization_id, name, slug) values ($1, 'Branch A', $2) returning id`,
    [org.rows[0].id, `${label.toLowerCase()}-a-${suffix}`],
  )
  const branchB = await client.query(
    `insert into public.branches (organization_id, name, slug) values ($1, 'Branch B', $2) returning id`,
    [org.rows[0].id, `${label.toLowerCase()}-b-${suffix}`],
  )
  const businessUnitA = await client.query(
    `insert into public.business_units (branch_id, business_type_id, name, slug) values ($1, $2, 'BU A', $3) returning id`,
    [branchA.rows[0].id, businessType.rows[0].id, `${label.toLowerCase()}-bua-${suffix}`],
  )
  const businessUnitB = await client.query(
    `insert into public.business_units (branch_id, business_type_id, name, slug) values ($1, $2, 'BU B', $3) returning id`,
    [branchB.rows[0].id, businessType.rows[0].id, `${label.toLowerCase()}-bub-${suffix}`],
  )
  return {
    organizationId: org.rows[0].id as string,
    branchA: branchA.rows[0].id as string,
    branchB: branchB.rows[0].id as string,
    businessUnitA: businessUnitA.rows[0].id as string,
    businessUnitB: businessUnitB.rows[0].id as string,
  }
}

async function insertProduct(client: PoolClient, businessUnitId: string, sku: string) {
  const result = await client.query(
    `insert into public.products (business_unit_id, name, sku, base_price, cost_price)
     values ($1, 'Test Product', $2, 500, 300) returning id`,
    [businessUnitId, sku],
  )
  return result.rows[0].id as string
}

async function recordMovement(
  client: PoolClient,
  branchId: string,
  productId: string,
  quantityDelta: number,
  reason: string | null = 'test',
) {
  return client.query(
    `select * from public.record_inventory_movement($1, $2, null, 'ADJUSTMENT', $3, $4, null, null)`,
    [branchId, productId, quantityDelta, reason],
  )
}

// A single shared afterAll for the whole file — `pool` is one module-level
// singleton, so calling pool.end() from more than one describe block's own
// afterAll would close it after the first block finishes and break every
// later block in this same file (same reasoning as products.test.ts).
afterAll(async () => {
  await pool.end()
})

describe('record_inventory_movement() — the shared ledger primitive', () => {
  it('increments and decrements the balance, recording a movement each time', async () => {
    await withTransaction(async (client) => {
      const { branchA, businessUnitA } = await seedOrgWithTwoBranches(client, 'Move')
      const productId = await insertProduct(client, businessUnitA, 'MOVE-1')

      const stockIn = await recordMovement(client, branchA, productId, 10, 'initial stock')
      expect(Number(stockIn.rows[0].quantity_after)).toBe(10)

      const stockOut = await recordMovement(client, branchA, productId, -4, 'correction')
      expect(Number(stockOut.rows[0].quantity_after)).toBe(6)

      const balance = await client.query(
        `select quantity from public.inventory_balances where branch_id = $1 and product_id = $2`,
        [branchA, productId],
      )
      expect(Number(balance.rows[0].quantity)).toBe(6)
    })
  })

  it('rejects a movement that would drive the balance negative', async () => {
    await withTransaction(async (client) => {
      const { branchA, businessUnitA } = await seedOrgWithTwoBranches(client, 'Neg')
      const productId = await insertProduct(client, businessUnitA, 'NEG-1')

      await expect(recordMovement(client, branchA, productId, -1, 'oops')).rejects.toThrow()
    })
  })

  it('rejects an ADJUSTMENT movement with no reason (DB check constraint)', async () => {
    await withTransaction(async (client) => {
      const { branchA, businessUnitA } = await seedOrgWithTwoBranches(client, 'Reason')
      const productId = await insertProduct(client, businessUnitA, 'REASON-1')

      await expect(recordMovement(client, branchA, productId, 5, null)).rejects.toMatchObject({
        code: '23514', // check_violation
      })
    })
  })

  it('the balance always equals the sum of its movements (ledger reconstruction)', async () => {
    await withTransaction(async (client) => {
      const { branchA, businessUnitA } = await seedOrgWithTwoBranches(client, 'Recon')
      const productId = await insertProduct(client, businessUnitA, 'RECON-1')

      await recordMovement(client, branchA, productId, 15, 'a')
      await recordMovement(client, branchA, productId, -4, 'b')
      await recordMovement(client, branchA, productId, 9, 'c')

      const sum = await client.query(
        `select coalesce(sum(quantity_delta), 0) as total from public.inventory_movements
         where branch_id = $1 and product_id = $2`,
        [branchA, productId],
      )
      const balance = await client.query(
        `select quantity from public.inventory_balances where branch_id = $1 and product_id = $2`,
        [branchA, productId],
      )
      expect(Number(balance.rows[0].quantity)).toBe(Number(sum.rows[0].total))
      expect(Number(balance.rows[0].quantity)).toBe(20)
    })
  })
})

describe('execute_stock_transfer() — branch-to-branch transfer atomicity', () => {
  it('rejects a transfer exceeding available source stock', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchA, branchB, businessUnitA, businessUnitB } =
        await seedOrgWithTwoBranches(client, 'XferFail')
      const sourceProduct = await insertProduct(client, businessUnitA, 'XF-SRC')
      const destProduct = await insertProduct(client, businessUnitB, 'XF-DST')

      const items = JSON.stringify([
        {
          source_product_id: sourceProduct,
          source_variant_id: null,
          destination_product_id: destProduct,
          destination_variant_id: null,
          quantity: 5,
        },
      ])

      await expect(
        client.query(`select * from public.execute_stock_transfer($1, $2, $3, $4::jsonb)`, [
          organizationId,
          branchA,
          branchB,
          items,
        ]),
      ).rejects.toThrow()
    })
  })

  it('a successful transfer produces exactly one TRANSFER_OUT and TRANSFER_IN, crediting the destination product row', async () => {
    await withTransaction(async (client) => {
      const { organizationId, branchA, branchB, businessUnitA, businessUnitB } =
        await seedOrgWithTwoBranches(client, 'XferOk')
      const sourceProduct = await insertProduct(client, businessUnitA, 'XO-SRC')
      const destProduct = await insertProduct(client, businessUnitB, 'XO-DST')

      await recordMovement(client, branchA, sourceProduct, 20, 'initial stock')

      const items = JSON.stringify([
        {
          source_product_id: sourceProduct,
          source_variant_id: null,
          destination_product_id: destProduct,
          destination_variant_id: null,
          quantity: 8,
        },
      ])
      const transferResult = await client.query(
        `select * from public.execute_stock_transfer($1, $2, $3, $4::jsonb)`,
        [organizationId, branchA, branchB, items],
      )
      const transferId = transferResult.rows[0].id

      const movements = await client.query(
        `select movement_type, product_id, branch_id, quantity_delta
         from public.inventory_movements where reference_id = $1 order by movement_type`,
        [transferId],
      )
      expect(movements.rows).toHaveLength(2)

      const out = movements.rows.find((row) => row.movement_type === 'TRANSFER_OUT')
      const inRow = movements.rows.find((row) => row.movement_type === 'TRANSFER_IN')
      expect(out.product_id).toBe(sourceProduct)
      expect(out.branch_id).toBe(branchA)
      expect(Number(out.quantity_delta)).toBe(-8)
      expect(inRow.product_id).toBe(destProduct)
      expect(inRow.branch_id).toBe(branchB)
      expect(Number(inRow.quantity_delta)).toBe(8)

      const sourceBalance = await client.query(
        `select quantity from public.inventory_balances where branch_id = $1 and product_id = $2`,
        [branchA, sourceProduct],
      )
      expect(Number(sourceBalance.rows[0].quantity)).toBe(12)

      const destBalance = await client.query(
        `select quantity from public.inventory_balances where branch_id = $1 and product_id = $2`,
        [branchB, destProduct],
      )
      expect(Number(destBalance.rows[0].quantity)).toBe(8)
    })
  })
})

describe('concurrency — two simultaneous adjustments against the same balance', () => {
  it('serializes via the row lock to a correct, non-racy final quantity', async () => {
    const suffix = randomUUID().slice(0, 8)
    const businessType = await pool.query(
      `select id from public.business_types where slug = 'supermarket'`,
    )
    const org = await pool.query(
      `insert into public.organizations (name, slug) values ('Concurrency Org', $1) returning id`,
      [`concurrency-org-${suffix}`],
    )
    const branch = await pool.query(
      `insert into public.branches (organization_id, name, slug) values ($1, 'Main', $2) returning id`,
      [org.rows[0].id, `concurrency-branch-${suffix}`],
    )
    const businessUnit = await pool.query(
      `insert into public.business_units (branch_id, business_type_id, name, slug) values ($1, $2, 'BU', $3) returning id`,
      [branch.rows[0].id, businessType.rows[0].id, `concurrency-bu-${suffix}`],
    )
    const product = await pool.query(
      `insert into public.products (business_unit_id, name, sku, base_price, cost_price)
       values ($1, 'Concurrent Product', $2, 500, 300) returning id`,
      [businessUnit.rows[0].id, `CONC-${suffix}`],
    )
    const branchId = branch.rows[0].id as string
    const productId = product.rows[0].id as string

    // Seed an initial balance so both concurrent deductions can succeed.
    await pool.query(
      `select * from public.record_inventory_movement($1, $2, null, 'ADJUSTMENT', 50, 'seed', null, null)`,
      [branchId, productId],
    )

    const clientA = await pool.connect()
    const clientB = await pool.connect()

    try {
      await clientA.query('BEGIN')
      await clientB.query('BEGIN')

      // clientA's call takes the row lock (FOR UPDATE inside
      // record_inventory_movement()); clientB's identical call against the
      // same balance blocks until clientA commits — that block is the
      // concurrency guarantee under test.
      const first = clientA.query(
        `select * from public.record_inventory_movement($1, $2, null, 'ADJUSTMENT', -10, 'concurrent A', null, null)`,
        [branchId, productId],
      )
      await new Promise((resolve) => setTimeout(resolve, 50))
      const second = clientB.query(
        `select * from public.record_inventory_movement($1, $2, null, 'ADJUSTMENT', -15, 'concurrent B', null, null)`,
        [branchId, productId],
      )

      await first
      await clientA.query('COMMIT')
      await second
      await clientB.query('COMMIT')

      const balance = await pool.query(
        `select quantity from public.inventory_balances where branch_id = $1 and product_id = $2`,
        [branchId, productId],
      )
      expect(Number(balance.rows[0].quantity)).toBe(25) // 50 - 10 - 15

      const movementCount = await pool.query(
        `select count(*) from public.inventory_movements where branch_id = $1 and product_id = $2`,
        [branchId, productId],
      )
      expect(Number(movementCount.rows[0].count)).toBe(3) // seed + A + B
    } finally {
      clientA.release()
      clientB.release()
      // Real commits happened above — explicit cleanup, unlike the
      // rolled-back withTransaction() fixtures used elsewhere in this file.
      await pool.query(`delete from public.inventory_movements where branch_id = $1`, [branchId])
      await pool.query(`delete from public.inventory_balances where branch_id = $1`, [branchId])
      await pool.query(`delete from public.products where id = $1`, [productId])
      await pool.query(`delete from public.business_units where id = $1`, [businessUnit.rows[0].id])
      await pool.query(`delete from public.branches where id = $1`, [branchId])
      await pool.query(`delete from public.organizations where id = $1`, [org.rows[0].id])
    }
  })
})

describe('inventory — authorization (permission resolution against real data)', () => {
  it('an Owner is allowed inventory.adjust/inventory.transfer; a user with no role is denied', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Inventory Auth Org')
    const branch = await pool.query(
      `insert into public.branches (organization_id, name, slug) values ($1, 'Main', $2) returning id`,
      [organizationId, `inv-auth-branch-${randomUUID().slice(0, 8)}`],
    )
    const branchId = branch.rows[0].id as string

    const ownerGrants = await fetchPermissionGrants(owner.client)
    expect(resolvePermission(ownerGrants, 'inventory.adjust', { organizationId, branchId })).toBe(
      true,
    )
    expect(resolvePermission(ownerGrants, 'inventory.transfer', { organizationId, branchId })).toBe(
      true,
    )

    const bystander = await createTestUser()
    const bystanderGrants = await fetchPermissionGrants(bystander.client)
    expect(
      resolvePermission(bystanderGrants, 'inventory.adjust', { organizationId, branchId }),
    ).toBe(false)
  })

  it('a Branch Manager scoped to one branch cannot adjust or transfer inventory at a different branch', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Branch Scope Org')
    const suffix = randomUUID().slice(0, 8)
    const branchA = await pool.query(
      `insert into public.branches (organization_id, name, slug) values ($1, 'A', $2) returning id`,
      [organizationId, `branch-scope-a-${suffix}`],
    )
    const branchB = await pool.query(
      `insert into public.branches (organization_id, name, slug) values ($1, 'B', $2) returning id`,
      [organizationId, `branch-scope-b-${suffix}`],
    )

    const manager = await createTestUser()
    const managerRole = await pool.query(
      `select id from public.roles where slug = 'branch_manager'`,
    )
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id, branch_id) values ($1, $2, $3, $4)`,
      [manager.userId, managerRole.rows[0].id, organizationId, branchA.rows[0].id],
    )

    const grants = await fetchPermissionGrants(manager.client)
    expect(
      resolvePermission(grants, 'inventory.adjust', {
        organizationId,
        branchId: branchA.rows[0].id,
      }),
    ).toBe(true)
    expect(
      resolvePermission(grants, 'inventory.transfer', {
        organizationId,
        branchId: branchB.rows[0].id,
      }),
    ).toBe(false)
  })
})

describe('inventory — RLS', () => {
  async function seedBranchProductBalance(user: Awaited<ReturnType<typeof createTestUser>>) {
    const { organizationId } = await bootstrapOrganization(user, 'Inv RLS Org')
    const suffix = randomUUID().slice(0, 8)

    const { data: branch, error: branchError } = await user.client
      .from('branches')
      .insert({ organization_id: organizationId, name: 'Main', slug: `inv-rls-branch-${suffix}` })
      .select('id')
      .single()
    if (branchError) throw branchError

    const businessType = await pool.query(
      `select id from public.business_types where slug = 'supermarket'`,
    )
    const { data: businessUnit, error: businessUnitError } = await user.client
      .from('business_units')
      .insert({
        branch_id: branch!.id,
        business_type_id: businessType.rows[0].id,
        name: 'BU',
        slug: `inv-rls-bu-${suffix}`,
      })
      .select('id')
      .single()
    if (businessUnitError) throw businessUnitError

    const { data: product, error: productError } = await user.client
      .from('products')
      .insert({
        business_unit_id: businessUnit!.id,
        name: 'Product',
        sku: `INV-RLS-${suffix}`,
        base_price: 1,
        cost_price: 1,
      })
      .select('id')
      .single()
    if (productError) throw productError

    const { error: movementError } = await user.client.rpc('record_inventory_movement', {
      p_branch_id: branch!.id,
      p_product_id: product!.id,
      p_variant_id: null,
      p_movement_type: 'ADJUSTMENT',
      p_quantity_delta: 5,
      p_reason: 'seed',
      p_reference_type: null,
      p_reference_id: null,
    })
    if (movementError) throw movementError

    return { organizationId, branchId: branch!.id as string, productId: product!.id as string }
  }

  it('a user cannot read inventory balances or movements belonging to another organization', async () => {
    const ownerA = await createTestUser()
    const { branchId } = await seedBranchProductBalance(ownerA)

    const ownerB = await createTestUser()
    await bootstrapOrganization(ownerB, 'Inv RLS Org B')

    const { data: crossOrgBalances, error: crossBalanceError } = await ownerB.client
      .from('inventory_balances')
      .select('id')
      .eq('branch_id', branchId)
    expect(crossBalanceError).toBeNull()
    expect(crossOrgBalances).toHaveLength(0)

    const { data: crossOrgMovements, error: crossMovementError } = await ownerB.client
      .from('inventory_movements')
      .select('id')
      .eq('branch_id', branchId)
    expect(crossMovementError).toBeNull()
    expect(crossOrgMovements).toHaveLength(0)

    const { data: ownBalances, error: ownBalanceError } = await ownerA.client
      .from('inventory_balances')
      .select('id')
      .eq('branch_id', branchId)
    expect(ownBalanceError).toBeNull()
    expect(ownBalances).toHaveLength(1)
  })

  it('cannot bypass the low_stock_threshold column grant to change quantity directly', async () => {
    const owner = await createTestUser()
    const { branchId, productId } = await seedBranchProductBalance(owner)

    const { error } = await owner.client
      .from('inventory_balances')
      .update({ quantity: 999 })
      .eq('branch_id', branchId)
      .eq('product_id', productId)

    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501') // insufficient_privilege
  })

  it('an Owner can set the low_stock_threshold on their own branch balance', async () => {
    const owner = await createTestUser()
    const { branchId, productId } = await seedBranchProductBalance(owner)

    const { data, error } = await owner.client
      .from('inventory_balances')
      .update({ low_stock_threshold: 3 })
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .select('low_stock_threshold')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(Number(data![0]!.low_stock_threshold)).toBe(3)
  })
})
