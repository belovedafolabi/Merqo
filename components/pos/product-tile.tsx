import { Package } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface ProductTileData {
  id: string
  name: string
  price: string
  sku?: string
}

/**
 * Product grid tile — docs/UXUI_Design_System_Specification.md §17: image,
 * name, price, optional SKU, sized as a large touch target. No product data
 * exists until Milestone 06 — this milestone ships the tile's shape only,
 * exercised by an empty grid + EmptyState in app/(pos)/pos/page.tsx.
 */
export function ProductTile({ product }: { product: ProductTileData }) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-28 flex-col items-start justify-between gap-2 rounded-xl border bg-card p-3 text-left shadow-card transition-colors',
        'hover:border-primary/50 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Package className="size-4" />
      </span>
      <span className="flex w-full flex-col gap-0.5">
        <span className="truncate text-body-sm font-medium">{product.name}</span>
        {product.sku && <span className="text-caption text-muted-foreground">{product.sku}</span>}
        <span className="text-body-sm font-semibold tabular-nums">{product.price}</span>
      </span>
    </button>
  )
}
