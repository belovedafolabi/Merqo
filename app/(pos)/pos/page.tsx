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
 */
export default function PosPage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <ProductGrid />
        <CartPanel />
      </div>
      <MobileCartBar />
    </div>
  )
}
