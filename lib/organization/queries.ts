import { getCurrentOrganizationId } from '@/lib/auth/context'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export interface OrganizationProfile {
  name: string
  contactPhone: string | null
  contactEmail: string | null
  addressLine: string | null
}

interface OrganizationProfileRow {
  name: string
  contact_phone: string | null
  contact_email: string | null
  address_line: string | null
}

export async function getOrganizationProfile(): Promise<OrganizationProfile | null> {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) return null

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('name, contact_phone, contact_email, address_line')
    .eq('id', organizationId)
    .single<OrganizationProfileRow>()

  if (error || !data) return null

  return {
    name: data.name,
    contactPhone: data.contact_phone,
    contactEmail: data.contact_email,
    addressLine: data.address_line,
  }
}
