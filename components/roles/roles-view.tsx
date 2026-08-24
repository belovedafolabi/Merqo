'use client'

import { useState } from 'react'
import { Plus, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { RoleBuilderDialog } from '@/components/roles/role-builder-dialog'
import type { PermissionGroup, RoleSummary } from '@/lib/roles/queries'

/**
 * The role catalog — built-in and custom side by side, proving Milestone
 * 11's Definition of Done in the UI itself: a custom role appears in exactly
 * the same list, with exactly the same shape, as a seeded one.
 */
export function RolesView({
  organizationId,
  roles,
  permissionGroups,
  ownPermissionKeys,
  permissionKeysByRole,
  canAuthorRoles,
}: {
  organizationId: string
  roles: RoleSummary[]
  permissionGroups: PermissionGroup[]
  ownPermissionKeys: string[]
  permissionKeysByRole: Record<string, string[]>
  canAuthorRoles: boolean
}) {
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null)

  function openCreate() {
    setEditingRole(null)
    setBuilderOpen(true)
  }

  function openEdit(role: RoleSummary) {
    setEditingRole(role)
    setBuilderOpen(true)
  }

  const columns: DataTableColumn<RoleSummary>[] = [
    {
      header: 'Role',
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{row.name}</span>
          {row.description && (
            <span className="truncate text-xs text-muted-foreground">{row.description}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Type',
      cell: (row) => (
        <Badge variant={row.isSystemRole ? 'secondary' : 'outline'}>
          {row.isSystemRole ? 'Built-in' : 'Custom'}
        </Badge>
      ),
    },
    { header: 'Assignments', cell: (row) => row.assignmentCount },
    {
      header: '',
      className: 'text-right',
      cell: (row) =>
        canAuthorRoles && !row.isSystemRole ? (
          <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
            Edit permissions
          </Button>
        ) : null,
    },
  ]

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-muted-foreground">
          {roles.length} role{roles.length === 1 ? '' : 's'} — built-in roles cannot be edited or
          deleted.
        </p>
        {canAuthorRoles && (
          <Button onClick={openCreate}>
            <Plus /> Create role
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={roles}
        getRowKey={(row) => row.id}
        emptyState={
          <EmptyState icon={ShieldCheck} title="No roles" description="This shouldn't happen." />
        }
      />

      {canAuthorRoles && (
        <RoleBuilderDialog
          organizationId={organizationId}
          editingRole={editingRole}
          permissionGroups={permissionGroups}
          ownPermissionKeys={ownPermissionKeys}
          initialSelectedKeys={editingRole ? (permissionKeysByRole[editingRole.id] ?? []) : []}
          open={builderOpen}
          onOpenChange={setBuilderOpen}
        />
      )}
    </>
  )
}
