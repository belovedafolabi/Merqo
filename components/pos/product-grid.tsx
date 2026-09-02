'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Package } from 'lucide-react'
import { toast } from 'sonner'

import { PosSearch } from '@/components/pos/pos-search'
import { ProductTile } from '@/components/pos/product-tile'
import { EmptyState } from '@/components/states/empty-state'
import { useBarcodeScanner, isScanCaptureBlocked } from '@/hooks/use-barcode-scanner'
import { logger } from '@/lib/logger'
import { useCart } from '@/lib/pos/cart-context'
import { usePosSession } from '@/lib/pos/session-context'
import { searchProductsAction, lookupBarcodeAction } from '@/app/(pos)/pos/actions'
import type { Product } from '@/lib/products/queries'

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
  const { organizationId, businessUnitId } = usePosSession()
  const { addItem } = useCart()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  // Derived, not a separate toggled boolean: "pending" is just "the trimmed
  // query hasn't been searched yet" — comparing against the last query that
  // actually resolved. Only the resolve itself (searchProductsAction's
  // .then()) needs to setState from inside the effect, and doing so from a
  // callback rather than synchronously in the effect body is the documented
  // exception react-hooks/set-state-in-effect allows.
  const [lastSearchedQuery, setLastSearchedQuery] = useState('')
  const pending = query.trim() !== '' && query.trim() !== lastSearchedQuery

  useEffect(() => {
    const term = query.trim()
    // No setResults([]) here for the empty-query case — nothing needs to
    // clear it: the render below already shows the "search or scan" empty
    // state whenever `!query.trim()`, without ever reading `results`, so a
    // stale value sitting in state until the next real search is harmless
    // and avoids a synchronous setState-in-effect for a case the render
    // already handles.
    if (!term) return
    const timeout = setTimeout(() => {
      searchProductsAction(organizationId, businessUnitId, term).then((data) => {
        setResults(data)
        setLastSearchedQuery(term)
      })
    }, 250)
    return () => clearTimeout(timeout)
  }, [query, organizationId, businessUnitId])

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
      // announced rather than conveyed by colour alone. The server side
      // already logs products.barcode_lookup_miss with the code itself
      // (lib/products/queries.ts); this client event is what correlates a
      // miss with useBarcodeScanner's own heuristic events during rollout,
      // per this milestone's Observability section.
      logger.warn('pos.scan_no_match', { businessUnitId, length: barcode.length })
      toast.error(`No product matches barcode ${barcode}`, {
        description: 'Search by name or SKU instead.',
      })

      // Fall back to the ordinary debounced search, which already matches
      // the barcode column (searchProducts' ilike OR) — so a partially-read
      // or mistyped code still surfaces its near-matches.
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
  // while nothing else is focused (a product tile, the cart, the page body)
  // pulls focus into the search box so the cashier never has to click it
  // first. Deliberately narrow — isScanCaptureBlocked() already excludes
  // inputs/textareas/selects/contenteditable and anything inside a
  // [role="dialog"] (the checkout drawer, customer picker), so this never
  // fights a field the user is actually typing in, and never fires while a
  // modal is open. No preventDefault, so the character that triggered it
  // still lands in the newly-focused input. Bubble phase and a focus guard
  // keep it composable with useBarcodeScanner (document-level, same phase).
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

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <PosSearch
        value={query}
        onChange={setQuery}
        onScan={() => runScan(query)}
        inputRef={inputRef}
      />

      {!query.trim() ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Package}
            title="Search or scan a product"
            description="Matching products appear here as you type or scan a barcode."
          />
        </div>
      ) : results.length === 0 && !pending ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Package}
            title="No products found"
            description={`No match for "${query}".`}
          />
        </div>
      ) : (
        <div className={TILE_GRID_CLASS}>
          {results.map((product) => (
            <ProductTile
              key={product.id}
              product={{
                id: product.id,
                name: product.name,
                sku: product.sku,
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
