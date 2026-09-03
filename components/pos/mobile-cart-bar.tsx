'use client'

import { ShoppingCart } from 'lucide-react'

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { CartLines } from '@/components/pos/cart-lines'
import { CartSummary } from '@/components/pos/cart-summary'
import { HeldSalesTabs } from '@/components/pos/held-sales-tabs'
import { useCart, useCartTotals } from '@/lib/pos/cart-context'

/**
 * Mobile cart entry point — "3 Items ₦12,500 [VIEW CART]" bottom bar per
 * docs/UXUI_Design_System_Specification.md §54, opening the cart as a
 * bottom-sheet Drawer rather than a shrunk desktop panel. Only rendered
 * below `lg` (app/(pos)/pos/page.tsx hides CartPanel there instead).
 *
 * `dvh` not `vh` on the drawer body (Milestone 14): on iOS Safari `vh`
 * ignores the URL bar, so `70vh` overshot the visible area and pushed
 * CartSummary's checkout button below the fold — exactly the "obscured
 * button" failure this milestone's acceptance criteria name. `pb-safe-b`
 * keeps both the bar and the drawer clear of the home indicator.
 */
export function MobileCartBar() {
  const { lines } = useCart()
  const totals = useCartTotals()
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <div className="border-t bg-card px-3 pt-3 pb-safe-b lg:hidden">
      <Drawer>
        <DrawerTrigger asChild>
          <button
            type="button"
            className="flex min-h-14 w-full touch-manipulation items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground active:bg-primary/90"
          >
            <span className="flex items-center gap-2 text-body-sm font-medium">
              <ShoppingCart className="size-4" /> {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
            <span className="text-body font-semibold tabular-nums">
              View cart ·{' '}
              {totals.total.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })}
            </span>
          </button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Cart</DrawerTitle>
          </DrawerHeader>
          <div className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto scroll-smooth px-4 pb-safe-b">
            <HeldSalesTabs />
            <CartLines />
            <CartSummary />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
