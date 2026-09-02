import { redirect } from 'next/navigation'
import { Package } from 'lucide-react'

import { requirePermission } from '@/lib/auth/guard'
import { getOnboardingState } from '@/lib/business-structure/queries'
import { listCategories, listCategorySuggestions, listProducts } from '@/lib/products/queries'
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

  // Milestone 15 audit finding 7: this page's own doc comment above says
  // "gated on `products.view`", but the gate lived only in the nav (`<Can>`)
  // and in the mutations — a user without the permission who typed the URL
  // still got the full management UI. RLS kept the data correct and the
  // create/edit actions still refused, so this is defense-in-depth, not a
  // breach — but it is inconsistent with reports/employees/expenses/roles,
  // which all guard here. Now it matches them.
  await requirePermission('products.view', { organizationId })

  const businessUnit = onboardingState.businessUnit

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Products" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        {businessUnit ? (
          <ProductsPageContent
            organizationId={organizationId}
            businessUnitId={businessUnit.id}
            businessTypeId={businessUnit.businessTypeId}
          />
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
  businessTypeId,
}: {
  organizationId: string
  businessUnitId: string
  businessTypeId: string
}) {
  const [products, categories, categorySuggestions] = await Promise.all([
    listProducts(organizationId, businessUnitId),
    listCategories(businessUnitId),
    listCategorySuggestions(businessTypeId),
  ])

  return (
    <ProductsView
      organizationId={organizationId}
      businessUnitId={businessUnitId}
      products={products}
      categories={categories}
      categorySuggestions={categorySuggestions}
    />
  )
}
