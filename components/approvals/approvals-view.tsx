'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'

import { decideRefundAction, type ApprovalsActionState } from '@/app/(app)/approvals/actions'
import { useActionToast } from '@/hooks/use-action-toast'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/states/empty-state'
import { formatDateTime } from '@/lib/utils'
import type { PendingRefund } from '@/lib/sales/queries'

const initialState: ApprovalsActionState = { error: null }

function money(value: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value)
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  transfer: 'Transfer',
  store_credit: 'Store credit',
}

/**
 * Milestone 17 Part E item 4. The pending-refund queue, lifted out of the POS
 * returns screen so a manager working in the Admin shell can act on it. Uses
 * the same `approveRefund()` mutation the POS screen does — the self-approval
 * rule and `refund.approve` gate live there.
 */
export function ApprovalsView({
  organizationId,
  branchId,
  pendingRefunds,
  pendingExpenseCount,
  canApproveExpenses,
}: {
  organizationId: string
  branchId: string
  pendingRefunds: PendingRefund[]
  pendingExpenseCount: number
  canApproveExpenses: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      {canApproveExpenses && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Expenses</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {pendingExpenseCount === 0
                ? 'No expenses awaiting a decision.'
                : `${pendingExpenseCount} expense${pendingExpenseCount === 1 ? '' : 's'} awaiting approval.`}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href="/expenses">Review expenses</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Pending refunds</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingRefunds.length === 0 ? (
            <EmptyState
              icon={TriangleAlert}
              title="Nothing to approve"
              description="Refund requests raised at the till appear here for a decision."
            />
          ) : (
            <ul className="flex flex-col divide-y">
              {pendingRefunds.map((refund) => (
                <RefundRow
                  key={refund.id}
                  refund={refund}
                  organizationId={organizationId}
                  branchId={branchId}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RefundRow({
  refund,
  organizationId,
  branchId,
}: {
  refund: PendingRefund
  organizationId: string
  branchId: string
}) {
  const [state, formAction, pending] = useActionState(decideRefundAction, initialState)
  useActionToast(state, pending, { loading: 'Recording decision…', success: 'Decision recorded' })

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium tabular-nums">{money(refund.amount)}</p>
          <p className="text-xs text-muted-foreground">
            {METHOD_LABELS[refund.method] ?? refund.method} · {formatDateTime(refund.createdAt)}
          </p>
          {refund.reason && <p className="mt-1 text-sm">{refund.reason}</p>}
        </div>
        <form action={formAction} className="flex shrink-0 gap-2">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="refundId" value={refund.id} />
          <Button type="submit" name="approved" value="true" size="sm" disabled={pending}>
            Approve
          </Button>
          <Button
            type="submit"
            name="approved"
            value="false"
            size="sm"
            variant="ghost"
            disabled={pending}
          >
            Reject
          </Button>
        </form>
      </div>
      {state.error && (
        <Alert variant="destructive" role="alert">
          <TriangleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </li>
  )
}
