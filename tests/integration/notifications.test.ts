import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Milestone 12's own suite, following tests/integration/inventory.test.ts's
 * established template: real supabase-js clients (never a Server Action, so
 * PostgREST/RLS is the thing actually under test) for anything that depends
 * on auth.uid() — which every notify_*() function does, since each one
 * self-authorizes via user_has_branch_access()/user_has_permission(). The
 * raw `pg` pool is used only for setup that has no RLS-relevant caller (a
 * business_types lookup) and for backdating a row's created_at to exercise
 * the 24-hour dedupe cooldown, which no application code ever does.
 */

async function seedBranchProductWithThreshold(
  owner: Awaited<ReturnType<typeof createTestUser>>,
  label: string,
) {
  const { organizationId } = await bootstrapOrganization(owner, `${label} Org`)
  const suffix = randomUUID().slice(0, 8)

  const { data: branch, error: branchError } = await owner.client
    .from('branches')
    .insert({ organization_id: organizationId, name: 'Main', slug: `${label}-branch-${suffix}` })
    .select('id')
    .single()
  if (branchError) throw branchError

  const businessType = await pool.query(
    `select id from public.business_types where slug = 'supermarket'`,
  )
  const { data: businessUnit, error: businessUnitError } = await owner.client
    .from('business_units')
    .insert({
      branch_id: branch!.id,
      business_type_id: businessType.rows[0].id,
      name: 'BU',
      slug: `${label}-bu-${suffix}`,
    })
    .select('id')
    .single()
  if (businessUnitError) throw businessUnitError

  const { data: product, error: productError } = await owner.client
    .from('products')
    .insert({
      business_unit_id: businessUnit!.id,
      name: 'Widget',
      sku: `${label}-SKU-${suffix}`,
      base_price: 100,
      cost_price: 50,
    })
    .select('id')
    .single()
  if (productError) throw productError

  return {
    organizationId,
    branchId: branch!.id as string,
    businessUnitId: businessUnit!.id as string,
    productId: product!.id as string,
  }
}

/** Records a movement bringing the balance to `quantity`, then sets a threshold at or above it. */
async function makeLowStock(
  owner: Awaited<ReturnType<typeof createTestUser>>,
  branchId: string,
  productId: string,
  quantity: number,
  threshold: number,
) {
  const { error: movementError } = await owner.client.rpc('record_inventory_movement', {
    p_branch_id: branchId,
    p_product_id: productId,
    p_variant_id: null,
    p_movement_type: 'ADJUSTMENT',
    p_quantity_delta: quantity,
    p_reason: 'seed',
    p_reference_type: null,
    p_reference_id: null,
  })
  if (movementError) throw movementError

  const { error: thresholdError } = await owner.client
    .from('inventory_balances')
    .update({ low_stock_threshold: threshold })
    .eq('branch_id', branchId)
    .eq('product_id', productId)
  if (thresholdError) throw thresholdError
}

interface NotifyLowStockRow {
  notification_id: string
  user_id: string
  email: string
  email_enabled: boolean
}

async function callNotifyLowStock(
  caller: Awaited<ReturnType<typeof createTestUser>>,
  branchId: string,
  productIds: string[] | null = null,
) {
  return caller.client.rpc('notify_low_stock', {
    p_branch_id: branchId,
    p_product_ids: productIds,
  }) as unknown as Promise<{ data: NotifyLowStockRow[] | null; error: { code?: string } | null }>
}

// One shared afterAll — `pool` is a module-level singleton (same reasoning
// as inventory.test.ts's own comment on this).
afterAll(async () => {
  await pool.end()
})

