'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import {
  createProductAction,
  updateProductAction,
  type ProductsActionState,
} from '@/app/(app)/products/actions'
import { useActionToast } from '@/hooks/use-action-toast'
import { Can } from '@/components/auth/can'
import { Switch } from '@/components/ui/switch'
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
import { InfoHint } from '@/components/ui/field-hint'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FORM_HINTS } from '@/lib/form-hints'
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
  unitNames,
  servicesEnabled = false,
  product,
  open,
  onOpenChange,
}: {
  organizationId: string
  businessUnitId: string
  categories: Category[]
  /** Active unit-of-measure names (system + this org's custom) for the Select. */
  unitNames: string[]
  /** Milestone 17 Part B — offer a "this is a service" toggle (track_inventory = false). */
  servicesEnabled?: boolean
  product?: Product | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const currentUnit = product?.unitOfMeasurement ?? 'Unit'
  // Keep an existing product's unit selectable even if it was later archived
  // or renamed (unit_of_measurement is free text, not an FK).
  const unitOptions = unitNames.includes(currentUnit) ? unitNames : [currentUnit, ...unitNames]
  const action = product ? updateProductAction : createProductAction
  const [state, formAction, pending] = useActionState(action, initialState)
  useActionToast(state, pending, {
    loading: product ? 'Saving product…' : 'Creating product…',
    success: product ? 'Product saved' : 'Product created',
  })

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      // A product created without its opening stock still closes the form —
      // the product exists — but says so rather than silently succeeding.
      if (state.notice) toast.warning(state.notice)
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
            <Label htmlFor="product-name">
              Name
              <InfoHint text={FORM_HINTS.product.name} />
            </Label>
            <Input id="product-name" name="name" defaultValue={product?.name} required autoFocus />
          </div>

          {/* Milestone 17 Part B: only for a NEW product on a unit with the
              `services` capability. A service is not stock-tracked — POS sells
              it with no balance, and create_sale() skips the deduction. */}
          {servicesEnabled && !product && (
            <label className="flex items-center justify-between gap-4 rounded-lg border bg-muted/40 p-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-body-sm font-medium">This is a service</span>
                <span className="text-caption text-muted-foreground">
                  Not stocked — no opening stock, no low-stock alerts, sells with no balance.
                </span>
              </span>
              <Switch name="isService" value="on" />
            </label>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-sku">
                SKU
                <InfoHint text={FORM_HINTS.product.sku} />
              </Label>
              <Input
                id="product-sku"
                name="sku"
                defaultValue={product?.sku}
                placeholder="Auto-generated if left blank"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-barcode">
                Barcode
                <InfoHint text={FORM_HINTS.product.barcode} />
              </Label>
              <Input id="product-barcode" name="barcode" defaultValue={product?.barcode ?? ''} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-category">
                Category
                <InfoHint text={FORM_HINTS.product.category} />
              </Label>
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
              <Label htmlFor="product-unit">
                Unit of measurement
                <InfoHint text={FORM_HINTS.product.unitOfMeasurement} />
              </Label>
              <Select name="unitOfMeasurement" defaultValue={currentUnit}>
                <SelectTrigger id="product-unit" className="w-full">
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Can permission="products.view_cost_price" scope={{ organizationId, businessUnitId }}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="product-cost-price">
                  Cost price
                  <InfoHint text={FORM_HINTS.product.costPrice} />
                </Label>
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
              <Label htmlFor="product-base-price">
                Base price
                <InfoHint text={FORM_HINTS.product.basePrice} />
              </Label>
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

          {!product && (
            <Can permission="inventory.adjust" scope={{ organizationId }}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="product-opening-stock">
                  Opening stock
                  <InfoHint text={FORM_HINTS.product.openingStock} />
                </Label>
                <Input
                  id="product-opening-stock"
                  name="openingStock"
                  type="number"
                  min={0}
                  step="1"
                  inputMode="numeric"
                  defaultValue={0}
                  placeholder="0"
                />
              </div>
            </Can>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="product-description">
              Description
              <InfoHint text={FORM_HINTS.product.description} />
            </Label>
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
