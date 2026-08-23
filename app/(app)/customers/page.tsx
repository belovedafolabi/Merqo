import { redirect } from 'next/navigation'

import { getOnboardingState } from '@/lib/business-structure/queries'
import { listCustomers } from '@/lib/customers/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { CustomersView } from '@/components/customers/customers-view'

/**
 * Customer management (docs/milestones/09-customer-store-credit-and-
 * layaway.md Frontend Changes). Reachable from the Admin sidebar's
 * "Customers" item (lib/shell/nav-items.ts), gated on `customers.view`.
 *
 * Scoped to the organization, not a branch — unlike app/(app)/inventory/
 * page.tsx, which needs the "current" branch. A customer record is shared
 * business-wide (this milestone's Scope), so there is nothing branch-shaped
 * to pick here.
 */
export default async function CustomersPage() {
  const { organizationId } = await getOnboardingState()
  if (!organizationId) redirect('/sign-in')

  const customers = await listCustomers(organizationId)

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Customers" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <CustomersView organizationId={organizationId} customers={customers} />
      </div>
    </div>
  )
}
