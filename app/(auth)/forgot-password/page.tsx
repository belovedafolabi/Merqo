'use client'

import { useActionState } from 'react'
import Link from 'next/link'

import { requestPasswordReset, type AuthActionState } from '@/app/(auth)/actions'

const initialState: AuthActionState = { error: null }

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState)

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" required className="rounded border px-3 py-2" />
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
          {pending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="text-sm text-muted-foreground">
        If an account exists for that email, a reset link has been sent.
      </p>

      <Link href="/sign-in" className="text-sm underline underline-offset-4">
        Back to sign in
      </Link>
    </main>
  )
}
