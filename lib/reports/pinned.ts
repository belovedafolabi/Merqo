import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Milestone 17 Part B — the standard-report ids a business unit has pinned,
 * seeded once at onboarding from business_type_presets and owner-editable
 * after. An existing unit has `'[]'` and this returns an empty array, so its
 * Reports index is unchanged.
 */
export async function getPinnedReports(
  businessUnitId: string | null | undefined,
): Promise<string[]> {
  if (!businessUnitId) return []

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('business_units')
    .select('pinned_reports')
    .eq('id', businessUnitId)
    .maybeSingle<{ pinned_reports: unknown }>()

  if (error || !Array.isArray(data?.pinned_reports)) return []
  return (data.pinned_reports as unknown[]).filter((id): id is string => typeof id === 'string')
}
