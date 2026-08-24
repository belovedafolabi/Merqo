'use server'

import { redirect } from 'next/navigation'

import {
  completeOnboarding,
  createBranch,
  createBusinessUnit,
  updateBusinessUnitCapabilities,
  upsertBusinessUnitPosConfig,
} from '@/lib/business-structure/mutations'
import { createOrganizationForCurrentUser } from '@/lib/organization/mutations'

/**
 * Server Actions for the onboarding wizard (app/(onboarding)/onboarding/page.tsx).
 * Each step calls the same lib/business-structure/mutations.ts functions the
 * post-onboarding management screens use (app/(app)/business-structure/actions.ts)
 * — but redirects back to /onboarding afterward instead of revalidating in
 * place, so the wizard's entry page re-derives which step to show next from
 * the freshly-mutated database state (this milestone's resumability design:
 * no separate step-tracker, the data itself is the state machine).
 */
export interface OnboardingActionState {
  error: string | null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

/**
 * app/(onboarding)/onboarding/page.tsx's ORG_STEPS recovery branch —
 * components/onboarding/organization-step.tsx's form target. Reuses
 * createOrganizationForCurrentUser() (lib/organization/mutations.ts), the
 * same create_organization_with_owner() call path signIn()'s
 * ensureOrganizationBootstrapped() uses, so "already taken" / "already
 * belongs to an organization" get identical handling either way.
 */
export async function createOrganizationStepAction(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const name = String(formData.get('name') ?? '')

  try {
    await createOrganizationForCurrentUser(name)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  redirect('/onboarding')
}

export async function createBranchStepAction(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const name = String(formData.get('name') ?? '')

  try {
    await createBranch(organizationId, { name })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  redirect('/onboarding')
}

export async function createBusinessUnitStepAction(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')
  const businessTypeId = String(formData.get('businessTypeId') ?? '')
  const name = String(formData.get('name') ?? '')

  try {
    await createBusinessUnit(organizationId, { branchId, businessTypeId, name })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  redirect('/onboarding')
}

/**
 * Capability review and POS configuration are one combined wizard step
 * (not two), submitted and persisted together. Both are otherwise
 * independent Server Actions (mutations.ts, reused as-is by the
 * post-onboarding management screens) — merging them here is purely a
 * wizard-flow simplification: this milestone's resumability design derives
 * the current step from what already exists in the database
 * (getOnboardingState()), and a Business Unit's capabilities always exist
 * the instant it's created (seeded from its Business Type's defaults), so
 * there is no reliable "capabilities reviewed but POS config not yet saved"
 * signal to resume a split step at — only "has a POS config row or not".
 * One combined step avoids needing an artificial extra tracking column for
 * a distinction the UI doesn't otherwise need.
 */
export async function configureStepAction(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  const branchId = String(formData.get('branchId') ?? '')
  const overridesJson = String(formData.get('overrides') ?? '[]')
  const discountMaxAmountRaw = String(formData.get('discountMaxAmount') ?? '').trim()

  try {
    const overrides = JSON.parse(overridesJson) as Array<{ capabilityId: string; enabled: boolean }>
    await updateBusinessUnitCapabilities(organizationId, businessUnitId, branchId, overrides)

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

  redirect('/onboarding')
}

export async function finishOnboardingAction(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')

  try {
    await completeOnboarding(organizationId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  redirect('/dashboard')
}
