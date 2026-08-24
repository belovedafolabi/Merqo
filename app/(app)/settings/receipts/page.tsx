import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth/guard'
import { getOrganizationBranding } from '@/lib/branding/queries'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { getReceiptSettings } from '@/lib/receipts/settings'
import { ReceiptSettingsForm } from '@/components/settings/receipt-settings-form'

export default async function ReceiptSettingsPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('organizations.update', { organizationId })

  const [settings, branding] = await Promise.all([getReceiptSettings(), getOrganizationBranding()])

  return <ReceiptSettingsForm organizationId={organizationId} settings={settings} branding={branding} />
}
