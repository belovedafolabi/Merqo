import { redirect } from 'next/navigation'

import {
  getOnboardingState,
  listBusinessTypes,
  listBusinessUnitCapabilities,
} from '@/lib/business-structure/queries'
import { OnboardingShell } from '@/components/onboarding/onboarding-shell'
import { BranchStep } from '@/components/onboarding/branch-step'
import { BusinessUnitStep } from '@/components/onboarding/business-unit-step'
import { ConfigureStep } from '@/components/onboarding/configure-step'
import { FinishStep } from '@/components/onboarding/finish-step'
import type { WizardStep } from '@/components/onboarding/wizard-progress'

const STEPS: WizardStep[] = [
  { label: 'Branch' },
  { label: 'Business unit' },
  { label: 'Configure' },
  { label: 'Finish' },
]

/**
 * The onboarding wizard's single entry point — every step redirects back
 * here (app/(onboarding)/onboarding/actions.ts), and this page re-derives
 * which step to show from the Organization's actual current state
 * (lib/business-structure/queries.ts's getOnboardingState()), rather than
 * trusting any client-side "current step" — this is what makes closing the
 * tab mid-wizard and reopening /onboarding resume correctly (docs/milestones/
 * 05-business-structure-and-onboarding.md Implementation Notes).
 */
export default async function OnboardingPage() {
  const state = await getOnboardingState()

  if (!state.organizationId) {
    redirect('/sign-in')
  }
  if (state.onboardingCompletedAt) {
    redirect('/dashboard')
  }

  if (!state.branch) {
    return (
      <OnboardingShell
        title="Create your first branch"
        description="A branch is a physical location — a store, outlet, or warehouse."
        steps={STEPS}
        currentStepIndex={0}
      >
        <BranchStep organizationId={state.organizationId} />
      </OnboardingShell>
    )
  }

  if (!state.businessUnit) {
    const businessTypes = await listBusinessTypes()
    return (
      <OnboardingShell
        title="Set up your business unit"
        description="A business unit is what you actually sell through — its type sets sensible defaults."
        steps={STEPS}
        currentStepIndex={1}
      >
        <BusinessUnitStep
          organizationId={state.organizationId}
          branchId={state.branch.id}
          businessTypes={businessTypes}
        />
      </OnboardingShell>
    )
  }

  if (!state.hasPosConfig) {
    const capabilities = await listBusinessUnitCapabilities(state.businessUnit.id)
    return (
      <OnboardingShell
        title="Configure your business unit"
        description="Review capabilities and set up tax, service charge, and discount policy."
        steps={STEPS}
        currentStepIndex={2}
      >
        <ConfigureStep
          organizationId={state.organizationId}
          branchId={state.branch.id}
          businessUnitId={state.businessUnit.id}
          capabilities={capabilities}
        />
      </OnboardingShell>
    )
  }

  return (
    <OnboardingShell title="You're all set" steps={STEPS} currentStepIndex={3}>
      <FinishStep
        organizationId={state.organizationId}
        branchName={state.branch.name}
        businessUnitName={state.businessUnit.name}
      />
    </OnboardingShell>
  )
}
