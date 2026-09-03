'use server'

import { toErrorMessage } from '@/lib/errors'

import { revalidatePath } from 'next/cache'

import {
  archiveBranch,
  archiveBusinessUnit,
  createBranch,
  createBusinessUnit,
  updateBranch,
  updateBusinessUnit,
  updateBusinessUnitCapabilities,
  upsertBusinessUnitPosConfig,
} from '@/lib/business-structure/mutations'

/**
 * Server Actions for the post-onboarding Branch/Business Unit management
 * screens (app/(app)/business-structure/page.tsx). Each is a thin
 * FormData-parsing wrapper — matching app/(auth)/actions.ts's established
 * shape (`useActionState`-compatible `(prevState, formData) => state`) —
 * around the actual mutation in lib/business-structure/mutations.ts, which
 * app/(onboarding)/onboarding/actions.ts's wizard steps call too. Unlike the
 * onboarding wizard (which redirects to re-derive its current step after
 * every mutation), these revalidate the current path and return so a
 * client-side dialog can close itself.
 */
export interface BusinessStructureActionState {
  error: string | null
}

function errorMessage(error: unknown): string {
  return toErrorMessage(error)
}

export async function createBranchAction(
  _prevState: BusinessStructureActionState,
  formData: FormData,
): Promise<BusinessStructureActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')

  try {
    await createBranch(organizationId, branchInputFrom(formData))
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/business-structure')
  return { error: null }
}

/**
 * The Branch identity + receipt-address fields, shared by create and update.
 * Empty strings pass the schema (they are within max length) and are
 * normalised to null by lib/business-structure/mutations.ts.
 */
function branchInputFrom(formData: FormData) {
  return {
    name: String(formData.get('name') ?? ''),
    addressLine: String(formData.get('addressLine') ?? ''),
    contactPhone: String(formData.get('contactPhone') ?? ''),
  }
}

export async function updateBranchAction(
  _prevState: BusinessStructureActionState,
  formData: FormData,
): Promise<BusinessStructureActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')

  try {
    await updateBranch(organizationId, branchId, branchInputFrom(formData))
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/business-structure')
  return { error: null }
}

export async function archiveBranchAction(
  _prevState: BusinessStructureActionState,
  formData: FormData,
): Promise<BusinessStructureActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')

  try {
    await archiveBranch(organizationId, branchId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/business-structure')
  return { error: null }
}

export async function createBusinessUnitAction(
  _prevState: BusinessStructureActionState,
  formData: FormData,
): Promise<BusinessStructureActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')
  const businessTypeId = String(formData.get('businessTypeId') ?? '')
  const name = String(formData.get('name') ?? '')

  try {
    await createBusinessUnit(organizationId, { branchId, businessTypeId, name })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/business-structure')
  return { error: null }
}

export async function updateBusinessUnitAction(
  _prevState: BusinessStructureActionState,
  formData: FormData,
): Promise<BusinessStructureActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')
  const name = String(formData.get('name') ?? '')

  try {
    await updateBusinessUnit(organizationId, businessUnitId, branchId, { name })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/business-structure')
  return { error: null }
}

export async function archiveBusinessUnitAction(
  _prevState: BusinessStructureActionState,
  formData: FormData,
): Promise<BusinessStructureActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')

  try {
    await archiveBusinessUnit(organizationId, businessUnitId, branchId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/business-structure')
  return { error: null }
}

export async function updateBusinessUnitCapabilitiesAction(
  _prevState: BusinessStructureActionState,
  formData: FormData,
): Promise<BusinessStructureActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')
  const overridesJson = String(formData.get('overrides') ?? '[]')

  try {
    const overrides = JSON.parse(overridesJson) as Array<{ capabilityId: string; enabled: boolean }>
    await updateBusinessUnitCapabilities(organizationId, businessUnitId, branchId, overrides)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/business-structure')
  return { error: null }
}

export async function updateBusinessUnitPosConfigAction(
  _prevState: BusinessStructureActionState,
  formData: FormData,
): Promise<BusinessStructureActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')
  const discountMaxAmountRaw = String(formData.get('discountMaxAmount') ?? '').trim()

  try {
    await upsertBusinessUnitPosConfig(organizationId, businessUnitId, branchId, {
      taxRate: Number(formData.get('taxRate') ?? 0),
      serviceChargeEnabled: formData.get('serviceChargeEnabled') === 'on',
      serviceChargeType:
        (formData.get('serviceChargeType') as 'percentage' | 'fixed') ?? 'percentage',
      serviceChargeValue: Number(formData.get('serviceChargeValue') ?? 0),
      discountRequiresAuthorization: formData.get('discountRequiresAuthorization') === 'on',
      discountMaxPercentage: Number(formData.get('discountMaxPercentage') ?? 0),
      discountMaxAmount: discountMaxAmountRaw === '' ? null : Number(discountMaxAmountRaw),
      discountReasonRequired: formData.get('discountReasonRequired') === 'on',
      defaultPaymentMethod:
        (formData.get('defaultPaymentMethod') as 'cash' | 'card' | 'transfer') ?? 'cash',
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/business-structure')
  return { error: null }
}
