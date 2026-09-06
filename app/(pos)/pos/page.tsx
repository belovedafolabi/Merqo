import { getOnboardingState } from '@/lib/business-structure/queries'
import { listCategories } from '@/lib/products/queries'
import { ProductGrid } from '@/components/pos/product-grid'
import { CartPanel } from '@/components/pos/cart-panel'
import { MobileCartBar } from '@/components/pos/mobile-cart-bar'

/**
 * POS terminal screen — search+grid / cart split per
 * docs/UXUI_Design_System_Specification.md §15. ProductGrid/CartPanel own
 * their own client state (lib/pos/cart-context.tsx, lib/pos/session-
 * context.tsx, both seeded in app/(pos)/layout.tsx) — this screen is purely
 * layout.
 *
 * The recently-sold / most-sold strips fetch their own data from inside
 * ProductGrid (a Server Action on mount), rather than this page awaiting it
 * — see getPosShortcutsAction's comment for why the grid must not be blocked.
 * The category list IS awaited here: it's a small, static-per-shift lookup
 * that the always-visible chip row needs on first paint.
 */
export default async function PosPage() {
  const { businessUnit } = await getOnboardingState()
  const categories = businessUnit
    ? (await listCategories(businessUnit.id))
        .filter((category) => category.archivedAt === null)
        .map((category) => ({ id: category.id, name: category.name }))
    : []

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <ProductGrid categories={categories} />
        <CartPanel />
      </div>
      <MobileCartBar />
    </div>
  )
}
