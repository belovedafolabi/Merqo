'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  createBranchAction,
  updateBranchAction,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Branch } from '@/lib/business-structure/queries'

const initialState: BusinessStructureActionState = { error: null }

/** Create/edit Branch — one dialog, `branch` prop present means edit mode. */
export function BranchFormDialog({
  organizationId,
  branch,
  open,
  onOpenChange,
}: {
  organizationId: string
  branch?: Branch | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const action = branch ? updateBranchAction : createBranchAction
  const [state, formAction, pending] = useActionState(action, initialState)

  // useActionState returns a fresh state object every time the action runs,
  // even when its value is {error: null} again — so `state !== initialState`
  // reliably means "the action just completed", distinct from the initial
  // render (where state IS the initialState reference).
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
          <DialogTitle>{branch ? 'Edit branch' : 'New branch'}</DialogTitle>
          <DialogDescription>
            {branch
              ? 'Update this branch’s name.'
              : 'A physical location — store, outlet, or warehouse.'}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            if (branch) formData.set('branchId', branch.id)
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
            <Label htmlFor="branch-name">Name</Label>
            <Input id="branch-name" name="name" defaultValue={branch?.name} required autoFocus />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : branch ? 'Save changes' : 'Create branch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
