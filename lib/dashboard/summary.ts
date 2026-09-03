import { createServerSupabaseClient } from '@/lib/supabase/server'
import { DASHBOARD_TIME_ZONE } from '@/lib/dashboard/periods'
import type { DashboardSeriesPoint, DashboardSummary } from '@/lib/dashboard/types'

/**
 * The Admin dashboard's sales figures — the three stat cards and the
 * "Sales overview" chart.
 *
 * These read dashboard_sales_summary / dashboard_sales_series
 * (20260903090300), both SECURITY INVOKER so sales_select scopes the rows to
 * branches the caller can see. Money semantics follow
 * 20260823141000_create_report_functions.sql's header exactly, so the
 * dashboard can never disagree with the Reports module for the same period.
 *
 * The `DashboardSummary` / `DashboardSeriesPoint` types and the pure
 * `deltaLabel` helper live in lib/dashboard/types.ts (no `next/headers`) so
 * client components can import them; they are re-exported here for callers
 * that already import this module.
 */

export { deltaLabel, type DashboardSeriesPoint, type DashboardSummary } from '@/lib/dashboard/types'

interface SummaryRow {
  sale_count: number
  gross_sales: string | number
  net_sales: string | number
  collected: string | number
  average_sale: string | number
  prior_sale_count: number
  prior_net_sales: string | number
  prior_average_sale: string | number
}

export async function getDashboardSummary(
  branchId: string,
  from: Date,
  to: Date,
): Promise<DashboardSummary> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('dashboard_sales_summary', {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })

  if (error) throw error
  const row = (data as SummaryRow[] | null)?.[0]
  return {
    saleCount: Number(row?.sale_count ?? 0),
    grossSales: Number(row?.gross_sales ?? 0),
    netSales: Number(row?.net_sales ?? 0),
    collected: Number(row?.collected ?? 0),
    averageSale: Number(row?.average_sale ?? 0),
    priorSaleCount: Number(row?.prior_sale_count ?? 0),
    priorNetSales: Number(row?.prior_net_sales ?? 0),
    priorAverageSale: Number(row?.prior_average_sale ?? 0),
  }
}

interface SeriesRow {
  day: string
  sale_count: number
  net_sales: string | number
}

export async function getDashboardSeries(
  branchId: string,
  from: Date,
  to: Date,
): Promise<DashboardSeriesPoint[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('dashboard_sales_series', {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_tz: DASHBOARD_TIME_ZONE,
  })

  if (error) throw error
  return ((data as SeriesRow[] | null) ?? []).map((row) => ({
    day: row.day,
    saleCount: Number(row.sale_count),
    netSales: Number(row.net_sales),
  }))
}
