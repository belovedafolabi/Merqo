'use client'

import { Suspense, useActionState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { signIn, type AuthActionState } from '@/app/(auth)/actions'
import { AuthCard } from '@/components/auth/auth-card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const initialState: AuthActionState = { error: null }

/** proxy.ts's Milestone 11 deactivation redirect — see that file's Security
 *  Requirement comment for why this exists rather than a silently empty app. */
const DEACTIVATED_MESSAGE = 'Your account has been deactivated. Contact your administrator.'

/**
 * Reads `?reason=deactivated` (set by proxy.ts on a signed-out deactivation
 * redirect). Split out from the page so useSearchParams()'s Suspense
 * requirement doesn't force the whole form — including useActionState's
 * submit affordance — behind a loading fallback for what is, on every normal
 * visit, a one-tick synchronous read.
 */
function DeactivationNotice() {
  const searchParams = useSearchParams()
  if (searchParams.get('reason') !== 'deactivated') return null
  return DEACTIVATED_MESSAGE
}

export default function SignInPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState)

  return (
    <AuthCard
      title="Sign in"
      error={
        state.error ?? (
          <Suspense fallback={null}>
            <DeactivationNotice />
          </Suspense>
        )
      }
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
