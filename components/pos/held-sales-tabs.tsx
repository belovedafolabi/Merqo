'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
 * read like browser tabs — tap one to see its detail + Resume/Discard —
 * with prev/next paging past PAGE_SIZE so a busy till doesn't overflow the
 * narrow cart panel.
 *
 * Rendered in both the desktop CartPanel header and the mobile cart Drawer,
 * so held sales are reachable below `lg` for the first time.
 *
 * Resume auto-holds a non-empty current cart first: the old flow called
 * loadLines() straight over the top, silently discarding whatever the
 * cashier had rung up.
 */
export function HeldSalesTabs() {
  const { organizationId, branchId, businessUnitId } = usePosSession()
  const { lines, loadLines, clear } = useCart()
  const [heldSales, setHeldSales] = useState<HeldSale[]>([])
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
  const selected = heldSales.find((held) => held.id === selectedId) ?? null

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
    const dismiss = notifyPending('Resuming sale…')
    startTransition(async () => {
      try {
        if (lines.length > 0) {
          await holdSaleAction(organizationId, branchId, businessUnitId, toItems(lines))
        }
        const resumed = await resumeHeldSaleAction(organizationId, branchId, held.id)
        clear()
        loadLines(resumed)
        setSelectedId(null)
        refresh()
      } finally {
        dismiss()
      }
    })
  }

  function handleDiscard(held: HeldSale) {
    startTransition(async () => {
      await discardHeldSaleAction(organizationId, branchId, held.id)
      setHeldSales((prev) => prev.filter((entry) => entry.id !== held.id))
      if (selectedId === held.id) setSelectedId(null)
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
              role="tablist"
              aria-label="Held sales"
              className="flex flex-1 gap-1 overflow-x-auto border-b"
            >
              {visible.map((held) => {
                const active = held.id === selectedId
                return (
                  <button
                    key={held.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedId(active ? null : held.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1 border-b-2 border-transparent px-2 py-1.5 text-body-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                      active && 'border-primary text-foreground',
                    )}
                  >
                    #{held.label ? held.label : shortRef(held.id)}
                    <span className="text-caption tabular-nums opacity-70">· {held.itemCount}</span>
                  </button>
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
                <span className="text-caption tabular-nums text-muted-foreground">
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

          {selected && (
            <div className="flex items-center justify-between gap-2 rounded-lg border p-2">
              <div className="min-w-0">
                <p className="truncate text-body-sm font-medium">
                  {selected.label ?? `Held sale #${shortRef(selected.id)}`}
                </p>
                <p className="text-caption text-muted-foreground">
                  {selected.itemCount} item{selected.itemCount === 1 ? '' : 's'} ·{' '}
                  {new Date(selected.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleResume(selected)}
                >
                  Resume
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => handleDiscard(selected)}
                >
                  Discard
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
