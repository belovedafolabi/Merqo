'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  createStockAdjustmentAction,
  type InventoryActionState,
} from '@/app/(app)/inventory/actions'
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
import { Textarea } from '@/components/ui/textarea'
import type { BranchProductOption } from '@/lib/inventory/queries'

const initialState: InventoryActionState = { error: null }

/**
 * Manual stock adjustment (docs/milestones/07-inventory-and-stock-
 * management.md Frontend Changes: "Adjustment form (product, branch,
 * quantity delta, reason)"). Batch/expiry fields only render when the
 * current branch's Business Unit has the corresponding capability enabled
 * (this milestone's Scope) — same conditional-field pattern as
 * components/products/product-form-dialog.tsx's cost-price field.
 */
export function StockAdjustmentDialog({
  organizationId,
  branchId,
  productOptions,
  batchTrackingEnabled,
  expiryTrackingEnabled,
  open,
  onOpenChange,
}: {
  organizationId: string
  branchId: string
  productOptions: BranchProductOption[]
  batchTrackingEnabled: boolean
  expiryTrackingEnabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(createStockAdjustmentAction, initialState)

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      onOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            Record a manual stock change at this branch. Every adjustment requires a reason and is
            permanently auditable.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('branchId', branchId)
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="adjustment-product">Product</Label>
            <Select name="productId" required>
              <SelectTrigger id="adjustment-product" className="w-full">
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="adjustment-quantity">Quantity change</Label>
            <Input
              id="adjustment-quantity"
              name="quantityDelta"
              type="number"
              step="0.001"
              placeholder="e.g. 10 or -3"
              required
            />
          </div>

          {(batchTrackingEnabled || expiryTrackingEnabled) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {batchTrackingEnabled && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="adjustment-batch">Batch number</Label>
                  <Input id="adjustment-batch" name="batchNumber" />
                </div>
              )}
              {expiryTrackingEnabled && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="adjustment-expiry">Expiry date</Label>
                  <Input id="adjustment-expiry" name="expiryDate" type="date" />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="adjustment-reason">Reason</Label>
            <Textarea
              id="adjustment-reason"
              name="reason"
              placeholder="e.g. Stock count correction, damaged goods, new delivery"
              rows={3}
              required
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Record adjustment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
