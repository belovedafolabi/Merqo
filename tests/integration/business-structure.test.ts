import { afterAll, describe, expect, it } from 'vitest'

import { resolvePermission } from '@/lib/auth/permissions'
import { fetchPermissionGrants } from '@/lib/auth/context'
import { pool } from './helpers/db'
import { bootstrapOrganization, createTestUser } from './helpers/supabase'

/**
 * Milestone 05's own RLS/authorization/validation suite, following the
 * template tests/integration/rls-policies.test.ts and authorization.test.ts
 * established (real supabase-js clients for RLS, fetchPermissionGrants() +
 * resolvePermission() — requirePermission()'s own logic minus the
 * next/headers-dependent redirect wrapper — for the Server Action-layer
 * decision). Capability-default seeding/override itself is already covered
 * by tests/integration/capabilities.test.ts (Milestone 02); this file covers
 * what Milestone 05 actually adds: business_unit_pos_config, the
 * business_unit_capabilities mutation policy, and the
 * business_units.configure_pos permission.
 */
async function createBranchAndBusinessUnit(
  ownerClient: Awaited<ReturnType<typeof createTestUser>>['client'],
  organizationId: string,
) {
  const { data: branch, error: branchError } = await ownerClient
    .from('branches')
    .insert({
      organization_id: organizationId,
      name: 'Main',
      slug: `main-${organizationId.slice(0, 8)}`,
    })
    .select('id')
    .single()
  if (branchError) throw branchError

  const { data: businessType } = await ownerClient
    .from('business_types')
    .select('id')
    .eq('slug', 'supermarket')
    .single()

  const { data: businessUnit, error: buError } = await ownerClient
    .from('business_units')
    .insert({
      branch_id: branch!.id,
      business_type_id: businessType!.id,
      name: 'Shop',
      slug: `shop-${organizationId.slice(0, 8)}`,
    })
    .select('id')
    .single()
  if (buError) throw buError

  return { branchId: branch!.id as string, businessUnitId: businessUnit!.id as string }
}

describe('business_unit_pos_config — RLS', () => {
  it('an Owner can insert, read, and update their own business unit’s POS config', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'POS Config Org A')
    const { businessUnitId } = await createBranchAndBusinessUnit(owner.client, organizationId)

    const { data: inserted, error: insertError } = await owner.client
      .from('business_unit_pos_config')
      .insert({ business_unit_id: businessUnitId, tax_rate: 7.5 })
      .select('tax_rate')
      .single()
    expect(insertError).toBeNull()
    expect(Number(inserted!.tax_rate)).toBe(7.5)

    const { data: updated, error: updateError } = await owner.client
      .from('business_unit_pos_config')
      .update({ tax_rate: 10 })
      .eq('business_unit_id', businessUnitId)
      .select('tax_rate')
      .single()
    expect(updateError).toBeNull()
    expect(Number(updated!.tax_rate)).toBe(10)
  })

  it('a user from a different organization cannot read another org’s POS config', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'POS Config Org B')
    const { businessUnitId } = await createBranchAndBusinessUnit(owner.client, organizationId)
    await owner.client.from('business_unit_pos_config').insert({ business_unit_id: businessUnitId })

    const otherOwner = await createTestUser()
    await bootstrapOrganization(otherOwner, 'POS Config Org C')

    const { data, error } = await otherOwner.client
      .from('business_unit_pos_config')
      .select('business_unit_id')
      .eq('business_unit_id', businessUnitId)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('a Branch Manager (no business_units.configure_pos) cannot insert a POS config row', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'POS Config Org D')
    const { businessUnitId } = await createBranchAndBusinessUnit(owner.client, organizationId)

    const manager = await createTestUser()
    const managerRole = await pool.query(
      `select id from public.roles where slug = 'branch_manager'`,
    )
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
      [manager.userId, managerRole.rows[0].id, organizationId],
    )

    const { data, error } = await manager.client
      .from('business_unit_pos_config')
      .insert({ business_unit_id: businessUnitId })
      .select('business_unit_id')

    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect((error as { code?: string }).code).toBe('42501')
  })

  it('CHECK constraints reject invalid POS configuration values even from a permitted Owner', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'POS Config Org E')
    const { businessUnitId } = await createBranchAndBusinessUnit(owner.client, organizationId)

    const negativeTax = await owner.client
      .from('business_unit_pos_config')
      .insert({ business_unit_id: businessUnitId, tax_rate: -1 })
    expect((negativeTax.error as { code?: string } | null)?.code).toBe('23514') // check_violation

    const overOneHundredPercentServiceCharge = await owner.client
      .from('business_unit_pos_config')
      .insert({
        business_unit_id: businessUnitId,
        service_charge_type: 'percentage',
        service_charge_value: 150,
      })
    expect((overOneHundredPercentServiceCharge.error as { code?: string } | null)?.code).toBe(
      '23514',
    )

    const negativeDiscountAmount = await owner.client
      .from('business_unit_pos_config')
      .insert({ business_unit_id: businessUnitId, discount_max_amount: -5 })
    expect((negativeDiscountAmount.error as { code?: string } | null)?.code).toBe('23514')

    const invalidPaymentMethod = await owner.client
      .from('business_unit_pos_config')
      .insert({ business_unit_id: businessUnitId, default_payment_method: 'crypto' })
    expect((invalidPaymentMethod.error as { code?: string } | null)?.code).toBe('23514')
  })
})

