'use client'

import { useActionState } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  createOrganizationStepAction,
  type OnboardingActionState,
} from '@/app/(onboarding)/onboarding/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoHint } from '@/components/ui/field-hint'
import { FORM_HINTS } from '@/lib/form-hints'

const initialState: OnboardingActionState = { error: null }

/**
 * The onboarding wizard's recovery step, per app/(onboarding)/onboarding/page.tsx's
 * ORG_STEPS branch — reached only by a signed-in user with no organization
 * yet (a stranded pre-fix account, or a sign-up whose chosen name collided
 * with an existing one). No organizationId hidden field, unlike every other
 * step's form: there isn't one yet, that's the point of this step.
 */
export function OrganizationStep() {
  const [state, formAction, pending] = useActionState(createOrganizationStepAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="destructive" role="alert">
          <TriangleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">
          Organization name
          <InfoHint text={FORM_HINTS.onboarding.organizationName} />
        </Label>
        <Input id="name" name="name" placeholder="Acme Retail" autoFocus required />
      </div>

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? 'Creating…' : 'Continue'}
      </Button>
    </form>
  )
}
