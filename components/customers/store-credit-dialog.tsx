'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  adjustStoreCreditAction,
  issueStoreCreditAction,
  type CustomerActionState,
} from '@/app/(app)/customers/actions'
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
import { Textarea } from '@/components/ui/textarea'
import { InfoHint } from '@/components/ui/field-hint'
import { FORM_HINTS } from '@/lib/form-hints'

const initialState: CustomerActionState = { error: null }

/**
 * Issue or adjust store credit (docs/milestones/09-customer-store-credit-
 * and-layaway.md Frontend Changes: "Store-credit issue/view screens").
 *
 * One component, two modes, two distinct Server Actions — `mode` decides
 * which, because the two check different permissions
 * (`store_credit.issue` vs `store_credit.adjust`, supabase/seed.sql section
 * 5e) and mean different things. An issue is always positive; an adjustment
 * is signed, since correcting a mistaken entry can go either way and never
 * happens by editing the original ledger row.
 */
export function StoreCreditDialog({
  organizationId,
  customerId,
  customerName,
  mode,
  open,
  onOpenChange,
}: {
  organizationId: string
  customerId: string
  customerName: string
  mode: 'issue' | 'adjust'
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(
    mode === 'issue' ? issueStoreCreditAction : adjustStoreCreditAction,
    initialState,
  )

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      onOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const isAdjust = mode === 'adjust'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isAdjust ? 'Adjust store credit' : 'Issue store credit'}</DialogTitle>
          <DialogDescription>
            {isAdjust
              ? `Post a correcting entry against ${customerName}'s balance. Earlier entries are never edited — this adds a new one.`
              : `Add store credit to ${customerName}'s balance. Every entry is permanently recorded against the customer.`}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('customerId', customerId)
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
            <Label htmlFor="credit-amount">
              Amount (₦) <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
              <InfoHint text={FORM_HINTS.storeCredit.amount} />
            </Label>
            <Input
              id="credit-amount"
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={isAdjust ? undefined : 0.01}
              placeholder={isAdjust ? 'e.g. 2500 or -2500' : 'e.g. 2500'}
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {isAdjust
                ? 'A negative amount reduces the balance. An adjustment can never take it below zero.'
                : 'Credit is spendable at any branch of this business.'}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="credit-reason">
              Reason <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
              <InfoHint text={FORM_HINTS.storeCredit.reason} />
            </Label>
            <Textarea
              id="credit-reason"
              name="reason"
              rows={3}
              placeholder={
                isAdjust
                  ? 'e.g. Correcting a credit issued twice on 12 Aug'
                  : 'e.g. Goodwill gesture for a delayed order'
              }
              required
            />
          </div>

          <DialogFooter>
            <Button type="submit" variant={isAdjust ? 'outline' : 'default'} disabled={pending}>
              {pending ? 'Saving…' : isAdjust ? 'Post adjustment' : 'Issue credit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
