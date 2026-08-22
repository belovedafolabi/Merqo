'use client'

import { useActionState } from 'react'
import Link from 'next/link'

import { requestPasswordReset, type AuthActionState } from '@/app/(auth)/actions'
import { AuthCard } from '@/components/auth/auth-card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const initialState: AuthActionState = { error: null }

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState)

  return (
    <AuthCard
      title="Reset your password"
      error={state.error}
      footer={
        <div className="flex flex-col gap-2">
          <span>If an account exists for that email, a reset link has been sent.</span>
          <Link href="/sign-in" className="underline underline-offset-4">
            Back to sign in
          </Link>
        </div>
      }
    >
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthCard>
  )
}
