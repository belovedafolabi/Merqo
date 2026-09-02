'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import { createExpenseAction, type ExpenseActionState } from '@/app/(app)/expenses/actions'
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

const initialState: ExpenseActionState = { error: null }

/**
 * Records a business expense
 * (docs/Financial_Architecture_Accounting_Reconciliation.md §26's field list).
 *
 * Category is a free-text input with a datalist of the categories already in
 * use rather than a fixed dropdown. Every business's expense categories differ,
 * and a hard-coded list drives operators into "Other" within a week; the
 * datalist keeps spelling consistent enough for the expense report to group
 * usefully without preventing a new category on the spot.
 *
 * The expense is created pending — approving your own expense is not a step
 * this form offers, because `expense.create` and `expense.approve` are
 * separate permissions precisely so the two acts can be separate people.
 */
export function ExpenseFormDialog({
  organizationId,
  branchId,
  businessUnitId,
  existingCategories,
  open,
  onOpenChange,
}: {
  organizationId: string
  branchId: string
  businessUnitId: string | null
  existingCategories: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(createExpenseAction, initialState)

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
          <DialogTitle>Record an expense</DialogTitle>
          <DialogDescription>
            Recorded as pending. It only affects reported profit once someone with approval rights
            approves it.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('branchId', branchId)
            if (businessUnitId) formData.set('businessUnitId', businessUnitId)
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="expense-category">
                Category
                <InfoHint text={FORM_HINTS.expense.category} />
              </Label>
              <Input
                id="expense-category"
                name="category"
                required
                maxLength={80}
                list="expense-categories"
                placeholder="Electricity"
              />
              <datalist id="expense-categories">
                {existingCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="expense-amount">
                Amount (₦)
                <InfoHint text={FORM_HINTS.expense.amount} />
              </Label>
              <Input
                id="expense-amount"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                inputMode="decimal"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="expense-date">
                Date
                <InfoHint text={FORM_HINTS.expense.incurredOn} />
              </Label>
              <Input
                id="expense-date"
                name="expenseDate"
                type="date"
                required
                // Defaults to today, which is what almost every expense is —
                // and it is still editable, because a receipt found in a
                // pocket next week belongs to the day it was spent.
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="expense-method">Paid by</Label>
              <select
                id="expense-method"
                name="paymentMethod"
                defaultValue="cash"
                className="h-9 rounded-md border bg-transparent px-3 text-body-sm"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-description">
              Description
              <InfoHint text={FORM_HINTS.expense.description} />
            </Label>
            <Textarea
              id="expense-description"
              name="description"
              maxLength={500}
              rows={2}
              placeholder="Optional — what this covered."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Recording…' : 'Record expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
