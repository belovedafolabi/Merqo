import { notFound, redirect } from 'next/navigation'

import { getCurrentOrganizationId } from '@/lib/auth/context'
import {
  getCustomer,
  getCustomerTransactionHistory,
  getStoreCreditBalance,
  listCustomerLayaways,
  listStoreCreditLedger,
} from '@/lib/customers/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { CustomerDetailView } from '@/components/customers/customer-detail-view'

/**
 * Customer detail (docs/milestones/09-customer-store-credit-and-layaway.md
 * Frontend Changes: detail screen, balance display, store-credit history,
 * transaction history). Same shape as app/(app)/products/[productId]/
 * page.tsx — the per-customer financial detail needs more room than a row
 * action on the list page could give it.
 */
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>
}) {
  const { customerId } = await params
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) redirect('/sign-in')

  const customer = await getCustomer(customerId)
  if (!customer || customer.organizationId !== organizationId) notFound()

  const [storeCreditBalance, storeCreditLedger, layaways, activity] = await Promise.all([
    getStoreCreditBalance(customerId),
    listStoreCreditLedger(customerId),
    listCustomerLayaways(customerId),
    getCustomerTransactionHistory(customerId),
  ])

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title={customer.name} />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <CustomerDetailView
          organizationId={organizationId}
          customer={customer}
          storeCreditBalance={storeCreditBalance}
          storeCreditLedger={storeCreditLedger}
          layaways={layaways}
          activity={activity}
        />
      </div>
    </div>
  )
}
