'use client'

import { useActionState, useEffect, useState } from 'react'
import { Plus, Trash2, TriangleAlert } from 'lucide-react'

import { createLayawayAction, type LayawayActionState } from '@/app/(app)/layaways/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog'
import { CustomerPicker } from '@/components/customers/customer-picker'
import type { BranchProductOption } from '@/lib/inventory/queries'
import type { Customer } from '@/lib/customers/queries'

const initialState: LayawayActionState = { error: null }

interface DraftItem {
  productId: string
  quantity: string
}

function emptyDraftItem(): DraftItem {
  return { productId: '', quantity: '1' }
}

/**
 * Create a layaway (docs/milestones/09-customer-store-credit-and-layaway.md
 * Frontend Changes: "Layaway creation screen (select customer, items,
 * capture original total)"). Repeating line rows serialized as a JSON
 * `items` field, same pattern as components/inventory/stock-transfer-
 * dialog.tsx.
 *
 * No total field: the original total is derived server-side from
 * Milestone 06's price resolution at creation time (lib/customers/
 * mutations.ts's createLayaway()), never typed in here — the same
 * "never trust a client-supplied price" rule checkout follows. What the
 * operator agrees with the customer is the current shelf price, and that is
 * exactly what the server resolves.
 */
export function LayawayFormDialog({
  organizationId,
  branchId,
  businessUnitId,
  productOptions,
  open,
  onOpenChange,
}: {
  organizationId: string
  branchId: string
  businessUnitId: string
  productOptions: BranchProductOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(createLayawayAction, initialState)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [items, setItems] = useState<DraftItem[]>([emptyDraftItem()])
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      handleOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function handleOpenChange(next: boolean) {
    if (!next) {
      setCustomer(null)
      setItems([emptyDraftItem()])
    }
    onOpenChange(next)
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    )
  }

  const canSubmit =
    Boolean(customer) && items.some((item) => item.productId && Number(item.quantity) > 0)

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New layaway</DialogTitle>
            <DialogDescription>
              The stock on this layaway is reserved as soon as it is created, so nobody else can
              sell it while the customer pays it off.
            </DialogDescription>
          </DialogHeader>

          <form
            action={(formData) => {
              formData.set('organizationId', organizationId)
              formData.set('branchId', branchId)
              formData.set('businessUnitId', businessUnitId)
              formData.set('customerId', customer?.id ?? '')
              formData.set(
                'items',
                JSON.stringify(
                  items
                    .filter((item) => item.productId && Number(item.quantity) > 0)
                    .map((item) => ({
                      productId: item.productId,
                      variantId: null,
                      quantity: Number(item.quantity),
                    })),
                ),
              )
              formAction(formData)
            }}
            className="flex flex-col gap-4"
          >
            {state.error && (
              <Alert variant="destructive" role="alert">
                <TriangleAlert />
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <CustomerPicker
              organizationId={organizationId}
              selected={customer}
              onSelect={setCustomer}
              onQuickAdd={() => setQuickAddOpen(true)}
              helperText="A layaway always belongs to a named customer."
            />

            <div className="flex flex-col gap-3">
              <Label>Items</Label>
              {items.map((item, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex flex-1 flex-col gap-2">
                    <Label htmlFor={`layaway-product-${index}`} className="sr-only">
                      Product {index + 1}
                    </Label>
                    <Select
                      value={item.productId}
                      onValueChange={(value) => updateItem(index, { productId: value })}
                    >
                      <SelectTrigger id={`layaway-product-${index}`} className="w-full">
                        <SelectValue placeholder="Select a product" />
                      </SelectTrigger>
                      <SelectContent>
                        {productOptions.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} · {product.sku}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex w-24 flex-col gap-2">
                    <Label htmlFor={`layaway-quantity-${index}`} className="sr-only">
                      Quantity for item {index + 1}
                    </Label>
                    <Input
                      id={`layaway-quantity-${index}`}
                      type="number"
                      inputMode="decimal"
                      min="0.001"
                      step="0.001"
                      value={item.quantity}
                      onChange={(event) => updateItem(index, { quantity: event.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove item ${index + 1}`}
                    disabled={items.length === 1}
                    onClick={() =>
                      setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setItems((current) => [...current, emptyDraftItem()])}
              >
                <Plus aria-hidden="true" /> Add item
              </Button>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={pending || !canSubmit}>
                {pending ? 'Creating…' : 'Create layaway'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CustomerFormDialog
        organizationId={organizationId}
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
      />
    </>
  )
}
