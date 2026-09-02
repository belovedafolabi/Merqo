'use server'

import { toErrorMessage } from '@/lib/errors'

import { revalidatePath } from 'next/cache'

import {
  assignUserRole,
  createRole,
  revokeUserRole,
  updateRolePermissions,
} from '@/lib/roles/mutations'

/**
 * Thin Server Action layer for the role builder and role assignment, per the
 * canonical shape every domain since Milestone 10 follows: parse FormData ->
 * delegate to lib/roles/mutations.ts -> return { error } -> revalidate. All
 * real validation, permission-checking, and DB access lives in
 * lib/roles/mutations.ts; this file exists only to be a useActionState
 * target.
 *
 * Supersedes this file's own previous shape (a UI-less stub exporting
 * assignUserRole/revokeUserRole directly as plain async functions, per
 * Milestone 03's "minimal admin path with no dedicated UI screen"). Those two
 * bodies now live in lib/roles/mutations.ts; this file only re-exposes them
 * as actions.
 */
export interface RolesActionState {
  error: string | null
}

const initialState: RolesActionState = { error: null }

function errorMessage(error: unknown): string {
  return toErrorMessage(error)
}

export async function createRoleAction(
  _prevState: RolesActionState,
  formData: FormData,
): Promise<RolesActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const name = String(formData.get('name') ?? '')
  const description = formData.get('description')
  const permissionKeys = formData.getAll('permissionKeys').map(String)

  try {
    await createRole(organizationId, {
      name,
      description: description ? String(description) : undefined,
      permissionKeys,
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/roles')
  return initialState
}

export async function updateRolePermissionsAction(
  _prevState: RolesActionState,
  formData: FormData,
): Promise<RolesActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const roleId = String(formData.get('roleId') ?? '')
  const permissionKeys = formData.getAll('permissionKeys').map(String)

  try {
    await updateRolePermissions(organizationId, { roleId, permissionKeys })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/roles')
  return initialState
}

export async function assignRoleAction(
  _prevState: RolesActionState,
  formData: FormData,
): Promise<RolesActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const userId = String(formData.get('userId') ?? '')
  const roleId = String(formData.get('roleId') ?? '')
  const branchId = formData.get('branchId')
  const businessUnitId = formData.get('businessUnitId')

  try {
    await assignUserRole({
      organizationId,
      userId,
      roleId,
      branchId: branchId ? String(branchId) : null,
      businessUnitId: businessUnitId ? String(businessUnitId) : null,
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/employees')
  revalidatePath('/roles')
  return initialState
}

export async function revokeRoleAction(
  _prevState: RolesActionState,
  formData: FormData,
): Promise<RolesActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const userRoleId = String(formData.get('userRoleId') ?? '')

  try {
    await revokeUserRole(userRoleId, organizationId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/employees')
  revalidatePath('/roles')
  return initialState
}
