import { recordAuditEvent } from '@/lib/auth/audit'
import { requirePermission } from '@/lib/auth/guard'
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
