'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { recordAuditEvent, recordUnauthenticatedAuditEvent } from '@/lib/auth/audit'
import {
  SESSION_COOKIES,
  absoluteCapMs,
  type SessionPolicy,
} from '@/lib/auth/session-policy'
import { isLoginThrottled, recordLoginAttempt } from '@/lib/auth/login-throttle'
import { getRequestMeta } from '@/lib/auth/request-context'
import { ensureOrganizationBootstrapped } from '@/lib/organization/mutations'
import { consumeRateLimit } from '@/lib/rate-limit/limiter'
import { getSubscriptionAccessState } from '@/lib/subscription/queries'
import { logger } from '@/lib/logger'
import { slugify } from '@/lib/utils'

export interface AuthActionState {
  error: string | null
  /** A non-error message to show alongside (or instead of) `error` — e.g.
   *  "check your email" after a sign-up that returned no session. */
  notice?: string | null
}

/**
 * Milestone 17 Part C. Stamps the session-policy cookies proxy.ts enforces on
 * every subsequent request. Written here rather than in proxy.ts because this
 * is the only place that knows what the user actually ticked — proxy.ts sees a
 * request, not a choice.
 *
 * `httpOnly` so page JS cannot rewrite `merqo_last_seen` to extend a session.
 * No `maxAge` for `short`: that is what makes the browser drop the cookies on
 * restart, delivering "signed out when you close the browser".
 */
async function startSessionPolicy(policy: SessionPolicy): Promise<void> {
  const store = await cookies()
  const now = String(Date.now())
  const options = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(policy === 'long' ? { maxAge: Math.floor(absoluteCapMs(policy) / 1000) } : {}),
  } as const

  store.set(SESSION_COOKIES.policy, policy, options)
  store.set(SESSION_COOKIES.start, now, options)
  store.set(SESSION_COOKIES.lastSeen, now, options)
}

/** Drops the policy cookies so the next sign-in starts a clean window. */
async function clearSessionPolicy(): Promise<void> {
  const store = await cookies()
  for (const name of Object.values(SESSION_COOKIES)) {
    store.delete(name)
  }
}

/**
 * Sign-up: creates the Supabase Auth identity, then bootstraps the new
 * Organization + Owner role assignment via create_organization_with_owner()
 * (supabase/migrations/20260822093600_create_organization_bootstrap_function.sql)
 * — this is what satisfies the Functional Requirement "On first Organization
 * signup, an Owner/Admin user and role are created automatically."
 */
export async function signUp(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('fullName') ?? '').trim()
  const organizationName = String(formData.get('organizationName') ?? '').trim()

  if (!email || !password || !fullName || !organizationName) {
    return { error: 'All fields are required.' }
  }

  const supabase = await createServerSupabaseClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // organization_name rides along in user_metadata (not just full_name)
      // because the branch below can leave sign-up without ever calling
      // create_organization_with_owner() — this is what lets
      // ensureOrganizationBootstrapped() (lib/organization/mutations.ts)
      // finish the job later, at first sign-in or at /auth/confirm, with
      // the name the user actually typed rather than losing it.
      data: { full_name: fullName, organization_name: organizationName },
      emailRedirectTo: `${appUrl}/auth/confirm?type=signup`,
    },
  })

  if (signUpError) {
    return { error: signUpError.message }
  }

  // Local/CI config disables email confirmation (supabase/config.toml
  // [auth.email] enable_confirmations = false), so signUp() already returns
  // a live session and bootstrap can happen inline below. A hosted
  // deployment with confirmations enabled returns no session here — the
  // organization gets created once a session actually exists, either via
  // app/auth/confirm/route.ts (the confirmation-email link) or, as the
  // load-bearing fallback, ensureOrganizationBootstrapped() inside signIn()
  // below.
  if (!signUpData.session) {
    return {
      error: null,
      notice: `Check ${email} for a confirmation link to finish creating your organization.`,
    }
  }

  const { error: bootstrapError } = await supabase.rpc('create_organization_with_owner', {
    p_organization_name: organizationName,
    p_organization_slug: slugify(organizationName),
    p_full_name: fullName,
  })

  if (bootstrapError) {
    logger.error('auth.organization_bootstrap_failed', {
      userId: signUpData.user?.id,
      error: bootstrapError.message,
    })
    return { error: 'Could not create your organization. Please contact support.' }
  }

  redirect('/dashboard')
}

/**
 * Sign-in: throttle check -> Supabase Auth -> record the attempt -> audit
 * event. Every branch below records both the login_attempts row (for
 * throttling) and an audit_logs row (for the compliance trail) — the two
 * are deliberately separate (docs/milestones/03-authentication-and-rbac-foundation.md
 * Observability: "structured logging of authentication events... distinct
 * from the audit log").
 */
