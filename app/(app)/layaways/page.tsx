import { redirect } from 'next/navigation'
import { Wallet } from 'lucide-react'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState, listBusinessUnitCapabilities } from '@/lib/business-structure/queries'
import { listBranchProductOptions } from '@/lib/inventory/queries'
import { listLayaways } from '@/lib/customers/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { EmptyState } from '@/components/states/empty-state'
import { LayawaysView } from '@/components/layaways/layaways-view'

/**
 * Layaway management (docs/milestones/09-customer-store-credit-and-
 * layaway.md Frontend Changes). Reachable from the Admin sidebar's
 * "Layaways" item (lib/shell/nav-items.ts), gated on `layaway.view`.
 *
 * Branch-scoped, the same way app/(app)/inventory/page.tsx is: a layaway
 * holds physical stock at one branch and is fulfilled there. The customer it
 * belongs to stays business-wide — only the layaway itself is branch-bound.
 *
 * Gated on the `layaway` capability as well as the permission: a business
 * type that doesn't offer layaway (a restaurant, say) has no use for this
 * screen at all, and the capability engine — not a business-type conditional
 * in code — is how this project expresses that (Milestone 02).
 */
export default async function LayawaysPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  // Milestone 15 audit finding 7 — see app/(app)/products/page.tsx.
  await requirePermission('layaway.view', { organizationId })

  const branch = onboardingState.branch
  const businessUnit = onboardingState.businessUnit

  if (!branch || !businessUnit) {
    return (
      <LayawaysShell>
        <EmptyState
          icon={Wallet}
          title="No branch yet"
          description="Set up a branch in Business Structure before creating layaways."
        />
      </LayawaysShell>
    )
  }

  const [capabilities, layaways, productOptions] = await Promise.all([
    listBusinessUnitCapabilities(businessUnit.id),
    listLayaways(branch.id),
    listBranchProductOptions(branch.id),
  ])

  const layawayEnabled = capabilities.some((c) => c.key === 'layaway' && c.enabled)
  if (!layawayEnabled) {
    return (
      <LayawaysShell>
        <EmptyState
          icon={Wallet}
          title="Layaway isn't enabled here"
          description="Turn on the Layaway capability for this business unit in Business Structure to start offering instalment plans."
        />
      </LayawaysShell>
    )
  }

  return (
    <LayawaysShell>
      <LayawaysView
        organizationId={organizationId}
        branchId={branch.id}
        businessUnitId={businessUnit.id}
        layaways={layaways}
        productOptions={productOptions}
      />
    </LayawaysShell>
  )
}

function LayawaysShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Layaways" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">{children}</div>
    </div>
  )
}
