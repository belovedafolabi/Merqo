import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { getOrganizationProfile } from '@/lib/organization/queries'
import { OrganizationProfileForm } from '@/components/settings/organization-profile-form'

export default async function OrganizationSettingsPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('organizations.update', { organizationId })

  const profile = await getOrganizationProfile()
  if (!profile) redirect('/sign-in')

  return <OrganizationProfileForm organizationId={organizationId} profile={profile} />
}
