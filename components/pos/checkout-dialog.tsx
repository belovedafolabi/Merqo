'use client'

import { useActionState, useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'

import { checkoutAction, type PosActionState } from '@/app/(pos)/pos/actions'
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
import { useCart, useCartTotals } from '@/lib/pos/cart-context'
import { usePosSession } from '@/lib/pos/session-context'
import { usePermission } from '@/lib/auth/permissions-context'
import { ReceiptView } from '@/components/pos/receipt-view'

const initialState: PosActionState = { error: null }

/**
 * Checkout — payment method + discount entry + submit, per this milestone's
 * Frontend Changes ("POS cart/checkout screen", "Discount application UI
 * (permission-gated, shows only what the current user is authorized to
 * apply)"). Every amount shown here is a client-side preview
 * (lib/sales/calculations.ts, mirrored server-side) — lib/sales/
 * mutations.ts's createSale() re-derives the authoritative total from
 * scratch, per this milestone's Security Requirements.
 *
 * The idempotency key (this milestone's Technical Requirements: "a
 * client-supplied idempotency key... checked before creating a new one") is
 * generated once per checkout *attempt* when the dialog opens, and stays
 * fixed across a retried submission within that same open dialog — a
 * network blip retries the exact same key, never a fresh one.
 */
export function CheckoutDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { organizationId, branchId, businessUnitId } = usePosSession()
  const { lines, discount, discountReason, setDiscount, clear } = useCart()
  const totals = useCartTotals()
  const canApplyDiscount = usePermission('discount.apply', { organizationId, branchId })

  const [state, formAction, pending] = useActionState(checkoutAction, initialState)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [discountInput, setDiscountInput] = useState('')
  const [discountReasonInput, setDiscountReasonInput] = useState('')

  // A fresh idempotency key per checkout *attempt* (this milestone's own
  // module doc above), derived during render rather than in an effect — the
  // "adjust state when a prop changes" pattern
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
  // comparing against the previous `open` value in render, not a useEffect,
  // is what keeps this a single render instead of a set-state-in-effect
  // cascade.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setIdempotencyKey(crypto.randomUUID())
  }

  useEffect(() => {
    setDiscount(
      discountInput ? { percentage: Number(discountInput) } : {},
      discountReasonInput || undefined,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountInput, discountReasonInput])

  if (state.saleId) {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            clear()
            setDiscountInput('')
            setDiscountReasonInput('')
          }
          onOpenChange(next)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sale complete</DialogTitle>
            <DialogDescription>
              {state.total?.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })}{' '}
              received.
            </DialogDescription>
          </DialogHeader>
          <ReceiptView saleId={state.saleId} />
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Checkout</DialogTitle>
          <DialogDescription>Select a payment method to complete this sale.</DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('branchId', branchId)
            formData.set('businessUnitId', businessUnitId)
            formData.set('idempotencyKey', idempotencyKey)
            formData.set(
              'items',
              JSON.stringify(
                lines.map((line) => ({
                  productId: line.productId,
                  variantId: line.variantId,
                  quantity: line.quantity,
                })),
              ),
            )
            if (discount.percentage) formData.set('discountPercentage', String(discount.percentage))
            if (discountReason) formData.set('discountReason', discountReason)
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

          <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-3 text-body-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">
                {totals.subtotal.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span className="tabular-nums">
                −
                {totals.discountAmount.toLocaleString(undefined, {
                  style: 'currency',
                  currency: 'NGN',
                })}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span className="tabular-nums">
                {totals.taxAmount.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })}
              </span>
            </div>
            {totals.serviceChargeAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Service charge</span>
                <span className="tabular-nums">
                  {totals.serviceChargeAmount.toLocaleString(undefined, {
                    style: 'currency',
                    currency: 'NGN',
                  })}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1.5 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {totals.total.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })}
              </span>
            </div>
          </div>

          {canApplyDiscount && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="checkout-discount">Discount (%)</Label>
                <Input
                  id="checkout-discount"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={discountInput}
                  onChange={(event) => setDiscountInput(event.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="checkout-discount-reason">Discount reason</Label>
                <Input
                  id="checkout-discount-reason"
                  value={discountReasonInput}
                  onChange={(event) => setDiscountReasonInput(event.target.value)}
                  placeholder="e.g. Loyalty customer"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="checkout-payment-method">Payment method</Label>
            <Select name="paymentMethod" defaultValue="cash" required>
              <SelectTrigger id="checkout-payment-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="transfer">Bank transfer</SelectItem>
                <SelectItem value="store_credit">Store credit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="checkout-payment-reference">Payment reference (optional)</Label>
            <Textarea
              id="checkout-payment-reference"
              name="paymentReference"
              placeholder="e.g. transfer reference or card auth code"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              size="lg"
              disabled={pending || lines.length === 0}
              className="h-12 w-full"
            >
              {pending
                ? 'Processing…'
                : `Complete sale · ${totals.total.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
