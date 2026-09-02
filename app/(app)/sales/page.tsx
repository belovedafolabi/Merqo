import { redirect } from 'next/navigation'
import { Receipt } from 'lucide-react'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { listSales } from '@/lib/sales/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { EmptyState } from '@/components/states/empty-state'
import { SalesView } from '@/components/sales/sales-view'

const PAGE_SIZE = 50

/**
 * Completed-sales list. The `sales.view` permission has been seeded and
 * granted (Branch Manager / Cashier / Salesperson / Pharmacist) since
 * Milestone 08 but the read-side screen it was meant for was deferred and
 * never built — the "Sales" sidebar item pointed at this route and 404'd.
 *
 * Same structure as app/(app)/expenses/page.tsx: onboarding-state guard →
 * permission guard → branch guard → render a `'use client'` view over plain
 * data.
 */
export default async function SalesPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('sales.view', { organizationId })

  const branch = onboardingState.branch
  if (!branch) {
    return (
      <div className="flex flex-1 flex-col">
        <AdminTopbar title="Sales" />
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
          <EmptyState
            icon={Receipt}
            title="No branch yet"
            description="Set up a branch in Business Structure before completed sales appear here."
          />
        </div>
      </div>
    )
  }

  const sales = await listSales(branch.id, { limit: PAGE_SIZE })

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Sales" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <SalesView initialSales={sales} pageSize={PAGE_SIZE} />
      </div>
    </div>
  )
}
