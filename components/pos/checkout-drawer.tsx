'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import {
  ChevronDown,
  CreditCard,
  Landmark,
  Printer,
  TicketPercent,
  TriangleAlert,
  Wallet,
  X,
  Banknote,
} from 'lucide-react'

import {
  checkoutAction,
  getStoreCreditBalanceAction,
  validateCouponAction,
  type PosActionState,
} from '@/app/(pos)/pos/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useCart, useCartTotals } from '@/lib/pos/cart-context'
import { usePosSession } from '@/lib/pos/session-context'
import { usePermission } from '@/lib/auth/permissions-context'
import { useTerminology } from '@/lib/terminology/terminology-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { usePendingToast } from '@/hooks/use-pending-toast'
import { ReceiptView } from '@/components/pos/receipt-view'
import { printReceiptInPlace } from '@/components/receipts/receipt-print-portal'
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog'
import { CustomerPicker } from '@/components/customers/customer-picker'
import { canCoverAmount } from '@/lib/customers/ledger'
import type { Customer } from '@/lib/customers/queries'
import { InfoHint } from '@/components/ui/field-hint'
import { FORM_HINTS } from '@/lib/form-hints'

const initialState: PosActionState = { error: null }

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'transfer', label: 'Transfer', icon: Landmark },
  { value: 'store_credit', label: 'Store credit', icon: Wallet },
] as const

