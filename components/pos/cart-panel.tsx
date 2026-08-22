import { ShoppingCart } from 'lucide-react'

import { EmptyState } from '@/components/states/empty-state'
import { CartSummary } from '@/components/pos/cart-summary'

/**
 * Desktop cart panel — search+grid on the left, cart+total on the right,
 * per docs/UXUI_Design_System_Specification.md §15's layout. Hidden below
 * `lg`; app/(pos)/pos/page.tsx swaps to MobileCartBar + a Drawer at that
 * breakpoint instead (§54: "The cart becomes a bottom sheet/drawer" — not a
 * shrunk sidebar).
 */
export function CartPanel() {
  return (
    <aside className="hidden w-80 shrink-0 flex-col gap-4 border-l bg-card p-4 lg:flex xl:w-96">
      <h2 className="text-body font-semibold">Cart</h2>
      <div className="flex-1">
        <EmptyState
          icon={ShoppingCart}
          title="Cart is empty"
          description="Scan or search a product to add it to the sale."
        />
      </div>
      <CartSummary />
    </aside>
  )
}
