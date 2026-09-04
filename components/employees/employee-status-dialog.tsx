'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import { setEmployeeActiveAction, type EmployeeActionState } from '@/app/(app)/employees/actions'
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
import type { Employee } from '@/lib/employees/queries'

const initialState: EmployeeActionState = { error: null }

/**
 * Deactivate/reactivate confirmation. Deactivating is the single most
 * consequential click in this milestone — it invalidates an already-live
 * session (20260824090100/090200) — so it gets an explicit confirmation
 * rather than a one-click row action, unlike most toggles in this app.
 */
export function EmployeeStatusDialog({
  organizationId,
  employee,
  open,
  onOpenChange,
}: {
  organizationId: string
  employee: Employee
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(setEmployeeActiveAction, initialState)
  const isDeactivating = employee.deactivatedAt === null
  useActionToast(state, pending, {
    loading: isDeactivating ? 'Deactivating…' : 'Reactivating…',
    success: isDeactivating ? 'Employee deactivated' : 'Employee reactivated',
  })

  useEffect(() => {
    if (state !== initialState && state.error === null) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isDeactivating ? 'Deactivate' : 'Reactivate'} {employee.fullName}?
          </DialogTitle>
          <DialogDescription>
            {isDeactivating
              ? 'This immediately revokes their access, including any session they currently have open.'
              : 'This restores their access at every role and scope they were previously assigned.'}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('userId', employee.id)
            formData.set('active', String(!isDeactivating))
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={isDeactivating ? 'destructive' : 'default'}
              disabled={pending}
            >
              {pending ? 'Working…' : isDeactivating ? 'Deactivate' : 'Reactivate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
