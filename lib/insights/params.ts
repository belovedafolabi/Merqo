import { INSIGHTS_HORIZONS, type InsightsHorizon } from '@/lib/insights/types'

/**
 * Milestone 17 Part A — Insights filters live in the URL, the same stance
 * lib/reports/params.ts takes and for the same reasons (bookmarkable,
 * back-button-safe, and it means the page's server component re-derives
 * everything on navigation with no client fetching).
 *
 * Two params only — a business-unit id and the forecast horizon. Validation
 * is not done here: the business-unit id is checked server-side against what
 * the caller can actually see, and an unknown horizon just falls back to the
 * default.
 */

export type InsightsSearchParams = Record<string, string | string[] | undefined>

function firstValue(params: InsightsSearchParams, key: string): string | undefined {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

export interface InsightsParams {
  businessUnitId: string | null
  horizon: InsightsHorizon
}

export function parseInsightsParams(searchParams: InsightsSearchParams): InsightsParams {
  const rawHorizon = firstValue(searchParams, 'horizon')
  const horizon = (INSIGHTS_HORIZONS as readonly string[]).includes(rawHorizon ?? '')
    ? (rawHorizon as InsightsHorizon)
    : 'next_7d'

  return {
    businessUnitId: firstValue(searchParams, 'unit') ?? null,
    horizon,
  }
}
