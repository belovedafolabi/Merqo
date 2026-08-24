import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'

import { getCurrentUserContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/guard'
import { resolvePermission } from '@/lib/auth/permissions'
import {
  getOnboardingState,
  listBranches,
  listBusinessUnits,
} from '@/lib/business-structure/queries'
import { listEmployees, listPendingInvitations } from '@/lib/employees/queries'
import { listRoles } from '@/lib/roles/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { EmptyState } from '@/components/states/empty-state'
import { EmployeesView } from '@/components/employees/employees-view'

/**
 * The employee directory (docs/milestones/11-administration-employees-and-branding.md
 * Scope: "list, invite, deactivate/reactivate, view an employee's assigned
 * role(s) and scope(s)"). Reachable from the Admin sidebar's "Employees"
 * item, gated on `users.view`.
 */
export default async function EmployeesPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('users.view', { organizationId })

  const branches = await listBranches(organizationId)
  if (branches.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <AdminTopbar title="Employees" />
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
          <EmptyState
            icon={Users}
            title="No branch yet"
            description="Set up a branch in Business Structure before inviting employees to it."
          />
        </div>
      </div>
    )
  }

  const [{ grants, user }, employees, invitations, roles, businessUnits] = await Promise.all([
    getCurrentUserContext(),
    listEmployees(organizationId),
    listPendingInvitations(organizationId),
    listRoles(organizationId),
    listBusinessUnits(organizationId),
  ])

  const scope = { organizationId }

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Employees" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <EmployeesView
          organizationId={organizationId}
          currentUserId={user?.id ?? ''}
          employees={employees}
          invitations={invitations}
          roles={roles}
          branches={branches}
          businessUnits={businessUnits}
          canInvite={resolvePermission(grants, 'employees.invite', scope)}
          canDeactivate={resolvePermission(grants, 'employees.deactivate', scope)}
          canAssignRoles={resolvePermission(grants, 'roles.assign', scope)}
        />
      </div>
    </div>
  )
}
