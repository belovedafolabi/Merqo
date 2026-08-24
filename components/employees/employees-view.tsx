'use client'

import { useState } from 'react'
import { Plus, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/states/empty-state'
import { AssignRoleDialog } from '@/components/employees/assign-role-dialog'
import { EmployeeStatusDialog } from '@/components/employees/employee-status-dialog'
import { InviteEmployeeDialog } from '@/components/employees/invite-employee-dialog'
import { PendingInvitationsList } from '@/components/employees/pending-invitations-list'
import type { Branch, BusinessUnit } from '@/lib/business-structure/queries'
import type { Employee, PendingInvitation } from '@/lib/employees/queries'
import type { RoleSummary } from '@/lib/roles/queries'

/**
 * The employee directory screen: active employees and pending invitations as
 * two tabs, same "to-do list vs record" split ExpensesView uses for
 * pending/all — an admin opening this screen to chase down an unaccepted
 * invite should not have to find it among every employee ever hired.
 */
export function EmployeesView({
  organizationId,
  currentUserId,
  employees,
  invitations,
  roles,
  branches,
  businessUnits,
  canInvite,
  canDeactivate,
  canAssignRoles,
}: {
  organizationId: string
  currentUserId: string
  employees: Employee[]
  invitations: PendingInvitation[]
  roles: RoleSummary[]
  branches: Branch[]
  businessUnits: BusinessUnit[]
  canInvite: boolean
  canDeactivate: boolean
  canAssignRoles: boolean
}) {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<Employee | null>(null)
  const [assignTarget, setAssignTarget] = useState<Employee | null>(null)

  const columns: DataTableColumn<Employee>[] = [
    {
      header: 'Name',
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{row.fullName}</span>
          <span className="truncate text-xs text-muted-foreground">{row.email}</span>
        </div>
      ),
    },
    {
      header: 'Role(s) & scope',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.assignments.map((assignment) => (
            <Badge key={assignment.userRoleId} variant="secondary" className="font-normal">
              {assignment.roleName}
              {assignment.businessUnitName
                ? ` · ${assignment.businessUnitName}`
                : assignment.branchName
                  ? ` · ${assignment.branchName}`
                  : ' · Org-wide'}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (row) =>
        row.deactivatedAt ? (
          <Badge variant="destructive">Deactivated</Badge>
        ) : (
          <Badge variant="default">Active</Badge>
        ),
    },
    {
      header: '',
      className: 'text-right',
      cell: (row) => (
        <div className="flex justify-end gap-2">
          {canAssignRoles && (
            <Button variant="outline" size="sm" onClick={() => setAssignTarget(row)}>
              Assign role
            </Button>
          )}
          {canDeactivate && row.id !== currentUserId && (
            <Button variant="outline" size="sm" onClick={() => setStatusTarget(row)}>
              {row.deactivatedAt ? 'Reactivate' : 'Deactivate'}
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <Tabs defaultValue="active" className="flex-1">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="active">Employees ({employees.length})</TabsTrigger>
            <TabsTrigger value="pending">Pending invitations ({invitations.length})</TabsTrigger>
          </TabsList>
          {canInvite && (
            <Button onClick={() => setInviteOpen(true)}>
              <Plus /> Invite employee
            </Button>
          )}
        </div>

        <TabsContent value="active" className="mt-4">
          <DataTable
            columns={columns}
            rows={employees}
            getRowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon={Users}
                title="No employees yet"
                description="Invite someone to get them working in this organization."
              />
            }
          />
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <PendingInvitationsList
            organizationId={organizationId}
            invitations={invitations}
            canManage={canInvite}
          />
        </TabsContent>
      </Tabs>

      {canInvite && (
        <InviteEmployeeDialog
          organizationId={organizationId}
          roles={roles}
          branches={branches}
          businessUnits={businessUnits}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      )}

      {statusTarget && (
        <EmployeeStatusDialog
          organizationId={organizationId}
          employee={statusTarget}
          open={statusTarget !== null}
          onOpenChange={(open) => !open && setStatusTarget(null)}
        />
      )}

      {assignTarget && (
        <AssignRoleDialog
          organizationId={organizationId}
          employee={assignTarget}
          roles={roles}
          branches={branches}
          businessUnits={businessUnits}
          open={assignTarget !== null}
          onOpenChange={(open) => !open && setAssignTarget(null)}
        />
      )}
    </>
  )
}
