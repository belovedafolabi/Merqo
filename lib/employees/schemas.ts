import { z } from 'zod'

/**
 * Shared client/server validation for inviting and deactivating employees.
 * lib/employees/mutations.ts parses against these before touching the
 * database; the RLS predicates in
 * supabase/migrations/20260824090400_alter_employee_invitations_add_policies.sql
 * and the permission check inside set_employee_active()
 * (20260824090200_create_employee_functions.sql) are the last line, not the
 * first.
 */

export const inviteEmployeeInputSchema = z.object({
  email: z.email('Enter a valid email address.').trim().toLowerCase(),
  roleId: z.uuid('Select a role.'),
  branchId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  businessUnitId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
})
export type InviteEmployeeInput = z.infer<typeof inviteEmployeeInputSchema>

export const setEmployeeActiveInputSchema = z.object({
  userId: z.uuid(),
  active: z.boolean(),
})
export type SetEmployeeActiveInput = z.infer<typeof setEmployeeActiveInputSchema>
