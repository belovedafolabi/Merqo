'use client'

import { useActionState } from 'react'

import { confirmPasswordReset, type AuthActionState } from '@/app/(auth)/actions'
import { AuthCard } from '@/components/auth/auth-card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const initialState: AuthActionState = { error: null }

/**
 * Reached only via the recovery session app/auth/confirm/route.ts
 * establishes from the password-reset email link — confirmPasswordReset()
 * rejects if there's no authenticated (recovery) session.
 */
export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(confirmPasswordReset, initialState)

  return (
    <AuthCard title="Choose a new password" error={state.error}>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>

        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </AuthCard>
  )
}
