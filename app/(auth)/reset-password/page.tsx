'use client'

import { useActionState } from 'react'

import { confirmPasswordReset, type AuthActionState } from '@/app/(auth)/actions'

const initialState: AuthActionState = { error: null }

/**
 * Reached only via the recovery session app/auth/confirm/route.ts
 * establishes from the password-reset email link — confirmPasswordReset()
 * rejects if there's no authenticated (recovery) session.
 */
export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(confirmPasswordReset, initialState)

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          New password
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
          {pending ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </main>
  )
}
