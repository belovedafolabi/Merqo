'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import type { BusinessStructureActionState } from '@/app/(app)/business-structure/actions'
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

const initialState: BusinessStructureActionState = { error: null }

/**
 * Shared "are you sure?" confirmation for archiving a Branch or Business
 * Unit — per this milestone's UX guideline (`confirmation-dialogs`: "confirm
 * before destructive actions"). Archiving is soft-delete (`archived_at`, not
 * a row deletion — docs/architecture/database-conventions.md), but it still
 * hides the row from active use, so the same confirm-first guardrail
 * applies. `action` is the bound Server Action (archiveBranchAction or
 * archiveBusinessUnitAction) with its hidden-field FormData already
 * prepared by the caller.
 */
export function ArchiveConfirmDialog({
  title,
  description,
  action,
  buildFormData,
  open,
  onOpenChange,
}: {
  title: string
  description: string
  action: (
    prevState: BusinessStructureActionState,
    formData: FormData,
  ) => Promise<BusinessStructureActionState>
  buildFormData: () => FormData
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(action, initialState)

  useEffect(() => {
    if (state !== initialState && state.error === null) {
      onOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {state.error && (
          <Alert variant="destructive" role="alert">
            <TriangleAlert />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <form action={() => formAction(buildFormData())}>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Archiving…' : 'Archive'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
