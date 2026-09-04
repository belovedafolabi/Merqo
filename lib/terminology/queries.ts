import { cache } from 'react'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { GENERIC_TERMS, resolveTerminology, type TerminologyMap } from '@/lib/terminology/types'

/**
 * Milestone 17 Part B — resolves a business unit's terminology map for the
 * current request. `cache()`-memoized like listCategorySuggestions /
 * getOnboardingState: the map is identical for every call with the same
 * business unit id within a request.
 *
 * A business unit with no seeded rows (supermarket, general_retail, other, or
 * simply a type nobody has curated) gets GENERIC_TERMS — that is the correct
 * wording for those, not a gap.
 */
export const getTerminology = cache(
  async (businessUnitId: string | null | undefined): Promise<TerminologyMap> => {
    if (!businessUnitId) return GENERIC_TERMS

    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('business_units')
      .select('business_types(business_type_terminology(term_key, singular, plural))')
      .eq('id', businessUnitId)
      .maybeSingle<{
        business_types: {
          business_type_terminology: Array<{
            term_key: string
            singular: string
            plural: string
          }>
        } | null
      }>()

    if (error || !data?.business_types) return GENERIC_TERMS

    return resolveTerminology(
      data.business_types.business_type_terminology.map((row) => ({
        termKey: row.term_key,
        singular: row.singular,
        plural: row.plural,
      })),
    )
  },
)
