'use client'

import { useActionState, useState, useTransition } from 'react'
import { Check, TriangleAlert } from 'lucide-react'

import {
  changePassword,
  signOutEverywhere,
  signOutOtherSessions,
  type AuthActionState,
} from '@/app/(auth)/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: AuthActionState = { error: null }

/** Shared settle feedback — the same shape the notification preferences rows use. */
function ActionFeedback({ state }: { state: AuthActionState }) {
  if (state.error) {
    return (
      <Alert variant="destructive" role="alert">
        <TriangleAlert />
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    )
  }
  if (state !== initialState && state.notice) {
    return (
      <Alert>
        <Check />
        <AlertDescription>{state.notice}</AlertDescription>
      </Alert>
    )
  }
  return null
}

function ChangePasswordCard({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(changePassword, initialState)

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Changing your password signs you out of every other device. You stay signed in here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {/* Present but hidden: password managers need a username field beside
              the password fields to associate the saved credential correctly. */}
          <input type="hidden" name="email" value={email} autoComplete="username" readOnly />

          <div className="flex flex-col gap-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          <ActionFeedback state={state} />

          <Button type="submit" disabled={pending} className="self-start">
            {pending ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function SessionsCard() {
  // useTransition rather than useActionState: this action takes no input, so a
  // <form>/FormData round trip would be ceremony around a button. Same shape as
  // the POS returns screen's direct action calls.
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<AuthActionState>(initialState)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function revokeOthers() {
    startTransition(async () => {
      setState(await signOutOtherSessions())
    })
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Signed-in devices</CardTitle>
        <CardDescription>
          Sessions end on their own after a period of inactivity, but you can revoke them now — for
          a lost phone, or a till you forgot to sign out of.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <ActionFeedback state={state} />
          <Button
            variant="outline"
            disabled={pending}
            onClick={revokeOthers}
            className="self-start"
          >
            {pending ? 'Signing out…' : 'Sign out of all other devices'}
          </Button>
        </div>

        <div className="border-t pt-4">
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Sign out everywhere, including this device
          </Button>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign out everywhere?</DialogTitle>
              <DialogDescription>
                Every device is signed out, including this one. You will need to sign in again to
                continue.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              {/* A plain form: signOutEverywhere() redirects, so there is no
                  settled state for useActionState to render afterwards. */}
              <form action={signOutEverywhere}>
                <Button type="submit" variant="destructive">
                  Sign out everywhere
                </Button>
              </form>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

/**
 * Milestone 17 Part C's account screen: change your password, and revoke your
 * other sessions. Deliberately not a per-device list with individual revoke —
 * that needs a session registry (auth.admin.listUserSessions via the service
 * role) and is noted as future work; `scope: 'others'` is the v1 blunt
 * instrument.
 */
export function AccountSecurityForm({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-6">
      <ChangePasswordCard email={email} />
      <SessionsCard />
    </div>
  )
}
