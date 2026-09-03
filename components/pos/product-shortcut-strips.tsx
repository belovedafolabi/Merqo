'use client'

import { useEffect, useState } from 'react'
import { Clock, TrendingUp } from 'lucide-react'

import { getPosShortcutsAction } from '@/app/(pos)/pos/actions'
import { usePosSession } from '@/lib/pos/session-context'
import type { PosProductShortcut, PosProductShortcuts } from '@/lib/pos/catalog'

/**
 * The "recently sold" and "most sold" fast-access strips, shown under the
 * search box while it is empty — docs/Functional_Specification.md §164
 * ("frequently sold products" reachable without searching), unbuilt until
 * now.
 *
 * Fetches its own data on mount rather than receiving it as a prop, so the
 * parent ProductGrid can mount synchronously (it registers the barcode
 * scanner on mount — see getPosShortcutsAction). One horizontally-scrolling
 * row per section; not a wrapping grid, so the cart and search results stay
 * above the fold on a phone. Renders nothing until the data arrives, and
 * nothing when both lists are empty (a shop with no sales yet).
 */
const EMPTY: PosProductShortcuts = { recent: [], top: [] }

export function ProductShortcutStrips({
  onSelect,
}: {
  onSelect: (product: { id: string; name: string; basePrice: number }) => void
}) {
  const { branchId, businessUnitId } = usePosSession()
  const [shortcuts, setShortcuts] = useState<PosProductShortcuts>(EMPTY)

  useEffect(() => {
    let cancelled = false
    getPosShortcutsAction(branchId, businessUnitId)
      .then((data) => {
        if (!cancelled) setShortcuts(data)
      })
      .catch(() => {
        /* a strip that fails to load just stays hidden — the grid is fine */
      })
    return () => {
      cancelled = true
    }
  }, [branchId, businessUnitId])

  const { recent, top } = shortcuts
  if (recent.length === 0 && top.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {recent.length > 0 && (
        <ShortcutStrip
          icon={<Clock className="size-3.5" />}
          title="Recently sold"
          products={recent}
          onSelect={onSelect}
        />
      )}
      {top.length > 0 && (
        <ShortcutStrip
          icon={<TrendingUp className="size-3.5" />}
          title="Most sold"
          products={top}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

function ShortcutStrip({
  icon,
  title,
  products,
  onSelect,
}: {
  icon: React.ReactNode
  title: string
  products: PosProductShortcut[]
  onSelect: (product: { id: string; name: string; basePrice: number }) => void
}) {
  return (
    <section className="flex flex-col gap-1.5" aria-label={title}>
      <h2 className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
        {icon}
        {title}
      </h2>
      {/* -mx-4 px-4 so the row bleeds to the screen edges of ProductGrid's
          own p-4 — a strip that stops short of the edge reads as "there is
          nothing more", which for a scroller is the wrong signal. */}
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
        {products.map((product) => (
          <li key={product.id} className="snap-start">
            <button
              type="button"
              onClick={() =>
                onSelect({ id: product.id, name: product.name, basePrice: product.basePrice })
              }
              className="flex h-full min-h-16 w-36 flex-col justify-between gap-1 rounded-lg border bg-card p-2.5 text-left shadow-card transition-[colors,transform] duration-100 hover:border-primary/50 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98] active:bg-accent"
            >
              <span className="line-clamp-2 text-body-sm font-medium">{product.name}</span>
              <span className="text-caption font-semibold tabular-nums">
                {product.basePrice.toLocaleString(undefined, {
                  style: 'currency',
                  currency: 'NGN',
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
