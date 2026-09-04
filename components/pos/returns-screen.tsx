'use client'

import { useEffect, useState, useTransition } from 'react'
import { PackageSearch, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import {
  findSaleAction,
  createReturnAction,
  requestRefundAction,
  decideRefundAction,
  listPendingRefundsAction,
} from '@/app/(pos)/pos/returns/actions'
import { notifyPending } from '@/lib/toast'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/states/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePosSession } from '@/lib/pos/session-context'
import { usePermission } from '@/lib/auth/permissions-context'
import type { Sale } from '@/lib/sales/queries'
import type { PendingRefund } from '@/lib/sales/queries'

function money(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'NGN' })
}

/**
 * Milestone 17 Part D. This screen drives its actions through `useTransition`
 * + `setError`, not `useActionState`, so it can't use `useActionToast`. This
 * is the equivalent: a pending toast for the duration, then a success or error
 * toast on settle. Actions here return `{ error }` rather than throwing.
 */
async function runWithToast<T extends { error?: string | null }>(
  messages: { loading: string; success: string },
  run: () => Promise<T>,
): Promise<T> {
  const dismiss = notifyPending(messages.loading)
  try {
    const result = await run()
    if (result.error) toast.error(result.error)
    else toast.success(messages.success)
    return result
  } finally {
    dismiss()
  }
}

/**
 * Returns/refund screen — find original sale, select items/qty/reason,
 * authorize, complete (this milestone's Frontend Changes). Both flows run
 * on the same engine as checkout: createReturnAction/requestRefundAction/
 * decideRefundAction wrap create_return()/request_refund()/decide_refund()
 * exactly as checkoutAction wraps create_sale() — no parallel "returns
 * engine", per this milestone's Implementation Notes.
 */
