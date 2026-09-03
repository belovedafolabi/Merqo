import { redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { listCoupons } from '@/lib/coupons/queries'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CouponsManager } from '@/components/settings/coupons-manager'

/**
 * Settings → Coupons. Gated on `coupons.manage` (Owner + Branch Manager by
 * default); the nav tab is already hidden from everyone else
 * (components/settings/settings-nav.tsx), this is the real boundary.
 */
export default async function CouponsSettingsPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('coupons.manage', { organizationId })

  const coupons = await listCoupons(organizationId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coupons</CardTitle>
        <CardDescription>
          Discount codes a customer can give at checkout. A redeemed coupon is applied as a
          discount on the sale.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CouponsManager organizationId={organizationId} coupons={coupons} />
      </CardContent>
    </Card>
  )
}
