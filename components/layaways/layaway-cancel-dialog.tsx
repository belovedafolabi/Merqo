'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import { cancelLayawayAction, type LayawayActionState } from '@/app/(app)/layaways/actions'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Layaway } from '@/lib/customers/queries'

const initialState: LayawayActionState = { error: null }

function currency(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

/**
 * Cancel a layaway — a destructive action, so it confirms first
 * (`confirmation-dialogs`) and states plainly what happens to money already
 * paid. Installments are never deleted: they stay on the record, and
 * returning that money to the customer is a refund, not an erasure. Saying
 * so here is the difference between an operator who knows to process the
 * refund and one who assumes the system did it.
 */
export function LayawayCancelDialog({
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
  const [state, formAction, pending] = useActionState(cancelLayawayAction, initialState)

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
          <DialogTitle>Cancel layaway {layaway.reference}?</DialogTitle>
          <DialogDescription>
            The reserved stock is released back for sale.
            {layaway.amountPaid > 0
              ? ` The ${currency(layaway.amountPaid)} already paid stays on the record — refund it separately if the customer is owed it back.`
              : ''}
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="cancel-reason">
              Reason <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </Label>
            <Textarea
              id="cancel-reason"
              name="reason"
              rows={3}
              placeholder="e.g. Customer no longer wants the item"
              required
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Keep layaway
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Cancelling…' : 'Cancel layaway'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
