'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  updateBusinessUnitCapabilitiesAction,
  type BusinessStructureActionState,
} from '@/app/(app)/business-structure/actions'
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
import { CapabilityToggleList } from '@/components/business-structure/capability-toggle-list'
import type { BusinessUnit, CapabilityRow } from '@/lib/business-structure/queries'

const initialState: BusinessStructureActionState = { error: null }

export function CapabilitiesDialog({
  organizationId,
  businessUnit,
  capabilities,
  open,
  onOpenChange,
}: {
  organizationId: string
  businessUnit: BusinessUnit
  capabilities: CapabilityRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(
    updateBusinessUnitCapabilitiesAction,
    initialState,
  )

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      onOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Capabilities — {businessUnit.name}</DialogTitle>
          <DialogDescription>
            Overrides the defaults seeded from this business unit’s business type.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('businessUnitId', businessUnit.id)
            formData.set('branchId', businessUnit.branchId)
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

          <CapabilityToggleList capabilities={capabilities} />

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
