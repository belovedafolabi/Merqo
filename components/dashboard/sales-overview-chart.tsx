'use client'

import { useId, useState } from 'react'

import type { DashboardSeriesPoint } from '@/lib/dashboard/summary'
import { EmptyState } from '@/components/states/empty-state'
import { Package } from 'lucide-react'

/**
 * Net sales per day over the summary window — a bar chart, because the data
 * is a magnitude per discrete day, not a continuous trend.
 *
 * Hand-rolled inline SVG: no chart library is installed, and one card does
 * not justify adding one. Follows the dataviz skill's rules for a
 * single-series chart — one hue (the brand `--primary`), thin bars with a
 * rounded top anchored to the baseline, a 2px gap between bars, recessive
 * axis, a per-bar hover tooltip, and a visually-hidden table so the figures
 * are reachable without the chart. Text stays in ink tokens; only the bars
 * wear the series colour.
 */

const CHART_HEIGHT = 160
const BAR_GAP = 2

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

export function SalesOverviewChart({ series }: { series: DashboardSeriesPoint[] }) {
  const captionId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const max = Math.max(1, ...series.map((point) => point.netSales))
  const total = series.reduce((sum, point) => sum + point.netSales, 0)
  const hovered = hover === null ? null : (series[hover] ?? null)

  const first = series[0]
  const last = series[series.length - 1]
  if (series.length === 0 || total === 0 || !first || !last) {
    return (
      <EmptyState
        icon={Package}
        title="No sales in this period"
        description="Completed sales at this branch will chart here day by day."
      />
    )
  }
  const mid = series.length > 2 ? series[Math.floor(series.length / 2)] : null

  // A viewBox in abstract units; the SVG scales to its container width. Each
  // bar owns an equal slice, minus the gap.
  const slice = 100 / series.length
  const barWidth = slice - BAR_GAP

  return (
    <figure className="flex flex-col gap-2" aria-describedby={captionId}>
      <div className="relative">
        <svg
          viewBox={`0 0 100 ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-40 w-full"
          role="img"
          aria-label={`Net sales per day. Total ${money(total)} over ${series.length} days.`}
        >
          {/* Baseline — recessive. */}
          <line
            x1="0"
            y1={CHART_HEIGHT}
            x2="100"
            y2={CHART_HEIGHT}
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {series.map((point, index) => {
            const barHeight = (point.netSales / max) * (CHART_HEIGHT - 8)
            const x = index * slice + BAR_GAP / 2
            const active = hover === index
            return (
              <rect
                key={point.day}
                x={x}
                y={CHART_HEIGHT - barHeight}
                width={barWidth}
                height={Math.max(barHeight, point.netSales > 0 ? 2 : 0)}
                rx="1.5"
                fill="var(--primary)"
                opacity={hover === null || active ? 1 : 0.55}
                className="transition-opacity motion-reduce:transition-none"
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              />
            )
          })}
        </svg>

        {hover !== null && hovered && (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-y-full rounded-md border bg-popover px-2 py-1 text-caption shadow-md"
            style={{ left: `${(hover + 0.5) * slice}%`, transform: 'translate(-50%, -100%)' }}
          >
            <span className="font-medium">{shortDay(hovered.day)}</span>
            <span className="ml-2 tabular-nums">{money(hovered.netSales)}</span>
          </div>
        )}
      </div>

      {/* First / mid / last date ticks — a full axis of 14 labels would
          collide at this width. */}
      <div className="flex justify-between text-caption text-muted-foreground">
        <span>{shortDay(first.day)}</span>
        {mid && <span>{shortDay(mid.day)}</span>}
        <span>{shortDay(last.day)}</span>
      </div>

      <figcaption id={captionId} className="sr-only">
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
