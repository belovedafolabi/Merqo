import { getCurrentOrganizationId } from '@/lib/auth/context'
import { requirePermission } from '@/lib/auth/guard'
import { logger } from '@/lib/logger'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  PAYLOAD_SCHEMAS,
  insightsAreStale,
  type InsightsSection,
  type SalesInsights,
} from '@/lib/insights/types'

/**
 * Milestone 17 Part A — the read path for the Sales Insights page.
 *
 * Reads the three sales_insights_cache rows for a business unit. If any row is
 * missing, or the newest is older than STALENESS_MS, it calls
 * compute_sales_insights() to recompute (timed + logged — the Observability
 * requirement; Postgres-side structured logging isn't available) and re-reads.
 *
 * insights.view is enforced here via the Milestone 03 guard AND again by RLS
 * on the cache table (its SELECT policy also checks the permission) — the same
 * two-boundary pattern Reports uses.
 */

interface CacheRow {
  section: InsightsSection
  payload: unknown
  computed_at: string
}

function emptyInsights(): SalesInsights {
  return { forecast: [], restock: [], slowMovers: [], computedAt: null }
}

function shape(rows: CacheRow[]): SalesInsights {
  const bySection = new Map(rows.map((row) => [row.section, row]))
  const forecast = PAYLOAD_SCHEMAS.forecast.parse(bySection.get('forecast')?.payload ?? [])
  const restock = PAYLOAD_SCHEMAS.restock.parse(bySection.get('restock')?.payload ?? [])
  const slowMovers = PAYLOAD_SCHEMAS.slow_movers.parse(bySection.get('slow_movers')?.payload ?? [])
  const computedAt =
    rows
      .map((row) => row.computed_at)
      .sort()
      .at(-1) ?? null

  return { forecast, restock, slowMovers, computedAt }
}

function isStale(rows: CacheRow[]): boolean {
  return insightsAreStale(
    rows.map((row) => ({ section: row.section, computedAt: row.computed_at })),
  )
}

export async function getSalesInsights(businessUnitId: string): Promise<SalesInsights> {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) return emptyInsights()

  await requirePermission('insights.view', { organizationId, businessUnitId })

  const supabase = await createServerSupabaseClient()

  const read = async (): Promise<CacheRow[]> => {
    const { data, error } = await supabase
      .from('sales_insights_cache')
      .select('section, payload, computed_at')
      .eq('business_unit_id', businessUnitId)
    if (error) throw error
    return (data ?? []) as CacheRow[]
  }

  let rows = await read()

  if (isStale(rows)) {
    const startedAt = performance.now()
    const { error } = await supabase.rpc('compute_sales_insights', {
      p_business_unit_id: businessUnitId,
    })
    if (error) {
      logger.error('insights.compute_failed', { businessUnitId, error: error.message })
      // Serve whatever is cached (possibly stale, possibly empty) rather than
      // blanking the page on a compute error.
      return rows.length > 0 ? shape(rows) : emptyInsights()
    }

    rows = await read()
    logger.info('insights.computed', {
      businessUnitId,
      durationMs: Math.round(performance.now() - startedAt),
      forecastRows: rows.find((r) => r.section === 'forecast')
        ? (rows.find((r) => r.section === 'forecast')!.payload as unknown[]).length
        : 0,
    })
  }

  return shape(rows)
}

/**
 * Forces a recompute regardless of staleness — the page's manual "Refresh now"
 * affordance. Rate-limited by refusing when the newest cache row is under a
 * minute old, so a bored click can't hammer the query.
 */
export async function refreshSalesInsights(
  businessUnitId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) return { ok: false, reason: 'Not signed in.' }

  await requirePermission('insights.view', { organizationId, businessUnitId })

  const supabase = await createServerSupabaseClient()

  const { data: existing } = await supabase
    .from('sales_insights_cache')
    .select('computed_at')
    .eq('business_unit_id', businessUnitId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ computed_at: string }>()

  if (existing && Date.now() - new Date(existing.computed_at).getTime() < 60_000) {
    return { ok: false, reason: 'Insights were just refreshed — try again in a minute.' }
  }

  const startedAt = performance.now()
  const { error } = await supabase.rpc('compute_sales_insights', {
    p_business_unit_id: businessUnitId,
  })
  if (error) {
    logger.error('insights.compute_failed', { businessUnitId, error: error.message })
    return { ok: false, reason: 'Could not refresh insights — try again in a moment.' }
  }

  logger.info('insights.computed', {
    businessUnitId,
    durationMs: Math.round(performance.now() - startedAt),
    trigger: 'manual',
  })
  return { ok: true }
}
