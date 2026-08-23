'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { CheckoutDialog } from '@/components/pos/checkout-dialog'
import { useCart, useCartTotals } from '@/lib/pos/cart-context'

function money(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })
}

/**
 * Subtotal/discount/tax/total breakdown + the always-dominant CHECKOUT
 * button, per docs/UXUI_Design_System_Specification.md §20/§27. Shared by
 * the desktop cart panel and the mobile cart drawer so the two never drift.
 * Totals are lib/pos/cart-context.tsx's live client-side preview — the
 * authoritative total is re-derived server-side at checkout.
 */
export function CartSummary() {
  const { lines } = useCart()
  const totals = useCartTotals()
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  // Forces CheckoutDialog to fully remount on each new attempt — otherwise
  // useActionState's result from a *previous* completed sale would still be
  // sitting in the component instance's state the next time the dialog
  // opens, showing a stale "Sale complete" receipt before the new checkout
  // ever submits.
  const [attempt, setAttempt] = useState(0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 text-body-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Discount</span>
          <span className="tabular-nums">−{money(totals.discountAmount)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Tax</span>
          <span className="tabular-nums">{money(totals.taxAmount)}</span>
        </div>
      </div>
      <Separator />
      <div className="flex items-baseline justify-between">
        <span className="text-body font-semibold">TOTAL</span>
        <span className="text-h3 font-semibold tabular-nums">{money(totals.total)}</span>
      </div>
      <Button
        size="lg"
        disabled={lines.length === 0}
        className="h-14 rounded-xl text-body font-semibold"
        onClick={() => {
          setAttempt((n) => n + 1)
          setCheckoutOpen(true)
        }}
      >
        Checkout
      </Button>
      <CheckoutDialog key={attempt} open={checkoutOpen} onOpenChange={setCheckoutOpen} />
    </div>
  )
}
