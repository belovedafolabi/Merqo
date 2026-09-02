'use client'

import { useActionState } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  createBusinessUnitStepAction,
  type OnboardingActionState,
} from '@/app/(onboarding)/onboarding/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BusinessTypePicker } from '@/components/business-structure/business-type-picker'
import type { BusinessType } from '@/lib/business-structure/queries'
import { InfoHint } from '@/components/ui/field-hint'
import { FORM_HINTS } from '@/lib/form-hints'

const initialState: OnboardingActionState = { error: null }

export function BusinessUnitStep({
  organizationId,
  branchId,
  businessTypes,
}: {
  organizationId: string
  branchId: string
  businessTypes: BusinessType[]
}) {
  const [state, formAction, pending] = useActionState(createBusinessUnitStepAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="branchId" value={branchId} />

      {state.error && (
        <Alert variant="destructive" role="alert">
          <TriangleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>
          Business type
          <InfoHint text={FORM_HINTS.onboarding.businessType} />
        </Label>
        <BusinessTypePicker businessTypes={businessTypes} name="businessTypeId" />
        <p className="text-sm text-muted-foreground">
          Pre-fills sensible defaults (products, inventory, etc.) — you can override any of them
          next.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">
          Business unit name
          <InfoHint text={FORM_HINTS.onboarding.businessUnitName} />
        </Label>
        <Input id="name" name="name" placeholder="Main Store" required />
      </div>

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? 'Creating business unit…' : 'Continue'}
      </Button>
    </form>
  )
}
