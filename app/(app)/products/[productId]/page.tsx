import { notFound, redirect } from 'next/navigation'

import { getCurrentOrganizationId } from '@/lib/auth/context'
import {
  getBusinessUnitBranch,
  getProduct,
  listBranchPriceOverrides,
  listCategories,
  listPriceHistory,
  listProductVariants,
} from '@/lib/products/queries'
import { listUnitsOfMeasure } from '@/lib/units/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { ProductDetailView } from '@/components/products/product-detail-view'

/**
 * Product detail (docs/milestones/06-product-catalog-and-pricing.md
 * Frontend Changes: "Price history view on a product's detail page",
 * "Branch price override management"). Variants, branch pricing, and price
 * history all need more room than the list page's row-action dropdown, so
 * they live here rather than in another dialog stacked on the list.
 */
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  const { productId } = await params
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) redirect('/sign-in')

  const product = await getProduct(organizationId, productId)
  if (!product) notFound()

  const [categories, variants, branchPriceOverrides, priceHistory, branch, units] =
    await Promise.all([
      listCategories(product.businessUnitId),
      listProductVariants(productId),
      listBranchPriceOverrides(productId),
      listPriceHistory(productId),
      getBusinessUnitBranch(product.businessUnitId),
      listUnitsOfMeasure(organizationId),
    ])
  const activeUnitNames = units.filter((u) => u.archivedAt === null).map((u) => u.name)

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title={product.name} />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <ProductDetailView
          organizationId={organizationId}
          product={product}
          categories={categories}
          unitNames={activeUnitNames}
          variants={variants}
          branch={branch}
          branchPriceOverride={branchPriceOverrides.find((o) => o.branchId === branch?.id) ?? null}
          priceHistory={priceHistory}
        />
      </div>
    </div>
  )
}