export async function signIn(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  // Unticked is the safe default: a shared till or a borrowed phone gets the
  // short, browser-lifetime session unless the user deliberately opts out.
  const policy: SessionPolicy = formData.get('remember') ? 'long' : 'short'

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const identifier = email.toLowerCase()
  const supabase = await createServerSupabaseClient()
  const { ipAddress, userAgent } = await getRequestMeta()

  const throttled = await isLoginThrottled(supabase, identifier)
  if (throttled) {
    logger.warn('auth.sign_in_throttled', { identifier })
    return { error: 'Too many failed attempts. Please try again in a few minutes.' }
  }

  // Sits beside the per-identifier throttle above, and catches what that one
  // structurally cannot see: password spraying, where a single source tries
  // one common password against many different accounts. No individual
  // identifier ever accumulates enough failures to trip check_login_throttle,
  // so only a per-source limit stops it (Milestone 15 Acceptance Criteria:
  // "Rate limiting is in place on login, webhook, and checkout endpoints").
  //
  // Same message as the throttle above on purpose — telling an attacker
  // which of the two limits they hit tells them how the defence is shaped.
  if (!(await consumeRateLimit(supabase, 'login', ipAddress))) {
    return { error: 'Too many failed attempts. Please try again in a few minutes.' }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  await recordLoginAttempt(supabase, identifier, ipAddress, !error)

  if (error) {
    // One of only two sessionless audit writes in the app (the other is the
    // rejected-webhook path), and therefore one of the only two reasons
    // `anon` needs any audit RPC at all. Uses the narrowed
    // record_unauthenticated_audit_event() rather than the general helper —
    // see lib/auth/audit.ts and Milestone 15's finding 1.
    await recordUnauthenticatedAuditEvent(
      { action: 'auth.sign_in_failed', identifier, ipAddress, userAgent },
      supabase,
    )
    return { error: 'Invalid email or password.' }
  }

  await recordAuditEvent(
    {
      organizationId: null,
      userId: data.user.id,
      action: 'auth.sign_in',
      resourceType: 'user',
      resourceId: data.user.id,
    },
    supabase,
  )

  // Stamped here, on the one path that knows what the user ticked. The
  // subscription-blocked branch below signs out again and leaves these behind
  // for an anonymous visitor — harmless, since proxy.ts only reads them when a
  // user is present, and the next successful sign-in overwrites all three.
  await startSessionPolicy(policy)

  // The load-bearing half of organization bootstrap (see the comment in
  // signUp() above): a hosted deployment's sign-up returns no session, so
  // this is the first point a session reliably exists to finish the job
  // create_organization_with_owner() started. A no-op for every user who
  // already has one (ensureOrganizationBootstrapped()'s own pre-check).
  const bootstrapOutcome = await ensureOrganizationBootstrapped(supabase, data.user)
  if (bootstrapOutcome === 'failed') {
    return { error: 'Could not finish setting up your organization. Please contact support.' }
  }

  // Milestone 13's subscription lock, PRD §38: "login is disabled for the
  // organization's users ... directing the Owner to renew." The real
  // boundary is organization_access_permitted() (20260825100500) — this is
  // the explicit-message layer, mirroring the throttle check above.
  const accessState = await getSubscriptionAccessState()
  if (accessState?.locked) {
    if (!accessState.canRenew) {
      // Genuinely disabled: sign out and bounce to /sign-in with a reason,
      // same shape as the deactivation redirect proxy.ts issues.
      //
      // The audit write deliberately comes BEFORE signOut(), not after.
      // Recording it afterwards meant this ran with no session, which is the
      // only reason it needed record_audit_event()'s anon grant — the grant
      // Milestone 15's finding 1 revoked. Auditing first is also simply
      // better evidence: the row keeps the real organizationId and userId
      // that a post-signOut call could only pass in as unverified arguments.
      await recordAuditEvent(
        {
          organizationId: accessState.organizationId,
          userId: data.user.id,
          action: 'auth.sign_in_blocked_subscription',
          resourceType: 'user',
          resourceId: data.user.id,
        },
        supabase,
      )
      await supabase.auth.signOut()
      redirect('/sign-in?reason=subscription_expired')
    }

    // Permitted but quarantined: the Owner keeps a session (they need one to
    // pay) and lands on the locked screen instead of the dashboard.
    redirect('/subscription-locked')
  }

  redirect('/dashboard')
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    await recordAuditEvent(
      {
        organizationId: null,
        userId: user.id,
        action: 'auth.sign_out',
        resourceType: 'user',
        resourceId: user.id,
      },
      supabase,
    )
  }

  await supabase.auth.signOut()
  await clearSessionPolicy()
  redirect('/sign-in')
}

