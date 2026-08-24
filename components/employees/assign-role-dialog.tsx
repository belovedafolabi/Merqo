'use client'

import { useActionState, useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'

import { assignRoleAction, type RolesActionState } from '@/app/(app)/roles/actions'
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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Branch, BusinessUnit } from '@/lib/business-structure/queries'
import type { Employee } from '@/lib/employees/queries'
import type { RoleSummary } from '@/lib/roles/queries'

const initialState: RolesActionState = { error: null }

/**
 * Grants an EXISTING employee an additional role at a chosen scope — the
 * milestone's "role assignment screen/flow" bullet, distinct from inviting
 * (which assigns exactly one role, at invite time, to someone new). Reuses
 * assignRoleAction (app/(app)/roles/actions.ts), the same action the invite
 * acceptance path's underlying RPC mirrors, so both paths are gated by the
 * identical RLS escalation guard (user_grants_cover_role).
 */
export function AssignRoleDialog({
  organizationId,
  employee,
  roles,
  branches,
  businessUnits,
  open,
  onOpenChange,
}: {
  organizationId: string
  employee: Employee
  roles: RoleSummary[]
  branches: Branch[]
  businessUnits: BusinessUnit[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(assignRoleAction, initialState)

  useEffect(() => {
    if (state !== initialState && state.error === null) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign a role to {employee.fullName}</DialogTitle>
          <DialogDescription>
            Grants an additional role at the scope you choose — existing role assignments are
            untouched.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            formData.set('userId', employee.id)
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
            <Label htmlFor="assign-role">Role</Label>
            <Select name="roleId" required>
              <SelectTrigger id="assign-role" className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="assign-branch">Scope</Label>
            <Select name="branchId">
              <SelectTrigger id="assign-branch" className="w-full">
                <SelectValue placeholder="Organization-wide" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Leave unset for organization-wide access.
            </p>
          </div>

          {businessUnits.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="assign-business-unit">Business unit (optional)</Label>
              <Select name="businessUnitId">
                <SelectTrigger id="assign-business-unit" className="w-full">
                  <SelectValue placeholder="Every unit in the branch" />
                </SelectTrigger>
                <SelectContent>
                  {businessUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name} ({unit.branchName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Assigning…' : 'Assign role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
