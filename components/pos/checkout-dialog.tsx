'use client'

import { useActionState, useEffect, useState } from 'react'
import { Printer, TriangleAlert } from 'lucide-react'

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
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog'
import { CustomerPicker } from '@/components/customers/customer-picker'
import { getStoreCreditBalanceAction } from '@/app/(pos)/pos/actions'
import { canCoverAmount } from '@/lib/customers/ledger'
import type { Customer } from '@/lib/customers/queries'

const initialState: PosActionState = { error: null }

function currency(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

/**
 * Milestone 14's browser-based receipt printing. Opens the existing
 * /receipts/preview route — which already renders the receipt alone, already
 * auto-prints on `?print=1`, and already gates on `sales.view` — in a small
 * named popup.
 *
 * Not window.print() on this dialog: ReceiptView renders inside a portalled
 * DialogContent with the entire POS screen still in the DOM behind it, so
 * printing in place would need a `body > * { display: none }` cascade to
 * suppress the shell — the fragile pattern the dedicated print route exists
 * to avoid. The window NAME matters too: clicking Print twice focuses the one
 * popup instead of spawning a second.
 */
function printReceipt(saleId: string): void {
  const popup = window.open(
    `/receipts/preview?saleId=${encodeURIComponent(saleId)}&print=1`,
    'merqo-receipt',
    'popup=yes,width=420,height=760',
  )
  popup?.focus()
}

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
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [creditBalance, setCreditBalance] = useState<number | null>(null)

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

  // The attached customer's balance, fetched when one is attached rather
  // than on every keystroke of the picker. Advisory only: createSale()
  // re-reads and locks the real balance server-side, so this number can be
  // stale without being dangerous — it exists so the cashier finds out
  // before submitting, not to be the check itself.
  //
  // Clearing the stale balance happens in handleSelectCustomer() below, not
  // in this effect: setting state synchronously inside an effect body is a
  // cascading render (react-hooks/set-state-in-effect), and "the cashier
  // changed the customer" is an event, not a synchronization.
  useEffect(() => {
    if (!customer) return
    let cancelled = false
    getStoreCreditBalanceAction(customer.id).then((balance) => {
      if (!cancelled) setCreditBalance(balance)
    })
    return () => {
      cancelled = true
    }
  }, [customer])

  function handleSelectCustomer(next: Customer | null) {
    setCustomer(next)
    setCreditBalance(null)
  }

  const payingWithCredit = paymentMethod === 'store_credit'
  const creditShortfall =
    payingWithCredit && creditBalance !== null && !canCoverAmount(creditBalance, totals.total)
  const blockedByCredit = payingWithCredit && (!customer || creditShortfall)

  if (state.saleId) {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            clear()
            setDiscountInput('')
            setDiscountReasonInput('')
            handleSelectCustomer(null)
            setPaymentMethod('cash')
          }
          onOpenChange(next)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sale complete</DialogTitle>
            <DialogDescription>
              {state.total?.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })}{' '}
              received.
            </DialogDescription>
          </DialogHeader>
          <ReceiptView saleId={state.saleId} />
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" size="touch" onClick={() => printReceipt(state.saleId!)}>
              <Printer /> Print receipt
            </Button>
            <Button size="touch" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* max-h + scroll (Milestone 14): on a 375x812 phone with the
            keyboard up there is ~400px of usable height, and this form is a
            customer picker + discount pair + payment select + reference
            textarea + submit. Unbounded, it simply overflowed. */}
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
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
              if (customer) formData.set('customerId', customer.id)
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
              if (discount.percentage)
                formData.set('discountPercentage', String(discount.percentage))
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
                  {totals.subtotal.toLocaleString(undefined, {
                    style: 'currency',
                    currency: 'NGN',
                  })}
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
                  {totals.taxAmount.toLocaleString(undefined, {
                    style: 'currency',
                    currency: 'NGN',
                  })}
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

            <CustomerPicker
              organizationId={organizationId}
              selected={customer}
              onSelect={handleSelectCustomer}
              onQuickAdd={() => setQuickAddOpen(true)}
              label="Customer (optional)"
              helperText={
                creditBalance === null
                  ? 'Attach a customer to record this sale against them, or to pay with store credit.'
                  : `Store credit available: ${currency(creditBalance)}`
              }
            />

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
                    inputMode="decimal"
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
              <Select
                name="paymentMethod"
                value={paymentMethod}
                onValueChange={setPaymentMethod}
                required
              >
                <SelectTrigger id="checkout-payment-method" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="transfer">Bank transfer</SelectItem>
                  <SelectItem value="store_credit">Store credit</SelectItem>
                </SelectContent>
              </Select>

              {/*
              Store credit is all-or-nothing (Milestone 08 excludes split
              payments), so the two ways it can fail are worth saying before
              the cashier submits rather than after the server rejects it.
            */}
              {payingWithCredit && !customer && (
                <p className="text-body-sm text-destructive" role="alert">
                  Attach a customer above to pay with store credit.
                </p>
              )}
              {creditShortfall && creditBalance !== null && (
                <p className="text-body-sm text-destructive" role="alert">
                  {customer?.name} has {currency(creditBalance)} in credit — not enough to cover{' '}
                  {currency(totals.total)}. Store credit can&rsquo;t be combined with another
                  payment method.
                </p>
              )}
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

            {/* Sticky so "Complete sale" stays reachable at any scroll
                position — the acceptance criterion is "no obscured buttons,
                no unreachable controls". */}
            <DialogFooter className="sticky bottom-0 -mx-6 bg-background px-6 pt-3 pb-safe-b">
              <Button
                type="submit"
                size="lg"
                disabled={pending || lines.length === 0 || blockedByCredit}
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

      <CustomerFormDialog
        organizationId={organizationId}
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
      />
    </>
  )
}
