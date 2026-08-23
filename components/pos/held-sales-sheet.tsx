'use client'

import { useEffect, useState, useTransition } from 'react'
import { PauseCircle } from 'lucide-react'

import {
  holdSaleAction,
  listHeldSalesAction,
  resumeHeldSaleAction,
  discardHeldSaleAction,
} from '@/app/(pos)/pos/actions'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { EmptyState } from '@/components/states/empty-state'
import { useCart } from '@/lib/pos/cart-context'
import { usePosSession } from '@/lib/pos/session-context'
import type { HeldSale } from '@/lib/sales/queries'

/**
 * Hold/resume-sale UI (this milestone's Frontend Changes). "Hold" parks the
 * current cart as a held_sales draft and clears it for the next customer;
 * this sheet lists every held sale at the branch (shift handoff — any
 * cashier can resume a colleague's hold, per held_sales' own RLS comment)
 * and lets the operator resume (loads it back into the cart) or discard it.
 */
export function HeldSalesSheet() {
  const { organizationId, branchId, businessUnitId } = usePosSession()
  const { lines, loadLines, clear } = useCart()
  const [open, setOpen] = useState(false)
  const [heldSales, setHeldSales] = useState<HeldSale[]>([])
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open) listHeldSalesAction(branchId).then(setHeldSales)
  }, [open, branchId])

  function handleHold() {
    if (lines.length === 0) return
    startTransition(async () => {
      await holdSaleAction(
        organizationId,
        branchId,
        businessUnitId,
        lines.map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
        })),
      )
      clear()
      setOpen(true)
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="flex gap-2">
        <SheetTrigger asChild>
          <Button type="button" variant="outline" className="gap-2">
            <PauseCircle className="size-4" /> Held sales
          </Button>
        </SheetTrigger>
        <Button
          type="button"
          variant="outline"
          disabled={lines.length === 0 || pending}
          onClick={handleHold}
        >
          Hold cart
        </Button>
      </div>
      <SheetContent side="right" className="flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>Held sales</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-6">
          {heldSales.length === 0 ? (
            <EmptyState
              icon={PauseCircle}
              title="No held sales"
              description="Hold the current cart to start a new sale without losing it."
            />
          ) : (
            heldSales.map((held) => (
              <div
                key={held.id}
                className="flex items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-medium">{held.label ?? 'Held sale'}</p>
                  <p className="text-caption text-muted-foreground">
                    {held.itemCount} item{held.itemCount === 1 ? '' : 's'} ·{' '}
                    {new Date(held.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const resumed = await resumeHeldSaleAction(
                          organizationId,
                          branchId,
                          held.id,
                        )
                        loadLines(resumed)
                        setOpen(false)
                      })
                    }
                  >
                    Resume
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await discardHeldSaleAction(organizationId, branchId, held.id)
                        setHeldSales((prev) => prev.filter((h) => h.id !== held.id))
                      })
                    }
                  >
                    Discard
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
