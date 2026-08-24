import { redirect } from 'next/navigation'

import { getCurrentUserContext } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/guard'
import { resolvePermission } from '@/lib/auth/permissions'
import { getOnboardingState } from '@/lib/business-structure/queries'
import {
  getRolePermissionKeys,
  listOwnOrgWidePermissionKeys,
  listPermissionsGroupedByResource,
  listRoles,
} from '@/lib/roles/queries'
import { AdminTopbar } from '@/components/shell/admin-topbar'
import { RolesView } from '@/components/roles/roles-view'

/**
 * The custom-role builder (docs/milestones/11-administration-employees-and-branding.md
 * Scope: "create a new role, name it, assign a set of permissions from the
 * existing permission catalog... the builder only ever composes existing,
 * whitelisted permissions, it never generates new code paths"). Reachable
 * from the Admin sidebar's "Roles" item, gated on `roles.view`.
 */
export default async function RolesPage() {
  const onboardingState = await getOnboardingState()
  const organizationId = onboardingState.organizationId
  if (!organizationId) redirect('/sign-in')

  await requirePermission('roles.view', { organizationId })

  const [{ grants }, roles, permissionGroups, ownPermissionKeys] = await Promise.all([
    getCurrentUserContext(),
    listRoles(organizationId),
    listPermissionsGroupedByResource(),
    listOwnOrgWidePermissionKeys(organizationId),
  ])

  // Pre-fetched per custom role (the small, editable minority — system roles
  // are never opened in the builder) so opening "Edit" is instant and the
  // dialog stays a plain client component with no data-fetching effect of
  // its own.
  const customRoles = roles.filter((role) => !role.isSystemRole)
  const permissionKeysByRole: Record<string, string[]> = {}
  await Promise.all(
    customRoles.map(async (role) => {
      permissionKeysByRole[role.id] = await getRolePermissionKeys(role.id)
    }),
  )

  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Roles" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <RolesView
          organizationId={organizationId}
          roles={roles}
          permissionGroups={permissionGroups}
          ownPermissionKeys={[...ownPermissionKeys]}
          permissionKeysByRole={permissionKeysByRole}
          canAuthorRoles={resolvePermission(grants, 'roles.create', { organizationId })}
        />
      </div>
    </div>
  )
}
