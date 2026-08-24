import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth/guard'
import { getOrganizationBranding } from '@/lib/branding/queries'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { BrandingEditor } from '@/components/settings/branding-editor'

/**
 * The branding editor Milestone 04's queries.ts docblock and
 * lib/branding/contrast.ts's resolveBrandColor() comment both pointed at:
 * "Milestone 11 wires the actual UI warning."
 */
export default async function BrandingSettingsPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('organizations.update', { organizationId })

  const branding = await getOrganizationBranding()
  if (!branding) redirect('/sign-in')

  return <BrandingEditor organizationId={organizationId} branding={branding} />
}
