'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { ReportResult } from '@/lib/reports/types'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

/**
 * A bar chart of a report's first plottable measure, grouped by its first
 * text column. Built on Recharts so it reflows cleanly and shares the app's
 * chart language with the dashboard; colours are theme tokens. The report
 * table beneath (components/reports/report-runner-view.tsx) always carries the
 * exact numbers, so the chart is a second view, never the only one.
 */

const MAX_BARS = 24

function compact(value: number): string {
  return new Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  )
}

interface TooltipEntry {
  payload?: { label: string; value: number }
}

export function ReportChart({ result }: { result: ReportResult }) {
  const reducedMotion = usePrefersReducedMotion()

  const chart = useMemo(() => {
    const labelColumn = result.columns.find((column) => column.type === 'text')
    const valueColumn = result.columns.find(
      (column) => column.type === 'money' || column.type === 'number',
    )
    if (!labelColumn || !valueColumn) return null

    const bars = result.rows
      .slice(0, MAX_BARS)
      .map((row) => ({
        label: String(row[labelColumn.key] ?? '—'),
        value: Number(row[valueColumn.key] ?? 0),
      }))
      .filter((bar) => Number.isFinite(bar.value))

    if (bars.length === 0 || bars.every((bar) => bar.value === 0)) return null

    return { bars, valueLabel: valueColumn.header, truncated: result.rows.length > MAX_BARS }
  }, [result])

  if (!chart) return null

  const { bars, valueLabel, truncated } = chart
  const peak = Math.max(...bars.map((bar) => Math.abs(bar.value)))
  const highest = bars.reduce((best, bar) => (bar.value > best.value ? bar : best))

  return (
    <figure className="flex flex-col gap-2">
      <div
        style={{ width: '100%', height: 208 }}
        role="img"
        aria-label={`${result.title} — ${valueLabel} across ${bars.length} groups. Highest: ${highest.label}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              interval={0}
              height={28}
              tickFormatter={(label: string) => (label.length > 10 ? `${label.slice(0, 9)}…` : label)}
            />
            <YAxis
              width={44}
              tickFormatter={compact}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--accent)' }}
              content={({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) => {
                const point = payload?.[0]?.payload
                if (!active || !point) return null
                return (
                  <div className="rounded-md border bg-popover px-2.5 py-1.5 text-caption shadow-md">
                    <p className="font-medium text-popover-foreground">{point.label}</p>
                    <p className="tabular-nums text-muted-foreground">
                      {new Intl.NumberFormat('en-NG').format(point.value)}
                    </p>
                  </div>
                )
              }}
            />
            <Bar
              dataKey="value"
              fill="var(--primary)"
              radius={[2, 2, 0, 0]}
              isAnimationActive={!reducedMotion}
              animationDuration={reducedMotion ? 0 : 350}
            >
              {bars.map((bar, index) => (
                <Cell key={index} fillOpacity={bar.value < 0 ? 0.4 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="text-caption text-muted-foreground">
        {valueLabel} · peak {compact(peak)}
        {truncated && ` · showing the first ${MAX_BARS} groups`}
      </figcaption>
    </figure>
  )
}
