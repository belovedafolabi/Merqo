'use client'

import { useEffect, useRef, useState } from 'react'
import { Package } from 'lucide-react'

import { PosSearch } from '@/components/pos/pos-search'
import { ProductTile } from '@/components/pos/product-tile'
import { EmptyState } from '@/components/states/empty-state'
import { useCart } from '@/lib/pos/cart-context'
import { usePosSession } from '@/lib/pos/session-context'
import { searchProductsAction, lookupBarcodeAction } from '@/app/(pos)/pos/actions'
import type { Product } from '@/lib/products/queries'

/**
 * Owns the search-as-you-type / barcode-scan workflow this milestone's
 * Functional Requirements call for ("search or scan a product, add it to a
 * cart... without leaving the primary screen for the common case"). A
 * scanner types the barcode followed by Enter — PosSearch's onScan fires,
 * this component tries an exact barcode match first (the fast path
 * lib/products/queries.ts's lookupProductByBarcode() serves); a manual
 * Enter press with no barcode match just keeps whatever the debounced
 * search already found.
 */
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

  function addProductToCart(product: { id: string; name: string; basePrice: number }) {
    addItem({ productId: product.id, name: product.name, unitPrice: product.basePrice })
    setQuery('')
    setResults([])
    inputRef.current?.focus()
  }

  async function handleScan() {
    const barcode = query.trim()
    if (!barcode) return

    const match = await lookupBarcodeAction(businessUnitId, barcode)
    if (match) {
      addProductToCart(match)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <PosSearch value={query} onChange={setQuery} onScan={handleScan} inputRef={inputRef} />

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
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
