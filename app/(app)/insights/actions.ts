'use server'

import { revalidatePath } from 'next/cache'

import { refreshSalesInsights } from '@/lib/insights/queries'

export interface InsightsActionState {
  error: string | null
  notice?: string | null
}

/**
 * Milestone 17 Part A — the page's manual "Refresh now" affordance. Forces a
 * recompute regardless of the 6h staleness window, but refuses if the cache
 * was rebuilt in the last minute (rate limit lives in refreshSalesInsights).
 */
export async function refreshInsightsAction(
  _prevState: InsightsActionState,
  formData: FormData,
): Promise<InsightsActionState> {
  const businessUnitId = String(formData.get('businessUnitId') ?? '')
  if (!businessUnitId) return { error: 'No business unit selected.' }

  const result = await refreshSalesInsights(businessUnitId)
  if (!result.ok) return { error: result.reason ?? 'Could not refresh insights.' }

  revalidatePath('/insights')
  return { error: null, notice: 'Insights refreshed.' }
}
