'use client'

import { useActionState } from 'react'
import { TriangleAlert } from 'lucide-react'

import {
  createBranchStepAction,
  type OnboardingActionState,
} from '@/app/(onboarding)/onboarding/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: OnboardingActionState = { error: null }

export function BranchStep({ organizationId }: { organizationId: string }) {
  const [state, formAction, pending] = useActionState(createBranchStepAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />

      {state.error && (
        <Alert variant="destructive" role="alert">
          <TriangleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Branch name</Label>
        <Input id="name" name="name" placeholder="Main Branch" autoFocus required />
        <p className="text-sm text-muted-foreground">
          Your first physical location. You can add more branches later from Business Structure.
        </p>
      </div>

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? 'Creating branch…' : 'Continue'}
      </Button>
    </form>
  )
}
