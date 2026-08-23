'use client'

import { useActionState } from 'react'
import { CheckCircle2, TriangleAlert } from 'lucide-react'

import {
  finishOnboardingAction,
  type OnboardingActionState,
} from '@/app/(onboarding)/onboarding/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const initialState: OnboardingActionState = { error: null }

export function FinishStep({
  organizationId,
  branchName,
  businessUnitName,
}: {
  organizationId: string
  branchName: string
  businessUnitName: string
}) {
  const [state, formAction, pending] = useActionState(finishOnboardingAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />

      {state.error && (
        <Alert variant="destructive" role="alert">
          <TriangleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-6 text-center">
        <CheckCircle2 className="size-10 text-success" />
        <p className="font-medium">{businessUnitName} is ready</p>
        <p className="text-sm text-muted-foreground">
          {branchName} is configured with its business type, capabilities, and POS settings. You’re
          ready to start adding products.
        </p>
      </div>

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? 'Finishing…' : 'Start adding products'}
      </Button>
    </form>
  )
}
