'use client'

import { useId, useMemo } from 'react'

import type { ReportResult } from '@/lib/reports/types'

/**
 * A bar chart, drawn as inline SVG.
 *
 * Milestone 10's Frontend Changes are explicit: "charts kept simple and
 * native, no paid charting SaaS", and the project's cost discipline argues
 * against a charting dependency for one bar chart on one screen. About a
 * hundred lines of SVG buys the same thing without a package, and without the
 * bundle weight landing on every report screen.
 *
 * Accessibility is why this is not just `<rect>`s: a chart alone is not
 * readable by a screen reader (WCAG). The SVG carries a `role="img"` and a
 * `<title>`/`<desc>` summarising what it shows, and the same numbers are
 * always present in the table beneath it — the chart is a second view of data
 * the reader can also get as text, never the only way to get it.
 */

const HEIGHT = 200
const BAR_GAP = 6
const AXIS_LABEL_HEIGHT = 28
const MAX_BARS = 24

function niceCeiling(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / magnitude) * magnitude
}

function compact(value: number): string {
  return new Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  )
}

export function ReportChart({ result }: { result: ReportResult }) {
  const titleId = useId()
  const descId = useId()

  const chart = useMemo(() => {
    const labelColumn = result.columns.find((column) => column.type === 'text')
    // The first summable column is the one worth plotting — for a sales
    // report that is the count or the money, never the group label.
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

  const { bars, valueLabel } = chart
  const max = niceCeiling(Math.max(...bars.map((bar) => Math.abs(bar.value))))
  const barWidth = 100 / bars.length

  const summary = `${valueLabel} across ${bars.length} groups. Highest: ${
    bars.reduce((best, bar) => (bar.value > best.value ? bar : best)).label
  }.`

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 100 ${HEIGHT + AXIS_LABEL_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-52 w-full"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
      >
        <title id={titleId}>{`${result.title} — ${valueLabel}`}</title>
        <desc id={descId}>{summary}</desc>

        {/* Grid lines, deliberately low-contrast so they never compete with
            the data (WCAG/Material: gridlines subtle). */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2="100"
            y1={HEIGHT - fraction * HEIGHT}
            y2={HEIGHT - fraction * HEIGHT}
            className="stroke-border"
            strokeWidth="0.25"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {bars.map((bar, index) => {
          const height = (Math.abs(bar.value) / max) * HEIGHT
          const x = index * barWidth
          return (
            <rect
              key={`${bar.label}-${index}`}
              x={x + BAR_GAP / bars.length / 2}
              y={HEIGHT - height}
              width={Math.max(barWidth - BAR_GAP / bars.length, 0.5)}
              height={height}
              rx="0.5"
              className="fill-primary"
            >
              {/* Native SVG tooltip — no JS, works on hover and on focus in
                  most assistive tooling. The table below carries the exact
                  numbers regardless. */}
              <title>{`${bar.label}: ${new Intl.NumberFormat('en-NG').format(bar.value)}`}</title>
            </rect>
          )
        })}

        <line
          x1="0"
          x2="100"
          y1={HEIGHT}
          y2={HEIGHT}
          className="stroke-border"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Axis labels live outside the SVG so they are real text: the SVG uses
          preserveAspectRatio="none" to stretch, which would distort any text
          drawn inside it. */}
      <div className="flex text-caption text-muted-foreground" aria-hidden="true">
        {bars.map((bar, index) => (
          <span
            key={`${bar.label}-label-${index}`}
            className="min-w-0 truncate px-0.5 text-center"
            style={{ width: `${barWidth}%` }}
            title={bar.label}
          >
            {bar.label}
          </span>
        ))}
      </div>

      <figcaption className="text-caption text-muted-foreground">
        {valueLabel} · peak {compact(max)}
        {chart.truncated && ` · showing the first ${MAX_BARS} groups`}
      </figcaption>
    </figure>
  )
}
