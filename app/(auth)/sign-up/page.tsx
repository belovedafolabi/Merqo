'use client'

import { useActionState } from 'react'
import Link from 'next/link'

import { signUp, type AuthActionState } from '@/app/(auth)/actions'

const initialState: AuthActionState = { error: null }

/**
 * Minimal, unstyled-beyond-Milestone-01 sign-up screen — functionally
 * complete now, visual polish arrives with Milestone 04's design system
 * (see docs/milestones/03-authentication-and-rbac-foundation.md Frontend
 * Changes).
 */
export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState)

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Create your organization</h1>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Organization name
          <input
            name="organizationName"
            type="text"
            required
            className="rounded border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Your full name
          <input name="fullName" type="text" required className="rounded border px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" required className="rounded border px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={6}
            className="rounded border px-3 py-2"
          />
        </label>

        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/sign-in" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  )
}
