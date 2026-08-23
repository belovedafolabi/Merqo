'use client'

import { Minus, Plus, ShoppingCart, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/states/empty-state'
import { useCart } from '@/lib/pos/cart-context'

/**
 * The cart's line-item list — quantity stepper + remove, per
 * docs/UXUI_Design_System_Specification.md §20's cart row shape. Shared by
 * the desktop cart panel and the mobile cart drawer. Owns the empty-state
 * fallback itself (rather than the panel/drawer around it) since only this
 * component reads the live cart state needed to decide which to show.
 */
export function CartLines() {
  const { lines, updateQuantity, removeItem } = useCart()

  if (lines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={ShoppingCart}
          title="Cart is empty"
          description="Scan or search a product to add it to the sale."
        />
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3 overflow-y-auto">
      {lines.map((line) => (
        <li key={`${line.productId}:${line.variantId ?? ''}`} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-medium">{line.name}</p>
            <p className="text-caption text-muted-foreground tabular-nums">
              {line.unitPrice.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })}{' '}
              each
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7"
              aria-label={`Decrease quantity of ${line.name}`}
              onClick={() => updateQuantity(line.productId, line.variantId, line.quantity - 1)}
            >
              <Minus className="size-3" />
            </Button>
            <span className="w-6 text-center text-body-sm tabular-nums">{line.quantity}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7"
              aria-label={`Increase quantity of ${line.name}`}
              onClick={() => updateQuantity(line.productId, line.variantId, line.quantity + 1)}
            >
              <Plus className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label={`Remove ${line.name} from cart`}
              onClick={() => removeItem(line.productId, line.variantId)}
            >
              <X className="size-3" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