function currency(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

/**
 * Checkout in a drawer — bottom sheet on mobile, side drawer on desktop —
 * replacing the old modal dialog. The common path (Cash, walk-in customer)
 * is one tap: payment method is a button row (not a Select), and everything
 * optional — customer, discount, payment note — is folded behind a single
 * "Add customer, discount or note" disclosure that only auto-opens when it
 * has to (store-credit needs a customer).
 *
 * All the server-facing logic is unchanged from checkout-dialog.tsx: same
 * `<form action>` payload, the once-per-open idempotency key, the discount
 * sync effect that keeps the cart panel's live totals in step, the advisory
 * store-credit balance fetch, and the `state.saleId` success screen with
 * ReceiptView + Print. Amounts shown are a client preview; createSale()
 * re-derives the authoritative total server-side.
 */
export function CheckoutDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { organizationId, branchId, businessUnitId } = usePosSession()
  const { lines, discount, discountReason, coupon, checkoutKey, setDiscount, setCoupon, clear } =
    useCart()
  const totals = useCartTotals()
  const canApplyDiscount = usePermission('discount.apply', { organizationId, branchId })
  const isMobile = useIsMobile()
  const t = useTerminology()

  const [state, formAction, pending] = useActionState(checkoutAction, initialState)
  const [discountInput, setDiscountInput] = useState('')
  const [discountReasonInput, setDiscountReasonInput] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [couponInput, setCouponInput] = useState('')
  const [couponError, setCouponError] = useState<string | null>(null)
  const [couponPending, startCouponCheck] = useTransition()

  usePendingToast(pending, 'Completing sale…')

  // The idempotency key now lives on the cart (useCart().checkoutKey): one
  // key per basket, stable across retries, rotated only when the cart is
  // cleared after a completed sale or reloaded from a held sale. A retry
  // after a sale that committed-but-reported-an-error is therefore
  // deduplicated by create_sale()'s `on conflict (idempotency_key)` instead
  // of writing a second sale.

  useEffect(() => {
    setDiscount(
      discountInput ? { percentage: Number(discountInput) } : {},
      discountReasonInput || undefined,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountInput, discountReasonInput])

  // Advisory balance for the attached customer — createSale() re-reads and
  // locks the real balance server-side, so a stale value here is safe. The
  // stale value is cleared in handleSelectCustomer (an event), not here.
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

  const payingWithCredit = paymentMethod === 'store_credit'

  // Picking store credit needs a customer attached — open the details
  // section in the same click so the picker is visible, rather than
  // syncing it in an effect (an event, not a synchronization).
  function selectPaymentMethod(value: string) {
    setPaymentMethod(value)
    if (value === 'store_credit') setDetailsOpen(true)
  }

  function handleSelectCustomer(next: Customer | null) {
    setCustomer(next)
    setCreditBalance(null)
  }

  function resetAfterSale() {
    clear()
    setDiscountInput('')
    setDiscountReasonInput('')
    setCouponInput('')
    setCouponError(null)
    handleSelectCustomer(null)
    setPaymentMethod('cash')
    setDetailsOpen(false)
  }

  function applyCoupon() {
    const code = couponInput.trim()
    if (!code) return
    setCouponError(null)
    startCouponCheck(async () => {
      const result = await validateCouponAction(organizationId, code, totals.subtotal)
      if (result.ok && result.code) {
        setCoupon({ code: result.code, discountAmount: result.discountAmount ?? 0 })
        setCouponInput('')
      } else {
        setCoupon(null)
        setCouponError(result.reason ?? 'That code could not be applied.')
      }
    })
  }

  function removeCoupon() {
    setCoupon(null)
    setCouponError(null)
  }

  // "Done" / "Print receipt" flip the parent's controlled `open` prop directly,
  // and vaul/Radix do NOT fire a Drawer's `onOpenChange` for a parent-driven
  // close (only for Esc / overlay / swipe) — so the cart-clear that hung off
  // that callback never ran and the basket survived into the next sale.
  // Clearing here, on the actual button, is what empties the till.
  function finish() {
    resetAfterSale()
    onOpenChange(false)
  }

  const creditShortfall =
    payingWithCredit && creditBalance !== null && !canCoverAmount(creditBalance, totals.total)
  const blockedByCredit = payingWithCredit && (!customer || creditShortfall)

  const direction = isMobile ? 'bottom' : 'right'

  if (state.saleId) {
    return (
      <Drawer
        open={open}
        direction={direction}
        onOpenChange={(next) => {
          // Esc / overlay / swipe dismissal of the success sheet: clear too, so
          // every way out of this screen lands the cashier at an empty till.
          if (!next) finish()
          else onOpenChange(next)
        }}
      >
        <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-md">
          <DrawerHeader>
            <DrawerTitle>{t('sale')} complete</DrawerTitle>
            <DrawerDescription>{currency(state.total ?? 0)} received.</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto scroll-smooth px-4">
            <ReceiptView saleId={state.saleId} />
          </div>
          <DrawerFooter className="flex-col gap-2 pb-safe-b sm:flex-row">
            <Button
              variant="outline"
              size="touch"
              disabled={printing}
              onClick={() => {
                setPrinting(true)
                // Finishing the print clears the cart and dismisses the receipt
                // in one step — the cashier is back at an empty till ready for
                // the next customer without touching Done.
                printReceiptInPlace(() => {
                  setPrinting(false)
                  finish()
                })
              }}
            >
              <Printer /> {printing ? 'Printing…' : `Print ${t('receipt', { lower: true })}`}
            </Button>
            <Button size="touch" disabled={printing} onClick={finish}>
              Done
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <>
      <Drawer open={open} direction={direction} onOpenChange={onOpenChange}>
        <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-md">
          <DrawerHeader>
            <DrawerTitle>Checkout</DrawerTitle>
            <DrawerDescription>
              {lines.reduce((sum, line) => sum + line.quantity, 0)} item
              {lines.reduce((sum, line) => sum + line.quantity, 0) === 1 ? '' : 's'} ·{' '}
              {currency(totals.total)}
            </DrawerDescription>
          </DrawerHeader>

          <form
            action={(formData) => {
              formData.set('organizationId', organizationId)
              formData.set('branchId', branchId)
              formData.set('businessUnitId', businessUnitId)
              formData.set('idempotencyKey', checkoutKey)
              formData.set('paymentMethod', paymentMethod)
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
              if (coupon) formData.set('couponCode', coupon.code)
              formAction(formData)
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto scroll-smooth px-4 pb-2">
              {state.error && (
                <Alert variant="destructive" role="alert">
                  <TriangleAlert />
                  <AlertDescription>
                    {state.stockShortfalls && state.stockShortfalls.length > 0 ? (
                      <>
                        <span>Not enough stock for:</span>
                        <ul className="mt-1 list-disc pl-4">
                          {state.stockShortfalls.map((s) => (
                            <li key={s.name}>
                              {s.name} — {s.available} left, {s.requested} needed
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      state.error
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-3 text-body-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{currency(totals.subtotal)}</span>
                </div>
                {coupon && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Coupon ({coupon.code})</span>
                    <span className="tabular-nums">
                      −{currency(Math.min(coupon.discountAmount, totals.discountAmount))}
                    </span>
                  </div>
                )}
                {totals.discountAmount - (coupon?.discountAmount ?? 0) > 0.004 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discount</span>
                    <span className="tabular-nums">
                      −
                      {currency(
                        totals.discountAmount -
                          Math.min(coupon?.discountAmount ?? 0, totals.discountAmount),
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span className="tabular-nums">{currency(totals.taxAmount)}</span>
                </div>
                {totals.serviceChargeAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Service charge</span>
                    <span className="tabular-nums">{currency(totals.serviceChargeAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{currency(totals.total)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>
                  Payment method
                  <InfoHint text={FORM_HINTS.checkout.paymentMethod} />
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => {
                    const active = paymentMethod === value
                    return (
                      <Button
                        key={value}
                        type="button"
                        variant={active ? 'default' : 'outline'}
                        size="touch"
                        className="justify-start gap-2"
                        aria-pressed={active}
                        onClick={() => selectPaymentMethod(value)}
                      >
                        <Icon className="size-4" /> {label}
                      </Button>
                    )
                  })}
                </div>

                {payingWithCredit && !customer && (
                  <p className="text-body-sm text-destructive" role="alert">
                    Attach a customer below to pay with store credit.
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

              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 w-full justify-between px-3 text-body-sm"
                  >
                    Add {t('customer', { lower: true })}, coupon, discount or note
                    <ChevronDown
                      className={cn('size-4 transition-transform', detailsOpen && 'rotate-180')}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-4 pt-3">
                  <CustomerPicker
                    organizationId={organizationId}
                    selected={customer}
                    onSelect={handleSelectCustomer}
                    onQuickAdd={() => setQuickAddOpen(true)}
                    label={`${t('customer')} (optional)`}
                    helperText={
                      creditBalance === null
                        ? `Attach a ${t('customer', { lower: true })} to record this ${t('sale', { lower: true })} against them, or to pay with store credit.`
                        : `Store credit available: ${currency(creditBalance)}`
                    }
                  />

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="checkout-coupon">
                      Coupon code
                      <InfoHint text={FORM_HINTS.checkout.coupon} />
                    </Label>
                    {coupon ? (
                      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-body-sm">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <TicketPercent className="size-4 text-muted-foreground" />
                          {coupon.code}
                          <span className="text-muted-foreground">
                            −{currency(coupon.discountAmount)}
                          </span>
                        </span>
                        <Button type="button" variant="ghost" size="sm" onClick={removeCoupon}>
                          <X className="size-4" /> Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          id="checkout-coupon"
                          value={couponInput}
                          onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              applyCoupon()
                            }
                          }}
                          placeholder="e.g. WELCOME10"
                          autoCapitalize="characters"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={applyCoupon}
                          disabled={couponPending || !couponInput.trim()}
                        >
                          {couponPending ? 'Checking…' : 'Apply'}
                        </Button>
                      </div>
                    )}
                    {couponError && (
                      <p className="text-body-sm text-destructive" role="alert">
                        {couponError}
                      </p>
                    )}
                  </div>

                  {canApplyDiscount && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="checkout-discount">
                          Discount (%)
                          <InfoHint text={FORM_HINTS.checkout.discountPercentage} />
                        </Label>
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
                        <Label htmlFor="checkout-discount-reason">
                          Discount reason
                          <InfoHint text={FORM_HINTS.checkout.discountReason} />
                        </Label>
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
                    <Label htmlFor="checkout-payment-reference">
                      Payment reference (optional)
                      <InfoHint text={FORM_HINTS.checkout.paymentReference} />
                    </Label>
                    <Textarea
                      id="checkout-payment-reference"
                      name="paymentReference"
                      placeholder="e.g. transfer reference or card auth code"
                      rows={2}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <DrawerFooter className="border-t pb-safe-b">
              <Button
                type="submit"
                size="lg"
                disabled={pending || lines.length === 0 || blockedByCredit}
                className={cn('h-12 w-full', !pending && lines.length > 0 && 'glow-brand')}
              >
                {pending ? 'Processing…' : `Complete sale · ${currency(totals.total)}`}
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>

      <CustomerFormDialog
        organizationId={organizationId}
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
      />
    </>
  )
}
