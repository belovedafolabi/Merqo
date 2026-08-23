'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  createProductVariantAction,
  updateProductVariantAction,
  type ProductsActionState,
} from '@/app/(app)/products/actions'
import { Can } from '@/components/auth/can'
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
import type { ProductVariant } from '@/lib/products/queries'

const initialState: ProductsActionState = { error: null }

/**
 * Create/edit a Product Variant (this milestone's Scope: "size/color...
 * sharing a parent product's identity but with their own SKU/barcode/stock
 * identity"). Cost/base price are optional overrides — left blank means
 * "inherit the parent product's price" (lib/products/pricing.ts's
 * resolveVariantPrice()).
 */
export function VariantFormDialog({
  organizationId,
  businessUnitId,
  productId,
  variant,
  open,
  onOpenChange,
}: {
  organizationId: string
  businessUnitId: string
  productId: string
  variant?: ProductVariant | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const action = variant ? updateProductVariantAction : createProductVariantAction
  const [state, formAction, pending] = useActionState(action, initialState)

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      onOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{variant ? 'Edit variant' : 'New variant'}</DialogTitle>
          <DialogDescription>
            Leave price fields blank to inherit the product’s own price.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('businessUnitId', businessUnitId)
            formData.set('productId', productId)
            if (variant) formData.set('variantId', variant.id)
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
            <Label htmlFor="variant-name">Name</Label>
            <Input id="variant-name" name="name" defaultValue={variant?.name} required autoFocus />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="variant-sku">SKU</Label>
              <Input id="variant-sku" name="sku" defaultValue={variant?.sku ?? ''} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="variant-barcode">Barcode</Label>
              <Input id="variant-barcode" name="barcode" defaultValue={variant?.barcode ?? ''} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Can permission="products.view_cost_price" scope={{ organizationId, businessUnitId }}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="variant-cost-price">Cost price override</Label>
                <Input
                  id="variant-cost-price"
                  name="costPrice"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={variant?.costPrice ?? ''}
                  placeholder="Inherit"
                />
              </div>
            </Can>
            <div className="flex flex-col gap-2">
              <Label htmlFor="variant-base-price">Base price override</Label>
              <Input
                id="variant-base-price"
                name="basePrice"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={variant?.basePrice ?? ''}
                placeholder="Inherit"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : variant ? 'Save changes' : 'Add variant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
