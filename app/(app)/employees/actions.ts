'use server'

import { revalidatePath } from 'next/cache'

import { inviteEmployee, revokeInvitation, setEmployeeActive } from '@/lib/employees/mutations'

/**
 * Thin Server Action layer for the employee directory — same shape as every
 * domain since Milestone 10: parse FormData -> delegate to
 * lib/employees/mutations.ts -> return { error, ...extras } -> revalidate.
 */
export interface EmployeeActionState {
  error: string | null
  /** Set only by inviteEmployeeAction, on success — the always-available copy-link fallback. */
  inviteUrl?: string
  emailWarning?: string | null
}

const initialState: EmployeeActionState = { error: null }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function optionalStringField(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  return value ? String(value) : null
}

export async function inviteEmployeeAction(
  _prevState: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')

  try {
    const result = await inviteEmployee(organizationId, {
      email: String(formData.get('email') ?? ''),
      roleId: String(formData.get('roleId') ?? ''),
      branchId: optionalStringField(formData, 'branchId'),
      businessUnitId: optionalStringField(formData, 'businessUnitId'),
    })

    revalidatePath('/employees')
    return { error: null, inviteUrl: result.inviteUrl, emailWarning: result.emailWarning }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

export async function revokeInvitationAction(
  _prevState: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const invitationId = String(formData.get('invitationId') ?? '')

  try {
    await revokeInvitation(organizationId, invitationId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/employees')
  return initialState
}

export async function setEmployeeActiveAction(
  _prevState: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const userId = String(formData.get('userId') ?? '')
  const active = formData.get('active') === 'true'

  try {
    await setEmployeeActive(organizationId, { userId, active })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/employees')
  return initialState
}
