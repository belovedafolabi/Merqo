'use client'

import { useState } from 'react'
import { Minus, Plus, ShoppingCart, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/states/empty-state'
import { useCart, type CartLine } from '@/lib/pos/cart-context'

/**
 * Type-a-quantity field, replacing what used to be a read-only `<span>`
 * between the −/+ buttons. Entering "12" directly beats tapping + eleven
 * times, which is the whole point, but the stepper stays because it is still
 * the faster control for ±1.
 *
 * `draft` is null whenever the field isn't being edited, so the displayed
 * value is derived straight from the cart and the stepper buttons keep
 * working with no effect syncing the two. While the cashier is mid-type it
 * holds their raw text — otherwise clearing the field to retype would parse
 * as 0 and delete the line out from under them.
 */
function QuantityField({ line }: { line: CartLine }) {
  const { updateQuantity } = useCart()
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <Input
      type="text"
      inputMode="numeric"
      // A quantity is never a decimal here (fractional units are sold by
      // changing the unit of measurement, not the count), so digits only.
      pattern="[0-9]*"
      aria-label={`Quantity of ${line.name}`}
      value={draft ?? String(line.quantity)}
      className="h-11 w-14 px-1 text-center text-body-sm tabular-nums lg:h-8 lg:w-11"
      onChange={(event) => {
        const cleaned = event.target.value.replace(/\D/g, '').slice(0, 4)
        setDraft(cleaned)
        const next = Number(cleaned)
        // Only commit a real quantity. A blank field or a leading 0 is a
        // half-finished edit, not a request to remove the line — removal is
        // the × button's job.
        if (cleaned !== '' && next >= 1) {
          updateQuantity(line.productId, line.variantId, next)
        }
      }}
      onFocus={(event) => event.target.select()}
      onBlur={() => setDraft(null)}
    />
  )
}

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
          <div className="flex items-center gap-2 lg:gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 active:bg-accent lg:size-8"
              aria-label={`Decrease quantity of ${line.name}`}
              onClick={() => updateQuantity(line.productId, line.variantId, line.quantity - 1)}
            >
              <Minus className="size-4 lg:size-3" />
            </Button>
            <QuantityField line={line} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 active:bg-accent lg:size-8"
              aria-label={`Increase quantity of ${line.name}`}
              onClick={() => updateQuantity(line.productId, line.variantId, line.quantity + 1)}
            >
              <Plus className="size-4 lg:size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground active:bg-accent lg:size-8"
              aria-label={`Remove ${line.name} from cart`}
              onClick={() => removeItem(line.productId, line.variantId)}
            >
              <X className="size-4 lg:size-3" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
