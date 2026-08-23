'use client'

import { useActionState } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  configureStepAction,
  type OnboardingActionState,
} from '@/app/(onboarding)/onboarding/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { CapabilityToggleList } from '@/components/business-structure/capability-toggle-list'
import { PosConfigForm } from '@/components/business-structure/pos-config-form'
import type { CapabilityRow } from '@/lib/business-structure/queries'

const initialState: OnboardingActionState = { error: null }

/** Capability review + POS configuration, one combined step — see configureStepAction's own doc for why. */
export function ConfigureStep({
  organizationId,
  branchId,
  businessUnitId,
  capabilities,
}: {
  organizationId: string
  branchId: string
  businessUnitId: string
  capabilities: CapabilityRow[]
}) {
  const [state, formAction, pending] = useActionState(configureStepAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="businessUnitId" value={businessUnitId} />

      {state.error && (
        <Alert variant="destructive" role="alert">
          <TriangleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        <p className="font-medium">Capabilities</p>
        <p className="text-sm text-muted-foreground">
          Pre-filled from your business type. Toggle any of these before continuing.
        </p>
        <CapabilityToggleList capabilities={capabilities} />
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <p className="font-medium">POS configuration</p>
        <PosConfigForm />
      </div>

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? 'Saving…' : 'Continue'}
      </Button>
    </form>
  )
}
