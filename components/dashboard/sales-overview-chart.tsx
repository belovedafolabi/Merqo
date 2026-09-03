'use client'

import type { DashboardSeriesPoint } from '@/lib/dashboard/types'
import { SalesTrendChart } from '@/components/charts/sales-trend-chart'

/**
 * Net sales per day over the Overview window. Thin adapter over the shared
 * Recharts trend (components/charts/sales-trend-chart.tsx) so the Overview
 * card and the "Sales performance" card render through one implementation.
 */
export function SalesOverviewChart({ series }: { series: DashboardSeriesPoint[] }) {
  return (
    <SalesTrendChart series={series} height={160} ariaLabel="Net sales per day, last two weeks" />
  )
}
