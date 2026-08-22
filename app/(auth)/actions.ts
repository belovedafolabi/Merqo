'use server'

import { redirect } from 'next/navigation'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { recordAuditEvent } from '@/lib/auth/audit'
import { isLoginThrottled, recordLoginAttempt } from '@/lib/auth/login-throttle'
import { getRequestMeta } from '@/lib/auth/request-context'
import { logger } from '@/lib/logger'

export interface AuthActionState {
  error: string | null
}

function slugifyOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })

  if (signUpError) {
    return { error: signUpError.message }
  }

  // Local/CI config disables email confirmation (supabase/config.toml
  // [auth.email] enable_confirmations = false), so signUp() already returns
  // a live session. A hosted deployment with confirmations enabled would
  // not — that user completes bootstrap on their first sign-in instead.
  if (!signUpData.session) {
    return {
      error: null,
    }
  }

  const { error: bootstrapError } = await supabase.rpc('create_organization_with_owner', {
    p_organization_name: organizationName,
    p_organization_slug: slugifyOrganizationName(organizationName),
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

  return { error: null }
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
