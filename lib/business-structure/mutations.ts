import type { PostgrestError } from '@supabase/supabase-js'

import { requirePermission } from '@/lib/auth/guard'
import { recordAuditEvent } from '@/lib/auth/audit'
import { applyBusinessTypePresets } from '@/lib/business-structure/presets'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import {
  branchInputSchema,
  businessUnitInputSchema,
  capabilityOverridesInputSchema,
  posConfigInputSchema,
  type BranchInput,
  type BusinessUnitInput,
  type CapabilityOverrideInput,
  type PosConfigInput,
} from '@/lib/business-structure/schemas'

/**
 * The actual DB mutations behind this milestone's Branch/Business
 * Unit/capability/POS-config Server Actions — factored out of the 'use
 * server' action files (app/(app)/business-structure/actions.ts,
 * app/(onboarding)/onboarding/actions.ts) because both call the *same*
 * mutations: the onboarding wizard and the post-onboarding management
 * screens create/update the same rows, they just differ in what happens
 * after (redirect to the next wizard step vs. revalidate-and-close-dialog).
 * Every function here follows the established Server Action shape
 * (app/(app)/roles/actions.ts): requirePermission() -> mutate -> recordAuditEvent().
 */

/** Retries a `slug` insert under a partial-unique (organization_id/branch_id, slug) WHERE archived_at IS NULL index. */
async function withSlugRetry<T>(
  baseSlug: string,
  attempt: (slug: string) => PromiseLike<{ data: T | null; error: PostgrestError | null }>,
): Promise<T> {
  const base = baseSlug || 'unnamed'
  let lastError: PostgrestError | null = null

  for (let i = 0; i < 5; i += 1) {
    const slug = i === 0 ? base : `${base}-${i + 1}`
    const { data, error } = await attempt(slug)
    if (!error) return data as T
    if (error.code !== '23505') throw error
    lastError = error
  }

  throw lastError
}

export async function createBranch(
  organizationId: string,
  input: BranchInput,
): Promise<{ id: string }> {
  const user = await requirePermission('branches.create', { organizationId })
  const parsed = branchInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const row = await withSlugRetry<{ id: string }>(slugify(parsed.name), (slug) =>
    supabase
      .from('branches')
      .insert({
        organization_id: organizationId,
        name: parsed.name,
        slug,
        address_line: parsed.addressLine?.trim() || null,
        contact_phone: parsed.contactPhone?.trim() || null,
        created_by: user.id,
      })
      .select('id')
      .single(),
  )

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'branch.created',
      resourceType: 'branch',
      resourceId: row.id,
      metadata: { name: parsed.name },
    },
    supabase,
  )

  return { id: row.id }
}

export async function updateBranch(
  organizationId: string,
  branchId: string,
  input: BranchInput,
): Promise<void> {
  const user = await requirePermission('branches.update', { organizationId })
  const parsed = branchInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('branches')
    .update({
      name: parsed.name,
      address_line: parsed.addressLine?.trim() || null,
      contact_phone: parsed.contactPhone?.trim() || null,
    })
    .eq('id', branchId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'branch.updated',
      resourceType: 'branch',
      resourceId: branchId,
      metadata: { name: parsed.name },
    },
    supabase,
  )
}

export async function archiveBranch(organizationId: string, branchId: string): Promise<void> {
  const user = await requirePermission('branches.archive', { organizationId })
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('branches')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', branchId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'branch.archived',
      resourceType: 'branch',
      resourceId: branchId,
    },
    supabase,
  )
}

export async function createBusinessUnit(
  organizationId: string,
  input: BusinessUnitInput,
): Promise<{ id: string }> {
  const user = await requirePermission('business_units.create', {
    organizationId,
    branchId: input.branchId,
  })
  const parsed = businessUnitInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const row = await withSlugRetry<{ id: string }>(slugify(parsed.name), (slug) =>
    supabase
      .from('business_units')
      .insert({
        branch_id: parsed.branchId,
        business_type_id: parsed.businessTypeId,
        name: parsed.name,
        slug,
        created_by: user.id,
      })
      .select('id')
      .single(),
  )

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'business_unit.created',
      resourceType: 'business_unit',
      resourceId: row.id,
      metadata: { name: parsed.name, businessTypeId: parsed.businessTypeId },
    },
    supabase,
  )

  return { id: row.id }
}

