import { notFound, redirect } from 'next/navigation'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { getLayaway } from '@/lib/customers/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { LayawayDetailView } from '@/components/layaways/layaway-detail-view'

/**
 * One layaway's items and installment history (Milestone 17 Part D). Linked to
 * from the customer detail screen's activity table. Gated on `layaway.view`,
 * the same permission as the list page; RLS (layaways_select) then scopes the
 * row itself to branches the reader can see, so a missing / out-of-scope id
 * lands on notFound() rather than leaking existence.
 */
export default async function LayawayDetailPage({
  params,
}: {
  params: Promise<{ layawayId: string }>
}) {
  const { layawayId } = await params

  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('layaway.view', { organizationId })

  const layaway = await getLayaway(layawayId)
  if (!layaway) notFound()

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title={`Layaway ${layaway.reference}`} />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <LayawayDetailView layaway={layaway} />
      </div>
    </div>
  )
}
