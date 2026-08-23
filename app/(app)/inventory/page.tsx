import { redirect } from 'next/navigation'
import { Boxes } from 'lucide-react'

import {
  getOnboardingState,
  listBranches,
  listBusinessUnitCapabilities,
} from '@/lib/business-structure/queries'
import {
  getInventoryValuation,
  listBranchProductOptions,
  listInventoryBalances,
  listMovementHistory,
} from '@/lib/inventory/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { EmptyState } from '@/components/states/empty-state'
import { InventoryView } from '@/components/inventory/inventory-view'

/**
 * Inventory balance/movement/transfer management (docs/milestones/
 * 07-inventory-and-stock-management.md Frontend Changes). Reachable from
 * the Admin sidebar's "Inventory" item (lib/shell/nav-items.ts), gated on
 * `inventory.view`.
 *
 * Scoped to the organization's "current" Branch (`onboardingState.branch`)
 * — inventory is branch-owned, not Business-Unit-owned (Decision #2), so
 * this page uses the branch the same way app/(app)/products/page.tsx uses
 * the current Business Unit. No new multi-branch switcher, same deferral
 * that page's own doc comment notes.
 */
export default async function InventoryPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  const branch = onboardingState.branch
  const businessUnit = onboardingState.businessUnit

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Inventory" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        {branch && businessUnit ? (
          <InventoryPageContent
            organizationId={organizationId}
            branchId={branch.id}
            businessUnitId={businessUnit.id}
          />
        ) : (
          <EmptyState
            icon={Boxes}
            title="No branch yet"
            description="Set up a branch in Business Structure before managing inventory."
          />
        )}
      </div>
    </div>
  )
}

async function InventoryPageContent({
  organizationId,
  branchId,
  businessUnitId,
}: {
  organizationId: string
  branchId: string
  businessUnitId: string
}) {
  const [balances, movements, productOptions, branches, capabilities, valuation] =
    await Promise.all([
      listInventoryBalances(branchId),
      listMovementHistory(branchId),
      listBranchProductOptions(branchId),
      listBranches(organizationId),
      listBusinessUnitCapabilities(businessUnitId),
      getInventoryValuation(organizationId, businessUnitId, branchId),
    ])

  const destinationBranches = branches.filter(
    (candidate) => candidate.id !== branchId && candidate.archivedAt === null,
  )
  const batchTrackingEnabled = capabilities.some((c) => c.key === 'batch_tracking' && c.enabled)
  const expiryTrackingEnabled = capabilities.some((c) => c.key === 'expiry_tracking' && c.enabled)

  return (
    <InventoryView
      organizationId={organizationId}
      branchId={branchId}
      balances={balances}
      movements={movements}
      productOptions={productOptions}
      destinationBranches={destinationBranches}
      batchTrackingEnabled={batchTrackingEnabled}
      expiryTrackingEnabled={expiryTrackingEnabled}
      valuation={valuation}
    />
  )
}