export function ReturnsScreen() {
  const { organizationId, branchId } = usePosSession()
  const canApprove = usePermission('refund.approve', { organizationId, branchId })

  const [saleIdInput, setSaleIdInput] = useState('')
  const [sale, setSale] = useState<Sale | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({})
  const [returnReason, setReturnReason] = useState('')
  const [lastReturnId, setLastReturnId] = useState<string | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card' | 'transfer' | 'store_credit'>(
    'cash',
  )
  const [refundReason, setRefundReason] = useState('')
  const [pendingRefunds, setPendingRefunds] = useState<PendingRefund[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (canApprove) listPendingRefundsAction(branchId).then(setPendingRefunds)
  }, [canApprove, branchId])

  function handleFindSale() {
    setError(null)
    setLastReturnId(null)
    startTransition(async () => {
      const found = await findSaleAction(saleIdInput.trim(), branchId)
      setSale(found)
      setNotFound(!found)
      setReturnQuantities({})
    })
  }

  function handleSubmitReturn() {
    if (!sale) return
    const items = Object.entries(returnQuantities)
      .filter(([, qty]) => qty > 0)
      // Per-line `reason` is optional (lib/sales/schemas.ts's
      // returnLineItemSchema) for a future per-item reason distinct from the
      // return's own `returnReason` below — this screen only captures the
      // one shared reason for now, so every line explicitly carries
      // `undefined` rather than omitting the key (the schema's
      // `.optional().transform()` output type requires the key present).
      .map(([saleItemId, quantity]) => ({ saleItemId, quantity, reason: undefined }))
    if (items.length === 0) {
      setError('Select at least one item to return.')
      return
    }
    if (!returnReason.trim()) {
      setError('A reason is required for a return.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await runWithToast(
        { loading: 'Processing return…', success: 'Return processed' },
        () => createReturnAction(organizationId, branchId, sale.id, returnReason, items),
      )
      if (result.error) {
        setError(result.error)
        return
      }
      setLastReturnId(result.returnId ?? null)
      const found = await findSaleAction(sale.id, branchId)
      setSale(found)
      setReturnQuantities({})
    })
  }

  function handleRequestRefund() {
    if (!sale) return
    const amount = Number(refundAmount)
    if (!amount || amount <= 0) {
      setError('Enter a valid refund amount.')
      return
    }
    if (!refundReason.trim()) {
      setError('A reason is required for a refund.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await runWithToast(
        { loading: 'Requesting refund…', success: 'Refund requested' },
        () =>
          requestRefundAction(
            organizationId,
            branchId,
            sale.id,
            lastReturnId,
            amount,
            refundMethod,
            refundReason,
          ),
      )
      if (result.error) {
        setError(result.error)
        return
      }
      setRefundAmount('')
      setRefundReason('')
    })
  }

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto scroll-smooth p-4">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <Label htmlFor="returns-sale-id">Original sale</Label>
        <div className="flex gap-2">
          <Input
            id="returns-sale-id"
            value={saleIdInput}
            onChange={(event) => setSaleIdInput(event.target.value)}
            placeholder="Receipt # or full sale ID"
          />
          <Button type="button" onClick={handleFindSale} disabled={pending || !saleIdInput.trim()}>
            Find sale
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">
          The “Receipt #” is printed at the top of every receipt.
        </p>
      </Card>

      {notFound && (
        <EmptyState
          icon={PackageSearch}
          title="Sale not found"
          description="Check the sale ID and try again."
        />
      )}

      {sale && (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <p className="text-body-sm font-medium">Receipt #{sale.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-body-sm text-muted-foreground tabular-nums">{money(sale.total)}</p>
          </div>

          <ul className="flex flex-col gap-2">
            {sale.items.map((item) => {
              const remaining = item.quantity - item.returnedQuantity
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 text-body-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{item.productName}</p>
                    <p className="text-caption text-muted-foreground">
                      {remaining} of {item.quantity} returnable
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={remaining}
                    step="0.001"
                    className="w-20"
                    disabled={remaining <= 0}
                    value={returnQuantities[item.id] ?? ''}
                    onChange={(event) =>
                      setReturnQuantities((prev) => ({
                        ...prev,
                        [item.id]: Math.min(Number(event.target.value) || 0, remaining),
                      }))
                    }
                  />
                </li>
              )
            })}
          </ul>

          <div className="flex flex-col gap-2">
            <Label htmlFor="returns-reason">Return reason</Label>
            <Textarea
              id="returns-reason"
              value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
              rows={2}
            />
          </div>

          <Button type="button" onClick={handleSubmitReturn} disabled={pending} className="gap-2">
            <RotateCcw className="size-4" /> Process return
          </Button>

          <div className="flex flex-col gap-3 border-t pt-4">
            <p className="text-body-sm font-medium">Request a refund</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="refund-amount">Amount</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={refundAmount}
                  onChange={(event) => setRefundAmount(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="refund-method">Method</Label>
                <Select
                  value={refundMethod}
                  onValueChange={(v) => setRefundMethod(v as typeof refundMethod)}
                >
                  <SelectTrigger id="refund-method" className="w-full">
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
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="refund-reason">Reason</Label>
              <Textarea
                id="refund-reason"
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                rows={2}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleRequestRefund}
              disabled={pending}
            >
              Request refund
            </Button>
          </div>
        </Card>
      )}

      {canApprove && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-body-sm font-medium">Pending refunds</p>
          {pendingRefunds.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">No refunds awaiting approval.</p>
          ) : (
            pendingRefunds.map((refund) => (
              <div
                key={refund.id}
                className="flex items-center justify-between gap-3 border-b pb-2 text-body-sm"
              >
                <div className="min-w-0">
                  <p className="tabular-nums">{money(refund.amount)}</p>
                  <p className="truncate text-caption text-muted-foreground">{refund.reason}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await runWithToast(
                          { loading: 'Approving refund…', success: 'Refund approved' },
                          () => decideRefundAction(organizationId, branchId, refund.id, true),
                        )
                        if (!result.error) {
                          setPendingRefunds((prev) => prev.filter((r) => r.id !== refund.id))
                        }
                      })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await runWithToast(
                          { loading: 'Rejecting refund…', success: 'Refund rejected' },
                          () => decideRefundAction(organizationId, branchId, refund.id, false),
                        )
                        if (!result.error) {
                          setPendingRefunds((prev) => prev.filter((r) => r.id !== refund.id))
                        }
                      })
                    }
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </Card>
      )}
    </div>
  )
}
