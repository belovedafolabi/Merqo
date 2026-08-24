import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Read-side queries for the role catalog and the custom-role builder. RLS is
 * the enforced visibility boundary (roles_select/permissions_select are
 * readable by any authenticated user — see 20260822094500/094600 — since a
 * role-assignment picker and a permission checklist both need the full
 * catalog to render), so these functions exist for shape, not access control.
 */

export interface RoleSummary {
  id: string
  name: string
  slug: string
  description: string | null
  isSystemRole: boolean
  createdBy: string | null
  /** How many employees currently hold this role, anywhere in the organization. */
  assignmentCount: number
}

export interface PermissionSummary {
  id: string
  key: string
  resource: string
  action: string
  description: string | null
}

/** A resource group for the checklist UI — components/roles/permission-checklist.tsx
 *  groups by this, per Milestone 11's Implementation Notes ("grouped and
 *  readable... rather than a flat, unstructured list of 50+ checkboxes"). */
export interface PermissionGroup {
  resource: string
  permissions: PermissionSummary[]
}

interface RoleRow {
  id: string
  name: string
  slug: string
  description: string | null
  is_system_role: boolean
  created_by: string | null
}

/**
 * Every role in the catalog, built-in and custom, with how many employees
 * hold it. The count matters for the UI decision every role list needs to
 * make: whether "delete" is even offerable (there is no delete policy — see
 * 20260824090700's header — so it never is, but "N employees hold this
 * role" is still the fact a builder screen has to show before letting
 * someone edit a role's permissions out from under active assignees).
 */
export async function listRoles(organizationId: string): Promise<RoleSummary[]> {
  const supabase = await createServerSupabaseClient()

  const [{ data: roles, error: rolesError }, { data: assignments, error: assignmentsError }] =
    await Promise.all([
      supabase
        .from('roles')
        .select('id, name, slug, description, is_system_role, created_by')
        .order('is_system_role', { ascending: false })
        .order('name'),
      supabase.from('user_roles').select('role_id').eq('organization_id', organizationId),
    ])

  if (rolesError) throw rolesError
  if (assignmentsError) throw assignmentsError

  const counts = new Map<string, number>()
  for (const row of assignments ?? []) {
    counts.set(row.role_id, (counts.get(row.role_id) ?? 0) + 1)
  }

  return ((roles ?? []) as RoleRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isSystemRole: row.is_system_role,
    createdBy: row.created_by,
    assignmentCount: counts.get(row.id) ?? 0,
  }))
}

/**
 * The full permission catalog, grouped by resource and sorted for a stable
 * checklist layout. Note what this does NOT filter on: every permission is
 * shown to every author, including ones they do not hold — the checklist
 * renders those disabled with a hint (components/roles/permission-checklist.tsx),
 * which is a UX mirror of the RLS predicate in
 * 20260824090800_alter_role_permissions_add_authoring_policies.sql, not a
 * second copy of it. Hiding rows outright would make "why can't I tick this"
 * a mystery instead of a stated rule.
 */
export async function listPermissionsGroupedByResource(): Promise<PermissionGroup[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('permissions')
    .select('id, key, resource, action, description')
    .order('resource')
    .order('action')

  if (error) throw error

  const groups = new Map<string, PermissionSummary[]>()
  for (const row of (data ?? []) as PermissionSummary[]) {
    const bucket = groups.get(row.resource) ?? []
    bucket.push(row)
    groups.set(row.resource, bucket)
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, permissions]) => ({ resource, permissions }))
}

/** The permission keys a role currently grants — the checklist's initial selection when editing. */
export async function getRolePermissionKeys(roleId: string): Promise<string[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('role_permissions')
    .select('permissions(key)')
    .eq('role_id', roleId)

  if (error) throw error

  return ((data ?? []) as unknown as { permissions: { key: string } | null }[])
    .map((row) => row.permissions?.key)
    .filter((key): key is string => Boolean(key))
}

/**
 * The permission keys the CALLER personally holds, org-wide, at
 * `organizationId` — what components/roles/permission-checklist.tsx disables
 * against. Mirrors user_holds_permission_org_wide()
 * (20260824090250_create_role_authoring_functions.sql) in TypeScript for the
 * one place that needs it as a set rather than a single boolean check.
 */
export async function listOwnOrgWidePermissionKeys(organizationId: string): Promise<Set<string>> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('current_user_permission_grants')
  if (error) throw error

  return new Set(
    (
      (data ?? []) as {
        permission_key: string
        organization_id: string
        branch_id: string | null
        business_unit_id: string | null
      }[]
    )
      .filter(
        (row) =>
          row.organization_id === organizationId &&
          row.branch_id === null &&
          row.business_unit_id === null,
      )
      .map((row) => row.permission_key),
  )
}