export async function requestPasswordReset(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { error: 'Email is required.' }

  const supabase = await createServerSupabaseClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { ipAddress } = await getRequestMeta()

  // Tighter than the sign-in bucket because every call here sends an email:
  // unthrottled, this is a free way to bomb somebody's inbox and to burn the
  // deployment's Resend quota at the same time.
  //
  // On trip we return the SAME notice as the success path and simply skip
  // sending. Returning a distinct "rate limited" message would hand an
  // attacker the account-existence oracle the generic notice below exists to
  // deny — the limit must not become the side channel.
  const withinLimit = await consumeRateLimit(supabase, 'login_reset', ipAddress)

  if (withinLimit) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/confirm?type=recovery`,
    })

    // Never reveal whether the email exists — the response is identical
    // either way, only the outcome (an email sent, or nothing) differs.
    if (error) {
      logger.warn('auth.password_reset_request_failed', { error: error.message })
    }
  }

  return { error: null, notice: 'If an account exists for that email, a reset link is on its way.' }
}

/**
 * Only valid inside the recovery session app/auth/confirm/route.ts
 * establishes after the user clicks the reset-password email link.
 */
export async function confirmPasswordReset(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get('password') ?? '')
  if (!password) return { error: 'A new password is required.' }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'This password reset link has expired. Please request a new one.' }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  await recordAuditEvent(
    {
      organizationId: null,
      userId: user.id,
      action: 'auth.password_reset',
      resourceType: 'user',
      resourceId: user.id,
    },
    supabase,
  )

  await revokeOtherSessions(supabase, user.id, 'password_reset')
  await startSessionPolicy('short')

  redirect('/dashboard')
}

/**
 * Milestone 17 Part C. A password change has to invalidate every other device
 * server-side, not merely clear a cookie: the whole point is that a refresh
 * token already copied onto somebody else's machine stops working. `scope:
 * 'others'` revokes every session but the caller's, so the person doing the
 * change is not signed out of the tab they are standing in.
 */
async function revokeOtherSessions(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  trigger: 'password_reset' | 'password_change' | 'manual',
): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'others' })
  if (error) {
    logger.warn('auth.revoke_other_sessions_failed', { userId, trigger, error: error.message })
    return
  }

  await recordAuditEvent(
    {
      organizationId: null,
      userId,
      action:
        trigger === 'manual'
          ? 'auth.sessions_revoked_manual'
          : 'auth.sessions_revoked_password_change',
      resourceType: 'user',
      resourceId: userId,
      metadata: { trigger },
    },
    supabase,
  )
}

/**
 * Self-service password change from Settings → Account. Distinct from
 * confirmPasswordReset(), which only runs inside the recovery session the
 * emailed link establishes.
 *
 * The current password is verified by re-running signInWithPassword rather than
 * trusted from the session: without it, anyone who walks up to an unlocked
 * screen can change the password and lock the real owner out.
 */
export async function changePassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const currentPassword = String(formData.get('currentPassword') ?? '')
  const newPassword = String(formData.get('newPassword') ?? '')

  if (!currentPassword || !newPassword) {
    return { error: 'Both your current and new password are required.' }
  }
  if (currentPassword === newPassword) {
    return { error: 'Your new password must be different from your current one.' }
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return { error: 'You need to be signed in to change your password.' }
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (reauthError) {
    return { error: 'That current password is not correct.' }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }

  await recordAuditEvent(
    {
      organizationId: null,
      userId: user.id,
      action: 'auth.password_changed',
      resourceType: 'user',
      resourceId: user.id,
    },
    supabase,
  )

  await revokeOtherSessions(supabase, user.id, 'password_change')

  return {
    error: null,
    notice: 'Password updated. Every other device has been signed out.',
  }
}

/**
 * "Sign out of all other devices" — keeps the current one. The blunt v1 of
 * session management: no per-device list, no individual revoke (both noted as
 * future work in the milestone doc).
 */
export async function signOutOtherSessions(): Promise<AuthActionState> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'You need to be signed in to do that.' }

  await revokeOtherSessions(supabase, user.id, 'manual')
  return { error: null, notice: 'Signed out of every other device.' }
}

/** "…including this device": a global revoke, then straight to sign-in. */
export async function signOutEverywhere(): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    await recordAuditEvent(
      {
        organizationId: null,
        userId: user.id,
        action: 'auth.sessions_revoked_manual',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { trigger: 'manual', scope: 'global' },
      },
      supabase,
    )
  }

  await supabase.auth.signOut({ scope: 'global' })
  await clearSessionPolicy()
  redirect('/sign-in')
}
