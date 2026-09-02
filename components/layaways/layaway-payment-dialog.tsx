'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import { recordLayawayPaymentAction, type LayawayActionState } from '@/app/(app)/layaways/actions'
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
import type { Layaway } from '@/lib/customers/queries'
import { InfoHint } from '@/components/ui/field-hint'
import { FORM_HINTS } from '@/lib/form-hints'

const initialState: LayawayActionState = { error: null }

function currency(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

/**
 * Record one installment (docs/milestones/09-customer-store-credit-and-
 * layaway.md Frontend Changes: "payment-recording screen").
 *
 * The amount defaults to the full outstanding balance — the most common
 * case at the counter is a customer clearing what's left — but stays
 * editable for a partial payment. Paying the balance to zero completes the
 * layaway, releases its stock reservation, and deducts the goods for real,
 * which is why the button says so rather than just "Record payment".
 */
export function LayawayPaymentDialog({
  organizationId,
  layaway,
  open,
  onOpenChange,
}: {
  organizationId: string
  layaway: Layaway
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(recordLayawayPaymentAction, initialState)

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      onOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {layaway.customerName} · {layaway.reference}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('branchId', layaway.branchId)
            formData.set('layawayId', layaway.id)
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
              <span>Original total</span>
              <span className="tabular-nums">{currency(layaway.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Paid so far</span>
              <span className="tabular-nums">{currency(layaway.amountPaid)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5 font-semibold">
              <span>Outstanding</span>
              <span className="tabular-nums">{currency(layaway.outstandingAmount)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="layaway-amount">
              Amount (₦) <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
              <InfoHint text={FORM_HINTS.layawayPayment.amount} />
            </Label>
            <Input
              id="layaway-amount"
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max={layaway.outstandingAmount}
              defaultValue={layaway.outstandingAmount}
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              A payment can never exceed the outstanding balance.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="layaway-method">
              Payment method
              <InfoHint text={FORM_HINTS.layawayPayment.method} />
            </Label>
            <Select name="method" defaultValue="cash" required>
              <SelectTrigger id="layaway-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="transfer">Bank transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="layaway-reference">
              Reference (optional)
              <InfoHint text={FORM_HINTS.layawayPayment.reference} />
            </Label>
            <Input
              id="layaway-reference"
              name="reference"
              placeholder="e.g. transfer reference or card auth code"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Recording…' : 'Record payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
