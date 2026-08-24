import { z } from 'zod'

/**
 * Shared client/server validation for the custom-role builder and role
 * assignment — mutations.ts parses against these before touching the
 * database; the RLS predicates in
 * supabase/migrations/20260824090700_alter_roles_add_authoring_policies.sql
 * and 20260824090800_alter_role_permissions_add_authoring_policies.sql are
 * the last line, not the first, exactly as every schema file here says of
 * its own table's constraints.
 */

const roleNameSchema = z
  .string()
  .trim()
  .min(2, 'Give the role a name of at least 2 characters.')
  .max(60, 'Role name must be 60 characters or fewer.')

/**
 * Slugified server-side from the name (see mutations.ts), not accepted from
 * the client: it only has to be unique and URL-safe, and asking the author
 * to separately think up a slug is a second decision nobody wants to make.
 */
export const createRoleInputSchema = z.object({
  name: roleNameSchema,
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value ? value : undefined)),
  // The checklist's selection, keyed by permission key rather than id: the
  // builder UI renders from lib/roles/queries.ts's
  // listPermissionsGroupedByResource(), which already carries the key, and
  // round-tripping the key (not a raw uuid) keeps a malformed submission
  // readable in a server log.
  permissionKeys: z.array(z.string().min(1)).max(200),
})
export type CreateRoleInput = z.infer<typeof createRoleInputSchema>

/**
 * A full replacement of a custom role's permission set — delete everything,
 * insert the new selection, both inside one transaction-shaped mutation (see
 * updateRolePermissions() in mutations.ts). Not a diff/patch: the checklist
 * UI always submits its complete current state, and computing an add/remove
 * diff client-side would only be able to get it wrong in a way the database
 * would then have to trust.
 */
export const updateRolePermissionsInputSchema = z.object({
  roleId: z.uuid('Select a role.'),
  permissionKeys: z.array(z.string().min(1)).max(200),
})
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsInputSchema>

export const assignRoleInputSchema = z.object({
  userId: z.uuid('Select an employee.'),
  roleId: z.uuid('Select a role.'),
  organizationId: z.uuid(),
  branchId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  businessUnitId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
})
export type AssignRoleInput = z.infer<typeof assignRoleInputSchema>
