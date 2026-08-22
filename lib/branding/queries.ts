import { cache } from 'react'

import { getCurrentUserContext } from '@/lib/auth/context'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolveBrandTokens, type BrandTokens } from '@/lib/branding/tokens'

interface OrganizationBrandingRow {
  primary_color: string | null
  secondary_color: string | null
  logo_url: string | null
  brand_name: string | null
  name: string
}

export interface OrganizationBranding {
  primaryColor: string | null
  secondaryColor: string | null
  logoUrl: string | null
  /** `brand_name` if set, otherwise the organization's own name. */
  displayName: string
}

/**
 * Reads the current user's organization's branding row. Read-only — per
 * docs/milestones/04-design-system-and-app-shell.md API/Backend Changes,
 * the write path (an editing UI) is Milestone 11's scope.
 *
 * The organization id comes from the caller's resolved permission grants
 * (lib/auth/context.ts's getCurrentUserContext(), the same source
 * lib/auth/guard.ts uses) rather than a new lookup — every grant already
 * carries organization_id, and this project's single-tenant-per-deployment
 * model (docs/milestones/DECISIONS_AND_CONFLICTS.md §5) means a signed-in
 * user has exactly one. Returns null for an unauthenticated request or one
 * with no resolved organization (e.g. mid-bootstrap).
 */
export const getOrganizationBranding = cache(async (): Promise<OrganizationBranding | null> => {
  const { grants } = await getCurrentUserContext()
  const organizationId = grants[0]?.organizationId
  if (!organizationId) return null

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('primary_color, secondary_color, logo_url, brand_name, name')
    .eq('id', organizationId)
    .single<OrganizationBrandingRow>()

  if (error || !data) return null

  return {
    primaryColor: data.primary_color,
    secondaryColor: data.secondary_color,
    logoUrl: data.logo_url,
    displayName: data.brand_name ?? data.name,
  }
})

/** Convenience wrapper: fetch + resolve in one call for render-time use. */
export const getResolvedBrandTokens = cache(async (): Promise<BrandTokens> => {
  const branding = await getOrganizationBranding()
  return resolveBrandTokens({
    primaryColor: branding?.primaryColor ?? null,
    secondaryColor: branding?.secondaryColor ?? null,
  })
})
