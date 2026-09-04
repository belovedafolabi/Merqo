'use client'

import { useActionState, useCallback, useEffect, useState } from 'react'
import { Plus, TriangleAlert } from 'lucide-react'

import {
  archiveCouponAction,
  createCouponAction,
  updateCouponAction,
  type CouponsActionState,
} from '@/app/(app)/settings/coupons/actions'
import { useActionToast } from '@/hooks/use-action-toast'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/states/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TicketPercent } from 'lucide-react'
import type { Coupon } from '@/lib/coupons/schemas'

const initialState: CouponsActionState = { error: null }

function money(value: number): string {
  return value.toLocaleString('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
}

/** A stored expires_at instant is the exclusive next-midnight; show the last valid day. */
function lastValidDay(iso: string): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function couponStatus(c: Coupon): {
  label: string
  variant: 'secondary' | 'outline' | 'destructive'
} {
  if (c.archivedAt) return { label: 'Archived', variant: 'outline' }
  const now = Date.now()
  if (c.startsAt && now < new Date(c.startsAt).getTime())
    return { label: 'Scheduled', variant: 'secondary' }
  if (c.expiresAt && now >= new Date(c.expiresAt).getTime())
    return { label: 'Expired', variant: 'outline' }
  if (c.maxRedemptions !== null && c.redemptionCount >= c.maxRedemptions)
    return { label: 'Used up', variant: 'outline' }
  return { label: 'Active', variant: 'secondary' }
}

type DialogState = { mode: 'create' } | { mode: 'edit'; coupon: Coupon } | null

export function CouponsManager({
  organizationId,
  coupons,
}: {
  organizationId: string
  coupons: Coupon[]
}) {
  const [dialog, setDialog] = useState<DialogState>(null)

  const columns: DataTableColumn<Coupon>[] = [
    {
      header: 'Code',
      className: 'font-mono',
      cell: (c) => c.code,
    },
    {
      header: 'Discount',
      cell: (c) =>
        c.discountType === 'percentage' ? `${c.discountValue}%` : money(c.discountValue),
    },
    {
      header: 'Min spend',
      cell: (c) => (c.minimumPurchase > 0 ? money(c.minimumPurchase) : '—'),
    },
    {
      header: 'Redeemed',
      cell: (c) =>
        c.maxRedemptions !== null
          ? `${c.redemptionCount} / ${c.maxRedemptions}`
          : String(c.redemptionCount),
    },
    {
      header: 'Status',
      cell: (c) => {
        const s = couponStatus(c)
        return <Badge variant={s.variant}>{s.label}</Badge>
      },
    },
    {
      header: '',
      className: 'text-right',
      cell: (c) =>
        c.archivedAt ? null : (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog({ mode: 'edit', coupon: c })}
            >
              Edit
            </Button>
            <ArchiveButton organizationId={organizationId} couponId={c.id} />
          </div>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-muted-foreground">
          {coupons.length} coupon{coupons.length === 1 ? '' : 's'}
        </p>
        <Button onClick={() => setDialog({ mode: 'create' })}>
          <Plus /> New coupon
        </Button>
      </div>

      {coupons.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title="No coupons yet"
          description="Create a code customers can enter at checkout for a discount."
        />
      ) : (
        <DataTable columns={columns} rows={coupons} getRowKey={(c) => c.id} />
      )}

      {dialog && (
        <CouponDialog
          organizationId={organizationId}
          state={dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

function ArchiveButton({ organizationId, couponId }: { organizationId: string; couponId: string }) {
  const [state, formAction, pending] = useActionState(archiveCouponAction, initialState)
  useActionToast(state, pending, { loading: 'Archiving coupon…', success: 'Coupon archived' })
  return (
    <form action={formAction}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="couponId" value={couponId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        title={state.error ?? undefined}
      >
        {pending ? 'Archiving…' : 'Archive'}
      </Button>
    </form>
  )
}

function CouponDialog({
  organizationId,
  state: dialog,
  onClose,
}: {
  organizationId: string
  state: Exclude<DialogState, null>
  onClose: () => void
}) {
  const editing = dialog.mode === 'edit'
  const coupon = editing ? dialog.coupon : null

  const action = useCallback(
    (prev: CouponsActionState, formData: FormData) =>
      editing ? updateCouponAction(prev, formData) : createCouponAction(prev, formData),
    [editing],
  )
  const [state, formAction, pending] = useActionState(action, initialState)
  useActionToast(state, pending, {
    loading: editing ? 'Saving coupon…' : 'Creating coupon…',
    success: editing ? 'Coupon saved' : 'Coupon created',
  })
  const [discountType, setDiscountType] = useState<Coupon['discountType']>(
    coupon?.discountType ?? 'percentage',
  )

  useEffect(() => {
    if (state !== initialState && state.error === null) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit coupon' : 'New coupon'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Changes apply to redemptions from now on.'
              : 'The code is case-insensitive at checkout.'}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            if (coupon) formData.set('couponId', coupon.id)
            formData.set('discountType', discountType)
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
            <Label htmlFor="coupon-code">Code</Label>
            <Input
              id="coupon-code"
              name="code"
              defaultValue={coupon?.code ?? ''}
              placeholder="e.g. WELCOME10"
              autoCapitalize="characters"
              maxLength={40}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="coupon-type">Type</Label>
              <Select
                value={discountType}
                onValueChange={(v) => setDiscountType(v as Coupon['discountType'])}
              >
                <SelectTrigger id="coupon-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="coupon-value">
                {discountType === 'percentage' ? 'Percent off' : 'Amount off (₦)'}
              </Label>
              <Input
                id="coupon-value"
                name="discountValue"
                type="number"
                min={0}
                step={discountType === 'percentage' ? '1' : '0.01'}
                max={discountType === 'percentage' ? 100 : undefined}
                defaultValue={coupon?.discountValue ?? ''}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="coupon-min">Minimum spend (₦)</Label>
              <Input
                id="coupon-min"
                name="minimumPurchase"
                type="number"
                min={0}
                step="0.01"
                defaultValue={coupon?.minimumPurchase ?? 0}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="coupon-max">Max redemptions</Label>
              <Input
                id="coupon-max"
                name="maxRedemptions"
                type="number"
                min={1}
                step="1"
                defaultValue={coupon?.maxRedemptions ?? ''}
                placeholder="Unlimited"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="coupon-starts">Starts</Label>
              <Input
                id="coupon-starts"
                name="startsAt"
                type="date"
                defaultValue={coupon?.startsAt ? coupon.startsAt.slice(0, 10) : ''}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="coupon-expires">Expires</Label>
              <Input
                id="coupon-expires"
                name="expiresAt"
                type="date"
                defaultValue={coupon?.expiresAt ? lastValidDay(coupon.expiresAt) : ''}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : editing ? 'Save changes' : 'Create coupon'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
