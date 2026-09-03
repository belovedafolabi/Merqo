import { redirect } from 'next/navigation'
import { Receipt } from 'lucide-react'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { listSales, type SalesFilter } from '@/lib/sales/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { EmptyState } from '@/components/states/empty-state'
import { SalesView } from '@/components/sales/sales-view'

const PAGE_SIZE = 50

const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'store_credit']

/** Reads the /sales list filter from the URL. `to` is stored as the user's
 *  chosen end date + 1 day, so the range stays half-open [from, to). */
export function parseSalesFilter(sp: Record<string, string | string[] | undefined>): SalesFilter {
  const one = (key: string) => {
    const value = sp[key]
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined
  }
  const toDate = one('to')
  return {
    search: one('q'),
    from: one('from'),
    to: toDate
      ? new Date(new Date(toDate).getTime() + 24 * 60 * 60 * 1000).toISOString()
      : undefined,
    paymentMethod: PAYMENT_METHODS.includes(one('method') ?? '') ? one('method') : undefined,
  }
}

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
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  const filter = parseSalesFilter(await searchParams)

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

  const sales = await listSales(branch.id, { limit: PAGE_SIZE, filter })

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Sales" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        {/* Keyed on the filter so the client view's paginated state resets
            when the filter changes, rather than appending a new first page
            onto a stale list. */}
        <SalesView
          key={JSON.stringify(filter)}
          initialSales={sales}
          pageSize={PAGE_SIZE}
          filter={filter}
        />
      </div>
    </div>
  )
}
