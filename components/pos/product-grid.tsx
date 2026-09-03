'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Package } from 'lucide-react'
import { toast } from 'sonner'

import { PosSearch } from '@/components/pos/pos-search'
import { ProductTile } from '@/components/pos/product-tile'
import { ProductShortcutStrips } from '@/components/pos/product-shortcut-strips'
import { EmptyState } from '@/components/states/empty-state'
import { useBarcodeScanner, isScanCaptureBlocked } from '@/hooks/use-barcode-scanner'
import { usePendingToast } from '@/hooks/use-pending-toast'
import { logger } from '@/lib/logger'
import { useCart } from '@/lib/pos/cart-context'
import { usePosSession } from '@/lib/pos/session-context'
import type { PosProduct } from '@/lib/pos/catalog'
import { lookupBarcodeAction } from '@/app/(pos)/pos/actions'

/**
 * Owns the search-as-you-type / barcode-scan workflow Milestone 08's
 * Functional Requirements call for ("search or scan a product, add it to a
 * cart... without leaving the primary screen for the common case").
 *
 * A scan reaches runScan() by either of two routes, and they share one
 * implementation so their behaviour cannot drift: PosSearch's own Enter
 * handler when the search box has focus, and Milestone 14's document-level
 * useBarcodeScanner() when it does not — the common case in a real shift,
 * where the cashier last touched a product tile or the cart.
 */
/**
 * Steps DOWN at `lg`, which looks like a mistake until you account for the
 * cart: that is exactly the breakpoint where CartPanel appears and claims
 * ~320px, so the grid's own content box shrinks even though the window grew.
 * Holding the column count constant across it squeezed tiles to ~215px and
 * truncated their names — the tablet-width failure Milestone 14 targets.
 */
const TILE_GRID_CLASS =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'

/**
 * Search debounce. Was 250ms; dropped to 120 once the search moved off a
 * serialized Server Action onto an abortable fetch (app/api/pos/products/
 * search) — the old value was partly compensating for the fact that stale
 * in-flight actions could not be cancelled, so a short debounce meant several
 * of them queued. With cancellation, 120ms is long enough to coalesce a fast
 * typist's burst and short enough to feel immediate.
 */
const SEARCH_DEBOUNCE_MS = 120

/**
 * Focuses the search box only on a device with a real pointer — i.e. a
 * desktop or a till with a keyboard attached.
 *
 * On a phone or tablet, focusing an input summons the on-screen keyboard,
 * which eats half the viewport. Milestone 14 scopes exactly this ("on-screen
 * keyboard behavior"), and the reason it is now safe to stop auto-focusing
 * is useBarcodeScanner: a scan no longer requires the search box to hold
 * focus, so the autofocus was buying nothing on touch devices and costing
 * them most of their screen.
 *
 * `(pointer: fine)` rather than a width query on purpose — this is a
 * question about the input device, not the viewport size.
 */
function focusSearchIfKeyboardDevice(input: HTMLInputElement | null): void {
  if (!input) return
  if (typeof window.matchMedia !== 'function') return
  if (!window.matchMedia('(pointer: fine)').matches) return
  input.focus()
}

