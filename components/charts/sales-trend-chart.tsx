'use client'

import { useId } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Package } from 'lucide-react'

import type { DashboardSeriesPoint } from '@/lib/dashboard/types'
import { EmptyState } from '@/components/states/empty-state'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

/**
 * Net sales per day, as a filled area trend — the dashboard's Overview and
 * "Sales performance" cards both render through here so they read as one
 * system. Built on Recharts (`ResponsiveContainer` reflows it to any width);
 * colours come from the theme tokens so a branding change recolours it, and
 * the same figures are mirrored in a visually-hidden table because a chart
 * alone is not screen-reader accessible.
 */

function money(value: number): string {
  return value.toLocaleString('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  })
}

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

interface TooltipEntry {
  payload?: DashboardSeriesPoint
  value?: number
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-caption shadow-md">
      <p className="font-medium text-popover-foreground">{shortDay(point.day)}</p>
      <p className="tabular-nums text-muted-foreground">
        {money(point.netSales)} · {point.saleCount} sale{point.saleCount === 1 ? '' : 's'}
      </p>
    </div>
  )
}

export function SalesTrendChart({
  series,
  height = 200,
  ariaLabel = 'Net sales per day',
}: {
  series: DashboardSeriesPoint[]
  height?: number
  ariaLabel?: string
}) {
  const gradientId = useId()
  const reducedMotion = usePrefersReducedMotion()

  const total = series.reduce((sum, point) => sum + point.netSales, 0)
  if (series.length === 0 || total === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No sales in this period"
        description="Completed sales at this branch chart here day by day."
      />
    )
  }

  // Enough labels to orient without crowding a narrow card.
  const tickInterval = Math.max(0, Math.ceil(series.length / 5) - 1)

  return (
    <figure className="flex flex-col gap-2">
      <div style={{ width: '100%', height }} role="img" aria-label={`${ariaLabel}. Total ${money(total)}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              interval={tickInterval}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              minTickGap={12}
            />
            <YAxis
              width={44}
              tickFormatter={(value: number) =>
                new Intl.NumberFormat('en-NG', { notation: 'compact' }).format(value)
              }
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)' }} />
            <Area
              type="monotone"
              dataKey="netSales"
              stroke="var(--primary)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              isAnimationActive={!reducedMotion}
              animationDuration={reducedMotion ? 0 : 350}
              dot={false}
              activeDot={{ r: 3, fill: 'var(--primary)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="sr-only">
        <table>
          <caption>Net sales per day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Sales</th>
              <th scope="col">Net revenue</th>
            </tr>
          </thead>
          <tbody>
            {series.map((point) => (
              <tr key={point.day}>
                <th scope="row">{shortDay(point.day)}</th>
                <td>{point.saleCount}</td>
                <td>{money(point.netSales)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  )
}
