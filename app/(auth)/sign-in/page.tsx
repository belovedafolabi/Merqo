'use client'

import { Suspense, useActionState } from 'react'
import Link from 'next/link'

import { signIn, type AuthActionState } from '@/app/(auth)/actions'
import { AuthCard } from '@/components/auth/auth-card'
import { AuthReasonAlert } from '@/components/auth/auth-reason-alert'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { usePendingToast } from '@/hooks/use-pending-toast'

const initialState: AuthActionState = { error: null }

export default function SignInPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState)
  usePendingToast(pending, 'Signing you in…')

  return (
    <AuthCard
      title="Sign in"
      // Plain `string | null` — AuthCard's `{error && …}` guard only renders
      // the alert when there is a real message. The `?reason=` notice is a
      // separate child below (AuthReasonAlert), which returns null when absent.
      error={state.error}
      footer={
        <div className="flex justify-between">
          <Link href="/sign-up" className="underline underline-offset-4">
            Create an organization
          </Link>
          <Link href="/forgot-password" className="underline underline-offset-4">
            Forgot password?
          </Link>
        </div>
      }
    >
      <Suspense fallback={null}>
        <AuthReasonAlert />
      </Suspense>

      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  )
}
