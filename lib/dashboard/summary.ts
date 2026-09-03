import { createServerSupabaseClient } from '@/lib/supabase/server'
import { DASHBOARD_TIME_ZONE } from '@/lib/dashboard/periods'

/**
 * The Admin dashboard's sales figures — the three stat cards and the
 * "Sales overview" chart.
 *
 * These read dashboard_sales_summary / dashboard_sales_series
 * (20260903090300), both SECURITY INVOKER so sales_select scopes the rows to
 * branches the caller can see. Money semantics follow
 * 20260823141000_create_report_functions.sql's header exactly, so the
 * dashboard can never disagree with the Reports module for the same period.
 */

export interface DashboardSummary {
  saleCount: number
  grossSales: number
  /** Revenue: subtotal − discount. Tax and service charge are excluded. */
  netSales: number
  /** What actually went in the till (includes tax). */
  collected: number
  averageSale: number
  priorSaleCount: number
  priorNetSales: number
  priorAverageSale: number
}

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

export interface DashboardSeriesPoint {
  day: string
  saleCount: number
  netSales: number
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

/**
 * A percentage-change label for a stat card's delta, against the prior
 * equal-length window. Returns null when the prior window had nothing to
 * compare to — "+∞%" is noise, and the card just omits the delta.
 */
export function deltaLabel(
  current: number,
  prior: number,
): { label: string; direction: 'up' | 'down'; positive: boolean } | null {
  if (prior === 0) return null
  const change = ((current - prior) / prior) * 100
  const rounded = Math.round(change)
  if (rounded === 0) return { label: 'no change vs. prior period', direction: 'up', positive: true }
  const direction = rounded > 0 ? 'up' : 'down'
  return {
    label: `${rounded > 0 ? '+' : ''}${rounded}% vs. prior period`,
    direction,
    // More sales / higher revenue is the good outcome for every metric the
    // dashboard shows, so a rise is always "positive" here.
    positive: rounded > 0,
  }
}
