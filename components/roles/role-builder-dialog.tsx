'use client'

import { useActionState, useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  createRoleAction,
  updateRolePermissionsAction,
  type RolesActionState,
} from '@/app/(app)/roles/actions'
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
import { Textarea } from '@/components/ui/textarea'
import { PermissionChecklist } from '@/components/roles/permission-checklist'
import type { PermissionGroup, RoleSummary } from '@/lib/roles/queries'

const initialState: RolesActionState = { error: null }

/**
 * Create a role, or edit an existing custom role's permission set.
 *
 * Editing replaces the whole selection (see lib/roles/schemas.ts's doc on
 * why updateRolePermissions is a full replacement, not a diff) — the
 * checklist's current state IS the submission, so there is nothing to
 * reconcile client-side.
 */
export function RoleBuilderDialog({
  organizationId,
  editingRole,
  permissionGroups,
  ownPermissionKeys,
  initialSelectedKeys,
  open,
  onOpenChange,
}: {
  organizationId: string
  editingRole: RoleSummary | null
  permissionGroups: PermissionGroup[]
  ownPermissionKeys: string[]
  initialSelectedKeys: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const action = editingRole ? updateRolePermissionsAction : createRoleAction
  const [state, formAction, pending] = useActionState(action, initialState)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(initialSelectedKeys))
  const ownKeys = new Set(ownPermissionKeys)

  // Resets the checklist selection to `initialSelectedKeys` whenever the
  // dialog opens (for a fresh "Create", that's empty; for "Edit", the
  // target role's current permissions) — without an effect. This component
  // stays mounted across opens/closes, so `selectedKeys` would otherwise
  // carry the previous role's ticks into the next one. Adjusting state
  // during render on a prop change is React's own documented alternative to
  // an effect for this "reset when X changes" shape — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSelectedKeys(new Set(initialSelectedKeys))
  }

  useEffect(() => {
    if (state !== initialState && state.error === null) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingRole ? `Edit ${editingRole.name}` : 'Create a role'}</DialogTitle>
          <DialogDescription>
            {editingRole
              ? "Replaces this role's entire permission set with your selection below."
              : 'Compose a role from the permissions you hold. Once created, it behaves exactly like a built-in role.'}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(formData) => {
            formData.set('organizationId', organizationId)
            if (editingRole) formData.set('roleId', editingRole.id)
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

          {!editingRole && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="role-name">Name</Label>
                <Input
                  id="role-name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={60}
                  placeholder="Stock Auditor"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="role-description">Description (optional)</Label>
                <Textarea id="role-description" name="description" maxLength={500} rows={2} />
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label>Permissions</Label>
            <PermissionChecklist
              groups={permissionGroups}
              selectedKeys={selectedKeys}
              ownKeys={ownKeys}
              onChange={setSelectedKeys}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : editingRole ? 'Save permissions' : 'Create role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
