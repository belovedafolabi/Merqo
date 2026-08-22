'use client'

import { useActionState } from 'react'
import Link from 'next/link'

import { signIn, type AuthActionState } from '@/app/(auth)/actions'

const initialState: AuthActionState = { error: null }

export default function SignInPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState)

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" required className="rounded border px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input name="password" type="password" required className="rounded border px-3 py-2" />
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
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="flex justify-between text-sm text-muted-foreground">
        <Link href="/sign-up" className="underline underline-offset-4">
          Create an organization
        </Link>
        <Link href="/forgot-password" className="underline underline-offset-4">
          Forgot password?
        </Link>
      </div>
    </main>
  )
}