export function ProductGrid() {
  const { businessUnitId } = usePosSession()
  const { addItem } = useCart()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PosProduct[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  // Derived, not a separate toggled boolean: "pending" is just "the trimmed
  // query hasn't been searched yet" — comparing against the last query that
  // actually resolved.
  const [lastSearchedQuery, setLastSearchedQuery] = useState('')
  const pending = query.trim() !== '' && query.trim() !== lastSearchedQuery

  // A toast only when a search is actually slow — a snappy one never flashes it.
  usePendingToast(pending, 'Searching products…', 400)

  // Keyed by the trimmed lowercase term. Backspacing through a word the
  // cashier just typed is then instant — the result for "brea" is already
  // here when they delete the "d". Lives in a ref so filling it never itself
  // triggers a render.
  const cacheRef = useRef<Map<string, PosProduct[]>>(new Map())
  // The in-flight request for the current keystroke, aborted when the next
  // one starts so a slow earlier response can never paint over a newer one.
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const term = query.trim()
    if (!term) return

    const key = term.toLowerCase()
    const cached = cacheRef.current.get(key)
    if (cached) {
      setResults(cached)
      setLastSearchedQuery(term)
      return
    }

    const timeout = setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      fetch(
        `/api/pos/products/search?businessUnitId=${encodeURIComponent(
          businessUnitId,
        )}&q=${encodeURIComponent(term)}`,
        { signal: controller.signal },
      )
        .then((response) => {
          if (!response.ok) throw new Error(`search ${response.status}`)
          return response.json() as Promise<{ products: PosProduct[] }>
        })
        .then(({ products }) => {
          cacheRef.current.set(key, products)
          setResults(products)
          setLastSearchedQuery(term)
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          logger.error('pos.search_request_failed', {
            error: error instanceof Error ? error.message : String(error),
          })
          toast.error('Search is unavailable', { description: 'Try again in a moment.' })
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [query, businessUnitId])

  // The category chips: distinct categories present in the current result
  // set. Shown only once there is more than one to choose between.
  const resultCategories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const product of results) {
      if (product.categoryId && product.categoryName && !seen.has(product.categoryId)) {
        seen.set(product.categoryId, product.categoryName)
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [results])

  // A filter that no longer matches any category in the current results (the
  // cashier changed the query) self-heals to "All" here, rather than an
  // effect resetting it on every keystroke — which would be a setState in an
  // effect body, and this project's lint forbids that.
  const activeCategory =
    categoryFilter && resultCategories.some((category) => category.id === categoryFilter)
      ? categoryFilter
      : null

  const visibleResults = useMemo(
    () =>
      activeCategory ? results.filter((product) => product.categoryId === activeCategory) : results,
    [results, activeCategory],
  )

  const addProductToCart = useCallback(
    (product: { id: string; name: string; basePrice: number }) => {
      addItem({ productId: product.id, name: product.name, unitPrice: product.basePrice })
      setQuery('')
      setResults([])
      focusSearchIfKeyboardDevice(inputRef.current)
    },
    [addItem],
  )

  const runScan = useCallback(
    async (raw: string) => {
      const barcode = raw.trim()
      if (!barcode) return

      const match = await lookupBarcodeAction(businessUnitId, barcode)
      if (match) {
        addProductToCart(match)
        return
      }

      // Previously a silent no-op, which was indistinguishable from a scanner
      // that had not fired at all. sonner's region is aria-live, so this is
      // announced rather than conveyed by colour alone.
      logger.warn('pos.scan_no_match', { businessUnitId, length: barcode.length })
      toast.error(`No product matches barcode ${barcode}`, {
        description: 'Search by name or SKU instead.',
      })

      // Fall back to the ordinary debounced search, which also matches the
      // barcode column — a partially-read code still surfaces its near-matches.
      setQuery(barcode)
    },
    [businessUnitId, addProductToCart],
  )

  useBarcodeScanner({ onScan: runScan })

  // Replaces PosSearch's own autoFocus attribute, which fired unconditionally
  // and raised the on-screen keyboard the instant /pos loaded on a phone.
  useEffect(() => {
    focusSearchIfKeyboardDevice(inputRef.current)
  }, [])

  // "Type anywhere to search": on a keyboard device, a printable keystroke
  // while nothing else is focused pulls focus into the search box so the
  // cashier never has to click it first.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key.length !== 1) return
      const input = inputRef.current
      if (!input || document.activeElement === input) return
      if (isScanCaptureBlocked(event.target)) return
      if (
        typeof window.matchMedia === 'function' &&
        !window.matchMedia('(pointer: fine)').matches
      ) {
        return
      }
      input.focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const searching = query.trim() !== ''

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto scroll-smooth p-4">
      <PosSearch
        value={query}
        onChange={setQuery}
        onScan={() => runScan(query)}
        inputRef={inputRef}
      />

      {!searching && <ProductShortcutStrips onSelect={addProductToCart} />}

      {searching && resultCategories.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter results by category">
          <CategoryChip
            label="All"
            active={activeCategory === null}
            onClick={() => setCategoryFilter(null)}
          />
          {resultCategories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              active={activeCategory === category.id}
              onClick={() => setCategoryFilter(category.id)}
            />
          ))}
        </div>
      )}

      {!searching ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Package}
            title="Search or scan a product"
            description="Matching products appear here as you type or scan a barcode."
          />
        </div>
      ) : visibleResults.length === 0 && !pending ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Package}
            title="No products found"
            description={`No match for "${query}".`}
          />
        </div>
      ) : (
        <div className={TILE_GRID_CLASS}>
          {visibleResults.map((product) => (
            <ProductTile
              key={product.id}
              product={{
                id: product.id,
                name: product.name,
                sku: product.sku ?? undefined,
                price: product.basePrice.toLocaleString(undefined, {
                  style: 'currency',
                  currency: 'NGN',
                }),
              }}
              onSelect={() => addProductToCart(product)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'min-h-9 rounded-full border px-3 text-body-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ' +
        (active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-card text-muted-foreground hover:text-foreground')
      }
    >
      {label}
    </button>
  )
}
