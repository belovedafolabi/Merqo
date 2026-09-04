'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  decideExpenseAction,
  voidExpenseAction,
  type ExpenseActionState,
} from '@/app/(app)/expenses/actions'
import { useActionToast } from '@/hooks/use-action-toast'
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
import type { Expense } from '@/lib/expenses/summary'

const initialState: ExpenseActionState = { error: null }

export type ExpenseDecision = 'approve' | 'reject' | 'void'

const COPY: Record<
  ExpenseDecision,
  {
    title: string
    description: string
    submit: string
    destructive: boolean
    reasonRequired: boolean
  }
> = {
  approve: {
    title: 'Approve expense',
    description: 'Approving adds this to reported costs and reduces net profit for its date.',
    submit: 'Approve',
    destructive: false,
    reasonRequired: false,
  },
  reject: {
    title: 'Reject expense',
    description: 'Rejecting leaves the record in place but keeps it out of reported costs.',
    submit: 'Reject',
    destructive: false,
    // A rejection with no reason leaves whoever recorded it with nothing to
    // act on.
    reasonRequired: true,
  },
  void: {
    title: 'Void expense',
    description:
      'Voiding withdraws this expense from reported profit. The record and its amount are kept — expenses are never deleted, so past reports stay reproducible.',
    submit: 'Void expense',
    destructive: true,
    reasonRequired: true,
  },
}

/**
 * Approve, reject or void one expense.
 *
 * All three share a dialog because they are the same shape — a decision plus a
 * reason — and splitting them into three components would triplicate the
 * confirmation copy that is the actual content here. Void is styled
 * destructively and separated in the UI: it is the one action that moves
 * reported profit with no originating business event, which is why it carries
 * its own Owner-only permission.
 */
export function ExpenseDecisionDialog({
  organizationId,
  expense,
  decision,
  open,
  onOpenChange,
}: {
  organizationId: string
  expense: Expense
  decision: ExpenseDecision
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isVoid = decision === 'void'
  const [state, formAction, pending] = useActionState(
    isVoid ? voidExpenseAction : decideExpenseAction,
    initialState,
  )
  const copy = COPY[decision]
  useActionToast(state, pending, {
    loading:
      decision === 'approve'
        ? 'Approving expense…'
        : decision === 'reject'
          ? 'Rejecting expense…'
          : 'Voiding expense…',
    success:
      decision === 'approve'
        ? 'Expense approved'
        : decision === 'reject'
          ? 'Expense rejected'
          : 'Expense voided',
  })

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
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {expense.category} —{' '}
            {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
              expense.amount,
            )}
            . {copy.description}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('branchId', expense.branchId)
            formData.set('expenseId', expense.id)
            if (!isVoid) formData.set('approved', String(decision === 'approve'))
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
            <Label htmlFor="expense-reason">Reason{copy.reasonRequired ? '' : ' (optional)'}</Label>
            <Textarea
              id="expense-reason"
              name="reason"
              rows={2}
              required={copy.reasonRequired}
              maxLength={500}
              placeholder={decision === 'approve' ? 'Optional note' : 'Why?'}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={copy.destructive ? 'destructive' : 'default'}
              disabled={pending}
            >
              {pending ? 'Working…' : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
