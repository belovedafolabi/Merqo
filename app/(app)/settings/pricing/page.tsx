import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { getSubscriptionPricing } from '@/lib/subscription/queries'
import { SubscriptionPricingForm } from '@/components/subscription/pricing-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * The Super Admin pricing configuration screen
 * (docs/milestones/13-subscription-billing-and-platform-admin.md Frontend
 * Changes: "Super Admin pricing configuration screen"). Gated on
 * platform.manage_pricing — the settings tab itself is already hidden from
 * everyone else (components/settings/settings-nav.tsx), this is the actual
 * boundary.
 */
export default async function PricingSettingsPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('platform.manage_pricing', { organizationId })

  const pricing = await getSubscriptionPricing()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription pricing</CardTitle>
        <CardDescription>
          Configure this deployment&apos;s subscription price for each billing duration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SubscriptionPricingForm organizationId={organizationId} pricing={pricing} />
      </CardContent>
    </Card>
  )
}
