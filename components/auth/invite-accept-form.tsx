'use client'

import { useActionState, useState } from 'react'
import { TriangleAlert } from 'lucide-react'

import { acceptInvitationAction, type InviteActionState } from '@/app/(auth)/invite/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: InviteActionState = { error: null }

export function InviteAcceptForm({ token, email }: { token: string; email: string }) {
  const [state, formAction, pending] = useActionState(acceptInvitationAction, initialState)
  // "I already have an account" toggle: an invitee who was previously
  // invited to a different organization already has a Supabase Auth
  // identity under this email, and signUp() would reject a second one.
  const [hasAccount, setHasAccount] = useState(false)

  if (state.needsConfirmation) {
    return (
      <Alert>
        <AlertDescription>
          Check {email} for a confirmation link, then come back to this page and use &ldquo;I
          already have an account&rdquo; below to finish accepting.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="hasAccount" value={String(hasAccount)} />

      {state.error && (
        <Alert variant="destructive" role="alert">
          <TriangleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {!hasAccount && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-full-name">Full name</Label>
          <Input id="invite-full-name" name="fullName" required autoComplete="name" />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-password">Password</Label>
        <Input
          id="invite-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={hasAccount ? 'current-password' : 'new-password'}
        />
      </div>

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? 'Working…' : hasAccount ? 'Sign in and accept' : 'Create account and accept'}
      </Button>

      <button
        type="button"
        className="text-center text-body-sm text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => setHasAccount((value) => !value)}
      >
        {hasAccount ? "I don't have an account yet" : 'I already have an account'}
      </button>
    </form>
  )
}
