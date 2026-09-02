'use server'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { listSales } from '@/lib/sales/queries'
import type { SaleListEntry } from '@/lib/sales/sale-list'

/**
 * "Load more" for the /sales list — keyset paginated on the last row's
 * `createdAt`. Re-checks `sales.view` (the frontend is never the boundary)
 * and resolves the branch from onboarding state rather than trusting a
 * client-supplied id.
 */
export async function loadMoreSalesAction(before: string): Promise<SaleListEntry[]> {
  const { organizationId, branch } = await getOnboardingState()
  if (!organizationId || !branch) return []

  await requirePermission('sales.view', { organizationId })

  return listSales(branch.id, { before, limit: 50 })
}
