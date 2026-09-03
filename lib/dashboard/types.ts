/**
 * Pure dashboard types and helpers — no `next/headers`, so client components
 * (the charts, the "Sales performance" card) can import from here. The
 * data-fetching functions that DO reach the server live in
 * lib/dashboard/summary.ts and re-export these. Same split as
 * lib/expenses/summary.ts vs lib/expenses/queries.ts.
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

export interface DashboardSeriesPoint {
  day: string
  saleCount: number
  netSales: number
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
