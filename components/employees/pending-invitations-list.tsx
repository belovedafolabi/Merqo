'use client'

import { useActionState } from 'react'
import { Mail } from 'lucide-react'

import { revokeInvitationAction, type EmployeeActionState } from '@/app/(app)/employees/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/states/empty-state'
import type { PendingInvitation } from '@/lib/employees/queries'

const initialState: EmployeeActionState = { error: null }

function RevokeButton({
  organizationId,
  invitationId,
}: {
  organizationId: string
  invitationId: string
}) {
  const [, formAction, pending] = useActionState(revokeInvitationAction, initialState)

  return (
    <form
      action={(formData) => {
        formData.set('organizationId', organizationId)
        formData.set('invitationId', invitationId)
        formAction(formData)
      }}
    >
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? 'Revoking…' : 'Revoke'}
      </Button>
    </form>
  )
}

/**
 * Invitations sent but not yet accepted. Resend is deliberately not offered
 * as a separate button here — re-inviting the same address from the "Invite
 * employee" dialog is the resend path (lib/employees/mutations.ts's
 * inviteEmployee() detects the existing pending row and updates it in
 * place), so this list only needs to show status and offer revocation.
 */
export function PendingInvitationsList({
  organizationId,
  invitations,
  canManage,
}: {
  organizationId: string
  invitations: PendingInvitation[]
  canManage: boolean
}) {
  const columns: DataTableColumn<PendingInvitation>[] = [
    {
      header: 'Email',
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{row.email}</span>
          {row.invitedByName && (
            <span className="truncate text-xs text-muted-foreground">
              Invited by {row.invitedByName}
            </span>
          )}
        </div>
      ),
    },
    { header: 'Role', cell: (row) => row.roleName },
    {
      header: 'Scope',
      cell: (row) => row.businessUnitName ?? row.branchName ?? 'Organization-wide',
    },
    {
      header: 'Status',
      cell: (row) =>
        row.isExpired ? (
          <Badge variant="destructive">Expired</Badge>
        ) : (
          <Badge variant="secondary">Pending</Badge>
        ),
    },
    {
      header: '',
      className: 'text-right',
      cell: (row) =>
        canManage ? <RevokeButton organizationId={organizationId} invitationId={row.id} /> : null,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={invitations}
      getRowKey={(row) => row.id}
      emptyState={
        <EmptyState
          icon={Mail}
          title="No pending invitations"
          description="Every invitation sent so far has been accepted or revoked."
        />
      }
    />
  )
}
