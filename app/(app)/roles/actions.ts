'use server'

import { requirePermission } from '@/lib/auth/guard'
import { recordAuditEvent } from '@/lib/auth/audit'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * The minimal role-assignment admin path this milestone's Scope calls for
 * ("employee/role changes made in this milestone's minimal admin path") —
 * a working code path with no dedicated UI screen, per this milestone's Out
 * of Scope ("employee invite/deactivate screens (Milestone 11)... the
 * schema and enforcement for custom roles exists here; the management UI
 * does not").
 */
export interface RoleAssignmentInput {
  userId: string
  roleId: string
  organizationId: string
  branchId?: string | null
  businessUnitId?: string | null
}

export async function assignUserRole(input: RoleAssignmentInput) {
  await requirePermission('roles.assign', { organizationId: input.organizationId })

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('user_roles')
    .insert({
      user_id: input.userId,
      role_id: input.roleId,
      organization_id: input.organizationId,
      branch_id: input.branchId ?? null,
      business_unit_id: input.businessUnitId ?? null,
    })
    .select('id')
    .single()

  if (error) throw error

  await recordAuditEvent(
    {
      organizationId: input.organizationId,
      userId: input.userId,
      action: 'user_role.assigned',
      resourceType: 'user_role',
      resourceId: data.id,
      metadata: { roleId: input.roleId, targetUserId: input.userId },
    },
    supabase,
  )

  return data.id as string
}

export async function revokeUserRole(userRoleId: string, organizationId: string) {
  await requirePermission('roles.assign', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('user_roles').delete().eq('id', userRoleId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: null,
      action: 'user_role.revoked',
      resourceType: 'user_role',
      resourceId: userRoleId,
    },
    supabase,
  )
}
