'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  updateLowStockThresholdAction,
  type InventoryActionState,
} from '@/app/(app)/inventory/actions'
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
import type { InventoryBalance } from '@/lib/inventory/queries'

const initialState: InventoryActionState = { error: null }

/**
 * Sets the low-stock threshold for one balance row (this milestone's FR:
 * "A low-stock condition is queryable (below configured threshold)"). A
 * blank value clears the threshold — "not configured", never treated as
 * "always low" (lib/inventory/queries.ts's listLowStockBalances()).
 */
export function LowStockThresholdDialog({
  organizationId,
  branchId,
  balance,
  open,
  onOpenChange,
}: {
  organizationId: string
  branchId: string
  balance: InventoryBalance
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(updateLowStockThresholdAction, initialState)

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      onOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Low-stock threshold</DialogTitle>
          <DialogDescription>
            {balance.productName} ({balance.sku}) — currently {balance.quantity} on hand.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('branchId', branchId)
            formData.set('balanceId', balance.id)
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
            <Label htmlFor="threshold-value">Threshold</Label>
            <Input
              id="threshold-value"
              name="threshold"
              type="number"
              min={0}
              step="0.001"
              defaultValue={balance.lowStockThreshold ?? ''}
              placeholder="Leave blank to clear"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
