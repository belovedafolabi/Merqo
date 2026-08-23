import { CartLines } from '@/components/pos/cart-lines'
import { CartSummary } from '@/components/pos/cart-summary'
import { HeldSalesSheet } from '@/components/pos/held-sales-sheet'

/**
 * Desktop cart panel — search+grid on the left, cart+total on the right,
 * per docs/UXUI_Design_System_Specification.md §15's layout. Hidden below
 * `lg`; app/(pos)/pos/page.tsx swaps to MobileCartBar + a Drawer at that
 * breakpoint instead (§54: "The cart becomes a bottom sheet/drawer" — not a
 * shrunk sidebar). CartLines/CartSummary read live state from
 * lib/pos/cart-context.tsx, so this component itself stays purely layout.
 */
export function CartPanel() {
  return (
    <aside className="hidden w-80 shrink-0 flex-col gap-4 border-l bg-card p-4 lg:flex xl:w-96">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-body font-semibold">Cart</h2>
        <HeldSalesSheet />
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <CartLines />
      </div>
      <CartSummary />
    </aside>
  )
}
