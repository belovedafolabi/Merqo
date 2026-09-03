'use client'

import { useActionState, useEffect, useState } from 'react'
import { Plus, Trash2, TriangleAlert } from 'lucide-react'

import {
  initiateStockTransferAction,
  listBranchProductOptionsAction,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Branch } from '@/lib/business-structure/queries'
import type { BranchProductOption } from '@/lib/inventory/queries'
import type { StockTransferItemInput } from '@/lib/inventory/schemas'
import { InfoHint } from '@/components/ui/field-hint'
import { FORM_HINTS } from '@/lib/form-hints'

const initialState: InventoryActionState = { error: null }

interface DraftItem {
  sourceProductId: string
  destinationProductId: string
  quantity: string
}

function emptyDraftItem(): DraftItem {
  return { sourceProductId: '', destinationProductId: '', quantity: '' }
}

/**
 * Branch-to-branch transfer (Decision #4, single-authorization/atomic
 * model — see this milestone's plan doc). Each line pairs a source-branch
 * product with a *different* destination-branch product record (this
 * milestone's key structural decision: a product row can never hold a
 * balance outside its own Business Unit's branch) — picking the
 * destination product auto-suggests the one with a matching SKU as a
 * convenience, not a DB-enforced pairing.
 */
export function StockTransferDialog({
  organizationId,
  sourceBranchId,
  sourceProductOptions,
  destinationBranches,
  open,
  onOpenChange,
}: {
  organizationId: string
  sourceBranchId: string
  sourceProductOptions: BranchProductOption[]
  destinationBranches: Branch[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(initiateStockTransferAction, initialState)
  const [destinationBranchId, setDestinationBranchId] = useState('')
  const [destinationOptions, setDestinationOptions] = useState<BranchProductOption[]>([])
  const [items, setItems] = useState<DraftItem[]>([emptyDraftItem()])

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      handleOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // Reset from the onOpenChange handler itself, not a useEffect watching
  // `open` — this is a controlled-form reset in response to a discrete
  // "the dialog is closing" event, not synchronizing with an external
  // system, so it belongs in the event handler (react-hooks/set-state-in-
  // effect: setState during an effect body risks cascading renders).
  function handleOpenChange(next: boolean) {
    if (!next) {
      setDestinationBranchId('')
      setDestinationOptions([])
      setItems([emptyDraftItem()])
    }
    onOpenChange(next)
  }

  async function handleDestinationBranchChange(value: string) {
    setDestinationBranchId(value)
    const options = await listBranchProductOptionsAction(value)
    setDestinationOptions(options)
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function handleSourceProductChange(index: number, sourceProductId: string) {
    const source = sourceProductOptions.find((option) => option.id === sourceProductId)
    const suggestedDestination = source
      ? destinationOptions.find((option) => option.sku === source.sku)
      : undefined
    updateItem(index, {
      sourceProductId,
      destinationProductId: suggestedDestination?.id ?? '',
    })
  }

  const validItems: StockTransferItemInput[] = items
    .filter(
      (item) => item.sourceProductId && item.destinationProductId && Number(item.quantity) > 0,
    )
    .map((item) => ({
      sourceProductId: item.sourceProductId,
      destinationProductId: item.destinationProductId,
      quantity: Number(item.quantity),
    }))

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transfer stock</DialogTitle>
          <DialogDescription>
            Move stock from this branch to another branch. Deducts the source and credits the
            destination atomically.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('sourceBranchId', sourceBranchId)
            formData.set('destinationBranchId', destinationBranchId)
            formData.set('items', JSON.stringify(validItems))
            formAction(formData)
          }}
          className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto scroll-smooth pr-1"
        >
          {state.error && (
            <Alert variant="destructive" role="alert">
              <TriangleAlert />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="transfer-destination-branch">
              Destination branch
              <InfoHint text={FORM_HINTS.inventory.toBranch} />
            </Label>
            {destinationBranches.length === 0 ? (
              // A single-branch organisation has nowhere to transfer to. Radix
              // Select with no items opens an empty, un-focusable popover — it
              // reads as "the dropdown is broken". Say so plainly instead.
              <>
                <Select disabled>
                  <SelectTrigger id="transfer-destination-branch" className="w-full">
                    <SelectValue placeholder="No other branch available" />
                  </SelectTrigger>
                </Select>
                <p className="text-caption text-muted-foreground">
                  Stock transfers need a second branch. Add one under Business structure first.
                </p>
              </>
            ) : (
              <Select value={destinationBranchId} onValueChange={handleDestinationBranchChange}>
                <SelectTrigger id="transfer-destination-branch" className="w-full">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  {destinationBranches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                <Select
                  value={item.sourceProductId}
                  onValueChange={(value) => handleSourceProductChange(index, value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Source product" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceProductOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name} · {option.sku}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={item.destinationProductId}
                  onValueChange={(value) => updateItem(index, { destinationProductId: value })}
                  disabled={!destinationBranchId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Destination product" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinationOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name} · {option.sku}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  placeholder="Qty"
                  className="w-24"
                  value={item.quantity}
                  onChange={(event) => updateItem(index, { quantity: event.target.value })}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={items.length === 1}
                  onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setItems((current) => [...current, emptyDraftItem()])}
            >
              <Plus /> Add product
            </Button>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={pending || !destinationBranchId || validItems.length === 0}
            >
              {pending ? 'Transferring…' : 'Transfer stock'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
