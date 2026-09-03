'use server'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { listSales, type SalesFilter } from '@/lib/sales/queries'
import type { SaleListEntry } from '@/lib/sales/sale-list'

/**
 * "Load more" for the /sales list — keyset paginated on the last row's
 * `createdAt`, carrying the active filter forward so a filtered list pages
 * within the filter. Re-checks `sales.view` (the frontend is never the
 * boundary) and resolves the branch from onboarding state rather than
 * trusting a client-supplied id. The `filter` is not a trust concern — it
 * only ever narrows what RLS already permits.
 */
export async function loadMoreSalesAction(
  before: string,
  filter: SalesFilter = {},
): Promise<SaleListEntry[]> {
  const { organizationId, branch } = await getOnboardingState()
  if (!organizationId || !branch) return []

  await requirePermission('sales.view', { organizationId })

  return listSales(branch.id, { before, limit: 50, filter })
}
