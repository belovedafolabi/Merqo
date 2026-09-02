'use client'

import { useActionState } from 'react'
import Link from 'next/link'

import { signUp, type AuthActionState } from '@/app/(auth)/actions'
import { AuthCard } from '@/components/auth/auth-card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { usePendingToast } from '@/hooks/use-pending-toast'

const initialState: AuthActionState = { error: null }

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState)
  usePendingToast(pending, 'Creating your organization…')

  return (
    <AuthCard
      title="Create your organization"
      error={state.error}
      notice={state.notice}
      footer={
        <>
          Already have an account?{' '}
          <Link href="/sign-in" className="underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="organizationName">Organization name</Label>
          <Input id="organizationName" name="organizationName" type="text" required />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="fullName">Your full name</Label>
          <Input id="fullName" name="fullName" type="text" autoComplete="name" required />
        </div>

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
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>

        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  )
}
