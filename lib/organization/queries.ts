import { getCurrentOrganizationId } from '@/lib/auth/context'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface OrganizationProfile {
  name: string
  contactPhone: string | null
  contactEmail: string | null
  addressLine: string | null
  /** Org-wide fallback low-stock threshold (20260904090000); null = none. */
  defaultLowStockThreshold: number | null
  /** Sales Insights knobs (20260905090100). */
  insightsLeadDays: number
  insightsReorderThresholdDays: number
}

interface OrganizationProfileRow {
  name: string
  contact_phone: string | null
  contact_email: string | null
  address_line: string | null
  default_low_stock_threshold: string | number | null
  insights_lead_days: number
  insights_reorder_threshold_days: number
}

export async function getOrganizationProfile(): Promise<OrganizationProfile | null> {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) return null

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('organizations')
    .select(
      'name, contact_phone, contact_email, address_line, default_low_stock_threshold, insights_lead_days, insights_reorder_threshold_days',
    )
    .eq('id', organizationId)
    .single<OrganizationProfileRow>()

  if (error || !data) return null

  return {
    name: data.name,
    contactPhone: data.contact_phone,
    contactEmail: data.contact_email,
    addressLine: data.address_line,
    defaultLowStockThreshold:
      data.default_low_stock_threshold === null ? null : Number(data.default_low_stock_threshold),
    insightsLeadDays: Number(data.insights_lead_days),
    insightsReorderThresholdDays: Number(data.insights_reorder_threshold_days),
  }
}

/**
 * Just the org-wide default low-stock threshold — for the inventory and
 * dashboard low-stock views, which need it to compute each balance's
 * effective threshold but not the rest of the profile. Returns null when
 * unset (or unreadable), which those callers treat as "no org default".
 */
export async function getDefaultLowStockThreshold(organizationId: string): Promise<number | null> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('default_low_stock_threshold')
    .eq('id', organizationId)
    .single<{ default_low_stock_threshold: string | number | null }>()

  if (error || !data || data.default_low_stock_threshold === null) return null
  return Number(data.default_low_stock_threshold)
}