describe('business_unit_capabilities — mutation RLS', () => {
  it('an Owner can override a capability on their own business unit', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Capability Override Org A')
    const { businessUnitId } = await createBranchAndBusinessUnit(owner.client, organizationId)

    const { data: layaway } = await owner.client
      .from('capabilities')
      .select('id')
      .eq('key', 'layaway')
      .single()

    const { data, error } = await owner.client
      .from('business_unit_capabilities')
      .update({ enabled: true, is_override: true })
      .eq('business_unit_id', businessUnitId)
      .eq('capability_id', layaway!.id)
      .select('enabled, is_override')
      .single()

    expect(error).toBeNull()
    expect(data).toEqual({ enabled: true, is_override: true })
  })

  it('a user with no role assignment cannot override a capability', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Capability Override Org B')
    const { businessUnitId } = await createBranchAndBusinessUnit(owner.client, organizationId)

    const { data: layaway } = await owner.client
      .from('capabilities')
      .select('id')
      .eq('key', 'layaway')
      .single()

    const bystander = await createTestUser()
    const { data, error } = await bystander.client
      .from('business_unit_capabilities')
      .update({ enabled: true, is_override: true })
      .eq('business_unit_id', businessUnitId)
      .eq('capability_id', layaway!.id)
      .select('enabled')

    // RLS silently filters (the row exists, but isn't visible/writable to
    // this caller) rather than erroring — zero rows affected.
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})

describe('business_units.configure_pos permission', () => {
  afterAll(async () => {
    await pool.end()
  })

  it('an Owner holds business_units.configure_pos; a Branch Manager at the same org does not', async () => {
    const owner = await createTestUser()
    const { organizationId } = await bootstrapOrganization(owner, 'Configure POS Permission Org')

    const manager = await createTestUser()
    const managerRole = await pool.query(
      `select id from public.roles where slug = 'branch_manager'`,
    )
    await pool.query(
      `insert into public.user_roles (user_id, role_id, organization_id) values ($1, $2, $3)`,
      [manager.userId, managerRole.rows[0].id, organizationId],
    )

    const ownerGrants = await fetchPermissionGrants(owner.client)
    expect(resolvePermission(ownerGrants, 'business_units.configure_pos', { organizationId })).toBe(
      true,
    )

    const managerGrants = await fetchPermissionGrants(manager.client)
    expect(
      resolvePermission(managerGrants, 'business_units.configure_pos', { organizationId }),
    ).toBe(false)
  })
})
