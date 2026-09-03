'use client'

import { useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SalesTrendChart } from '@/components/charts/sales-trend-chart'
import { deltaLabel, type DashboardSummary, type DashboardSeriesPoint } from '@/lib/dashboard/types'
import type { DashboardPeriod } from '@/lib/dashboard/periods'

/**
 * "Sales performance" — one card, four windows. The page pre-fetches the
 * summary numbers and a trend for today / month-to-date / year-to-date /
 * all-time, and the period switch here is pure client state, so changing it is
 * instant with no spinner. Charts render through the shared trend component so
 * this reads as one system with the Overview card above it.
 */

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
]

function money(value: number): string {
  return value.toLocaleString('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
}

type Bundle = Record<DashboardPeriod, { summary: DashboardSummary; series: DashboardSeriesPoint[] }>

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border bg-muted/30 p-3">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className="text-h4 font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
    </div>
  )
}

export function SalesPerformanceCard({ bundle }: { bundle: Bundle }) {
  const [period, setPeriod] = useState<DashboardPeriod>('today')
  const { summary, series } = bundle[period]
  const showDelta = period !== 'all'
  const netDelta = showDelta ? deltaLabel(summary.netSales, summary.priorNetSales) : null

  return (
    <Card className="shadow-card lg:col-span-2">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Sales performance</CardTitle>
        <Tabs value={period} onValueChange={(value) => setPeriod(value as DashboardPeriod)}>
          <TabsList className="flex-wrap">
            {PERIODS.map((p) => (
              <TabsTrigger key={p.value} value={p.value}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile
            label="Net sales"
            value={money(summary.netSales)}
            hint={netDelta ? netDelta.label : undefined}
          />
          <Tile label="Transactions" value={String(summary.saleCount)} />
          <Tile label="Average sale" value={money(summary.averageSale)} />
        </div>
        <SalesTrendChart
          series={series}
          height={200}
          ariaLabel={`Net sales trend, ${PERIODS.find((p) => p.value === period)?.label}`}
        />
      </CardContent>
    </Card>
  )
}
