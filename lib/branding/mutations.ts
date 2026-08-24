import { recordAuditEvent } from '@/lib/auth/audit'
import { requirePermission } from '@/lib/auth/guard'
import {
  LOGO_MAX_BYTES,
  LOGO_MIME_TYPES,
  brandingSettingsSchema,
  sniffLogoMimeType,
  type BrandingSettingsInput,
  type LogoMimeType,
} from '@/lib/branding/schemas'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * The write path Milestone 04 deferred ("branding's write path — an editing
 * UI — is Milestone 11's scope"). Same requirePermission() -> mutate ->
 * recordAuditEvent() shape as every domain since Milestone 06; RLS
 * (organizations_update, 20260822093700, and the organization-assets bucket
 * policies, 20260824091100) is the real boundary.
 */

const BUCKET = 'organization-assets'

const EXTENSION_BY_MIME: Record<LogoMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function updateBranding(
  organizationId: string,
  rawInput: BrandingSettingsInput,
): Promise<void> {
  const input = brandingSettingsSchema.parse(rawInput)
  const user = await requirePermission('organizations.update', { organizationId })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('organizations')
    .update({
      brand_name: input.brandName ?? null,
      primary_color: input.primaryColor,
      secondary_color: input.secondaryColor,
    })
    .eq('id', organizationId)

  if (error) throw error

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'organization.branding_updated',
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: { brandName: input.brandName ?? null },
    },
    supabase,
  )
}

/** The path segment stored logo_url values live under, per
 *  20260824091100's convention — needed to delete the previous object when a
 *  new one is uploaded. */
function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`
  const index = url.indexOf(marker)
  return index === -1 ? null : url.slice(index + marker.length)
}

export async function uploadOrganizationLogo(organizationId: string, file: File): Promise<string> {
  const user = await requirePermission('organizations.update', { organizationId })

  // Layer 1 of 3 (see lib/branding/schemas.ts's doc on sniffLogoMimeType for
  // the other two). The client-side check in
  // components/settings/logo-upload-field.tsx is a fourth, purely for a fast
  // error message — none of these three is optional because any one of them
  // can be bypassed by a caller that skips the browser entirely.
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error(`Logo must be ${Math.floor(LOGO_MAX_BYTES / 1024)} KB or smaller.`)
  }
  if (!LOGO_MIME_TYPES.includes(file.type as (typeof LOGO_MIME_TYPES)[number])) {
    throw new Error('Logo must be a PNG, JPEG, or WebP image.')
  }

  const buffer = new Uint8Array(await file.arrayBuffer())
  const sniffed = sniffLogoMimeType(buffer)
  if (!sniffed || sniffed !== file.type) {
    throw new Error('This file does not look like a valid image.')
  }

  const supabase = await createServerSupabaseClient()

  const { data: existing } = await supabase
    .from('organizations')
    .select('logo_url')
    .eq('id', organizationId)
    .single<{ logo_url: string | null }>()

  // Timestamped filename, not a fixed "logo.png": a CDN or browser cache
  // keyed on URL would otherwise keep serving the old image at the same
  // path after a replace.
  const path = `organizations/${organizationId}/branding/logo-${Date.now()}.${EXTENSION_BY_MIME[sniffed]}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: sniffed, upsert: false })
  if (uploadError) throw uploadError

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)

  const { error: updateError } = await supabase
    .from('organizations')
    .update({ logo_url: publicUrl })
    .eq('id', organizationId)
  if (updateError) throw updateError

  // Cleanup after the row points at the new object, not before — if this
  // upload had failed, the previous logo must still be the one referenced.
  const previousPath = existing?.logo_url ? storagePathFromPublicUrl(existing.logo_url) : null
  if (previousPath) {
    await supabase.storage.from(BUCKET).remove([previousPath])
  }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'organization.logo_updated',
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: { path },
    },
    supabase,
  )

  return publicUrl
}

export async function removeOrganizationLogo(organizationId: string): Promise<void> {
  const user = await requirePermission('organizations.update', { organizationId })
  const supabase = await createServerSupabaseClient()

  const { data: existing } = await supabase
    .from('organizations')
    .select('logo_url')
    .eq('id', organizationId)
    .single<{ logo_url: string | null }>()

  const { error } = await supabase
    .from('organizations')
    .update({ logo_url: null })
    .eq('id', organizationId)
  if (error) throw error

  const previousPath = existing?.logo_url ? storagePathFromPublicUrl(existing.logo_url) : null
  if (previousPath) {
    await supabase.storage.from(BUCKET).remove([previousPath])
  }

  await recordAuditEvent(
    {
      organizationId,
      userId: user.id,
      action: 'organization.logo_removed',
      resourceType: 'organization',
      resourceId: organizationId,
    },
    supabase,
  )
}
