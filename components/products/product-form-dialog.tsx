'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  createProductAction,
  updateProductAction,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Category, Product } from '@/lib/products/queries'

const initialState: ProductsActionState = { error: null }

/**
 * Create/edit Product (docs/milestones/06-product-catalog-and-pricing.md
 * Frontend Changes: "Product create/edit form... name, SKU, barcode,
 * category, images, unit, cost, base price, variants"). Variants and images
 * are managed on the product detail page once a product exists, not in
 * this create/edit form — this mirrors BusinessUnitFormDialog's own
 * precedent of keeping the create form to identity fields and moving
 * cross-referencing sub-resources to a dedicated management surface.
 *
 * Cost price is wrapped in `<Can permission="products.view_cost_price">` —
 * a UX nicety on top of lib/products/queries.ts's own server-side
 * redaction (this milestone's Security Requirements): a user without the
 * permission never even receives the value in `product` to begin with.
 */
export function ProductFormDialog({
  organizationId,
  businessUnitId,
  categories,
  product,
  open,
  onOpenChange,
}: {
  organizationId: string
  businessUnitId: string
  categories: Category[]
  product?: Product | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const action = product ? updateProductAction : createProductAction
  const [state, formAction, pending] = useActionState(action, initialState)

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      onOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit product' : 'New product'}</DialogTitle>
          <DialogDescription>
            {product
              ? 'Update this product’s details and pricing.'
              : `What you're selling — scoped to this business unit's catalog.`}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('businessUnitId', businessUnitId)
            if (product) formData.set('productId', product.id)
            formAction(formData)
          }}
          className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
        >
          {state.error && (
            <Alert variant="destructive" role="alert">
              <TriangleAlert />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="product-name">Name</Label>
            <Input id="product-name" name="name" defaultValue={product?.name} required autoFocus />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-sku">SKU</Label>
              <Input id="product-sku" name="sku" defaultValue={product?.sku} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-barcode">Barcode</Label>
              <Input id="product-barcode" name="barcode" defaultValue={product?.barcode ?? ''} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-category">Category</Label>
              <Select name="categoryId" defaultValue={product?.categoryId ?? undefined}>
                <SelectTrigger id="product-category" className="w-full">
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-unit">Unit of measurement</Label>
              <Input
                id="product-unit"
                name="unitOfMeasurement"
                defaultValue={product?.unitOfMeasurement ?? 'unit'}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Can permission="products.view_cost_price" scope={{ organizationId, businessUnitId }}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="product-cost-price">Cost price</Label>
                <Input
                  id="product-cost-price"
                  name="costPrice"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={product?.costPrice ?? 0}
                />
              </div>
            </Can>
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-base-price">Base price</Label>
              <Input
                id="product-base-price"
                name="basePrice"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={product?.basePrice ?? 0}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="product-description">Description</Label>
            <Textarea
              id="product-description"
              name="description"
              defaultValue={product?.description ?? ''}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : product ? 'Save changes' : 'Create product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