describe('notify_low_stock() — Milestone 07 low stock, end to end (Testing Requirement 2)', () => {
  it('produces exactly one in-app notification and one email payload for the restock authority', async () => {
    const owner = await createTestUser()
    const { branchId, productId } = await seedBranchProductWithThreshold(owner, 'LowStock')
    await makeLowStock(owner, branchId, productId, 3, 5)

    const { data, error } = await callNotifyLowStock(owner, branchId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]!.user_id).toBe(owner.userId)
    expect(data![0]!.email).toBe(owner.email)
    expect(data![0]!.email_enabled).toBe(true)

    const { data: rows } = await owner.client
      .from('notifications')
      .select('type, category, href, metadata')
      .eq('user_id', owner.userId)
    expect(rows).toHaveLength(1)
    expect(rows![0]!.type).toBe('inventory.low_stock')
    expect(rows![0]!.category).toBe('inventory')
    expect(rows![0]!.href).toContain(branchId)
    expect(rows![0]!.metadata).toMatchObject({ threshold: 5 })
  })

  it('does not re-notify for the same still-below-threshold condition (dedupe)', async () => {
    const owner = await createTestUser()
    const { branchId, productId } = await seedBranchProductWithThreshold(owner, 'Dedup')
    await makeLowStock(owner, branchId, productId, 3, 5)

    const first = await callNotifyLowStock(owner, branchId)
    expect(first.data).toHaveLength(1)

    // Still below threshold — a second call within the cooldown window must
    // not produce a second row.
    const second = await callNotifyLowStock(owner, branchId)
    expect(second.data).toHaveLength(0)

    const { data: rows } = await owner.client
      .from('notifications')
      .select('id')
      .eq('user_id', owner.userId)
    expect(rows).toHaveLength(1)
  })

  it('re-notifies once the 24-hour cooldown has elapsed', async () => {
    const owner = await createTestUser()
    const { branchId, productId } = await seedBranchProductWithThreshold(owner, 'Cooldown')
    await makeLowStock(owner, branchId, productId, 3, 5)

    await callNotifyLowStock(owner, branchId)

    // Backdate past the cooldown — a privileged operation no application
    // code performs, hence the raw pool rather than the user's own client
    // (whose UPDATE grant is restricted to read_at; see 20260824100500).
    await pool.query(
      `update public.notifications set created_at = now() - interval '25 hours' where user_id = $1`,
      [owner.userId],
    )

    const { data } = await callNotifyLowStock(owner, branchId)
    expect(data).toHaveLength(1)

    const { data: rows } = await owner.client
      .from('notifications')
      .select('id')
      .eq('user_id', owner.userId)
    expect(rows).toHaveLength(2)
  })

  it('honours the recipient preference: email disabled leaves the row in-app-only', async () => {
    const owner = await createTestUser()
    const { branchId, productId } = await seedBranchProductWithThreshold(owner, 'PrefEmail')
    await makeLowStock(owner, branchId, productId, 3, 5)

    const { error: prefError } = await owner.client.from('notification_preferences').upsert(
      { user_id: owner.userId, category: 'inventory', in_app_enabled: true, email_enabled: false },
      { onConflict: 'user_id,category' },
    )
    expect(prefError).toBeNull()

    const { data } = await callNotifyLowStock(owner, branchId)
    expect(data).toHaveLength(1)
    expect(data![0]!.email_enabled).toBe(false)

    // The in-app row still exists — only email delivery (a TypeScript-layer
    // decision in lib/notifications/low-stock.ts) is what email_enabled
    // gates, not the write itself.
    const { data: rows } = await owner.client
      .from('notifications')
      .select('id')
      .eq('user_id', owner.userId)
    expect(rows).toHaveLength(1)
  })

  it('honours the recipient preference: in-app disabled excludes the recipient entirely', async () => {
    const owner = await createTestUser()
    const { branchId, productId } = await seedBranchProductWithThreshold(owner, 'PrefInApp')
    await makeLowStock(owner, branchId, productId, 3, 5)

    const { error: prefError } = await owner.client.from('notification_preferences').upsert(
      { user_id: owner.userId, category: 'inventory', in_app_enabled: false, email_enabled: true },
      { onConflict: 'user_id,category' },
    )
    expect(prefError).toBeNull()

    const { data } = await callNotifyLowStock(owner, branchId)
    expect(data).toHaveLength(0)

    const { data: rows } = await owner.client
      .from('notifications')
      .select('id')
      .eq('user_id', owner.userId)
    expect(rows).toHaveLength(0)
  })

  it('a Cashier — who holds sales.create but NOT inventory.adjust — can still trigger the branch-scoped alert', async () => {
    const owner = await createTestUser()
    const { organizationId, branchId, productId } = await seedBranchProductWithThreshold(
      owner,
      'Cashier',
    )
    await makeLowStock(owner, branchId, productId, 3, 5)

    const cashier = await createTestUser()
    const cashierRole = await pool.query(`select id from public.roles where slug = 'cashier'`)
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id, branch_id) values ($1, $2, $3, $4)`,
      [cashier.userId, cashierRole.rows[0].id, organizationId, branchId],
    )

    // This is the guard-choice this migration made deliberately: branch
    // access, not inventory.adjust — a cashier finishing a sale is the
    // highest-volume caller and holds neither inventory.adjust nor
    // inventory.view (supabase/seed.sql's pos_operator_permissions list).
    const { data, error } = await callNotifyLowStock(cashier, branchId)
    expect(error).toBeNull()
    // The recipient is still the Owner (holds inventory.adjust) — the
    // cashier merely triggered the check, they are not a recipient.
    expect(data).toHaveLength(1)
    expect(data![0]!.user_id).toBe(owner.userId)
  })

  it('rejects a caller with no access to the branch at all', async () => {
    const owner = await createTestUser()
    const { branchId, productId } = await seedBranchProductWithThreshold(owner, 'Denied')
    await makeLowStock(owner, branchId, productId, 3, 5)

    const stranger = await createTestUser()
    const { error } = await callNotifyLowStock(stranger, branchId)
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})

describe('inventory.transfer path — the only reason transfer-driven depletion is covered', () => {
  it('a transfer draining the source branch below threshold produces a notification', async () => {
    const owner = await createTestUser()
    const {
      organizationId,
      branchId: sourceBranchId,
      productId: sourceProductId,
    } = await seedBranchProductWithThreshold(owner, 'TransferSrc')

    const suffix = randomUUID().slice(0, 8)
    const { data: destBranch, error: destBranchError } = await owner.client
      .from('branches')
      .insert({ organization_id: organizationId, name: 'Dest', slug: `transfer-dest-${suffix}` })
      .select('id')
      .single()
    if (destBranchError) throw destBranchError

    const businessType = await pool.query(
      `select id from public.business_types where slug = 'supermarket'`,
    )
    const { data: destBu, error: destBuError } = await owner.client
      .from('business_units')
      .insert({
        branch_id: destBranch!.id,
        business_type_id: businessType.rows[0].id,
        name: 'Dest BU',
        slug: `transfer-dest-bu-${suffix}`,
      })
      .select('id')
      .single()
    if (destBuError) throw destBuError

    const { data: destProduct, error: destProductError } = await owner.client
      .from('products')
      .insert({
        business_unit_id: destBu!.id,
        name: 'Widget',
        sku: `TRANSFER-DEST-${suffix}`,
        base_price: 100,
        cost_price: 50,
      })
      .select('id')
      .single()
    if (destProductError) throw destProductError

    // Stock the source to exactly the threshold + a small buffer so a
    // 2-unit transfer drains it below.
    await makeLowStock(owner, sourceBranchId, sourceProductId, 10, 8)

    const { error: transferError } = await owner.client.rpc('execute_stock_transfer', {
      p_organization_id: organizationId,
      p_source_branch_id: sourceBranchId,
      p_destination_branch_id: destBranch!.id,
      p_items: [
        {
          source_product_id: sourceProductId,
          source_variant_id: null,
          destination_product_id: destProduct!.id,
          destination_variant_id: null,
          quantity: 6,
        },
      ],
    })
    expect(transferError).toBeNull()

    // The source is now at 4, below its threshold of 8 — this is the RPC
    // lib/inventory/mutations.ts's initiateStockTransfer() calls after
    // execute_stock_transfer() commits.
    const { data } = await callNotifyLowStock(owner, sourceBranchId, [sourceProductId])
    expect(data).toHaveLength(1)
  })
})

describe('notify_role_assigned() — the basic security trigger', () => {
  it('assigning a role notifies the target user, not the actor, in the mandatory security category', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'RoleNotify Org')

    const assignee = await createTestUser()
    const branchManagerRole = await pool.query(
      `select id from public.roles where slug = 'branch_manager'`,
    )
    const { data: userRole, error: assignError } = await owner.client
      .from('user_roles')
      .insert({
        user_id: assignee.userId,
        role_id: branchManagerRole.rows[0].id,
        organization_id: organizationId,
      })
      .select('id')
      .single()
    expect(assignError).toBeNull()

    const { data, error } = await owner.client.rpc('notify_role_assigned', {
      p_user_role_id: userRole!.id,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect((data as { user_id: string }[])[0]!.user_id).toBe(assignee.userId)

    const { data: ownerRows } = await owner.client
      .from('notifications')
      .select('id')
      .eq('user_id', owner.userId)
      .eq('type', 'employee.role_changed')
    expect(ownerRows).toHaveLength(0)

    const { data: assigneeRows } = await assignee.client
      .from('notifications')
      .select('category, type')
      .eq('user_id', assignee.userId)
    expect(assigneeRows).toHaveLength(1)
    expect(assigneeRows![0]!.category).toBe('security')
  })

  it('rejects a caller who could not have performed the assignment', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'RoleNotifyDenied Org')
    const assignee = await createTestUser()
    const role = await pool.query(`select id from public.roles where slug = 'branch_manager'`)
    const { data: userRole } = await owner.client
      .from('user_roles')
      .insert({ user_id: assignee.userId, role_id: role.rows[0].id, organization_id: organizationId })
      .select('id')
      .single()

    const stranger = await createTestUser()
    const { error } = await stranger.client.rpc('notify_role_assigned', {
      p_user_role_id: userRole!.id,
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})

describe('notification_preferences — the mandatory-category guard (both INSERT and UPDATE)', () => {
  it('rejects disabling security on the very first write (INSERT, no prior row)', async () => {
    const user = await createTestUser()
    await bootstrapOrganization(user, 'MandatoryInsert Org')

    const { error } = await user.client
      .from('notification_preferences')
      .insert({ user_id: user.userId, category: 'security', in_app_enabled: false, email_enabled: false })
    expect(error).not.toBeNull()
  })

  it('rejects disabling billing on a subsequent UPDATE', async () => {
    const user = await createTestUser()
    await bootstrapOrganization(user, 'MandatoryUpdate Org')

    const { error: insertError } = await user.client
      .from('notification_preferences')
      .insert({ user_id: user.userId, category: 'billing', in_app_enabled: true, email_enabled: true })
    expect(insertError).toBeNull()

    const { error: updateError } = await user.client
      .from('notification_preferences')
      .update({ email_enabled: false })
      .eq('user_id', user.userId)
      .eq('category', 'billing')
    expect(updateError).not.toBeNull()
  })

  it('allows disabling a non-mandatory category (inventory)', async () => {
    const user = await createTestUser()
    await bootstrapOrganization(user, 'MandatoryAllowed Org')

    const { error } = await user.client.from('notification_preferences').upsert(
      { user_id: user.userId, category: 'inventory', in_app_enabled: true, email_enabled: false },
      { onConflict: 'user_id,category' },
    )
    expect(error).toBeNull()
  })
})

describe('notifications — cross-user authorization (Testing Requirement 4)', () => {
  it('a user cannot read, mark-read, or overwrite another user\'s notifications', async () => {
    const owner = await createTestUser()
    const { branchId, productId } = await seedBranchProductWithThreshold(owner, 'CrossUser')
    await makeLowStock(owner, branchId, productId, 3, 5)
    await callNotifyLowStock(owner, branchId)

    const { data: ownRows } = await owner.client.from('notifications').select('id').eq('user_id', owner.userId)
    expect(ownRows).toHaveLength(1)
    const notificationId = ownRows![0]!.id as string

    const other = await createTestUser()
    await bootstrapOrganization(other, 'CrossUser Other Org')

    const { data: crossRead } = await other.client
      .from('notifications')
      .select('id')
      .eq('id', notificationId)
    expect(crossRead).toHaveLength(0)

    const { data: markReadResult, error: markReadError } = await other.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .select('id')
    expect(markReadError).toBeNull()
    expect(markReadResult).toHaveLength(0) // RLS scoped the update to zero rows, not an error

    const { data: stillUnread } = await owner.client
      .from('notifications')
      .select('read_at')
      .eq('id', notificationId)
      .single()
    expect(stillUnread!.read_at).toBeNull()

    // Even the OWNING user cannot rewrite title/href — the grant restricts
    // UPDATE to the read_at column alone (20260824100500).
    const { error: titleError } = await owner.client
      .from('notifications')
      .update({ title: 'tampered' })
      .eq('id', notificationId)
    expect(titleError).not.toBeNull()
    expect(titleError?.code).toBe('42501')
  })
})

describe('internal notify_*() plumbing is not directly reachable', () => {
  it('resolve_notification_recipients and create_user_notification have no authenticated EXECUTE grant', async () => {
    const resolveResult = await pool.query(
      `select has_function_privilege(
         'authenticated',
         'public.resolve_notification_recipients(text, uuid, uuid, text)',
         'execute'
       ) as can_execute`,
    )
    expect(resolveResult.rows[0].can_execute).toBe(false)

    const createResult = await pool.query(
      `select has_function_privilege(
         'authenticated',
         'public.create_user_notification(uuid, uuid, text, text, text, text, text, jsonb, text)',
         'execute'
       ) as can_execute`,
    )
    expect(createResult.rows[0].can_execute).toBe(false)
  })

  it('notify_low_stock and notify_role_assigned DO have an authenticated EXECUTE grant', async () => {
    const lowStockResult = await pool.query(
      `select has_function_privilege(
         'authenticated', 'public.notify_low_stock(uuid, uuid[])', 'execute'
       ) as can_execute`,
    )
    expect(lowStockResult.rows[0].can_execute).toBe(true)

    const roleResult = await pool.query(
      `select has_function_privilege(
         'authenticated', 'public.notify_role_assigned(uuid)', 'execute'
       ) as can_execute`,
    )
    expect(roleResult.rows[0].can_execute).toBe(true)
  })
})
