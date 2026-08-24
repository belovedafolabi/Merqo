import type { SupabaseClient, User } from '@supabase/supabase-js'

import { fetchPermissionGrants } from '@/lib/auth/context'
import { recordAuditEvent } from '@/lib/auth/audit'
import { requirePermission } from '@/lib/auth/guard'
import { logger } from '@/lib/logger'
import { slugify } from '@/lib/utils'
import {
  organizationProfileInputSchema,
  type OrganizationProfileInput,
} from '@/lib/organization/schemas'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function updateOrganizationProfile(
  organizationId: string,
  rawInput: OrganizationProfileInput,
): Promise<void> {
  const input = organizationProfileInputSchema.parse(rawInput)
  const user = await requirePermission('organizations.update', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('organizations')
    .update({
      contact_phone: input.contactPhone ?? null,
      contact_email: input.contactEmail ?? null,
      address_line: input.addressLine ?? null,
    })
    .eq('id', organizationId)

  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'organization.profile_updated',
      resourceType: 'organization',
      resourceId: organizationId,
    },
    supabase,
  )
}

export type BootstrapOutcome =
  'created' | 'already_bootstrapped' | 'missing_organization_name' | 'name_taken' | 'failed'

/**
 * The one call path that actually invokes create_organization_with_owner()
 * (supabase/migrations/20260822093600_create_organization_bootstrap_function.sql).
 * Both ensureOrganizationBootstrapped() (an existing session that may or may
 * not have an organization yet) and createOrganizationForCurrentUser() (the
 * onboarding wizard's explicit "name your organization" step) flow through
 * here so the slug-collision copy is written once.
 */
async function callCreateOrganizationRpc(
  supabase: SupabaseClient,
  organizationName: string,
  fullName: string | null,
): Promise<Exclude<BootstrapOutcome, 'missing_organization_name'>> {
  const { error } = await supabase.rpc('create_organization_with_owner', {
    p_organization_name: organizationName,
    p_organization_slug: slugify(organizationName),
    p_full_name: fullName,
  })

  if (!error) return 'created'

  // create_organization_with_owner() raises this exact sentence
  // (20260822093600) when the caller already holds a user_roles row — a
  // benign race with ensureOrganizationBootstrapped()'s own pre-check, not a
  // failure worth error-logging.
  if (error.message.includes('already belongs to an organization')) {
    return 'already_bootstrapped'
  }

  // organizations_slug_key (20260822090400) is unique among non-archived
  // rows — a second organization with the same name hits this, not a bug.
  if (error.code === '23505') {
    return 'name_taken'
  }

  logger.error('auth.organization_bootstrap_failed', {
    organizationName,
    error: error.message,
  })
  return 'failed'
}

/**
 * Completes the sign-up an existing session may have left unfinished — a
 * hosted deployment with email confirmation enabled returns no session from
 * supabase.auth.signUp() (app/(auth)/actions.ts), so the organization can
 * only be created once a session actually exists: at first sign-in, or via
 * app/auth/confirm/route.ts. Deliberately idempotent (safe to call on every
 * sign-in) rather than trying to track "has bootstrap already run" as a
 * separate flag — current_user_permission_grants() already answers that.
 */
export async function ensureOrganizationBootstrapped(
  supabase: SupabaseClient,
  user: User,
): Promise<BootstrapOutcome> {
  const grants = await fetchPermissionGrants(supabase)
  if (grants.length > 0) return 'already_bootstrapped'

  const organizationName = String(user.user_metadata?.organization_name ?? '').trim()
  if (!organizationName) {
    // Expected for an account that signed up before organization_name
    // started being stored in user_metadata, and for an invited employee
    // who has a session but never accepted an invitation — not an error.
    // app/(onboarding)/onboarding/page.tsx's "name your organization" step
    // recovers both cases.
    logger.info('auth.organization_bootstrap_deferred', { userId: user.id })
    return 'missing_organization_name'
  }

  const fullName = String(user.user_metadata?.full_name ?? '').trim() || null
  return callCreateOrganizationRpc(supabase, organizationName, fullName)
}

/**
 * The onboarding wizard's "name your organization" step
 * (components/onboarding/organization-step.tsx) — the explicit,
 * user-supplied counterpart to ensureOrganizationBootstrapped()'s metadata
 * read, for a user metadata can't help (organization_name missing or
 * already taken by another organization).
 */
export async function createOrganizationForCurrentUser(
  name: string,
): Promise<Exclude<BootstrapOutcome, 'missing_organization_name'>> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to create an organization.')

  const organizationName = name.trim()
  if (!organizationName) throw new Error('Organization name is required.')

  const fullName = String(user.user_metadata?.full_name ?? '').trim() || null
  const outcome = await callCreateOrganizationRpc(supabase, organizationName, fullName)

  if (outcome === 'name_taken') {
    throw new Error('That organization name is already taken. Please choose another.')
  }
  if (outcome === 'failed') {
    throw new Error('Could not create your organization. Please contact support.')
  }
  return outcome
}
