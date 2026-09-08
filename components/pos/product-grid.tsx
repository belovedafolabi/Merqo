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
 *
 * The category chip row (All + every category, from `categories`) is now
 * shown at ALL times, not only while a term is present. With the box empty,
 * "All" keeps the recently-/most-sold strips; picking a category browses it
 * (a term-less fetch scoped by category_id). While searching, the chips
 * filter the result set exactly as before.
 */
const TILE_GRID_CLASS =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'

const SEARCH_DEBOUNCE_MS = 120

function focusSearchIfKeyboardDevice(input: HTMLInputElement | null): void {
  if (!input) return
  if (typeof window.matchMedia !== 'function') return
  if (!window.matchMedia('(pointer: fine)').matches) return
  input.focus()
}

export interface PosCategory {
  id: string
  name: string
}

export function ProductGrid({ categories }: { categories: PosCategory[] }) {
  const { businessUnitId } = usePosSession()
  const { addItem } = useCart()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PosProduct[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [lastSearchedQuery, setLastSearchedQuery] = useState('')
  // Mirrors lastSearchedQuery: the category whose browse fetch has resolved.
  // "browse pending" is derived from it rather than a setState in the effect
  // body (which the project lint forbids).
  const [lastBrowsedCategory, setLastBrowsedCategory] = useState<string | null>(null)
  const pending = query.trim() !== '' && query.trim() !== lastSearchedQuery

  usePendingToast(pending, 'Searching products…', 400)

  const searching = query.trim() !== ''
  const browsing = !searching && categoryFilter !== null
  const browsePending = browsing && categoryFilter !== lastBrowsedCategory

  const selectCategory = (id: string | null) => {
    setCategoryFilter(id)
    // Drop the previous category's tiles so they don't flash under the new
    // chip while its fetch is in flight.
    if (!searching) setResults([])
  }

  const cacheRef = useRef<Map<string, PosProduct[]>>(new Map())
  const abortRef = useRef<AbortController | null>(null)

  // Search-as-you-type. Unchanged: only runs while a term is present.
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

  // Category browse — term-less, scoped by category_id. Fires when the box is
  // empty and a specific chip is active (including after clearing a search
  // while a chip stays selected).
  useEffect(() => {
    if (!browsing || categoryFilter === null) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    fetch(
      `/api/pos/products/search?businessUnitId=${encodeURIComponent(
        businessUnitId,
      )}&categoryId=${encodeURIComponent(categoryFilter)}`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!response.ok) throw new Error(`browse ${response.status}`)
        return response.json() as Promise<{ products: PosProduct[] }>
      })
      .then(({ products }) => {
        setResults(products)
        setLastBrowsedCategory(categoryFilter)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLastBrowsedCategory(categoryFilter)
        logger.error('pos.browse_request_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        toast.error('Could not load that category', { description: 'Try again in a moment.' })
      })

    return () => controller.abort()
  }, [browsing, categoryFilter, businessUnitId])

  // While searching the chips filter the current result set; while browsing
  // the server already scoped it.
  const visibleResults = useMemo(
    () =>
      searching && categoryFilter
        ? results.filter((product) => product.categoryId === categoryFilter)
        : results,
    [results, searching, categoryFilter],
  )

  const addProductToCart = useCallback(
    (product: { id: string; name: string; basePrice: number }) => {
      addItem({ productId: product.id, name: product.name, unitPrice: product.basePrice })
      setQuery('')
      // Keep a category browse on screen so the next item from the same
      // category is one tap away; a search clears back to the strips.
      if (searching) setResults([])
      focusSearchIfKeyboardDevice(inputRef.current)
    },
    [addItem, searching],
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

      logger.warn('pos.scan_no_match', { businessUnitId, length: barcode.length })
      toast.error(`No product matches barcode ${barcode}`, {
        description: 'Search by name or SKU instead.',
      })
      setQuery(barcode)
    },
    [businessUnitId, addProductToCart],
  )

  useBarcodeScanner({ onScan: runScan })

  useEffect(() => {
    focusSearchIfKeyboardDevice(inputRef.current)
  }, [])

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

  const showStrips = !searching && !browsing
  const showGrid = searching || browsing

  // `pb-28` below `lg` clears the fixed MobileCartBar (bottom bar + safe-area)
  // so the last product row is never hidden behind it; reset at `lg` where
  // CartPanel takes over and the bar is gone.
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto scroll-smooth p-4 pb-28 lg:pb-4">
      <PosSearch
        value={query}
        onChange={setQuery}
        onScan={() => runScan(query)}
        inputRef={inputRef}
      />

      {categories.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={searching ? 'Filter results by category' : 'Browse a category'}
        >
          <CategoryChip
            label="All"
            active={categoryFilter === null}
            onClick={() => selectCategory(null)}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              active={categoryFilter === category.id}
              onClick={() => selectCategory(category.id)}
            />
          ))}
        </div>
      )}

      {showStrips && (
        <>
          <ProductShortcutStrips onSelect={addProductToCart} />
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={Package}
              title="Search, scan, or pick a category"
              description="Products appear here as you type or scan, or when you choose a category above."
            />
          </div>
        </>
      )}

      {showGrid &&
        (visibleResults.length === 0 && !pending && !browsePending ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={Package}
              title={searching ? 'No products found' : 'No products in this category'}
              description={
                searching
                  ? `No match for "${query}".`
                  : 'Add products to this category to see them here.'
              }
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
        ))}
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
