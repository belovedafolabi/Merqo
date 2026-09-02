'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  removeBranchPriceOverrideAction,
  upsertBranchPriceOverrideAction,
  type ProductsActionState,
} from '@/app/(app)/products/actions'
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
import type { BranchPriceOverride } from '@/lib/products/queries'
import { InfoHint } from '@/components/ui/field-hint'
import { FORM_HINTS } from '@/lib/form-hints'

const initialState: ProductsActionState = { error: null }

/**
 * Branch-level price override (docs/Product_Catalog_and_Pricing_
 * Architecture.md §20.4, this milestone's Scope). Fixed to the product's
 * own branch, not a branch picker — because a product belongs to exactly
 * one Business Unit which belongs to exactly one Branch (Decision #3), only
 * that one (product, branch) pair is ever relevant; there's no other branch
 * to pick from for this product. lib/products/pricing.ts's
 * resolveEffectivePrice() is what actually reads this override.
 */
export function BranchPriceOverrideDialog({
  organizationId,
  businessUnitId,
  productId,
  branchId,
  branchName,
  basePrice,
  override,
  open,
  onOpenChange,
}: {
  organizationId: string
  businessUnitId: string
  productId: string
  branchId: string
  branchName: string
  basePrice: number
  override: BranchPriceOverride | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(upsertBranchPriceOverrideAction, initialState)
  const [removeState, removeAction, removePending] = useActionState(
    removeBranchPriceOverrideAction,
    initialState,
  )

  useEffect(() => {
    if (state !== initialState && state.error === null) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
  useEffect(() => {
    if (removeState !== initialState && removeState.error === null) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removeState])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Branch price override — {branchName}</DialogTitle>
          <DialogDescription>
            Base price is{' '}
            {basePrice.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })}. Set an
            override to charge a different price at this branch.
          </DialogDescription>
        </DialogHeader>

        {state.error && (
          <Alert variant="destructive" role="alert">
            <TriangleAlert />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {removeState.error && (
          <Alert variant="destructive" role="alert">
            <TriangleAlert />
            <AlertDescription>{removeState.error}</AlertDescription>
          </Alert>
        )}

        <form
          id="branch-price-override-form"
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('businessUnitId', businessUnitId)
            formData.set('productId', productId)
            formData.set('branchId', branchId)
            formAction(formData)
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="override-price">
              Override price
              <InfoHint text={FORM_HINTS.branchPriceOverride.price} />
            </Label>
            <Input
              id="override-price"
              name="price"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              defaultValue={override?.price ?? basePrice}
              required
              autoFocus
            />
          </div>
        </form>

        {/* A sibling form, not nested inside the one above — nested <form>
            elements are invalid HTML and browsers silently misparse them. */}
        {override && (
          <form
            id="branch-price-override-remove-form"
            action={(formData) => {
              formData.set('organizationId', organizationId)
              formData.set('businessUnitId', businessUnitId)
              formData.set('productId', productId)
              formData.set('branchId', branchId)
              removeAction(formData)
            }}
          />
        )}

        <DialogFooter className="sm:justify-between">
          {override && (
            <Button
              type="submit"
              form="branch-price-override-remove-form"
              variant="outline"
              disabled={removePending}
            >
              {removePending ? 'Removing…' : 'Remove override'}
            </Button>
          )}
          <Button type="submit" form="branch-price-override-form" disabled={pending}>
            {pending ? 'Saving…' : 'Save override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
