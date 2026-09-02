'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'

import {
  discardHeldSaleAction,
  holdSaleAction,
  listHeldSalesAction,
  resumeHeldSaleAction,
} from '@/app/(pos)/pos/actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCart } from '@/lib/pos/cart-context'
import { usePosSession } from '@/lib/pos/session-context'
import { notifyPending } from '@/lib/toast'
import type { HeldSale } from '@/lib/sales/queries'

const PAGE_SIZE = 5

function toItems(lines: { productId: string; variantId: string | null; quantity: number }[]) {
  return lines.map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    quantity: line.quantity,
  }))
}

function shortRef(id: string): string {
  return id.replace(/-/g, '').slice(0, 4).toUpperCase()
}

/**
 * Held sales as a row of quick-switch tabs, replacing the old right-side
 * Sheet + vertical list (components/pos/held-sales-sheet.tsx). Parked carts
 * read like browser tabs, with prev/next paging past PAGE_SIZE so a busy
 * till doesn't overflow the narrow cart panel.
 *
 * Rendered in both the desktop CartPanel header and the mobile cart Drawer,
 * so held sales are reachable below `lg` for the first time.
 *
 * Tapping a tab switches to it outright. It used to only reveal a detail
 * card with a Resume button, which made every cart switch two taps for no
 * information the tab itself wasn't already showing. Discard moved onto the
 * tab as a × for the same reason.
 *
 * Switching auto-holds a non-empty current cart first, so the outgoing cart
 * comes straight back as its own tab rather than being silently discarded —
 * that round-trip is what makes this feel like tabs rather than a load.
 *
 * Not `role="tablist"`: a tab selects a panel that is already on screen,
 * whereas these replace the cart's contents and then vanish (resumeHeldSale
 * deletes the row). They are actions, so they are announced as buttons.
 */
export function HeldSalesTabs() {
  const { organizationId, branchId, businessUnitId } = usePosSession()
  const { lines, loadLines, clear } = useCart()
  const [heldSales, setHeldSales] = useState<HeldSale[]>([])
  const [page, setPage] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = useCallback(() => {
    listHeldSalesAction(branchId)
      .then(setHeldSales)
      .catch(() => {
        /* a transient list failure just leaves the last-known tabs in place */
      })
  }, [branchId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const pageCount = Math.max(1, Math.ceil(heldSales.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const visible = heldSales.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE)

  function handleHold() {
    if (lines.length === 0) return
    const dismiss = notifyPending('Holding sale…')
    startTransition(async () => {
      try {
        await holdSaleAction(organizationId, branchId, businessUnitId, toItems(lines))
        clear()
        refresh()
      } finally {
        dismiss()
      }
    })
  }

  function handleResume(held: HeldSale) {
    if (busyId) return
    setBusyId(held.id)
    // Drop the tab straight away rather than waiting for refresh(): resuming
    // deletes the held sale, so leaving it on screen for the length of the
    // round-trip is showing something that is already on its way out.
    setHeldSales((prev) => prev.filter((entry) => entry.id !== held.id))
    const dismiss = notifyPending('Switching cart…')
    startTransition(async () => {
      try {
        if (lines.length > 0) {
          await holdSaleAction(organizationId, branchId, businessUnitId, toItems(lines))
        }
        const resumed = await resumeHeldSaleAction(organizationId, branchId, held.id)
        clear()
        loadLines(resumed)
      } finally {
        setBusyId(null)
        dismiss()
        // Reconciles both optimistic edits above against the server: the
        // outgoing cart's new tab appears and, if anything failed, the tab
        // we removed comes back.
        refresh()
      }
    })
  }

  function handleDiscard(held: HeldSale) {
    if (busyId) return
    setBusyId(held.id)
    startTransition(async () => {
      try {
        await discardHeldSaleAction(organizationId, branchId, held.id)
        setHeldSales((prev) => prev.filter((entry) => entry.id !== held.id))
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-medium text-muted-foreground">
          {heldSales.length > 0 ? `Held sales · ${heldSales.length}` : 'Held sales'}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={lines.length === 0 || pending}
          onClick={handleHold}
        >
          Hold cart
        </Button>
      </div>

      {heldSales.length > 0 && (
        <>
          <div className="flex items-center gap-1">
            <div
              role="group"
              aria-label="Held sales"
              className="flex flex-1 gap-1 overflow-x-auto border-b"
            >
              {visible.map((held) => {
                const name = held.label ? held.label : `#${shortRef(held.id)}`
                const busy = busyId === held.id
                return (
                  <div
                    key={held.id}
                    className={cn(
                      'flex shrink-0 items-center border-b-2 border-transparent transition-colors',
                      busy && 'border-primary',
                    )}
                  >
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleResume(held)}
                      aria-label={`Switch to held sale ${name}, ${held.itemCount} item${
                        held.itemCount === 1 ? '' : 's'
                      }`}
                      className="flex min-h-11 shrink-0 items-center gap-1 pr-1 pl-2 text-body-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60 lg:min-h-8"
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                      ) : null}
                      {held.label ? held.label : `#${shortRef(held.id)}`}
                      <span className="text-caption tabular-nums opacity-70">
                        · {held.itemCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleDiscard(held)}
                      aria-label={`Discard held sale ${name}`}
                      className="flex min-h-11 items-center px-1.5 text-muted-foreground transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60 lg:min-h-8"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>

            {pageCount > 1 && (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={clampedPage === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  aria-label="Previous held sales"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-caption text-muted-foreground tabular-nums">
                  {clampedPage + 1}/{pageCount}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={clampedPage >= pageCount - 1}
                  onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                  aria-label="More held sales"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
