import { cache } from 'react'

import { getCurrentOrganizationId } from '@/lib/auth/context'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Read-side queries for this milestone's domain (Organization's Branches,
 * Business Units, capability overrides, POS config) plus the onboarding
 * resumability check every later Server Component in app/(app) and
 * app/(onboarding) relies on. RLS (supabase/migrations/20260823090*.sql,
 * 20260822093[89]00_alter_*_add_policies.sql) is the enforced boundary —
 * the `organizationId`/`branchId` filters below are for query precision,
 * not authorization; a caller who somehow queried outside their own scope
 * would still get an empty result from Postgres, never another tenant's row.
 */

export interface BusinessType {
  id: string
  slug: string
  name: string
  description: string | null
}

export interface Branch {
  id: string
  name: string
  slug: string
  archivedAt: string | null
}

export interface BusinessUnit {
  id: string
  branchId: string
  branchName: string
  businessTypeId: string
  businessTypeName: string
  name: string
  slug: string
  archivedAt: string | null
}

export interface CapabilityRow {
  capabilityId: string
  key: string
  name: string
  description: string | null
  enabled: boolean
  isOverride: boolean
}

export interface PosConfig {
  businessUnitId: string
  taxRate: number
  serviceChargeEnabled: boolean
  serviceChargeType: 'percentage' | 'fixed'
  serviceChargeValue: number
  discountRequiresAuthorization: boolean
  discountMaxPercentage: number
  discountMaxAmount: number | null
  discountReasonRequired: boolean
  defaultPaymentMethod: 'cash' | 'card' | 'transfer'
}

export interface OnboardingState {
  organizationId: string | null
  onboardingCompletedAt: string | null
  branch: Branch | null
  businessUnit: BusinessUnit | null
  hasPosConfig: boolean
}

/** Platform-wide catalog (business_types_select: `to authenticated using (true)`) — no organization scoping. */
export const listBusinessTypes = cache(async (): Promise<BusinessType[]> => {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('business_types')
    .select('id, slug, name, description')
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data ?? []
})

export async function listBranches(organizationId: string): Promise<Branch[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, slug, archived_at')
    .eq('organization_id', organizationId)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    archivedAt: row.archived_at,
  }))
}

interface BusinessUnitRow {
  id: string
  branch_id: string
  business_type_id: string
  name: string
  slug: string
  archived_at: string | null
  branches: { name: string } | null
  business_types: { name: string } | null
}

export async function listBusinessUnits(organizationId: string): Promise<BusinessUnit[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('business_units')
    .select(
      'id, branch_id, business_type_id, name, slug, archived_at, branches!inner(name, organization_id), business_types(name)',
    )
    .eq('branches.organization_id', organizationId)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return ((data ?? []) as unknown as BusinessUnitRow[]).map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branches?.name ?? '',
    businessTypeId: row.business_type_id,
    businessTypeName: row.business_types?.name ?? '',
    name: row.name,
    slug: row.slug,
    archivedAt: row.archived_at,
  }))
}

export async function listBusinessUnitCapabilities(
  businessUnitId: string,
): Promise<CapabilityRow[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('business_unit_capabilities')
    .select('capability_id, enabled, is_override, capabilities(key, name, description)')
    .eq('business_unit_id', businessUnitId)

  if (error) throw error
  return (
    (data ?? []) as unknown as Array<{
      capability_id: string
      enabled: boolean
      is_override: boolean
      capabilities: { key: string; name: string; description: string | null } | null
    }>
  )
    .map((row) => ({
      capabilityId: row.capability_id,
      key: row.capabilities?.key ?? '',
      name: row.capabilities?.name ?? '',
      description: row.capabilities?.description ?? null,
      enabled: row.enabled,
      isOverride: row.is_override,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

interface PosConfigRow {
  business_unit_id: string
  tax_rate: string | number
  service_charge_enabled: boolean
  service_charge_type: 'percentage' | 'fixed'
  service_charge_value: string | number
  discount_requires_authorization: boolean
  discount_max_percentage: string | number
  discount_max_amount: string | number | null
  discount_reason_required: boolean
  default_payment_method: 'cash' | 'card' | 'transfer'
}

function mapPosConfigRow(row: PosConfigRow): PosConfig {
  return {
    businessUnitId: row.business_unit_id,
    taxRate: Number(row.tax_rate),
    serviceChargeEnabled: row.service_charge_enabled,
    serviceChargeType: row.service_charge_type,
    serviceChargeValue: Number(row.service_charge_value),
    discountRequiresAuthorization: row.discount_requires_authorization,
    discountMaxPercentage: Number(row.discount_max_percentage),
    discountMaxAmount: row.discount_max_amount === null ? null : Number(row.discount_max_amount),
    discountReasonRequired: row.discount_reason_required,
    defaultPaymentMethod: row.default_payment_method,
  }
}

export async function getBusinessUnitPosConfig(businessUnitId: string): Promise<PosConfig | null> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('business_unit_pos_config')
    .select(
      'business_unit_id, tax_rate, service_charge_enabled, service_charge_type, service_charge_value, discount_requires_authorization, discount_max_percentage, discount_max_amount, discount_reason_required, default_payment_method',
    )
    .eq('business_unit_id', businessUnitId)
    .maybeSingle<PosConfigRow>()

  if (error) throw error
  return data ? mapPosConfigRow(data) : null
}

/**
 * Resolves the current user's onboarding progress — the single source of
 * truth both app/(app)/layout.tsx and app/(pos)/layout.tsx read to decide
 * whether to redirect to /onboarding, and app/(onboarding)/onboarding/page.tsx
 * reads to decide which step to resume at. Derived entirely from whether a
 * Branch/Business Unit/POS config already exist — see this milestone's plan
 * ("Onboarding resumability... no separate step-tracker table needed").
 */
export const getOnboardingState = cache(async (): Promise<OnboardingState> => {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) {
    return {
      organizationId: null,
      onboardingCompletedAt: null,
      branch: null,
      businessUnit: null,
      hasPosConfig: false,
    }
  }

  const supabase = await createServerSupabaseClient()

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('onboarding_completed_at')
    .eq('id', organizationId)
    .single<{ onboarding_completed_at: string | null }>()
  if (orgError) throw orgError

  const branches = await listBranches(organizationId)
  const activeBranch = branches.find((branch) => branch.archivedAt === null) ?? null

  let businessUnit: BusinessUnit | null = null
  let hasPosConfig = false

  if (activeBranch) {
    const businessUnits = await listBusinessUnits(organizationId)
    businessUnit =
      businessUnits.find((unit) => unit.branchId === activeBranch.id && unit.archivedAt === null) ??
      null

    if (businessUnit) {
      const posConfig = await getBusinessUnitPosConfig(businessUnit.id)
      hasPosConfig = posConfig !== null
    }
  }

  return {
    organizationId,
    onboardingCompletedAt: org.onboarding_completed_at,
    branch: activeBranch,
    businessUnit,
    hasPosConfig,
  }
})
