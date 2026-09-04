'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/states/empty-state'
import { usePendingToast } from '@/hooks/use-pending-toast'
import { forecastWhy } from '@/lib/insights/why'
import {
  INSIGHTS_HORIZONS,
  forecastFor,
  type ForecastRow,
  type InsightsHorizon,
  type Trend,
} from '@/lib/insights/types'
import { LineChart } from 'lucide-react'

const HORIZON_LABEL: Record<InsightsHorizon, string> = {
  next_day: 'Next day',
  next_7d: 'Next 7 days',
  next_30d: 'Next 30 days',
}

const TREND_ICON: Record<Trend, typeof Minus> = {
  rising: TrendingUp,
  falling: TrendingDown,
  steady: Minus,
}
const TREND_VARIANT: Record<Trend, 'secondary' | 'outline'> = {
  rising: 'secondary',
  falling: 'outline',
  steady: 'outline',
}

/**
 * Milestone 17 Part A — the demand-forecast section. The horizon toggle writes
 * `?horizon=` to the URL (a bookmarkable choice, and the server re-renders the
 * whole page around it). A LOW-confidence product shows "Not enough history
 * yet", never a fabricated number — the payload already nulls its forecast
 * fields, this just labels the null.
 */
export function ForecastSection({
  rows,
  horizon,
}: {
  rows: ForecastRow[]
  horizon: InsightsHorizon
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  usePendingToast(pending, 'Loading forecast…', 400)

  function setHorizon(next: InsightsHorizon) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('horizon', next)
    startTransition(() => router.push(`?${params.toString()}`, { scroll: false }))
  }

  const columns: DataTableColumn<ForecastRow>[] = [
    { header: 'Product', cell: (row) => row.name },
    {
      header: HORIZON_LABEL[horizon],
      cell: (row) => {
        if (row.confidence === 'LOW') {
          return <span className="text-body-sm text-muted-foreground">Not enough history yet</span>
        }
        const value = forecastFor(row, horizon)
        return (
          <span className="tabular-nums">
            {value === null ? '—' : `${Math.round(value)} units`}
          </span>
        )
      },
    },
    {
      header: 'Trend',
      cell: (row) => {
        const Icon = TREND_ICON[row.trend]
        return (
          <Badge variant={TREND_VARIANT[row.trend]} className="gap-1">
            <Icon className="size-3" />
            {row.trend}
          </Badge>
        )
      },
    },
    {
      header: 'Why',
      cell: (row) => <span className="text-body-sm text-muted-foreground">{forecastWhy(row)}</span>,
    },
  ]

  return (
    <Card className="shadow-card" aria-busy={pending}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Demand forecast</CardTitle>
            <CardDescription>
              Projected unit demand per product, from recent sales velocity and this unit&rsquo;s
              day-of-week pattern.
            </CardDescription>
          </div>
          <div
            role="group"
            aria-label="Forecast horizon"
            className="inline-flex rounded-lg border p-0.5"
          >
            {INSIGHTS_HORIZONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === horizon}
                onClick={() => setHorizon(option)}
                className={
                  option === horizon
                    ? 'rounded-md bg-primary px-3 py-1 text-body-sm font-medium text-primary-foreground'
                    : 'rounded-md px-3 py-1 text-body-sm text-muted-foreground hover:text-foreground'
                }
              >
                {HORIZON_LABEL[option]}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.productId}
          emptyState={
            <EmptyState
              icon={LineChart}
              title="No forecast yet"
              description="Once this business unit has a few weeks of sales, per-product forecasts will appear here."
            />
          }
        />
      </CardContent>
    </Card>
  )
}
