'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  updateBusinessUnitPosConfigAction,
  type BusinessStructureActionState,
} from '@/app/(app)/business-structure/actions'
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
import { PosConfigForm } from '@/components/business-structure/pos-config-form'
import type { BusinessUnit, PosConfig } from '@/lib/business-structure/queries'

const initialState: BusinessStructureActionState = { error: null }

export function PosConfigDialog({
  organizationId,
  businessUnit,
  posConfig,
  open,
  onOpenChange,
}: {
  organizationId: string
  businessUnit: BusinessUnit
  posConfig: PosConfig | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(
    updateBusinessUnitPosConfigAction,
    initialState,
  )
  useActionToast(state, pending, {
    loading: 'Saving configuration…',
    success: 'Configuration saved',
  })

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
          <DialogTitle>POS configuration — {businessUnit.name}</DialogTitle>
          <DialogDescription>
            Tax, service charge, discount policy, and default payment method.
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

          <PosConfigForm initialConfig={posConfig} />

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
