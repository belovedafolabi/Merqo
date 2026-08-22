'use client'

import { ShoppingCart } from 'lucide-react'

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { CartSummary } from '@/components/pos/cart-summary'
import { EmptyState } from '@/components/states/empty-state'

/**
 * Mobile cart entry point — "3 Items ₦12,500 [VIEW CART]" bottom bar per
 * docs/UXUI_Design_System_Specification.md §54, opening the cart as a
 * bottom-sheet Drawer rather than a shrunk desktop panel. Only rendered
 * below `lg` (app/(pos)/pos/page.tsx hides CartPanel there instead).
 */
export function MobileCartBar() {
  return (
    <div className="border-t bg-card p-3 lg:hidden">
      <Drawer>
        <DrawerTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground"
          >
            <span className="flex items-center gap-2 text-body-sm font-medium">
              <ShoppingCart className="size-4" /> 0 items
            </span>
            <span className="text-body font-semibold tabular-nums">View cart · ₦0</span>
          </button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Cart</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-4 px-4 pb-6">
            <EmptyState
              icon={ShoppingCart}
              title="Cart is empty"
              description="Scan or search a product to add it to the sale."
            />
            <CartSummary />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
