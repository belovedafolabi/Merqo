'use client'

import { useActionState, useState } from 'react'
import { Check, Copy, TriangleAlert } from 'lucide-react'

import { inviteEmployeeAction, type EmployeeActionState } from '@/app/(app)/employees/actions'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Branch, BusinessUnit } from '@/lib/business-structure/queries'
import type { RoleSummary } from '@/lib/roles/queries'
import { InfoHint } from '@/components/ui/field-hint'
import { FORM_HINTS } from '@/lib/form-hints'

const initialState: EmployeeActionState = { error: null }

/**
 * Invites a new employee by email. On success, shows the invite link with a
 * copy button REGARDLESS of whether the email was actually delivered — the
 * plan's "always-available fallback, not an error path": without a verified
 * Resend sending domain, delivery is restricted to the account owner's own
 * address (lib/email/transports/resend.ts), so the link is how this feature
 * stays usable on day one.
 */
export function InviteEmployeeDialog({
  organizationId,
  roles,
  branches,
  businessUnits,
  open,
  onOpenChange,
}: {
  organizationId: string
  roles: RoleSummary[]
  branches: Branch[]
  businessUnits: BusinessUnit[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(inviteEmployeeAction, initialState)
  useActionToast(state, pending, { loading: 'Sending invitation…', success: 'Invitation created' })
  const [copied, setCopied] = useState(false)

  // Resets `copied` when the dialog closes, without an effect: this
  // component stays mounted across opens/closes (its parent renders it once,
  // toggling only `open`), so `copied` would otherwise carry a stale
  // checkmark into the next invite. Adjusting state during render on a prop
  // change is React's own documented alternative to an effect for exactly
  // this "reset when X changes" shape — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setCopied(false)
  }

  const assignableRoles = roles // every role in the catalog is offerable; RLS/the invite
  // policy is what actually decides whether the inviter may use it — showing
  // a role here and having the submit fail with a clear error beats hiding
  // roles an Owner (who can grant anything) would expect to see.

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite an employee</DialogTitle>
          <DialogDescription>
            They will receive an email with a link to set up their account.
          </DialogDescription>
        </DialogHeader>

        {state.inviteUrl ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <Check />
              <AlertDescription>
                Invitation created{state.emailWarning ? '' : ' and emailed'}.
              </AlertDescription>
            </Alert>

            {state.emailWarning && (
              <Alert variant="destructive" role="alert">
                <TriangleAlert />
                <AlertDescription>
                  The email could not be sent ({state.emailWarning}). Share this link directly
                  instead.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-url">Invite link</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-url"
                  readOnly
                  value={state.inviteUrl}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    void navigator.clipboard.writeText(state.inviteUrl ?? '')
                    setCopied(true)
                  }}
                  aria-label="Copy invite link"
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            action={(formData) => {
              formData.set('organizationId', organizationId)
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
              <Label htmlFor="invite-email">
                Email
                <InfoHint text={FORM_HINTS.employee.email} />
              </Label>
              <Input id="invite-email" name="email" type="email" required autoComplete="off" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-role">
                Role
                <InfoHint text={FORM_HINTS.employee.role} />
              </Label>
              <Select name="roleId" required>
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-branch">
                Scope
                <InfoHint text={FORM_HINTS.employee.branch} />
              </Label>
              <Select name="branchId">
                <SelectTrigger id="invite-branch" className="w-full">
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
                <Label htmlFor="invite-business-unit">
                  Business unit (optional)
                  <InfoHint text={FORM_HINTS.employee.branch} />
                </Label>
                <Select name="businessUnitId">
                  <SelectTrigger id="invite-business-unit" className="w-full">
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
                {pending ? 'Sending…' : 'Send invitation'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
