'use server'

import { redirect } from 'next/navigation'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { recordAuditEvent } from '@/lib/auth/audit'
import { isLoginThrottled, recordLoginAttempt } from '@/lib/auth/login-throttle'
import { getRequestMeta } from '@/lib/auth/request-context'
import { ensureOrganizationBootstrapped } from '@/lib/organization/mutations'
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

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const identifier = email.toLowerCase()
  const supabase = await createServerSupabaseClient()
  const { ipAddress } = await getRequestMeta()

  const throttled = await isLoginThrottled(supabase, identifier)
  if (throttled) {
    logger.warn('auth.sign_in_throttled', { identifier })
    return { error: 'Too many failed attempts. Please try again in a few minutes.' }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  await recordLoginAttempt(supabase, identifier, ipAddress, !error)

  if (error) {
    await recordAuditEvent(
      {
        organizationId: null,
        userId: null,
        action: 'auth.sign_in_failed',
        resourceType: 'user',
        metadata: { identifier },
      },
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
      await supabase.auth.signOut()
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

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/confirm?type=recovery`,
  })

  // Never reveal whether the email exists — the response is identical
  // either way, only the outcome (an email sent, or nothing) differs.
  if (error) {
    logger.warn('auth.password_reset_request_failed', { error: error.message })
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

  redirect('/dashboard')
}