export async function updateBusinessUnit(
  organizationId: string,
  businessUnitId: string,
  branchId: string,
  input: Pick<BusinessUnitInput, 'name'>,
): Promise<void> {
  const user = await requirePermission('business_units.update', {
    organizationId,
    branchId,
    businessUnitId,
  })
  const parsed = businessUnitInputSchema.pick({ name: true }).parse(input)
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('business_units')
    .update({ name: parsed.name })
    .eq('id', businessUnitId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'business_unit.updated',
      resourceType: 'business_unit',
      resourceId: businessUnitId,
      metadata: { name: parsed.name },
    },
    supabase,
  )
}

export async function archiveBusinessUnit(
  organizationId: string,
  businessUnitId: string,
  branchId: string,
): Promise<void> {
  const user = await requirePermission('business_units.archive', {
    organizationId,
    branchId,
    businessUnitId,
  })
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('business_units')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', businessUnitId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'business_unit.archived',
      resourceType: 'business_unit',
      resourceId: businessUnitId,
    },
    supabase,
  )
}

export async function updateBusinessUnitCapabilities(
  organizationId: string,
  businessUnitId: string,
  branchId: string,
  overrides: CapabilityOverrideInput[],
): Promise<void> {
  const user = await requirePermission('business_units.update', {
    organizationId,
    branchId,
    businessUnitId,
  })
  const parsed = capabilityOverridesInputSchema.parse(overrides)
  const supabase = await createServerSupabaseClient()

  await Promise.all(
    parsed.map(async ({ capabilityId, enabled }) => {
      const { error } = await supabase
        .from('business_unit_capabilities')
        .update({ enabled, is_override: true })
        .eq('business_unit_id', businessUnitId)
        .eq('capability_id', capabilityId)
      if (error) throw error
    }),
  )

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'business_unit.capabilities_updated',
      resourceType: 'business_unit',
      resourceId: businessUnitId,
      metadata: { overrides: parsed },
    },
    supabase,
  )
}

export async function upsertBusinessUnitPosConfig(
  organizationId: string,
  businessUnitId: string,
  branchId: string,
  input: PosConfigInput,
): Promise<void> {
  const user = await requirePermission('business_units.configure_pos', {
    organizationId,
    branchId,
    businessUnitId,
  })
  const parsed = posConfigInputSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('business_unit_pos_config').upsert(
    {
      business_unit_id: businessUnitId,
      tax_rate: parsed.taxRate,
      service_charge_enabled: parsed.serviceChargeEnabled,
      service_charge_type: parsed.serviceChargeType,
      service_charge_value: parsed.serviceChargeValue,
      discount_requires_authorization: parsed.discountRequiresAuthorization,
      discount_max_percentage: parsed.discountMaxPercentage,
      discount_max_amount: parsed.discountMaxAmount,
      discount_reason_required: parsed.discountReasonRequired,
      default_payment_method: parsed.defaultPaymentMethod,
      created_by: user.id,
    },
    { onConflict: 'business_unit_id' },
  )
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'business_unit.pos_config_updated',
      resourceType: 'business_unit',
      resourceId: businessUnitId,
      metadata: { posConfig: parsed },
    },
    supabase,
  )
}

export async function completeOnboarding(organizationId: string): Promise<void> {
  const user = await requirePermission('organizations.update', { organizationId })
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('organizations')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', organizationId)
  if (error) throw error

  // Milestone 17 Part B — apply the new business unit's type presets, ONCE.
  // A one-time onboarding convenience, never re-applied. Best-effort: a preset
  // failure must not fail the whole onboarding.
  let presetsApplied: { widgetsApplied: number; reportsApplied: number } | null = null
  const { data: unit } = await supabase
    .from('business_units')
    .select('id, business_type_id, branches!inner(organization_id)')
    .eq('branches.organization_id', organizationId)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; business_type_id: string }>()

  if (unit) {
    try {
      presetsApplied = await applyBusinessTypePresets(supabase, {
        businessUnitId: unit.id,
        businessTypeId: unit.business_type_id,
        userId: user.id,
      })
    } catch {
      // logged inside applyBusinessTypePresets; never block onboarding
    }
  }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'organization.onboarding_completed',
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: presetsApplied ? { presetsApplied } : undefined,
    },
    supabase,
  )
}
