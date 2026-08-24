'use server'

import { redirect } from 'next/navigation'

import { recordAuditEvent } from '@/lib/auth/audit'
import { hashInvitationToken } from '@/lib/employees/invitations'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface InviteActionState {
  error: string | null
  /** Set when signUp() succeeded but returned no live session (a hosted
   *  deployment with email confirmation enabled — see the comment below). */
  needsConfirmation?: boolean
}

/**
 * accept_employee_invitation()'s stable machine-readable error tokens
 * (20260824090500), mapped to copy a person should read. Matching on the
 * token rather than the raw Postgres message keeps this mapping stable if
 * the SQL wording ever changes.
 */
const ERROR_COPY: Record<string, string> = {
  invalid_invitation: 'This invitation link is invalid.',
  invitation_revoked: 'This invitation has been revoked.',
  invitation_already_accepted: 'This invitation has already been accepted.',
  invitation_expired: 'This invitation has expired.',
  invitation_email_mismatch: 'This invitation was sent to a different email address than the one you signed in with.',
}

function friendlyError(message: string): string {
  const token = Object.keys(ERROR_COPY).find((key) => message.includes(key))
  return (token && ERROR_COPY[token]) || 'Something went wrong. Please try again.'
}

/**
 * signUp-or-signIn as the invited email, then redeem the invitation.
 * accept_employee_invitation() itself carries the real authorization
 * decision (it validates the token, checks expiry/single-use, and requires
 * the caller's email match the invitation) — this action's job is only to
 * get the invitee a session under the right identity and then call it.
 */
export async function acceptInvitationAction(
  _prevState: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const token = String(formData.get('token') ?? '')
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('fullName') ?? '').trim()
  const hasAccount = formData.get('hasAccount') === 'true'

  if (!token || !email || !password) {
    return { error: 'All fields are required.' }
  }

  const supabase = await createServerSupabaseClient()

  if (hasAccount) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: 'Incorrect password.' }
  } else {
    if (!fullName) return { error: 'Your name is required.' }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })

    if (error) {
      // A common real-world path: the invitee already has an account (e.g.
      // from a previous invitation to a different organization) but chose
      // "create an account" instead of "I already have an account". Rather
      // than a dead-end error, tell them what to do next.
      if (error.message.toLowerCase().includes('already registered')) {
        return { error: 'An account already exists for this email. Use "I already have an account" below.' }
      }
      return { error: error.message }
    }

    // Local/CI config disables email confirmation (supabase/config.toml),
    // so signUp() returns a live session immediately in every environment
    // this milestone's tests run against. A hosted deployment with
    // confirmations enabled would not — the invitee has to confirm their
    // email first, then return to this same link and use "I already have an
    // account" to finish. The invitation itself does not expire from this
    // detour (still governed by its own 7-day TTL), so there is no dead end,
    // only an extra step.
    if (!data.session) {
      return { error: null, needsConfirmation: true }
    }
  }

  const { data: userRoleId, error: acceptError } = await supabase.rpc('accept_employee_invitation', {
    p_token_hash: hashInvitationToken(token),
  })

  if (acceptError) {
    return { error: friendlyError(acceptError.message) }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    await recordAuditEvent(
      {
        organizationId: null,
        userId: user.id,
        action: 'auth.sign_in',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { via: 'invitation', userRoleId },
      },
      supabase,
    )
  }

  redirect('/dashboard')
}
