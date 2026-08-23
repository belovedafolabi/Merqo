import { redirect } from 'next/navigation'
import { Package } from 'lucide-react'

import { getOnboardingState } from '@/lib/business-structure/queries'
import { listCategories, listProducts } from '@/lib/products/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { EmptyState } from '@/components/states/empty-state'
import { ProductsView } from '@/components/products/products-view'

/**
 * Product catalog management (docs/milestones/06-product-catalog-and-
 * pricing.md Frontend Changes). Reachable from the Admin sidebar's
 * "Products" item (lib/shell/nav-items.ts), gated on `products.view`.
 *
 * Operates on the organization's "current" Business Unit — the same one
 * app/(app)/layout.tsx's sidebar and components/shell/business-unit-
 * switcher.tsx already treat as authoritative (that component's own doc
 * comment notes there's no real multi-business-unit switcher yet). A
 * Business Unit selector here would need the same persisted "active
 * context" that component defers — out of this milestone's scope until a
 * concrete need for it emerges.
 */
export default async function ProductsPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  const businessUnit = onboardingState.businessUnit

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Products" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        {businessUnit ? (
          <ProductsPageContent organizationId={organizationId} businessUnitId={businessUnit.id} />
        ) : (
          <EmptyState
            icon={Package}
            title="No business unit yet"
            description="Set up a business unit in Business Structure before adding products."
          />
        )}
      </div>
    </div>
  )
}

async function ProductsPageContent({
  organizationId,
  businessUnitId,
}: {
  organizationId: string
  businessUnitId: string
}) {
  const [products, categories] = await Promise.all([
    listProducts(organizationId, businessUnitId),
    listCategories(businessUnitId),
  ])

  return (
    <ProductsView
      organizationId={organizationId}
      businessUnitId={businessUnitId}
      products={products}
      categories={categories}
    />
  )
}
