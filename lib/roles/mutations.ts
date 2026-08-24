import { recordAuditEvent } from '@/lib/auth/audit'
import { requirePermission } from '@/lib/auth/guard'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  assignRoleInputSchema,
  createRoleInputSchema,
  updateRolePermissionsInputSchema,
  type AssignRoleInput,
  type CreateRoleInput,
  type UpdateRolePermissionsInput,
} from '@/lib/roles/schemas'

/**
 * The custom-role builder's writes, plus role assignment (moved here from
 * app/(app)/roles/actions.ts, which is now a thin 'use server' wrapper — see
 * that file).
 *
 * requirePermission() here is a UX/error-message convenience, NOT the
 * security boundary — say so explicitly, because every other mutation module
 * in this codebase can say the opposite. The actual boundary for every write
 * below is the RLS predicate in
 * 20260824090700/090800/090900_alter_*_add_authoring_policies.sql: a request
 * that skips this module and posts straight to PostgREST hits the identical
 * checks, including the self-elevation guard. requirePermission() only
 * exists so an unauthorized attempt through the UI fails with "you don't
 * have roles.create" instead of a bare Postgres RLS error.
 */

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'role'
  )
}

/**
 * Creates a role and attaches its initial permission set in one call.
 *
 * The role insert and the role_permissions inserts are two round trips, not
 * one transaction — Supabase's JS client has no multi-statement transaction
 * primitive, and there is none of the atomicity requirement here that a
 * SECURITY DEFINER function exists to provide elsewhere in this codebase
 * (decide_expense(), accept_employee_invitation()): if the permission
 * inserts partially fail, the role simply ends up with fewer permissions
 * than requested, still RLS-correct at every intermediate row, and the
 * builder UI shows the failure and lets the author retry — unlike, say, a
 * sale total, nothing here needs "all or nothing".
 */
export async function createRole(organizationId: string, rawInput: CreateRoleInput): Promise<string> {
  const input = createRoleInputSchema.parse(rawInput)
  const user = await requirePermission('roles.create', { organizationId })

  const supabase = await createServerSupabaseClient()

  const slugBase = slugify(input.name)
  // Not guaranteed unique in isolation (two orgs, or two attempts, could both
  // slugify "Stock Auditor" to the same base) — the suffix keeps a retry
  // after a name collision from requiring the author to rename their role.
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`

  const { data: role, error: roleError } = await supabase
    .from('roles')
    .insert({
      name: input.name,
      slug,
      description: input.description ?? null,
      is_system_role: false,
      created_by: user.id,
    })
    .select('id')
    .single<{ id: string }>()

  if (roleError) throw roleError

  if (input.permissionKeys.length > 0) {
    await attachPermissions(supabase, role.id, input.permissionKeys)
  }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'role.created',
      resourceType: 'role',
      resourceId: role.id,
      metadata: { name: input.name, permissionKeys: input.permissionKeys },
    },
    supabase,
  )

  return role.id
}

/**
 * Replaces a custom role's entire permission set: delete every existing row,
 * insert the submitted selection. See lib/roles/schemas.ts's doc on why this
 * is a replacement, not a diff.
 */
export async function updateRolePermissions(
  organizationId: string,
  rawInput: UpdateRolePermissionsInput,
): Promise<void> {
  const input = updateRolePermissionsInputSchema.parse(rawInput)
  const user = await requirePermission('roles.create', { organizationId })

  const supabase = await createServerSupabaseClient()

  const { error: deleteError } = await supabase
    .from('role_permissions')
    .delete()
    .eq('role_id', input.roleId)
  if (deleteError) throw deleteError

  if (input.permissionKeys.length > 0) {
    await attachPermissions(supabase, input.roleId, input.permissionKeys)
  }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'role.permissions_updated',
      resourceType: 'role',
      resourceId: input.roleId,
      metadata: { permissionKeys: input.permissionKeys },
    },
    supabase,
  )
}

async function attachPermissions(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  roleId: string,
  permissionKeys: readonly string[],
): Promise<void> {
  const { data: permissions, error: permissionsError } = await supabase
    .from('permissions')
    .select('id, key')
    .in('key', permissionKeys)
  if (permissionsError) throw permissionsError

  const rows = ((permissions ?? []) as { id: string; key: string }[]).map((p) => ({
    role_id: roleId,
    permission_id: p.id,
  }))

  if (rows.length === 0) return

  // One .insert([...]) call, not a loop of single inserts — this is what
  // makes 20260824090800's self-elevation guard atomic per submission (see
  // that migration's own comment): if any row's permission is one the
  // author does not personally hold org-wide, the WHOLE statement is
  // rejected by its WITH CHECK, not just that one row.
  const { error } = await supabase.from('role_permissions').insert(rows)
  if (error) throw error
}

export async function assignUserRole(rawInput: AssignRoleInput): Promise<string> {
  const input = assignRoleInputSchema.parse(rawInput)
  // Captured, not discarded: `input.userId` is the EMPLOYEE being granted the
  // role (assignRoleInputSchema's own doc), not the person doing the
  // granting. Using it as audit_logs.user_id would misattribute the action —
  // the log would read as the new employee having assigned the role to
  // themselves. `actor` is who requirePermission() resolved from the calling
  // session, matching every other mutation in this codebase.
  const actor = await requirePermission('roles.assign', { organizationId: input.organizationId })

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('user_roles')
    .insert({
      user_id: input.userId,
      role_id: input.roleId,
      organization_id: input.organizationId,
      branch_id: input.branchId,
      business_unit_id: input.businessUnitId,
    })
    .select('id')
    .single<{ id: string }>()

  if (error) throw error

  await recordAuditEvent(
    {
      organizationId: input.organizationId,
      userId: actor.id,
      action: 'user_role.assigned',
      resourceType: 'user_role',
      resourceId: data.id,
      metadata: { roleId: input.roleId, targetUserId: input.userId },
    },
    supabase,
  )

  return data.id
}

export async function revokeUserRole(userRoleId: string, organizationId: string): Promise<void> {
  const actor = await requirePermission('roles.assign', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('user_roles').delete().eq('id', userRoleId)
  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      // Previously null: revocation is exactly as attributable an action as
      // assignment, and requirePermission() already has the actor in hand —
      // there was no reason to throw it away here.
      userId: actor.id,
      action: 'user_role.revoked',
      resourceType: 'user_role',
      resourceId: userRoleId,
    },
    supabase,
  )
}
