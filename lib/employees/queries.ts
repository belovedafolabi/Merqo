import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Read-side queries for the employee directory. RLS is the enforced
 * visibility boundary (users_select via user_shares_org_with(),
 * employee_invitations_select gated on employees.invite — see those
 * migrations), so these functions exist for shape, not access control.
 */

export interface EmployeeRoleAssignment {
  userRoleId: string
  roleId: string
  roleName: string
  branchId: string | null
  branchName: string | null
  businessUnitId: string | null
  businessUnitName: string | null
}

export interface Employee {
  id: string
  email: string
  fullName: string
  deactivatedAt: string | null
  /** One role per user (migration 20260908090700; DECISIONS_AND_CONFLICTS.md §8). Always set
   *  for a row this query returns — the directory lists members who hold a
   *  role, and a member with none has no user_roles row to appear on. */
  assignment: EmployeeRoleAssignment
}

interface UserRoleRow {
  id: string
  role_id: string
  branch_id: string | null
  business_unit_id: string | null
  users: { id: string; email: string; full_name: string; deactivated_at: string | null } | null
  roles: { name: string } | null
  branches: { name: string } | null
  business_units: { name: string } | null
}

/**
 * Every employee holding a role in this organization, with that role and its
 * scope. One flat user_roles query — and with one role per user (migration
 * 20260908090700) it is already one row per member, so there is no grouping
 * left to do.
 */
export async function listEmployees(organizationId: string): Promise<Employee[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('user_roles')
    .select(
      // user_roles has TWO foreign keys to users (user_id and created_by —
      // the latter is who assigned the role), so a bare `users(...)` embed
      // is ambiguous and PostgREST rejects it (PGRST201). Disambiguated the
      // same way lib/expenses/queries.ts's two user embeds are, with the
      // explicit foreign-key hint.
      `id, role_id, branch_id, business_unit_id,
       users:users!user_roles_user_id_fkey(id, email, full_name, deactivated_at),
       roles(name),
       branches(name),
       business_units(name)`,
    )
    .eq('organization_id', organizationId)

  if (error) throw error

  return ((data ?? []) as unknown as UserRoleRow[])
    .flatMap((row) => {
      const user = row.users
      if (!user) return [] // FK is SET NULL on delete; a de-linked row has nothing left to show.
      return [
        {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          deactivatedAt: user.deactivated_at,
          assignment: {
            userRoleId: row.id,
            roleId: row.role_id,
            roleName: row.roles?.name ?? 'Unknown role',
            branchId: row.branch_id,
            branchName: row.branches?.name ?? null,
            businessUnitId: row.business_unit_id,
            businessUnitName: row.business_units?.name ?? null,
          },
        } satisfies Employee,
      ]
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export interface PendingInvitation {
  id: string
  email: string
  roleId: string
  roleName: string
  branchId: string | null
  branchName: string | null
  businessUnitId: string | null
  businessUnitName: string | null
  expiresAt: string
  createdAt: string
  invitedByName: string | null
  isExpired: boolean
}

interface InvitationRow {
  id: string
  email: string
  role_id: string
  branch_id: string | null
  business_unit_id: string | null
  expires_at: string
  created_at: string
  roles: { name: string } | null
  branches: { name: string } | null
  business_units: { name: string } | null
  inviter: { full_name: string } | null
}

/** Invitations not yet accepted or revoked, newest first. */
export async function listPendingInvitations(organizationId: string): Promise<PendingInvitation[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('employee_invitations')
    .select(
      `id, email, role_id, branch_id, business_unit_id, expires_at, created_at,
       roles(name),
       branches(name),
       business_units(name),
       inviter:users!employee_invitations_created_by_fkey(full_name)`,
    )
    .eq('organization_id', organizationId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error

  const now = Date.now()

  return ((data ?? []) as unknown as InvitationRow[]).map((row) => ({
    id: row.id,
    email: row.email,
    roleId: row.role_id,
    roleName: row.roles?.name ?? 'Unknown role',
    branchId: row.branch_id,
    branchName: row.branches?.name ?? null,
    businessUnitId: row.business_unit_id,
    businessUnitName: row.business_units?.name ?? null,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    invitedByName: row.inviter?.full_name ?? null,
    isExpired: new Date(row.expires_at).getTime() <= now,
  }))
}
