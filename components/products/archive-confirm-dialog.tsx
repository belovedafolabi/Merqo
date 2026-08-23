'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import type { ProductsActionState } from '@/app/(app)/products/actions'
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

const initialState: ProductsActionState = { error: null }

/**
 * Shared "are you sure?" confirmation for archiving a Product/Variant/
 * Category — same pattern as
 * components/business-structure/archive-confirm-dialog.tsx, retyped to
 * this milestone's own ProductsActionState (that component is typed to
 * BusinessStructureActionState, not generic, so this is a copy-and-retype,
 * not a reuse — matching how every dialog set in this codebase is scoped to
 * its own milestone's action-state type).
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
  action: (prevState: ProductsActionState, formData: FormData) => Promise<ProductsActionState>
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
